import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';import {once} from 'node:events';import {createAddressServer} from './server.mjs';
test('standalone submission is authenticated and idempotent, callback updates correct order',async t=>{
 const dir=await fs.mkdtemp(path.join(tmpdir(),'address-api-'));let count=0;
 const server=createAddressServer({database:path.join(dir,'orders.sqlite'),queueDirectory:dir,accessToken:'submit-test-key',callbackToken:'callback-test-key'},async()=>{count++;});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});});const base='http://127.0.0.1:'+server.address().port;
 const body={profile:{fullName:'TEST USER',addressLines:['1 Test Street','',''],recipientEmail:'test@example.invalid'},template:{name:'Clphk'}};
 const send=(route,payload,token,key)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(key?{'idempotency-key':key}:{})},body:JSON.stringify(payload)});
 assert.equal((await send('/api/personal-details/submit',body)).status,401);
 assert.equal((await send('/api/personal-details/submit',body,'submit-test-key')).status,400);
 const a=await send('/api/personal-details/submit',body,'submit-test-key','job1');assert.equal(a.status,202);const id=(await a.json()).requestNo;
 const b=await send('/api/personal-details/submit',body,'submit-test-key','job1');assert.equal(b.status,200);assert.equal((await b.json()).requestNo,id);assert.equal(count,1);
 assert.equal((await send('/api/personal-details/submit',{...body,template:{name:'Other'}},'submit-test-key','job1')).status,409);
 assert.equal((await send('/api/address-orders/callback',{requestNo:id,status:'delivered'},'submit-test-key')).status,401);
 assert.equal((await send('/api/address-orders/callback',{requestNo:id,status:'filling'},'callback-test-key')).status,200);
 const status=await fetch(base+'/api/address-orders/'+id,{headers:{authorization:'Bearer submit-test-key'}});assert.equal((await status.json()).order.status,'filling');
});
