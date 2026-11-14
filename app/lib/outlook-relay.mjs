import { spawn } from "node:child_process";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const OAUTH_ROOT = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const OAUTH_SCOPE = "offline_access User.Read Mail.ReadWrite Mail.Send";
const PROCESSED_CATEGORY = "越大爷已交付";
const DELIVERY_DELAY_MS = 60_000;
const SMALL_ATTACHMENT_BYTES = 2_500_000;
const UPLOAD_CHUNK_BYTES = 10 * 320 * 1024;
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

let storeTail = Promise.resolve();
let cachedAccessToken = null;

function clean(value, limit = 500) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
}

function enabled(value) {
  return value === true || ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isGuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadOutlookRelaySettings(raw, root) {
  const requested = enabled(raw?.enabled);
  const mailbox = clean(raw?.mailbox, 254).toLowerCase();
  const clientId = clean(raw?.clientId, 80);
  const brandName = clean(raw?.brandName || "越大爷", 80) || "越大爷";
  const pollSeconds = Math.min(300, Math.max(15, Number(raw?.pollSeconds) || 30));
  const secretPath = path.join(root, "secrets", "outlook-refresh-token.dpapi");
  const jobsPath = path.join(root, "data", "outlook-delivery-jobs.json");
  const problems = [];
  if (requested && !isEmail(mailbox)) problems.push("Outlook 邮箱地址无效");
  if (requested && !isGuid(clientId)) problems.push("Outlook OAuth Client ID 尚未配置");
  const authorized = problems.length === 0 && await exists(secretPath);
  if (requested && !authorized && problems.length === 0) problems.push("Outlook 尚未完成一次性授权");
  return {
    enabled: requested,
    active: requested && authorized && problems.length === 0,
    mailbox,
    clientId,
    brandName,
    pollSeconds,
    root,
    secretPath,
    jobsPath,
    activationError: problems.join("；"),
  };
}

function runPowerShell(settings, scriptName, input = "") {
  if (process.platform !== "win32") throw new Error("Outlook DPAPI 令牌只能在 Windows 服务器上读取");
  const scriptPath = path.join(settings.root, "scripts", scriptName);
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", scriptPath,
      "-InstallRoot", settings.root,
    ], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `Outlook DPAPI 操作失败 (${code})`));
    });
    child.stdin.end(input);
  });
}

async function readRefreshToken(settings) {
  const token = await runPowerShell(settings, "read-outlook-token.ps1");
  if (!token) throw new Error("Outlook 刷新令牌为空");
  return token;
}

export async function saveOutlookRefreshToken(settings, token) {
  if (!token || /[\r\n\0]/.test(token)) throw new Error("Outlook 刷新令牌无效");
  await runPowerShell(settings, "write-outlook-token.ps1", token);
}

async function tokenRequest(body) {
  const response = await fetch(`${OAUTH_ROOT}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function refreshAccessToken(settings) {
  if (cachedAccessToken?.clientId === settings.clientId
    && cachedAccessToken?.mailbox === settings.mailbox
    && cachedAccessToken.expiresAt > Date.now() + 120_000) {
    return cachedAccessToken.value;
  }
  const refreshToken = await readRefreshToken(settings);
  const { response, data } = await tokenRequest({
    client_id: settings.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: OAUTH_SCOPE,
  });
  if (!response.ok || !data.access_token) {
    throw new Error(`Outlook OAuth 刷新失败 (${response.status})：${clean(data.error_description || data.error, 240)}`);
  }
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await saveOutlookRefreshToken(settings, data.refresh_token);
  }
  cachedAccessToken = {
    clientId: settings.clientId,
    mailbox: settings.mailbox,
    value: data.access_token,
    expiresAt: Date.now() + Math.max(300, Number(data.expires_in) || 3600) * 1000,
  };
  return cachedAccessToken.value;
}

async function graphResponse(accessToken, method, pathname, body, headers = {}) {
  const response = await fetch(`${GRAPH_ROOT}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let detail = text;
    try { detail = JSON.parse(text)?.error?.message || text; } catch {}
    throw new Error(`Outlook Graph ${method} ${pathname} 失败 (${response.status})：${clean(detail, 300)}`);
  }
  return response;
}

