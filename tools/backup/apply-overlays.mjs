import fs from 'node:fs';import path from 'node:path';import {sha256} from './vault.mjs';
const [repo,botRoot,siteRoot,snapshotRoot]=process.argv.slice(2);const manifest=JSON.parse(fs.readFileSync(path.join(repo,'config/restore-overlays.json'),'utf8'));
const snapshot=JSON.parse(fs.readFileSync(path.join(snapshotRoot,'snapshot-inventory.json'),'utf8'));
if(snapshot.snapshotId!==manifest.baseSnapshot){console.log('Snapshot already supplies its own application version; baseline overlays skipped.');process.exit(0);}
for(const item of manifest.files){
 if(!['app','selfhost/site'].includes(item.component)||path.isAbsolute(item.relativePath)||item.relativePath.split(/[\\/]/).includes('..'))throw new Error('Unsafe overlay path');
 const source=path.join(repo,item.component,item.relativePath);if(await sha256(source)!==item.sha256)throw new Error('Overlay checksum mismatch: '+item.relativePath);
}
for(const item of manifest.files){const target=path.join(item.component==='app'?botRoot:siteRoot,item.relativePath);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(repo,item.component,item.relativePath),target);}
console.log(JSON.stringify({overlay:manifest.id,files:manifest.files.length}));
