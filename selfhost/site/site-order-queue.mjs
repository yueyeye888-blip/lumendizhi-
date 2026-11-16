import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const orderPattern = /^ADDR-\d{8}-[A-Z0-9]{8}$/;
export function callbackAuthorized(header, secret) {
  if (!secret || typeof header !== 'string') return false;
  const supplied = Buffer.from(header.replace(/^Bearer\s+/i, '').trim());
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function orderNotice(requestNo, payload, submitterEmail) {
  const p = payload?.profile;
  if (!orderPattern.test(requestNo) || !p || !Array.isArray(p.addressLines) || p.addressLines.length !== 3) throw new Error('Invalid order snapshot');
  const values = [p.fullName, ...p.addressLines, p.recipientEmail, payload.template?.name, submitterEmail];
  if (values.some(v => typeof v !== 'string' || /[\r\n]/.test(v))) throw new Error('Invalid order fields');
  const normalized = value => value.trim().replace(/\s+/g, ' ');
  return ['📩 新的个人资料提交', `订单编号：${requestNo}`, '', `提交人账号：${submitterEmail}`, '', `姓名：${normalized(p.fullName)}`, '',
    ...p.addressLines.map((line, i) => `第 ${i + 1} 行地址：${normalized(line)}`), '', `模版：${payload.template.name.trim()}`, '', `接收邮箱：${p.recipientEmail.trim().toLowerCase()}`].join('\n');
}

export async function enqueueSiteOrder(directory, requestNo, payload, submitterEmail) {
  const text = orderNotice(requestNo, payload, submitterEmail);
  await mkdir(directory, { recursive: true });
  const job = path.join(directory, requestNo);
  try { await mkdir(job); } catch (error) {
    if (error.code === 'EEXIST') return { duplicate: true };
    throw error;
  }
  await writeFile(path.join(job, 'pending.tmp'), JSON.stringify({ requestNo, text, createdAt: new Date().toISOString() }), { mode: 0o600 });
  await rename(path.join(job, 'pending.tmp'), path.join(job, 'pending.json'));
  return { duplicate: false };
}

// A claimed job is never automatically replayed after a crash or a failure.
// This prevents a restarted consumer from creating or paying for it twice.
export async function processSiteQueue(directory, handle, onError = () => {}) {
  if (!directory) return;
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries.filter(e => e.isDirectory() && orderPattern.test(e.name)).sort((a,b) => a.name.localeCompare(b.name))) {
    const job = path.join(directory, entry.name);
    const active = path.join(job, 'processing.json');
    try { await rename(path.join(job, 'pending.json'), active); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    try {
      const data = JSON.parse(await readFile(active, 'utf8'));
      if (data.requestNo !== entry.name || typeof data.text !== 'string') throw new Error('Queue identity mismatch');
      await handle(data);
      await writeFile(path.join(job, 'done.json'), JSON.stringify({ requestNo: data.requestNo, completedAt: new Date().toISOString() }));
      await rename(active, path.join(job, 'completed-payload.json'));
    } catch (error) {
      await rename(active, path.join(job, 'failed-payload.json'));
      await onError(entry.name, error);
    }
  }
}