async function graphJson(accessToken, method, pathname, body) {
  const response = await graphResponse(accessToken, method, pathname, body);
  if (response.status === 202 || response.status === 204) return {};
  return response.json();
}

export async function authorizeOutlookDevice(settings, onCode) {
  if (!isEmail(settings.mailbox) || !isGuid(settings.clientId)) {
    throw new Error("请先配置有效的 Outlook 邮箱和 OAuth Client ID");
  }
  const response = await fetch(`${OAUTH_ROOT}/devicecode`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: settings.clientId, scope: OAUTH_SCOPE }),
    signal: AbortSignal.timeout(30_000),
  });
  const device = await response.json().catch(() => ({}));
  if (!response.ok || !device.device_code) {
    throw new Error(`无法启动 Outlook 授权 (${response.status})：${clean(device.error_description || device.error, 240)}`);
  }
  onCode?.({
    userCode: device.user_code,
    verificationUri: device.verification_uri,
    message: device.message,
    expiresIn: device.expires_in,
  });
  const deadline = Date.now() + Number(device.expires_in || 900) * 1000;
  let interval = Math.max(5, Number(device.interval) || 5);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    const { response: tokenResponse, data } = await tokenRequest({
      client_id: settings.clientId,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: device.device_code,
    });
    if (tokenResponse.ok && data.access_token && data.refresh_token) {
      const profile = await graphJson(data.access_token, "GET", "/me?$select=displayName,mail,userPrincipalName");
      const identities = [profile.mail, profile.userPrincipalName].filter(Boolean).map((item) => String(item).toLowerCase());
      if (!identities.includes(settings.mailbox)) {
        throw new Error(`登录邮箱与配置不一致：期望 ${settings.mailbox}`);
      }
      await saveOutlookRefreshToken(settings, data.refresh_token);
      cachedAccessToken = {
        clientId: settings.clientId,
        mailbox: settings.mailbox,
        value: data.access_token,
        expiresAt: Date.now() + Math.max(300, Number(data.expires_in) || 3600) * 1000,
      };
      return profile;
    }
    if (data.error === "authorization_pending") continue;
    if (data.error === "slow_down") {
      interval += 5;
      continue;
    }
    throw new Error(`Outlook 授权失败：${clean(data.error_description || data.error, 240)}`);
  }
  throw new Error("Outlook 授权已超时，请重新运行授权工具");
}

function withStoreLock(work) {
  const running = storeTail.then(work, work);
  storeTail = running.catch(() => {});
  return running;
}

