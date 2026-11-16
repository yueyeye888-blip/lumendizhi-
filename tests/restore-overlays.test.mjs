import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../tools/backup/apply-overlays.mjs',import.meta.url));
test('matching snapshot gets checked overlays; newer snapshots keep their own code',t=>{
 const r=fs.mkdtempSync(path.join(os.tmpdir(),'lumen-overlay-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));for(const d of ['repo/config','repo/app','bot','site','snapshot'])fs.mkdirSync(path.join(r,d),{recursive:true});
 fs.writeFileSync(r+'/repo/app/example.mjs','updated');const m={id:'test',baseSnapshot:'baseline',files:[{component:'app',relativePath:'example.mjs',sha256:createHash('sha256').update('updated').digest('hex')}]};fs.writeFileSync(r+'/repo/config/restore-overlays.json',JSON.stringify(m));fs.writeFileSync(r+'/snapshot/snapshot-inventory.json',JSON.stringify({snapshotId:'baseline'}));
 const run=()=>spawnSync(process.execPath,[script,r+'/repo',r+'/bot',r+'/site',r+'/snapshot'],{encoding:'utf8'});
 assert.equal(run().status,0);assert.equal(fs.readFileSync(r+'/bot/example.mjs','utf8'),'updated');fs.writeFileSync(r+'/repo/app/example.mjs','tampered');fs.writeFileSync(r+'/bot/example.mjs','existing');assert.notEqual(run().status,0);assert.equal(fs.readFileSync(r+'/bot/example.mjs','utf8'),'existing');
 fs.writeFileSync(r+'/snapshot/snapshot-inventory.json',JSON.stringify({snapshotId:'newer'}));assert.equal(run().status,0);assert.equal(fs.readFileSync(r+'/bot/example.mjs','utf8'),'existing');
});
