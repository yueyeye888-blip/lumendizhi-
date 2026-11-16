import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';
import {encryptFile,decryptFile,sha256,readKey} from './vault.mjs';
const job=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const input=JSON.parse(fs.readFileSync(path.join(job,'input.json'),'utf8'));
const key=Buffer.from(input.keyBase64,'base64');fs.unlinkSync(path.join(job,'input.json'));
const stage=path.join(job,'snapshot');fs.mkdirSync(stage);
const progress=(event,more={})=>{const value={event,time:new Date().toISOString(),...more};fs.writeFileSync(path.join(job,'progress.json'),JSON.stringify(value));console.log(JSON.stringify(value));};
const ps=(code)=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',code],{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
const taskNames=['LumenResourceHub-Domain','LumenResourceHub-Web','SafeTGDemoBot','SafeTGDemoBrowser','SafeTGDemoServer'];
let stopped=false,states;
async function resume(){
 if(!stopped)return;
 for(const name of ['LumenResourceHub-Domain','LumenResourceHub-Web','SafeTGDemoBrowser','SafeTGDemoServer'])if(states.find(x=>x.name===name)?.state==='Running')ps(`Start-ScheduledTask -TaskName '${name}'`);
 if(states.find(x=>x.name==='SafeTGDemoBot')?.state==='Running'){
  for(let n=0;n<20;n++){try{const r=await fetch('https://yorkeai.com/__host/health',{signal:AbortSignal.timeout(3000)});if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,2000));}
  ps("Start-ScheduledTask -TaskName 'SafeTGDemoBot'");
 }
 stopped=false;progress('services-resumed');
}
async function main(){
 const disk=fs.statfsSync('C:/');if(disk.bavail*disk.bsize<5*1024**3)throw new Error('At least 5 GiB free disk space is required');
 if(key.length!==32)throw new Error('Invalid encryption key');
 const meta=path.join(stage,'metadata');fs.mkdirSync(meta);
 states=JSON.parse(ps(`@(${taskNames.map(n=>`$t=Get-ScheduledTask -TaskName '${n}';@{name=$t.TaskName;state=[string]$t.State}`).join(';')})|ConvertTo-Json -Compress`));
 fs.writeFileSync(path.join(meta,'task-states.json'),JSON.stringify(states,null,2));
 for(const name of taskNames)fs.writeFileSync(path.join(meta,name+'.xml'),ps(`Export-ScheduledTask -TaskName '${name}'`));
 const paths=['C:\\SafeTGDemo','C:\\SafeTGDemo\\data','C:\\SafeTGDemo\\data\\site-order-queue','C:\\SafeTGDemo\\secrets','C:\\LumenResourceHub','C:\\LumenResourceHub\\config','C:\\LumenResourceHub\\data','C:\\LumenResourceHub\\logs'];
 fs.writeFileSync(path.join(meta,'acl.json'),ps(`@(${paths.map(p=>`@{path='${p}';sddl=(Get-Acl '${p}').Sddl}`).join(';')})|ConvertTo-Json -Compress`));
 const active=JSON.parse(ps("@(Get-CimInstance Win32_Process|Where-Object {$_.Name -eq 'node.exe' -and $_.CommandLine -like '*cdp-fill.mjs*'}|Select-Object ProcessId)|ConvertTo-Json -Compress")||'[]');
 if(Array.isArray(active)?active.length:active)throw new Error('An order is currently filling; retry snapshot after it completes');
 progress('quiescing');stopped=true;
 ps(String.raw`$ErrorActionPreference='Stop';$all=@(Get-CimInstance Win32_Process);$roots=@((Get-NetTCPConnection -State Listen -LocalPort 443,8443,8765 -ErrorAction SilentlyContinue).OwningProcess)+@(($all|Where-Object {$_.CommandLine -like '*C:\SafeTGDemo\telegram-bot.mjs*' -or ($_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*safe_tg_demo_profile*')}).ProcessId);function Desc([int]$id){foreach($p in $all|Where-Object {$_.ParentProcessId -eq $id}){Desc $p.ProcessId};if($id -ne $PID){Stop-Process -Id $id -Force -ErrorAction SilentlyContinue}};${taskNames.map(n=>`Stop-ScheduledTask -TaskName '${n}' -ErrorAction SilentlyContinue`).join(';')};Start-Sleep -Seconds 2;foreach($id in $roots|Select-Object -Unique){if($id){Desc $id}}`);
 const sources=[['C:/SafeTGDemo','apps/SafeTGDemo'],['C:/LumenResourceHub','apps/LumenResourceHub'],['C:/Users/Administrator/safe_tg_demo_profile','browser-profile']];
 for(const [from,to] of sources){fs.cpSync(from,path.join(stage,to),{recursive:true,verbatimSymlinks:true});progress('copied',{component:to});}
 // DPAPI is tied to the old user. Export only into the protected snapshot,
 // which is then authenticated/encrypted before it leaves this machine.
 const portable={format:'lumen-portable-secrets-v1'};
 try{portable.payerPrivateKey=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','C:/SafeTGDemo/scripts/read-payer-key.ps1','-SecretPath',stage+'/apps/SafeTGDemo/secrets/payer-private-key.dpapi'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{throw new Error('Wallet DPAPI export failed; no portable snapshot will be published');}
 try{portable.outlookRefreshToken=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','C:/SafeTGDemo/scripts/read-outlook-token.ps1','-InstallRoot',stage+'/apps/SafeTGDemo'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{throw new Error('Outlook DPAPI export failed; no portable snapshot will be published');}
 if(!/^0x[0-9a-fA-F]{64}$/.test(portable.payerPrivateKey)||portable.outlookRefreshToken.length<40)throw new Error('Portable secret verification failed');
 fs.writeFileSync(path.join(stage,'portable-secrets.json'),JSON.stringify(portable),{mode:0o600});
 const dbFiles=fs.readdirSync(stage+'/apps/LumenResourceHub/data/d1',{recursive:true}).filter(x=>x.endsWith('.sqlite'));
 const databases=[];for(const file of dbFiles){const db=new DatabaseSync(path.join(stage,'apps/LumenResourceHub/data/d1',file),{readOnly:true});const check=db.prepare('PRAGMA integrity_check').all();if(check.some(x=>Object.values(x)[0]!=='ok'))throw new Error('Database integrity check failed');databases.push({file,integrity:'ok'});db.close();}
 fs.writeFileSync(path.join(meta,'databases.json'),JSON.stringify(databases,null,2));
 await resume();
 for(const [from,to] of [['C:/Tools/node22','runtime/node22'],['C:/Program Files/Google/Chrome/Application','runtime/chrome']]){fs.cpSync(from,path.join(stage,to),{recursive:true,verbatimSymlinks:true});progress('copied',{component:to});}
 const files=[];for(const entry of fs.readdirSync(stage,{recursive:true,withFileTypes:true})){if(!entry.isFile())continue;const file=path.join(entry.parentPath||entry.path,entry.name);files.push({path:path.relative(stage,file).split(path.sep).join('/'),bytes:fs.statSync(file).size,sha256:await sha256(file)});}
 const inventory={format:'lumen-full-snapshot-v1',snapshotId:input.snapshotId,createdAt:new Date().toISOString(),node:process.version,files,notes:['Entire application roots, installed dependencies and Chrome profile captured.','Browser profile is archival only; use a fresh profile on another Windows machine.','Portable wallet and Outlook DPAPI exports are inside this encrypted archive.','Restore remains stopped until the previous consumer is stopped and pending jobs are reviewed.']};
 fs.writeFileSync(path.join(stage,'snapshot-inventory.json'),JSON.stringify(inventory,null,2));
 progress('compressing',{files:files.length,bytes:files.reduce((s,x)=>s+x.bytes,0)});
 const archive=path.join(job,'snapshot.tar.gz');execFileSync('tar.exe',['-czf',archive,'-C',stage,'.'],{stdio:['ignore','pipe','pipe'],timeout:600000});
 const archiveHash=await sha256(archive),encrypted=path.join(job,'snapshot.enc');await encryptFile(archive,encrypted,key);
 const verify=path.join(job,'verify.tar.gz');await decryptFile(encrypted,verify,key);if(await sha256(verify)!==archiveHash)throw new Error('Encrypted archive round trip failed');
 const report={snapshotId:input.snapshotId,fileCount:files.length,rawBytes:files.reduce((s,x)=>s+x.bytes,0),archiveBytes:fs.statSync(archive).size,cipherBytes:fs.statSync(encrypted).size,archiveSha256:archiveHash,cipherSha256:await sha256(encrypted),portableWallet:true,portableOutlook:true,databases,encryptedPath:encrypted};
 fs.writeFileSync(path.join(job,'result.json'),JSON.stringify(report,null,2));
 fs.rmSync(stage,{recursive:true,force:true});fs.rmSync(archive);fs.rmSync(verify);key.fill(0);progress('complete',report);
}
main().catch(async e=>{try{await resume();}catch{}progress('failed',{error:e.message.slice(0,300)});key.fill(0);process.exitCode=1;});