async function readJobs(settings) {
  try {
    const data = JSON.parse(await readFile(settings.jobsPath, "utf8"));
    return Array.isArray(data?.jobs) ? data.jobs : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeJobs(settings, jobs) {
  await mkdir(path.dirname(settings.jobsPath), { recursive: true });
  const temporary = `${settings.jobsPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ version: 1, jobs })}\n`, { mode: 0o600 });
  await rename(temporary, settings.jobsPath);
}

export async function queueOutlookDelivery(settings, profile, payment) {
  if (!settings.active) return false;
  const externalOrderNo = clean(payment?.externalOrderNo, 100);
  if (!externalOrderNo) throw new Error("Outlook 交付任务缺少 addrs.xyz 订单号");
  return withStoreLock(async () => {
    const jobs = await readJobs(settings);
    const now = new Date();
    const job = {
      requestNo: clean(profile.requestNo, 80),
      externalOrderNo,
      recipientEmail: clean(profile.recipientEmail, 254).toLowerCase(),
      fullName: clean(profile.fullName, 160),
      addressLines: Array.isArray(profile.addressLines) ? profile.addressLines.map((line) => clean(line, 200)).slice(0, 3) : [],
      createdAt: now.toISOString(),
      readyAfter: new Date(now.getTime() + DELIVERY_DELAY_MS).toISOString(),
      state: "waiting",
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
      sourceMessageId: null,
      deliveredAt: null,
    };
    const index = jobs.findIndex((item) => item.externalOrderNo === externalOrderNo);
    if (index >= 0 && jobs[index].state !== "delivered") jobs[index] = { ...jobs[index], ...job };
    else if (index < 0) jobs.push(job);
    await writeJobs(settings, jobs.slice(-500));
    return true;
  });
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function matchDeliveryJob(jobs, message) {
  const haystack = [
    message?.subject,
    message?.body?.content,
    message?.bodyPreview,
  ].map(decodeHtml).join(" ");
  return jobs.find((job) => job.state !== "delivered"
    && job.externalOrderNo
    && haystack.includes(job.externalOrderNo)) || null;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildBrandedMessage(job, brandName = "越大爷") {
  const brand = clean(brandName, 80) || "越大爷";
  const orderNo = clean(job.externalOrderNo, 100);
  const address = (job.addressLines || []).filter(Boolean).join(", ");
  const subject = `${brand}｜文件生成完成｜${orderNo}`;
  const paragraphs = [
    brand,
    "文件生成完成",
    "生成成功",
    "您的图片和 PDF 已准备完成",
    "PDF 原件和图片（合成）文件已制作完成，请下载附件。",
    "下载后请打开 PDF 查看地址、姓名是否存在乱码等异常。",
    "PDF 原件已核验元数据，请勿修改或编辑 PDF。",
    "可直接上传 PDF 原件、合成图片，或自行打印拍照。",
    "",
    "声明：",
    "本文件为翻译件，仅用于语言转换参考。文件内容由客户提供或指定区域来源整理，其真实性及准确性不在本翻译件范围内进行核实。",
    "本翻译件仅反映原文件内容的语言转换结果，请根据实际用途自行确认其适用性。",
    "",
    "邮件附件",
    "图片和 PDF · 2 个文件",
    "",
    "订单号",
    orderNo,
    "",
    "本次使用地址",
    address,
    "",
    "文件已作为附件发送，请下载并妥善保存。若未在收件箱看到邮件，请同时检查垃圾邮件。",
    `本邮件由 ${brand} 自动发送。`,
  ];
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,'Microsoft YaHei',sans-serif;color:#1f2937"><div style="max-width:680px;margin:24px auto;background:white;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb"><div style="padding:24px 28px;background:#1f67db;color:white;font-size:24px;font-weight:700">${escapeHtml(brand)}</div><div style="padding:28px"><h1 style="margin:0 0 8px;font-size:26px">文件生成完成</h1><p style="color:#16803c;font-weight:700">生成成功</p><p>您的图片和 PDF 已准备完成。</p><p>PDF 原件和图片（合成）文件已制作完成，请下载附件。</p><p>下载后请打开 PDF 查看地址、姓名是否存在乱码等异常！</p><p>PDF 原件已核验元数据，请勿修改或编辑 PDF。</p><p>【可直接上传 PDF 原件 / 合成图片 / 自行打印拍照】</p><hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0"><h2 style="font-size:18px">声明</h2><p style="line-height:1.8;color:#4b5563">本文件为翻译件，仅用于语言转换参考。文件内容由客户提供或指定区域来源整理，其真实性及准确性不在本翻译件范围内进行核实。</p><p style="line-height:1.8;color:#4b5563">本翻译件仅反映原文件内容的语言转换结果，请根据实际用途自行确认其适用性。</p><div style="margin-top:24px;padding:18px;background:#f8fafc;border-radius:12px"><p><strong>邮件附件</strong><br>图片和 PDF · 2 个文件</p><p><strong>订单号</strong><br>${escapeHtml(orderNo)}</p><p><strong>本次使用地址</strong><br>${escapeHtml(address)}</p></div><p style="margin-top:24px">文件已作为附件发送，请下载并妥善保存。若未在收件箱看到邮件，请同时检查垃圾邮件。</p><p style="color:#6b7280;font-size:13px">本邮件由 ${escapeHtml(brand)} 自动发送。</p></div></div></body></html>`;
  return { subject, text: paragraphs.join("\n"), html };
}

function pdfLiteral(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPreviewPdf(orderNo) {
  const stream = [
    "BT",
    "/F1 24 Tf",
    "72 720 Td",
    `(${pdfLiteral("Yue Da Ye - Test Delivery")}) Tj`,
    "0 -42 Td",
    "/F1 14 Tf",
    `(${pdfLiteral(`Order: ${orderNo}`)}) Tj`,
    "0 -28 Td",
    `(${pdfLiteral("This PDF is only for checking the delivery email layout.")}) Tj`,
    "ET",
  ].join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

export function buildOutlookPreviewPackage(job, brandName = "越大爷") {
  const content = buildBrandedMessage(job, brandName);
  const brand = clean(brandName, 80) || "越大爷";
  const orderNo = clean(job.externalOrderNo, 100);
  const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#f4f7fb"/><rect x="70" y="70" width="1060" height="660" rx="36" fill="#ffffff" stroke="#dbe4f0" stroke-width="4"/><rect x="70" y="70" width="1060" height="150" rx="36" fill="#1f67db"/><text x="130" y="165" fill="#ffffff" font-size="58" font-family="Arial, Microsoft YaHei, sans-serif" font-weight="700">${escapeHtml(brand)}</text><text x="130" y="335" fill="#1f2937" font-size="62" font-family="Arial, Microsoft YaHei, sans-serif" font-weight="700">文件生成完成</text><text x="130" y="420" fill="#16803c" font-size="38" font-family="Arial, Microsoft YaHei, sans-serif">生成成功</text><text x="130" y="510" fill="#4b5563" font-size="30" font-family="Arial, Microsoft YaHei, sans-serif">此图片用于测试邮件 UI 与附件展示</text><text x="130" y="610" fill="#6b7280" font-size="26" font-family="Arial, sans-serif">Order: ${escapeHtml(orderNo)}</text></svg>`;
  return {
    content,
    attachments: [
      {
        name: `${brand}-测试文件.pdf`,
        contentType: "application/pdf",
        content: buildPreviewPdf(orderNo),
      },
      {
        name: `${brand}-测试图片.svg`,
        contentType: "image/svg+xml",
        content: Buffer.from(svg, "utf8"),
      },
    ],
  };
}

async function listSourceAttachments(accessToken, messageId) {
  const data = await graphJson(accessToken, "GET", `/me/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`);
  const files = (data.value || []).filter((item) => {
    if (item.isInline || item.size > MAX_ATTACHMENT_BYTES) return false;
    return item.contentType === "application/pdf"
      || String(item.contentType || "").startsWith("image/")
      || /\.(pdf|png|jpe?g|webp)$/i.test(item.name || "");
  });
  const pdf = files.find((item) => item.contentType === "application/pdf" || /\.pdf$/i.test(item.name || ""));
  const image = files.find((item) => String(item.contentType || "").startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(item.name || ""));
  if (!pdf || !image) throw new Error("Outlook 原邮件没有同时找到 PDF 和图片附件");
  const selected = [pdf, image];
  const output = [];
  for (const item of selected) {
    const response = await graphResponse(accessToken, "GET", `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(item.id)}/$value`);
    output.push({
      name: clean(item.name, 180).replace(/[\\/:*?"<>|]/g, "_") || "attachment",
      contentType: clean(item.contentType, 100) || "application/octet-stream",
      content: Buffer.from(await response.arrayBuffer()),
    });
  }
  return output;
}

async function attachFile(accessToken, draftId, attachment) {
  if (attachment.content.length <= SMALL_ATTACHMENT_BYTES) {
    await graphJson(accessToken, "POST", `/me/messages/${encodeURIComponent(draftId)}/attachments`, {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: attachment.name,
      contentType: attachment.contentType,
      contentBytes: attachment.content.toString("base64"),
    });
    return;
  }
  const session = await graphJson(accessToken, "POST", `/me/messages/${encodeURIComponent(draftId)}/attachments/createUploadSession`, {
    AttachmentItem: {
      attachmentType: "file",
      name: attachment.name,
      size: attachment.content.length,
      contentType: attachment.contentType,
    },
  });
  if (!session.uploadUrl) throw new Error("Outlook 没有返回附件上传地址");
  for (let start = 0; start < attachment.content.length; start += UPLOAD_CHUNK_BYTES) {
    const end = Math.min(start + UPLOAD_CHUNK_BYTES, attachment.content.length);
    const chunk = attachment.content.subarray(start, end);
    const response = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: {
        "content-length": String(chunk.length),
        "content-range": `bytes ${start}-${end - 1}/${attachment.content.length}`,
      },
      body: chunk,
      signal: AbortSignal.timeout(120_000),
    });
    if (![200, 201, 202].includes(response.status)) {
      throw new Error(`Outlook 大附件上传失败 (${response.status})`);
    }
  }
}

async function sendBrandedMail(accessToken, settings, job, attachments) {
  const content = buildBrandedMessage(job, settings.brandName);
  const draft = await graphJson(accessToken, "POST", "/me/messages", {
    subject: content.subject,
    body: { contentType: "HTML", content: content.html },
    toRecipients: [{
      emailAddress: {
        address: job.recipientEmail,
        name: job.fullName || job.recipientEmail,
      },
    }],
  });
  if (!draft.id) throw new Error("Outlook 创建邮件草稿失败");
  try {
    for (const attachment of attachments) {
      await attachFile(accessToken, draft.id, attachment);
    }
    await graphJson(accessToken, "POST", `/me/messages/${encodeURIComponent(draft.id)}/send`, {});
  } catch (error) {
    await graphResponse(accessToken, "DELETE", `/me/messages/${encodeURIComponent(draft.id)}`).catch(() => {});
    throw error;
  }
}

export async function sendOutlookPreviewMail(settings, recipientEmail) {
  const recipient = clean(recipientEmail, 254).toLowerCase();
  if (!settings?.active) throw new Error("Outlook 邮件接管尚未启用");
  if (!isEmail(recipient)) throw new Error("测试收件邮箱无效");
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const job = {
    externalOrderNo: `TEST${stamp}`,
    recipientEmail: recipient,
    fullName: "测试收件人",
    addressLines: ["619 Oak Ave", "Austin", "TX 61397, United States"],
  };
  const preview = buildOutlookPreviewPackage(job, settings.brandName);
  const accessToken = await refreshAccessToken(settings);
  await sendBrandedMail(accessToken, settings, job, preview.attachments);
  return { orderNo: job.externalOrderNo, recipientEmail: recipient };
}

async function pollOutlookDeliveries(settings, onDelivered) {
  return withStoreLock(async () => {
    const jobs = await readJobs(settings);
    const waiting = jobs.filter((job) => job.state !== "delivered");
    if (!waiting.length) return 0;
    const accessToken = await refreshAccessToken(settings);
    const query = new URLSearchParams({
      "$select": "id,subject,body,bodyPreview,receivedDateTime,hasAttachments,categories",
      "$top": "50",
      "$orderby": "receivedDateTime desc",
    });
    const inbox = await graphJson(accessToken, "GET", `/me/mailFolders/inbox/messages?${query}`);
    let delivered = 0;
    for (const message of inbox.value || []) {
      if (!message.hasAttachments || message.categories?.includes(PROCESSED_CATEGORY)) continue;
      const text = decodeHtml(`${message.subject || ""} ${message.body?.content || ""}`);
      if (!/文件生成完成/.test(text) || !/PDF/i.test(text)) continue;
      const job = matchDeliveryJob(waiting, message);
      if (!job || Date.parse(job.readyAfter) > Date.now()) continue;
      if (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > Date.now()) continue;
      try {
        const attachments = await listSourceAttachments(accessToken, message.id);
        await sendBrandedMail(accessToken, settings, job, attachments);
        job.state = "delivered";
        job.sourceMessageId = message.id;
        job.deliveredAt = new Date().toISOString();
        job.lastError = null;
        job.nextAttemptAt = null;
        await graphJson(accessToken, "PATCH", `/me/messages/${encodeURIComponent(message.id)}`, {
          isRead: true,
          categories: [...new Set([...(message.categories || []), PROCESSED_CATEGORY])],
        });
        await writeJobs(settings, jobs);
        await onDelivered?.(job);
        delivered += 1;
      } catch (error) {
        job.attempts = Number(job.attempts || 0) + 1;
        job.lastError = clean(error instanceof Error ? error.message : error, 500);
        const delayMinutes = Math.min(30, 2 ** Math.min(5, job.attempts));
        job.nextAttemptAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
        await writeJobs(settings, jobs);
      }
    }
    return delivered;
  });
}

export function startOutlookRelay(settings, { onDelivered, logger = console } = {}) {
  if (!settings.active) {
    if (settings.enabled) logger.warn(`[outlook-relay] disabled: ${settings.activationError || "not ready"}`);
    return { stop() {} };
  }
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const delivered = await pollOutlookDeliveries(settings, onDelivered);
      if (delivered) logger.log(`[outlook-relay] delivered ${delivered} order(s)`);
    } catch (error) {
      logger.error(`[outlook-relay] poll failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, settings.pollSeconds * 1000);
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
