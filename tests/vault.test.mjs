import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';import {randomBytes} from 'node:crypto';
import {encryptFile,decryptFile,sha256,splitFile,joinParts} from '../tools/backup/vault.mjs';
test('encrypted split snapshot restores byte-for-byte and rejects tampering',async t=>{
 const dir=await fs.mkdtemp(path.join(tmpdir(),'lumen-vault-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const raw=path.join(dir,'source'),enc=path.join(dir,'encrypted'),restored=path.join(dir,'restored'),key=randomBytes(32),data=randomBytes(5000);await fs.writeFile(raw,data);
 await encryptFile(raw,enc,key);const chunks=await splitFile(enc,path.join(dir,'parts'),1024);
 const manifest=path.join(dir,'parts/manifest.json');await fs.writeFile(manifest,JSON.stringify({format:'lumen-encrypted-snapshot-v1',chunks,cipherSha256:await sha256(enc)}));
 const joined=path.join(dir,'joined');await joinParts(manifest,joined);await decryptFile(joined,restored,key);assert.deepEqual(await fs.readFile(restored),data);
 await assert.rejects(decryptFile(joined,path.join(dir,'wrong-key'),randomBytes(32)),/authentication/);
 const damaged=await fs.readFile(joined);damaged[50]^=1;await fs.writeFile(joined,damaged);await assert.rejects(decryptFile(joined,path.join(dir,'damaged'),key),/authentication/);
 await fs.rm(path.join(dir,'parts',chunks[0].name));await assert.rejects(joinParts(manifest,path.join(dir,'missing')));
});
