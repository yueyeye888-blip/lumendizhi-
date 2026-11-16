import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const mode of ['Full','Automation'])test('restore '+mode+' rewraps DPAPI and holds historical work',{skip:process.platform!=='win32'},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lumen-restore-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const bot=path.join(root,'bot'),site=path.join(root,'site'),snapshot=path.join(root,'snapshot');for(const dir of [bot,site,snapshot,bot+'/secrets',site+'/config',bot+'/data/site-order-queue/ADDR-20260101-11111111'])fs.mkdirSync(dir,{recursive:true});
 const app=process.env.LUMEN_TEST_APP_ROOT||path.join(repo,'app');fs.copyFileSync(app+'/wallet-address.mjs',bot+'/wallet-address.mjs');fs.symlinkSync(app+'/node_modules',bot+'/node_modules','junction');
 const key='0x'+'11'.repeat(32),token='fixture-refresh-token-'+'x'.repeat(80);const address=JSON.parse(execFileSync(process.execPath,[bot+'/wallet-address.mjs'],{input:key,encoding:'utf8'})).address;
 const write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v));
 write(bot+'/secrets/payer-wallet.json',{address});write(snapshot+'/portable-secrets.json',{format:'lumen-portable-secrets-v1',payerPrivateKey:key,outlookRefreshToken:token});write(bot+'/runtime-config.json',{telegramBotToken:'fixture-bot-token',orderCallbackToken:'fixture-callback-token',paymentMode:'live',paymentLiveApproval:'ENABLE_BSC_USDT_LIVE_PAYMENT',outlookRelay:{enabled:true}});write(site+'/config/runtime.json',{origin:'https://old.example',bindings:{SETTINGS_ENCRYPTION_KEY:'fixture-mail-key'}});write(bot+'/data/site-order-queue/ADDR-20260101-11111111/pending.json',{requestNo:'ADDR-20260101-11111111'});
 execFileSync(process.execPath,[repo+'/tools/backup/prepare-restored.mjs',snapshot,bot,site,'https://new.example',mode],{encoding:'utf8'});
 const cfg=JSON.parse(fs.readFileSync(bot+'/runtime-config.json'));assert.equal(cfg.paymentMode,'dry-run');assert.equal(cfg.outlookRelay.enabled,false);assert.equal(cfg.telegramBotToken,'fixture-bot-token');assert.equal(cfg.orderCallbackUrl,'https://new.example/api/address-orders/callback');assert.ok(fs.existsSync(bot+'/data/site-order-queue/ADDR-20260101-11111111/held-after-restore.json'));
 const newSite=JSON.parse(fs.readFileSync(site+'/config/runtime.json'));assert.equal(newSite.bindings.SETTINGS_ENCRYPTION_KEY,'fixture-mail-key');assert.equal(newSite.bindings.ADDRESS_ORDER_CALLBACK_TOKEN,cfg.orderCallbackToken);
 for(const [name,expected] of [['payer-private-key.dpapi',key],['outlook-refresh-token.dpapi',token]]){
  const ps="$s=Get-Content -Raw -LiteralPath '"+(bot+'/secrets/'+name).replaceAll("'","''")+"'|ConvertTo-SecureString;$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}";
  assert.equal(execFileSync('powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{encoding:'utf8'}),expected);
 }
 if(mode==='Automation'){const api=JSON.parse(fs.readFileSync(bot+'/standalone-config.private.json'));assert.ok(api.accessToken.length>=40);assert.equal(api.callbackToken,cfg.orderCallbackToken);}
});
