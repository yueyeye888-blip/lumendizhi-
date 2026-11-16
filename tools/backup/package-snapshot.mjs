import fs from 'node:fs';import path from 'node:path';import {splitFile,sha256} from './vault.mjs';
const [resultFile,cipherFile,destination]=process.argv.slice(2);
if(!destination)throw new Error('Usage: node package-snapshot.mjs RESULT.json SNAPSHOT.enc OUTPUT_DIRECTORY');
const r=JSON.parse(fs.readFileSync(resultFile,'utf8'));
if(fs.statSync(cipherFile).size!==r.cipherBytes||await sha256(cipherFile)!==r.cipherSha256)throw new Error('Ciphertext does not match exported result');
const chunks=await splitFile(cipherFile,destination);
const m={format:'lumen-encrypted-snapshot-v1',snapshotId:r.snapshotId,createdAt:r.time||new Date().toISOString(),fileCount:r.fileCount,rawBytes:r.rawBytes,archiveBytes:r.archiveBytes,cipherBytes:r.cipherBytes,archiveSha256:r.archiveSha256,cipherSha256:r.cipherSha256,encryption:'AES-256-GCM; 256-bit random recovery key stored separately',portableWallet:r.portableWallet,portableOutlook:r.portableOutlook,databaseIntegrity:r.databases.map(x=>x.integrity),chunks};
fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(m,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({packaged:true,parts:chunks.length,bytes:r.cipherBytes}));
