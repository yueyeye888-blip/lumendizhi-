import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { callbackAuthorized, enqueueSiteOrder, orderNotice, processSiteQueue } from '../app/lib/site-order-queue.mjs';
import { parsePersonalDetailsNotice } from '../app/lib/parser.mjs';
const no = 'ADDR-20261116-ABCDEF12';
const payload = {profile:{fullName:'TEST USER',addressLines:['1 Test Street','',''],recipientEmail:'test@example.invalid'},template:{name:'Clphk'}};
async function fixture(t) { const dir = await mkdtemp(path.join(tmpdir(),'lumen-queue-test-')); t.after(()=>rm(dir,{recursive:true,force:true})); return dir; }

test('callback requires exact existing bearer credential',()=>{
  assert.equal(callbackAuthorized(undefined,'secret'),false);
  assert.equal(callbackAuthorized('Bearer wrong','secret'),false);
  assert.equal(callbackAuthorized('Bearer secret',''),false);
  assert.equal(callbackAuthorized('Bearer secret','secret'),true);
});
test('site snapshot preserves empty address lines and is accepted by real bot parser',()=>{
  const parsed=parsePersonalDetailsNotice(orderNotice(no,payload,'admin@example.invalid'));
  assert.equal(parsed.requestNo,no);
  assert.equal(parsed.fullName,'TEST USER');
  assert.deepEqual(parsed.addressLines,['1 Test Street','','']);
});
test('invalid snapshot never reaches queue',async t=>{
  const dir=await fixture(t);
  await assert.rejects(enqueueSiteOrder(dir,no,{...payload,profile:{...payload.profile,fullName:'TEST\nUSER'}},'admin@example.invalid'));
  assert.deepEqual(await readdir(dir),[]);
});
test('duplicate enqueue and concurrent consumers execute a job exactly once',async t=>{
  const dir=await fixture(t);let runs=0;
  await enqueueSiteOrder(dir,no,payload,'admin@example.invalid');
  assert.equal((await enqueueSiteOrder(dir,no,payload,'admin@example.invalid')).duplicate,true);
  const handle=async()=>{runs++;await new Promise(resolve=>setTimeout(resolve,20));};
  await Promise.all([processSiteQueue(dir,handle),processSiteQueue(dir,handle)]);
  await processSiteQueue(dir,handle);
  assert.equal(runs,1);
  assert.equal(JSON.parse(await readFile(path.join(dir,no,'done.json'))).requestNo,no);
});
test('failure is recorded and never automatically replayed',async t=>{
  const dir=await fixture(t);let runs=0;let errors=0;
  await enqueueSiteOrder(dir,no,payload,'admin@example.invalid');
  await processSiteQueue(dir,async()=>{runs++;throw new Error('callback unavailable');},async()=>{errors++;});
  await processSiteQueue(dir,async()=>{runs++;});
  assert.equal(runs,1);assert.equal(errors,1);
  assert.ok((await readdir(path.join(dir,no))).includes('failed-payload.json'));
});
test('interrupted claimed job is not replayed on restart',async t=>{
  const dir=await fixture(t);let runs=0;
  await enqueueSiteOrder(dir,no,payload,'admin@example.invalid');
  await rename(path.join(dir,no,'pending.json'),path.join(dir,no,'processing.json'));
  await processSiteQueue(dir,async()=>{runs++;});
  assert.equal(runs,0);
});
