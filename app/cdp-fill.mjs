import { readFile, writeFile } from "node:fs/promises";
import { waitForOrderConfirmation } from "./lib/verification.mjs";
import { parsePersonalDetailsNotice } from "./lib/parser.mjs";
import { ensureBrowserReady, createBrowserConnection, browserConnectionError } from "./lib/browser-connection.mjs";

const cdpPort = Number(process.env.SAFE_DEMO_CDP_PORT || 9333);
const targetUrl = process.env.TARGET_URL || "https://addrs.xyz";
const targetOrigin = new URL(targetUrl).origin;
const messagePath = process.argv[2] || "sample-message.txt";
const message = await readFile(messagePath, "utf8");
const profile = parsePersonalDetailsNotice(message);
const addrsDeliveryEmail = String(process.env.ADDRS_DELIVERY_EMAIL || profile.recipientEmail).trim();
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

await ensureBrowserReady(cdpPort);
async function browserJson(url, options = {}) {
  try {
    const response = await fetch(url, {...options, signal: AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error('Browser HTTP error');
    return await response.json();
  } catch { throw browserConnectionError('连接失败（准备页面阶段，尚未提交上游订单）'); }
}
const targets = await browserJson(`http://127.0.0.1:${cdpPort}/json/list`);
let target = targets.find((item) => item.type === "page" && item.url?.startsWith(targetOrigin));
if (!target) target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
if (!target) {
  target = await browserJson(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(targetUrl)}`, {
    method: "PUT",
  });
}
if (!target?.webSocketDebuggerUrl) throw new Error(`未找到可连接的浏览器页面 (${targetUrl})`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
const {ready: connectionReady, call} = createBrowserConnection(socket);

async function evaluate(expression) {
  const result = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "页面脚本执行失败");
  }
  return result.result?.value;
}

async function waitUntil(check, attempts, delay = 500) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      if (error?.code === 'BROWSER_CONNECTION_LOST') throw error;
      // Navigation briefly invalidates the JavaScript execution context.
    }
    await sleep(delay);
  }
  return null;
}

await connectionReady;
await call("Page.enable");
await call("Runtime.enable");

// Turnstile responses are short-lived and single-use. Always start a new document so
// a previous failed or completed attempt cannot reuse a stale verification token.
await call("Page.navigate", { url: targetUrl });
const ready = await waitUntil(
  () => evaluate("document.readyState === 'complete' && Boolean(document.querySelector('.template-card') && document.querySelector('#create_order_button'))"),
  60,
);
if (!ready) throw new Error("addrs.xyz 首页加载超时");

const payload = JSON.stringify({ ...profile, recipientEmail: addrsDeliveryEmail });
const fillResult = await evaluate(`(async () => {
  const profile = ${payload};
  const templateCard = Array.from(document.querySelectorAll('.template-card'))
    .find((element) => element.dataset.template === profile.template);
  if (!templateCard) {
    return { ok: false, templateSelected: false, selectedTemplate: '', error: 'addrs.xyz 中找不到模版“' + profile.template + '”', filledCount: 0, filledFields: [], missingFields: [] };
  }
  templateCard.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const selectedTemplate = document.querySelector('#template')?.value || '';
  if (selectedTemplate !== profile.template) {
    return { ok: false, templateSelected: false, selectedTemplate, error: '模版选择校验失败：期望“' + profile.template + '”，当前“' + (selectedTemplate || '未选择') + '”', filledCount: 0, filledFields: [], missingFields: [] };
  }

  function setNativeValue(element, value) {
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) descriptor.set.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.classList.add('just-filled');
  }

  function isUsableField(element) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function findByLabelOrPlaceholder(patterns) {
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([disabled]), textarea:not([disabled])')).filter(isUsableField);
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'i');
      for (const input of inputs) {
        const id = input.id || '';
        const name = input.name || '';
        const placeholder = input.placeholder || '';
        const ariaLabel = input.getAttribute('aria-label') || '';
        const labelEl = id ? document.querySelector('label[for="' + CSS.escape(id) + '"]') : null;
        const parentLabel = input.closest('label');
        const prevText = input.previousElementSibling?.textContent || '';
        const labelText = [labelEl?.textContent, parentLabel?.textContent, prevText].filter(Boolean).join(' ');
        if (regex.test(id) || regex.test(name) || regex.test(placeholder) || regex.test(ariaLabel) || regex.test(labelText)) return input;
      }
    }
    return null;
  }

  function resolveField(selectors, patterns) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && isUsableField(element)) return element;
    }
    return findByLabelOrPlaceholder(patterns);
  }

  const fieldDefs = [
    { key: 'full_name', value: profile.fullName, selectors: ['#name_input', '#full_name', '#fullName', '#name', 'input[name="full_name"]', 'input[name="fullName"]', 'input[name="name"]', 'input[autocomplete="name"]'], patterns: ['姓名', 'full\\s*name', 'recipient\\s*name', 'holder\\s*name', '^name$'] },
    { key: 'address_line_1', value: profile.addressLines[0], selectors: ['#address_line1', '#address_line_1', '#addressLine1', '#address1', '#address', 'input[name="address_line1"]', 'input[name="address_line_1"]', 'input[name="addressLine1"]', 'input[name="address1"]', 'input[name="address"]', 'input[autocomplete="address-line1"]'], patterns: ['第\\s*1\\s*行地址', '地址第\\s*1\\s*行', '地址\\s*1', 'address\\s*line\\s*1', 'address\\s*1', 'street\\s*address'] },
    { key: 'address_line_2', value: profile.addressLines[1], selectors: ['#address_line2', '#address_line_2', '#addressLine2', '#address2', 'input[name="address_line2"]', 'input[name="address_line_2"]', 'input[name="addressLine2"]', 'input[name="address2"]', 'input[autocomplete="address-line2"]'], patterns: ['第\\s*2\\s*行地址', '地址第\\s*2\\s*行', '地址\\s*2', 'address\\s*line\\s*2', 'address\\s*2'] },
    { key: 'address_line_3', value: profile.addressLines[2], selectors: ['#address_line3', '#address_line_3', '#addressLine3', '#address3', 'input[name="address_line3"]', 'input[name="address_line_3"]', 'input[name="addressLine3"]', 'input[name="address3"]', 'input[autocomplete="address-line3"]'], patterns: ['第\\s*3\\s*行地址', '地址第\\s*3\\s*行', '地址\\s*3', 'address\\s*line\\s*3', 'address\\s*3'] },
    { key: 'recipient_email', value: profile.recipientEmail, selectors: ['#email_input', '#recipient_email', '#recipientEmail', '#email', 'input[type="email"]', 'input[name="recipient_email"]', 'input[name="recipientEmail"]', 'input[name="email"]', 'input[autocomplete="email"]'], patterns: ['接收邮箱', '邮箱', 'email'] },
  ];

  const filled = [];
  const missing = [];
  const resolvedFields = new Map();
  for (const def of fieldDefs) {
    const field = resolveField(def.selectors, def.patterns);
    if (field) {
      setNativeValue(field, def.value || '');
      resolvedFields.set(def.key, field);
      filled.push(def.key);
    } else missing.push(def.key);
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  const line1Field = resolvedFields.get('address_line_1');
  const hasSeparateExtraAddressFields = resolvedFields.has('address_line_2') || resolvedFields.has('address_line_3');
  const isGenericSingleAddress = line1Field && !hasSeparateExtraAddressFields && (line1Field instanceof HTMLTextAreaElement || line1Field.matches('#address, [name="address"]'));
  if (isGenericSingleAddress) {
    const separator = line1Field instanceof HTMLTextAreaElement ? '\\n' : ', ';
    setNativeValue(line1Field, profile.addressLines.filter(Boolean).join(separator));
    filled.push('address_combined');
  }
  if (missing.includes('address_line_1')) {
    const addressTextarea = resolveField(['textarea[name*="address" i]', 'textarea[id*="address" i]', 'textarea'], ['地址', 'address']);
    if (addressTextarea) {
      setNativeValue(addressTextarea, profile.addressLines.filter(Boolean).join('\\n'));
      filled.push('address_combined');
    }
  }

  const paymentText = document.querySelector('#payment_method_trigger')?.textContent || '';
  return {
    ok: filled.length > 0,
    templateSelected: true,
    selectedTemplate,
    paymentMethod: paymentText.trim().replace(/\\s+/g, ' '),
    filledCount: filled.length,
    filledFields: filled,
    missingFields: missing,
  };
})()`);

if (!fillResult?.templateSelected) throw new Error(fillResult?.error || `未能选择模版：${profile.template}`);
if (!fillResult?.ok) throw new Error("目标页面没有找到可填写字段");
const essentialFieldsPresent = fillResult.filledFields.includes("full_name")
  && fillResult.filledFields.includes("recipient_email")
  && (fillResult.filledFields.includes("address_line_1") || fillResult.filledFields.includes("address_combined"));
if (!essentialFieldsPresent) throw new Error(`目标页面缺少必要字段：${fillResult.missingFields.join(", ")}`);
if (!/BEP20|BNB Smart Chain/i.test(fillResult.paymentMethod || "")) {
  throw new Error(`支付网络不是 BSC/BEP20：${fillResult.paymentMethod || "未识别"}`);
}
await sleep(700);

const createResult = await evaluate(`(() => {
  const button = document.querySelector('#create_order_button');
  if (!button) return { ok: false, error: '找不到“创建支付订单”按钮' };
  button.click();
  return { ok: true };
})()`);
if (!createResult?.ok) throw new Error(createResult?.error || "无法创建支付订单");

// The storefront starts its order verification on the first form submission.
await waitForOrderConfirmation(() => evaluate(`(() => {
  const dialog = document.querySelector('#order_confirm_dialog');
  const confirm = dialog?.querySelector('#order_confirm_submit');
  const status = document.querySelector('#order_form_status');
  return {
    confirmationReady: Boolean(dialog?.open && confirm && !confirm.disabled),
    error: status?.classList.contains('error') ? status.textContent.trim() : '',
  };
})()`));

const confirmResult = await evaluate(`(() => {
  const dialog = document.querySelector('#order_confirm_dialog');
  const button = dialog?.querySelector('#order_confirm_submit');
  if (!dialog?.open || !button || button.disabled) return { ok: false, error: '订单确认窗口未就绪' };
  button.click();
  return { ok: true };
})()`);
if (!confirmResult?.ok) throw new Error(confirmResult?.error || "无法确认创建订单");

const orderPageReady = await waitUntil(
  () => evaluate("location.origin === 'https://addrs.xyz' && location.pathname.startsWith('/order/') && (document.body?.innerText || '').includes('收款地址')"),
  120,
);
if (!orderPageReady) throw new Error("支付订单页加载超时");

const payment = await evaluate(`(() => {
  const lines = (document.body?.innerText || '').split(/\\n+/).map((line) => line.trim()).filter(Boolean);
  const valueAfter = (label) => {
    const index = lines.findIndex((line) => line === label || line.startsWith(label + ' '));
    if (index < 0) return '';
    const inline = lines[index].slice(label.length).trim();
    return inline || lines[index + 1] || '';
  };
  const orderText = document.title.match(/订单\\s+([A-Z0-9]+)/i)?.[1]
    || (document.body?.innerText || '').match(/ORDER\\s+([A-Z0-9]+)/i)?.[1]
    || '';
  const amountText = valueAfter('本单精确金额') || valueAfter('支付金额');
  const amountMatch = amountText.match(/^([0-9]+(?:\\.[0-9]+)?)\\s*([A-Z0-9]+)?/i);
  return {
    externalOrderNo: orderText,
    externalOrderUrl: location.href,
    paymentAmount: amountMatch?.[1] || '',
    paymentCurrency: amountMatch?.[2]?.toUpperCase() || 'USDT',
    paymentNetwork: valueAfter('支付网络'),
    paymentAddress: valueAfter('收款地址'),
  };
})()`);

if (!payment.externalOrderNo || !payment.paymentAmount || !payment.paymentAddress) {
  throw new Error("支付页字段读取不完整");
}
if (!/BEP20|BNB Smart Chain/i.test(payment.paymentNetwork || "")) {
  throw new Error(`支付页网络不是 BSC/BEP20：${payment.paymentNetwork || "未识别"}`);
}

const result = {
  ok: true,
  requestNo: profile.requestNo,
  templateSelected: true,
  selectedTemplate: fillResult.selectedTemplate,
  filledCount: fillResult.filledCount,
  filledFields: fillResult.filledFields,
  missingFields: fillResult.missingFields,
  payment,
};
console.log(JSON.stringify(result));
const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile("demo-preview.png", Buffer.from(screenshot.data, "base64"));
socket.close();
