import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
const MAGIC=Buffer.from('LUMENBK1');
export async function sha256(file){const h=createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
export function readKey(file){const data=JSON.parse(fs.readFileSync(file,'utf8'));const key=Buffer.from(data.keyBase64||'','base64');if(data.format!=='lumen-recovery-key-v1'||key.length!==32)throw new Error('Invalid recovery key file');return key;}
export async function encryptFile(input,output,key){
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(MAGIC);
 await fsp.writeFile(output,Buffer.concat([MAGIC,nonce]),{mode:0o600,flag:'wx'});
 try{await pipeline(fs.createReadStream(input),cipher,fs.createWriteStream(output,{flags:'a'}));await fsp.appendFile(output,cipher.getAuthTag());}
 catch(e){await fsp.rm(output,{force:true});throw e;}
}
export async function decryptFile(input,output,key){
 const size=(await fsp.stat(input)).size;if(size<36)throw new Error('Truncated encrypted backup');
 const handle=await fsp.open(input,'r');const head=Buffer.alloc(20),tag=Buffer.alloc(16);
 try{await handle.read(head,0,20,0);await handle.read(tag,0,16,size-16);}finally{await handle.close();}
 if(!head.subarray(0,8).equals(MAGIC))throw new Error('Unknown backup format');
 const cipher=createDecipheriv('aes-256-gcm',key,head.subarray(8));cipher.setAAD(MAGIC);cipher.setAuthTag(tag);
 const temporary=output+'.decrypting';
 try{await pipeline(fs.createReadStream(input,{start:20,end:size-17}),cipher,fs.createWriteStream(temporary,{flags:'wx',mode:0o600}));await fsp.rename(temporary,output);}
 catch{await fsp.rm(temporary,{force:true});throw new Error('Backup authentication failed: wrong key or damaged archive');}
}
export async function splitFile(file,directory,chunkBytes=20*1024*1024){
 await fsp.mkdir(directory,{recursive:true});const input=await fsp.open(file,'r');const chunks=[];let offset=0;
 try{for(let index=1;;index++){const buffer=Buffer.alloc(chunkBytes);const {bytesRead}=await input.read(buffer,0,buffer.length,offset);if(!bytesRead)break;
 const name=`snapshot.part${String(index).padStart(3,'0')}`;await fsp.writeFile(path.join(directory,name),buffer.subarray(0,bytesRead),{flag:'wx'});
 chunks.push({name,bytes:bytesRead,sha256:createHash('sha256').update(buffer.subarray(0,bytesRead)).digest('hex')});offset+=bytesRead;
 }}finally{await input.close();}return chunks;
}
export async function joinParts(manifestFile,output){
 const m=JSON.parse(await fsp.readFile(manifestFile,'utf8'));if(m.format!=='lumen-encrypted-snapshot-v1'||!m.chunks?.length)throw new Error('Invalid manifest');
 const out=await fsp.open(output,'wx',0o600);const whole=createHash('sha256');
 try{for(const part of m.chunks){if(!/^snapshot\.part\d{3,}$/.test(part.name))throw new Error('Invalid chunk path');const file=path.join(path.dirname(manifestFile),part.name);
 if((await fsp.stat(file)).size!==part.bytes||await sha256(file)!==part.sha256)throw new Error('Missing or damaged part: '+part.name);
 for await(const buffer of fs.createReadStream(file)){whole.update(buffer);await out.write(buffer);}
 }if(whole.digest('hex')!==m.cipherSha256)throw new Error('Encrypted snapshot checksum mismatch');}
 catch(e){await out.close();await fsp.rm(output,{force:true});throw e;}await out.close();return m;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const [command,manifestFile,keyFile,output]=process.argv.slice(2);
 if(command!=='decrypt'||!output)throw new Error('Usage: node vault.mjs decrypt MANIFEST KEY_FILE OUTPUT.tar.gz');
 const combined=output+'.encrypted';
 try{const m=await joinParts(manifestFile,combined);await decryptFile(combined,output,readKey(keyFile));if(await sha256(output)!==m.archiveSha256){await fsp.rm(output);throw new Error('Archive checksum mismatch');}console.log('Backup authenticated and decrypted.');}
 finally{await fsp.rm(combined,{force:true});}
}
