import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function passwordRecord(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
export function verifyPassword(password, record) {
  if (!record?.salt || !/^[a-f0-9]{128}$/.test(record.hash)) return false;
  return timingSafeEqual(scryptSync(password, record.salt, 64), Buffer.from(record.hash, 'hex'));
}
export function trustedHeaders(incoming, user) {
  const headers = new Headers(incoming);
  for (const name of [...headers.keys()]) {
    if (/^(oai-|x-forwarded-|x-dispatched-|cf-)/i.test(name) || ['host', 'connection', 'content-length', 'cookie'].includes(name)) headers.delete(name);
  }
  headers.set('oai-authenticated-user-id', user.id);
  headers.set('oai-authenticated-user-email', user.email);
  headers.set('oai-authenticated-user-full-name', encodeURIComponent(user.name || user.email));
  headers.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
  return headers;
}
export function safeReturn(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value) || value.startsWith('/__host/') || value.startsWith('/signin-with-chatgpt')) return '/';
  return value;
}
