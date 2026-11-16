import fs from 'node:fs';import path from 'node:path';import {sha256} from './vault.mjs';
const root=path.resolve(process.argv[2]||'');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'snapshot-inventory.json'),'utf8'));
if(manifest.format!=='lumen-full-snapshot-v1')throw new Error('Unknown inventory');
for(const item of manifest.files){if(path.isAbsolute(item.path)||item.path.split(/[\\/]/).includes('..'))throw new Error('Unsafe inventory path');const file=path.join(root,item.path);if(fs.statSync(file).size!==item.bytes||await sha256(file)!==item.sha256)throw new Error('Snapshot file mismatch: '+item.path);}
console.log(JSON.stringify({verified:true,files:manifest.files.length,snapshotId:manifest.snapshotId}));
