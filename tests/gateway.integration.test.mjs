import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import https from 'node:https';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { processSiteQueue } from '../app/lib/site-order-queue.mjs';
import { parsePersonalDetailsNotice } from '../app/lib/parser.mjs';

test('real gateway persists an authenticated submission and admits only authenticated callbacks', async t => {
  const dir=await mkdtemp(path.join(tmpdir(),'lumen-gateway-test-'));
  await mkdir(path.join(dir,'config'));
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const origin=`https://127.0.0.1:${port}`,queue=path.join(dir,'queue');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(dir,'config/tls.key'),'-out',path.join(dir,'config/tls.crt'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
  await copyFile(new URL('../selfhost/site/server.mjs',import.meta.url),path.join(dir,'server.mjs'));
  await copyFile(new URL('../app/lib/site-order-queue.mjs',import.meta.url),path.join(dir,'site-order-queue.mjs'));
  await writeFile(path.join(dir,'config/runtime.json'),JSON.stringify({origin,port,siteOrderQueueDirectory:queue,bindings:{ADDRESS_ORDER_CALLBACK_TOKEN:'fixture-secret'}}));
  await writeFile(path.join(dir,'config/accounts.json'),JSON.stringify([{id:'fixture',email:'fixture@example.invalid',password:'fixture-password'}]));
  await writeFile(path.join(dir,'auth.mjs'),`export const verifyPassword=(a,b)=>a===b;export const safeReturn=()=>'/';export const trustedHeaders=(h,u)=>new Headers({'oai-authenticated-user-id':u.id});`);
  await writeFile(path.join(dir,'runtime.mjs'),`export function worker(){return {ready:Promise.resolve(),dispose:async()=>{},getD1Database:async()=>({prepare:()=>({bind:()=>({first:async()=>({status:'queued'}),run:async()=>({})})})}),dispatchFetch:async(url,init)=>{if(new URL(url).pathname==='/api/address-orders/callback')return Response.json({received:true,hasCookie:new Headers(init.headers).has('cookie')});return Response.json({ok:true,requestNo:'ADDR-20261116-11223344'},{status:202});}}}`);
  const child=spawn(process.execPath,['server.mjs'],{cwd:dir,stdio:['ignore','pipe','pipe'],env:{...process.env,LUMEN_LISTEN_HOST:'127.0.0.1'}});
  t.after(async()=>{child.kill();await once(child,'exit').catch(()=>{});await rm(dir,{recursive:true,force:true});});
  const request=(route,method='GET',body,headers={})=>new Promise((resolve,reject)=>{
    const r=https.request(origin+route,{method,rejectUnauthorized:false,headers},res=>{let value='';res.on('data',x=>value+=x);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:value}));});r.on('error',reject);r.end(body);
  });
  for(let n=0;n<100;n++){try{if((await request('/__host/health')).status===200)break;}catch{}await new Promise(r=>setTimeout(r,20));}
  assert.equal((await request('/api/personal-details/submit','POST','{}')).status,401);
  assert.equal((await request('/api/address-orders/callback','POST','{}')).status,401);
  assert.equal((await request('/api/address-orders/callback','POST','{}',{authorization:'Bearer wrong'})).status,401);
  const callback=await request('/api/address-orders/callback','POST','{}',{authorization:'Bearer fixture-secret',cookie:'sensitive=fixture'});
  assert.equal(callback.status,200);assert.equal(JSON.parse(callback.text).hasCookie,false);
  const login=await request('/__host/login','POST','email=fixture%40example.invalid&password=fixture-password',{'content-type':'application/x-www-form-urlencoded'});
  assert.equal(login.status,303);
  const cookie=login.headers['set-cookie'][0].split(';')[0];
  const payload={profile:{fullName:'TEST USER',addressLines:['1 Test Street','',''],recipientEmail:'test@example.invalid'},template:{id:1,name:'Clphk'}};
  const submitted=await request('/api/personal-details/submit','POST',JSON.stringify(payload),{cookie,origin,'content-type':'application/json'});
  assert.equal(submitted.status,202);
  const no=JSON.parse(submitted.text).requestNo;
  assert.equal(JSON.parse(await readFile(path.join(queue,no,'pending.json'))).requestNo,no);
  let processed=0;
  await processSiteQueue(queue,async job=>{assert.equal(parsePersonalDetailsNotice(job.text).requestNo,no);processed++;});
  await processSiteQueue(queue,async()=>{processed++;});
  assert.equal(processed,1);
});
