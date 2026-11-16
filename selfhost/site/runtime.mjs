import { Miniflare, Log, LogLevel } from 'miniflare';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createOutlookMail } from './outlook-mail.mjs';
export function worker(root, config) {
  const base = path.join(root, 'dist', 'server');
  function collect(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? collect(file) : entry.name.endsWith('.js') ? [{ type: 'ESModule', path: file, contents: readFileSync(file, 'utf8') }] : [];
    });
  }
  const modules = collect(base);
  modules.sort((a, b) => Number(b.path === path.join(base, 'index.js')) - Number(a.path === path.join(base, 'index.js')));
  const mail = createOutlookMail(root, config);
  return new Miniflare({
    name: 'lumen-resource-hub', host: '127.0.0.1', port: 0,
    compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
    modulesRoot: base, modules, cf: false,
    bindings: config.bindings || {}, d1Databases: ['DB'],
    ...(mail ? { serviceBindings: { MAIL_DELIVERY: mail.fetch } } : {}),
    d1Persist: path.join(root, 'data', 'd1'),
    log: new Log(LogLevel.ERROR),
  });
}
