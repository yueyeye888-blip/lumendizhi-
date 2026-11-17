import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureBrowserReady, createBrowserConnection, browserConnectionError} from '../lib/browser-connection.mjs';
import {waitForVerification} from '../lib/verification.mjs';

const ready = async () => ({ok:true, json:async()=>({Browser:'Chrome/test',webSocketDebuggerUrl:'ws://127.0.0.1/test'})});
test('healthy browser is reused without starting or navigating it', async () => {
  await ensureBrowserReady(9333,{fetchImpl:ready,start:()=>assert.fail('must not start'),sleep:()=>assert.fail('must not wait')});
});
test('stopped browser starts once and waits for the debugging endpoint', async () => {
  let probes=0,starts=0;
  await ensureBrowserReady(9333,{fetchImpl:async()=>{if(++probes<3)throw new Error('ECONNREFUSED');return ready();},start:async()=>{starts++;},sleep:async()=>{}});
  assert.equal(starts,1);assert.equal(probes,3);
});
test('startup failure is bounded, clear and does not leak shell details', async () => {
  let probes=0;
  await assert.rejects(ensureBrowserReady(9333,{fetchImpl:async()=>{probes++;throw new Error('fetch failed');},start:async()=>{throw new Error('sensitive shell output');},sleep:async()=>{},attempts:2}),error=>{
    assert.match(error.message,/未提交上游订单、未付款/);assert.doesNotMatch(error.message,/sensitive/);return true;
  });assert.equal(probes,3);
});
class Socket extends EventTarget {
  readyState=1; sent=[];
  send(data){this.sent.push(JSON.parse(data));}
  close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
  answer(id,result){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({id,result})}));}
}
test('CDP correlates responses without replaying commands', async () => {
  const socket=new Socket(),connection=createBrowserConnection(socket);await connection.ready;
  const a=connection.call('Page.enable'),b=connection.call('Runtime.enable');
  socket.answer(2,{second:true});socket.answer(1,{first:true});
  assert.deepEqual(await a,{first:true});assert.deepEqual(await b,{second:true});assert.equal(socket.sent.length,2);socket.close();
});
test('disconnect rejects all pending work and prevents further commands', async () => {
  const socket=new Socket(),connection=createBrowserConnection(socket);await connection.ready;
  const a=assert.rejects(connection.call('Runtime.evaluate'),{code:'BROWSER_CONNECTION_LOST'});
  const b=assert.rejects(connection.call('Page.enable'),{code:'BROWSER_CONNECTION_LOST'});
  socket.close();await Promise.all([a,b]);
  await assert.rejects(connection.call('Runtime.evaluate'),{code:'BROWSER_CONNECTION_LOST'});assert.equal(socket.sent.length,2);
});
test('unresponsive CDP request times out instead of leaving an unresolved top-level await', async () => {
  const socket=new Socket(),connection=createBrowserConnection(socket,{timeoutMs:15});await connection.ready;
  await assert.rejects(connection.call('Runtime.evaluate'),/响应超时/);assert.equal(socket.readyState,3);
});
test('verification aborts on lost browser but tolerates a navigated execution context', async () => {
  await assert.rejects(waitForVerification(async()=>{throw browserConnectionError();},{sleep:()=>assert.fail('must abort immediately')}),{code:'BROWSER_CONNECTION_LOST'});
  let calls=0;
  const state=await waitForVerification(async()=>{if(++calls===1)throw new Error('Execution context destroyed');return {widgetPresent:true,responseLength:100};},{sleep:async()=>{},onEvent:()=>{}});
  assert.equal(state.responseLength,100);
});
