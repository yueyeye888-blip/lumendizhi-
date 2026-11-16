import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { worker } from './runtime.mjs';
const root = process.cwd();
const marker = path.join(root, 'data', 'initialized.json');
if (existsSync(marker)) throw new Error('Database is already initialized; existing data was not modified.');
const config = JSON.parse(readFileSync('config/runtime.json', 'utf8'));
const mf = worker(root, config);
try {
  const db = await mf.getD1Database('DB');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(path.join('drizzle', file), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  const imported = JSON.parse(readFileSync('config/import-data.json', 'utf8'));
  const counts = {};
  for (const [table, rows] of Object.entries(imported)) {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table');
    for (const row of rows) {
      const columns = Object.keys(row);
      if (columns.some(c => !/^[a-z_]+$/.test(c))) throw new Error('Invalid column');
      await db.prepare(`INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...columns.map(c => row[c])).run();
    }
    counts[table] = rows.length;
  }
  writeFileSync(marker, JSON.stringify({ sourceVersion: 29, initializedAt: new Date().toISOString(), counts }));
  console.log(JSON.stringify({ initialized: true, counts }));
} finally { await mf.dispose(); }
