import { randomBytes, randomUUID, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { sampleMailAttachments } from './sample-mail-attachments.mjs';

export function encryptMailToken(token, encodedKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(encodedKey, 'base64'), iv);
  const bytes = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), ciphertext: bytes.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
export function decryptMailToken(record, encodedKey) {
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(encodedKey, 'base64'), Buffer.from(record.iv, 'base64'));
  cipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(record.ciphertext, 'base64')), cipher.final()]).toString('utf8');
}
const save = (file, data) => { writeFileSync(file + '.tmp', JSON.stringify(data)); renameSync(file + '.tmp', file); };
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value);

export function createOutlookMail(root, config, fetchImpl = fetch) {
  const credentialsFile = path.join(root, 'data', 'outlook-mail-credentials.json');
  if (!existsSync(credentialsFile)) return null;
  const ledgerFile = path.join(root, 'data', 'outlook-mail-delivery.json');
  let cached, refreshPending;
  let queue = Promise.resolve();
  async function token() {
    if (cached && cached.expires > Date.now() + 120000) return cached;
    if (refreshPending) return refreshPending;
    refreshPending = (async () => {
      const credentials = JSON.parse(readFileSync(credentialsFile, 'utf8'));
      const refreshToken = decryptMailToken(credentials.refreshToken, config.bindings.SETTINGS_ENCRYPTION_KEY);
      const response = await fetchImpl('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: credentials.clientId, grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'offline_access User.Read Mail.Send' }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json();
      if (!response.ok || !data.access_token || !/\bMail\.Send\b/i.test(data.scope || '')) throw new Error('Outlook authorization is unavailable or lacks Mail.Send');
      if (data.refresh_token) {
        credentials.refreshToken = encryptMailToken(data.refresh_token, config.bindings.SETTINGS_ENCRYPTION_KEY);
        credentials.updatedAt = new Date().toISOString(); save(credentialsFile, credentials);
      }
      cached = { access: data.access_token, mailbox: credentials.mailbox, expires: Date.now() + Number(data.expires_in || 3600) * 1000 };
      return cached;
    })();
    try { return await refreshPending; } finally { refreshPending = null; }
  }
  async function validate() {
    const current = await token();
    const response = await fetchImpl('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', { headers: { authorization: `Bearer ${current.access}` }, signal: AbortSignal.timeout(20000) });
    const profile = await response.json();
    if (!response.ok || ![profile.mail, profile.userPrincipalName].filter(Boolean).some(v => v.toLowerCase() === current.mailbox.toLowerCase())) throw new Error('Outlook mailbox identity does not match the approved test account');
    return { provider: 'Outlook', authorized: true, mailbox: current.mailbox };
  }
  async function deliver(payload, key) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !/^[A-Za-z0-9_./:-]{1,180}$/.test(key || '') || !validEmail(payload.to) || typeof payload.subject !== 'string' || payload.subject.length > 250 || /[\r\n]/.test(payload.subject) || (!payload.text && !payload.html) || [payload.text, payload.html].some(s => s !== undefined && (typeof s !== 'string' || s.length > 200000))) {
      return { status: 400, body: { ok: false, status: 'failed', error: '邮件参数无效' } };
    }
    let attachments;
    try { attachments = sampleMailAttachments(payload, key); }
    catch (error) { return { status: 400, body: { ok: false, status: 'failed', error: error.message } }; }
    const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    let ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : {};
    ledger = Object.fromEntries(Object.entries(ledger).filter(([, row]) => row.at > Date.now() - 86400000));
    if (ledger[key]) {
      if (ledger[key].digest !== digest) return { status: 409, body: { ok: false, error: '该发送编号对应的邮件内容已变化' } };
      if (ledger[key].state === 'accepted') return { status: 200, body: { ok: true, status: 'accepted', providerId: ledger[key].id, deduplicated: true } };
      return { status: 503, body: { ok: false, status: 'unknown', error: '上次邮件发送结果尚未确认，请先核对收件箱和垃圾邮箱' } };
    }
    const current = await token();
    const id = `outlook-${randomUUID()}`;
    ledger[key] = { digest, id, at: Date.now(), state: 'pending' }; save(ledgerFile, ledger);
    let response;
    try {
      response = await fetchImpl('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST', headers: { authorization: `Bearer ${current.access}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ message: { subject: payload.subject, body: { contentType: payload.html ? 'HTML' : 'Text', content: payload.html || payload.text }, toRecipients: [{ emailAddress: { address: payload.to } }], ...(attachments.length ? { attachments } : {}) }, saveToSentItems: true }),
      });
    } catch {
      ledger[key].state = 'unknown'; save(ledgerFile, ledger);
      return { status: 502, body: { ok: false, status: 'unknown', error: '邮件发送结果暂时无法确认，请核对收件箱和垃圾邮箱，避免重复发送' } };
    }
    if (response.status !== 202) {
      delete ledger[key]; save(ledgerFile, ledger);
      if (response.status === 401) cached = null;
      return { status: 502, body: { ok: false, status: 'failed', error: `Outlook 未接受发送请求（${response.status}）` } };
    }
    ledger[key].state = 'accepted'; save(ledgerFile, ledger);
    return { status: 200, body: { ok: true, status: 'accepted', providerId: id, accepted: true, attachmentCount: attachments.length } };
  }
  async function relay(request) {
    if (request.method === 'GET' && new URL(request.url).pathname === '/status') {
      try {
        const result = await validate();
        const [local, domain] = result.mailbox.split('@');
        return Response.json({ configured: true, authorized: true, provider: 'Outlook', maskedSender: local.slice(0, 2) + '***@' + domain });
      } catch { return Response.json({ configured: true, authorized: false, error: 'Outlook 邮箱授权验证失败' }, { status: 503 }); }
    }
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/send') return Response.json({ ok: false }, { status: 404 });
    const text = await request.text();
    if (Buffer.byteLength(text) > 500000) return Response.json({ ok: false }, { status: 413 });
    let payload; try { payload = JSON.parse(text); } catch { return Response.json({ ok: false }, { status: 400 }); }
    const run = queue.then(() => deliver(payload, request.headers.get('idempotency-key')));
    queue = run.catch(() => {});
    try { const result = await run; return Response.json(result.body, { status: result.status }); }
    catch { return Response.json({ ok: false, status: 'unknown', error: '邮件授权、连接或状态记录异常，发送结果待确认；请联系管理员核对' }, { status: 502 }); }
  }
  return { validate, fetch: relay };
}
