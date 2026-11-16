import test from 'node:test';import assert from 'node:assert/strict';
import {waitForVerification,createVerificationProgress,fillFailureMessage} from '../lib/verification.mjs';
test('manual verification can finish after the old ninety-second deadline without restarting the page',async()=>{
 let clock=0;const events=[];const result=await waitForVerification(async()=>({widgetPresent:true,responseLength:clock>=120000?730:0}),{now:()=>clock,sleep:async ms=>{clock+=ms;},onEvent:e=>events.push(e)});
 assert.equal(result.responseLength,730);assert.equal(clock,120000);assert.deepEqual(events,['waiting_verification','verification_ready']);
});
test('missing verification times out before allowing order creation',async()=>{
 let clock=0,submitted=false;await assert.rejects(async()=>{await waitForVerification(async()=>({widgetPresent:true,responseLength:0}),{now:()=>clock,sleep:async ms=>{clock+=ms;},onEvent:()=>{}});submitted=true;},/本次未创建支付订单、未付款/);assert.equal(submitted,false);assert.equal(clock,300000);
});
test('progress handles fragmented stderr, ignores unknown events and drains callbacks in order',async()=>{
 const seen=[];let release;const blocked=new Promise(r=>release=r);const p=createVerificationProgress(async text=>{seen.push(text);if(seen.length===1)await blocked;});p.write('noise\nLUMEN_FILL_PRO');p.write('GRESS {"event":"waiting_verification"}\nLUMEN_FILL_PROGRESS {"event":"unknown"}\nLUMEN_FILL_PROGRESS {"event":"verification_ready"}\n');await Promise.resolve();assert.equal(seen.length,1);let finished=false;const drained=p.drain().then(()=>finished=true);await Promise.resolve();assert.equal(finished,false);release();await drained;assert.equal(seen.length,2);assert.match(seen[1],/已完成/);
});
test('public failure text excludes stack traces and progress protocol',()=>{
 assert.equal(fillFailureMessage('LUMEN_FILL_PROGRESS {"event":"waiting_verification"}\nfile:///source:10\n  throw new Error("timeout");\nError: 人机验证超时\n    at file:///source:10\n',1),'人机验证超时');
});
