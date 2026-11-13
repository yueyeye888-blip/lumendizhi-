import { readFile, writeFile } from "node:fs/promises";
import { parsePersonalDetailsNotice } from "./lib/parser.mjs";

const cdpPort = Number(process.env.SAFE_DEMO_CDP_PORT || 9333);
const targetUrl = process.env.TARGET_URL || "https://addrs.xyz";
const targetOrigin = new URL(targetUrl).origin;
const messagePath = process.argv[2] || "sample-message.txt";
const message = await readFile(messagePath, "utf8");
const profile = parsePersonalDetailsNotice(message);

const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
let target = targets.find(
  (item) => item.type === "page" && item.url && item.url.startsWith(targetOrigin)
);

if (!target) {
  target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
}

if (!target) {
  target = await fetch(
    `http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(targetUrl)}`,
    { method: "PUT" }
  ).then((response) => response.json());
}

if (!target?.webSocketDebuggerUrl) throw new Error(`未找到可连接的浏览器页面 (${targetUrl})`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
let sequence = 0;
const pending = new Map();

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function call(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

await call("Page.enable");
await call("Runtime.enable");

if (!target.url || !target.url.startsWith(targetOrigin)) {
  await call("Page.navigate", { url: targetUrl });
  for (let i = 0; i < 30; i++) {
    const state = await call("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    });
    if (state.result?.value === "complete") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 1000));
}

const payload = JSON.stringify(profile);
const expression = `(async () => {
  const profile = ${payload};

  const templateCard = Array.from(document.querySelectorAll('.template-card'))
    .find((element) => element.dataset.template === profile.template);
  if (!templateCard) {
    return {
      ok: false,
      templateSelected: false,
      selectedTemplate: '',
      error: 'addrs.xyz 中找不到模版“' + profile.template + '”',
      filledCount: 0,
      filledFields: [],
      missingFields: [],
    };
  }
  templateCard.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const selectedTemplate = document.querySelector('#template')?.value || '';
  if (selectedTemplate !== profile.template) {
    return {
      ok: false,
      templateSelected: false,
      selectedTemplate,
      error: '模版选择校验失败：期望“' + profile.template + '”，当前“' + (selectedTemplate || '未选择') + '”',
      filledCount: 0,
      filledFields: [],
      missingFields: [],
    };
  }

  function setNativeValue(element, value) {
    const proto = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
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
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([disabled]), textarea:not([disabled])'))
      .filter(isUsableField);
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'i');
      for (const input of inputs) {
        const id = input.id || '';
        const name = input.name || '';
        const placeholder = input.placeholder || '';
        const ariaLabel = input.getAttribute('aria-label') || '';
        const labelEl = id ? document.querySelector(\`label[for="\${CSS.escape(id)}"]\`) : null;
        const parentLabel = input.closest('label');
        const prevText = input.previousElementSibling?.textContent || '';
        const labelText = [labelEl?.textContent, parentLabel?.textContent, prevText].filter(Boolean).join(' ');
        if (
          regex.test(id) ||
          regex.test(name) ||
          regex.test(placeholder) ||
          regex.test(ariaLabel) ||
          regex.test(labelText)
        ) {
          return input;
        }
      }
    }
    return null;
  }

  function resolveField(selectors, patterns) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && isUsableField(el)) return el;
    }
    return findByLabelOrPlaceholder(patterns);
  }

  const fieldDefs = [
    {
      key: 'full_name',
      value: profile.fullName,
      selectors: ['#name_input', '#full_name', '#fullName', '#name', 'input[name="full_name"]', 'input[name="fullName"]', 'input[name="name"]', 'input[autocomplete="name"]'],
      patterns: ['姓名', 'full\\s*name', 'recipient\\s*name', 'holder\\s*name', '^name$'],
    },
    {
      key: 'address_line_1',
      value: profile.addressLines[0],
      selectors: ['#address_line1', '#address_line_1', '#addressLine1', '#address1', '#address', 'input[name="address_line1"]', 'input[name="address_line_1"]', 'input[name="addressLine1"]', 'input[name="address1"]', 'input[name="address"]', 'input[autocomplete="address-line1"]'],
      patterns: ['第\\s*1\\s*行地址', '地址第\\s*1\\s*行', '地址\\s*1', 'address\\s*line\\s*1', 'address\\s*1', 'street\\s*address'],
    },
    {
      key: 'address_line_2',
      value: profile.addressLines[1],
      selectors: ['#address_line2', '#address_line_2', '#addressLine2', '#address2', 'input[name="address_line2"]', 'input[name="address_line_2"]', 'input[name="addressLine2"]', 'input[name="address2"]', 'input[autocomplete="address-line2"]'],
      patterns: ['第\\s*2\\s*行地址', '地址第\\s*2\\s*行', '地址\\s*2', 'address\\s*line\\s*2', 'address\\s*2'],
    },
    {
      key: 'address_line_3',
      value: profile.addressLines[2],
      selectors: ['#address_line3', '#address_line_3', '#addressLine3', '#address3', 'input[name="address_line3"]', 'input[name="address_line_3"]', 'input[name="addressLine3"]', 'input[name="address3"]', 'input[autocomplete="address-line3"]'],
      patterns: ['第\\s*3\\s*行地址', '地址第\\s*3\\s*行', '地址\\s*3', 'address\\s*line\\s*3', 'address\\s*3'],
    },
    {
      key: 'recipient_email',
      value: profile.recipientEmail,
      selectors: ['#email_input', '#recipient_email', '#recipientEmail', '#email', 'input[type="email"]', 'input[name="recipient_email"]', 'input[name="recipientEmail"]', 'input[name="email"]', 'input[autocomplete="email"]'],
      patterns: ['接收邮箱', '邮箱', 'email'],
    },
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
    } else {
      missing.push(def.key);
    }
  }

  const line1Field = resolvedFields.get('address_line_1');
  const hasSeparateExtraAddressFields = resolvedFields.has('address_line_2') || resolvedFields.has('address_line_3');
  const isGenericSingleAddress = line1Field && !hasSeparateExtraAddressFields && (
    line1Field instanceof HTMLTextAreaElement ||
    line1Field.matches('#address, [name="address"]')
  );
  if (isGenericSingleAddress) {
    const separator = line1Field instanceof HTMLTextAreaElement ? '\\n' : ', ';
    setNativeValue(line1Field, profile.addressLines.filter(Boolean).join(separator));
    filled.push('address_combined');
  }

  // Fallback: if address_line_1..3 were not matched individually but there is a single address textarea
  if (missing.includes('address_line_1')) {
    const addrTextarea = resolveField(['textarea[name*="address" i]', 'textarea[id*="address" i]', 'textarea'], ['地址', 'address']);
    if (addrTextarea) {
      setNativeValue(addrTextarea, profile.addressLines.filter(Boolean).join('\\n'));
      filled.push('address_combined');
    }
  }

  const syncStatus = document.getElementById('sync_status');
  if (syncStatus) syncStatus.dataset.state = 'done';
  const syncStatusText = document.getElementById('sync_status_text');
  if (syncStatusText) syncStatusText.textContent = '已从 TG 消息同步并填入目标页面。';
  const syncTime = document.getElementById('sync_time');
  if (syncTime) syncTime.textContent = new Date().toLocaleString('zh-CN', { hour12: false });

  window.scrollTo({ top: 0, behavior: 'instant' });
  return {
    ok: filled.length > 0,
    templateSelected: true,
    selectedTemplate,
    title: document.title,
    url: location.href,
    filledCount: filled.length,
    filledFields: filled,
    missingFields: missing,
  };
})()`;

const result = await call("Runtime.evaluate", {
  expression,
  returnByValue: true,
  awaitPromise: true,
});
if (result.exceptionDetails) {
  throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "页面填表脚本执行失败");
}
const fillResult = result.result?.value;
if (!fillResult?.templateSelected) {
  throw new Error(fillResult?.error || `未能选择模版：${profile.template}`);
}
if (!fillResult?.ok) throw new Error("目标页面没有找到可填写字段");
const essentialFieldsPresent =
  fillResult.filledFields.includes("full_name") &&
  fillResult.filledFields.includes("recipient_email") &&
  (fillResult.filledFields.includes("address_line_1") || fillResult.filledFields.includes("address_combined"));
if (!essentialFieldsPresent) {
  throw new Error(`目标页面缺少必要字段：${fillResult.missingFields.join(", ")}`);
}
console.log(JSON.stringify(fillResult, null, 2));
const screenshot = await call("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
});
await writeFile("demo-preview.png", Buffer.from(screenshot.data, "base64"));
socket.close();
