import https from 'node:https';
import path from 'node:path';
import { readFileSync, statSync, createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { worker } from './runtime.mjs';
import { trustedHeaders, verifyPassword, safeReturn } from './auth.mjs';
import { callbackAuthorized, enqueueSiteOrder } from './site-order-queue.mjs';

const root = process.cwd();
const config = JSON.parse(readFileSync('config/runtime.json', 'utf8'));
const mf = worker(root, config);
await mf.ready;
const sessions = new Map(), attempts = new Map();
const cookie = '__Host-lumen_session';
const ttl = 8 * 60 * 60 * 1000;
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const redirect = (res, location, headers = {}) => { res.writeHead(303, { location, 'cache-control': 'no-store', ...headers }); res.end(); };
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function login(res, destination, error = '') {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" });
  res.end(`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lumen 登录</title><style>body{font:16px system-ui;background:#f4f7fb;color:#243d64;margin:0;display:grid;min-height:100vh;place-items:center}main{box-sizing:border-box;background:white;padding:36px;border-radius:20px;max-width:420px;width:92%;box-shadow:0 12px 40px #243d6414}h1{font-size:22px}label{display:block;margin:20px 0}input,button{box-sizing:border-box;width:100%;padding:13px;margin-top:8px;border:1px solid #dce5f3;border-radius:10px;font:inherit}button{background:#1d3b72;color:white;cursor:pointer}p{font-size:13px;line-height:1.7;color:#64748b}.error{color:#b42318}</style><main><h1>Lumen 资源申购中心</h1><p>使用公司内部账号登录</p>${error ? `<p class="error">${escape(error)}</p>` : ''}<form method="post" action="/__host/login"><input type="hidden" name="returnTo" value="${escape(destination)}"><label>邮箱<input type="email" name="email" required autocomplete="username"></label><label>密码<input type="password" name="password" required autocomplete="current-password"></label><button>登录</button></form></main></html>`);
}
async function body(req, limit = 16384) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('Request too large'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
const tls = config.tlsPfxPassword
  ? { pfx: readFileSync('config/tls.pfx'), passphrase: config.tlsPfxPassword }
  : { key: readFileSync('config/tls.key'), cert: readFileSync('config/tls.crt') };
const server = https.createServer(tls, async (req, res) => {
  try {
    const origin = config.origin;
    const url = new URL(req.url, origin);
    const allowedOrigins = new Set([origin, ...(config.aliasOrigins || [])]);
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin && !allowedOrigins.has(req.headers.origin)) return json(res, 403, { error: '请求来源不匹配' });
    if (url.pathname === '/__host/health') return json(res, 200, { ok: true, sourceVersion: 29 });
    // Machine callbacks use the existing order secret, never a browser session.
    if (url.pathname === '/api/address-orders/callback') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
      if (!callbackAuthorized(req.headers.authorization, config.bindings?.ADDRESS_ORDER_CALLBACK_TOKEN)) return json(res, 401, { error: '未授权' });
      const payload = await body(req, 8192);
      const response = await mf.dispatchFetch(url.href, { method: 'POST', headers: { authorization: req.headers.authorization, 'content-type': 'application/json' }, body: payload });
      res.writeHead(response.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(await response.text());
      return;
    }
    if (url.pathname === '/signin-with-chatgpt') return redirect(res, '/__host/login?returnTo=' + encodeURIComponent(safeReturn(url.searchParams.get('return_to'))));
    if (url.pathname === '/__host/login') {
      if (req.method === 'GET') return login(res, safeReturn(url.searchParams.get('returnTo')));
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
      const address = req.socket.remoteAddress;
      const attempt = attempts.get(address) || { count: 0, until: Date.now() + 15 * 60_000 };
      if (attempt.until < Date.now()) attempt.count = 0;
      if (attempt.count >= 8) return json(res, 429, { error: '登录尝试过多，请稍后重试' });
      const fields = new URLSearchParams((await body(req)).toString());
      const users = JSON.parse(readFileSync('config/accounts.json', 'utf8'));
      const user = users.find(u => u.email.toLowerCase() === fields.get('email')?.trim().toLowerCase() && u.enabled !== false);
      if (!user || !verifyPassword(fields.get('password') || '', user.password)) {
        attempt.count++; attempts.set(address, attempt); return login(res, safeReturn(fields.get('returnTo')), '账号或密码不正确');
      }
      attempts.delete(address);
      const token = randomBytes(32).toString('hex'); sessions.set(token, { user, expires: Date.now() + ttl });
      return redirect(res, safeReturn(fields.get('returnTo')), { 'set-cookie': `${cookie}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800` });
    }
    const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookie + '='))?.slice(cookie.length + 1);
    const session = token && sessions.get(token);
    if (url.pathname === '/signout-with-chatgpt') { if (token) sessions.delete(token); return redirect(res, '/__host/login', { 'set-cookie': `${cookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` }); }
    if (!session || session.expires < Date.now()) {
      if (token) sessions.delete(token);
      if (url.pathname.startsWith('/api/')) return json(res, 401, { error: '请先登录' });
      return redirect(res, '/__host/login?returnTo=' + encodeURIComponent(safeReturn(url.pathname + url.search)));
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const assetRoot = path.join(root, 'dist', 'client');
      const asset = path.resolve(assetRoot, '.' + decodeURIComponent(url.pathname));
      if (asset.startsWith(assetRoot + path.sep)) {
        try {
          if (statSync(asset).isFile()) {
            const types = { '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json' };
            res.writeHead(200, { 'content-type': types[path.extname(asset)] || 'application/octet-stream', 'cache-control': url.pathname.includes('/assets/') ? 'private, max-age=31536000, immutable' : 'private, max-age=3600' });
            if (req.method === 'HEAD') return res.end();
            await pipeline(createReadStream(asset), res); return;
          }
        } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
      }
    }
    const headers = trustedHeaders(req.headers, session.user);
    // The outer gateway checks the original browser origin before normalization.
    if (req.headers.origin) headers.set('origin', origin);
    const payload = req.method === 'GET' || req.method === 'HEAD' ? undefined : await body(req, 2 * 1024 * 1024);
    const response = await mf.dispatchFetch(url.href, { method: req.method, headers, body: payload, redirect: 'manual' });
    if (req.method === 'POST' && url.pathname === '/api/personal-details/submit' && response.status === 202 && config.siteOrderQueueDirectory) {
      const result = await response.clone().json();
      if (result.ok && result.requestNo) {
        const db = await mf.getD1Database('DB');
        const order = await db.prepare('SELECT status FROM address_orders WHERE request_no = ?').bind(result.requestNo).first();
        if (order?.status === 'queued') {
          try {
            await enqueueSiteOrder(config.siteOrderQueueDirectory, result.requestNo, JSON.parse(payload.toString()), session.user.email);
            console.log(JSON.stringify({ event: 'address_order_enqueued', requestNo: result.requestNo, time: new Date().toISOString() }));
          } catch {
            await db.prepare("UPDATE address_orders SET status = 'failed', status_message = ?, error = ?, updated_at = ? WHERE request_no = ? AND status = 'queued'").bind('自动处理队列写入失败，请联系管理员', '自动处理队列写入失败，请联系管理员', new Date().toISOString(), result.requestNo).run();
            console.error(JSON.stringify({ event: 'address_order_enqueue_failed', requestNo: result.requestNo }));
          }
        }
      }
    }
    res.statusCode = response.status;
    for (const [key, value] of response.headers) if (!['transfer-encoding', 'content-encoding', 'content-length'].includes(key)) res.setHeader(key, value);
    res.setHeader('x-content-type-options', 'nosniff');
    if (response.body && req.method !== 'HEAD') await pipeline(Readable.fromWeb(response.body), res); else res.end();
  } catch {
    if (!res.headersSent) json(res, 500, { error: '服务暂时不可用，请稍后重试' }); else res.end();
    console.error(JSON.stringify({ event: 'request_failed', path: req.url?.split('?')[0], time: new Date().toISOString() }));
  }
});
server.listen(config.port || 8443, process.env.LUMEN_LISTEN_HOST || '0.0.0.0', () => console.log(JSON.stringify({ event: 'listening', sourceVersion: 29, port: config.port || 8443 })));
const cleanup = setInterval(() => { for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key); for (const [key, value] of attempts) if (value.until < Date.now()) attempts.delete(key); }, 60_000);
for (const event of ['SIGTERM', 'SIGINT']) process.on(event, () => { clearInterval(cleanup); server.close(async () => { await mf.dispose(); process.exit(0); }); });
