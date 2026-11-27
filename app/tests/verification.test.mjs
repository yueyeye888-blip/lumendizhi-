import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForOrderConfirmation, createVerificationProgress, fillFailureMessage } from '../lib/verification.mjs';

function clock() {
  let time = 0;
  return {now: () => time, sleep: async ms => { time += ms; }};
}

test('continues immediately when automatic verification is ready', async () => {
  const time = clock();
  await waitForOrderConfirmation(async () => ({confirmationReady: true}), {
    ...time, onEvent: () => assert.fail('unexpected progress message'),
  });
  assert.equal(time.now(), 0);
});

test('reports automatic validation while waiting and resumes early', async () => {
  const time = clock();
  const events = [];
  await waitForOrderConfirmation(async () => ({confirmationReady: time.now() >= 45_000}), {
    ...time, onEvent: event => events.push(event),
  });
  assert.equal(time.now(), 45_000);
  assert.deepEqual(events, ['waiting_verification', 'verification_ready']);
});

test('missing verification ends after 60 seconds before creating an order', async () => {
  const time = clock();
  await assert.rejects(waitForOrderConfirmation(async () => ({confirmationReady: false}), {
    ...time, onEvent: () => {},
  }), /60 秒.*未确认创建上游订单/);
  assert.equal(time.now(), 60_000);
});

test('a stalled browser read cannot hold the order past the verification deadline', async () => {
  await assert.rejects(waitForOrderConfirmation(() => new Promise(() => {}), {timeoutMs: 20}), /确认窗口超时/);
});

test('surfaces a storefront rejection immediately before confirmation', async () => {
  const time = clock();
  await assert.rejects(waitForOrderConfirmation(async () => ({
    confirmationReady: false, error: '资料检查未通过',
  }), time), /资料检查未通过/);
  assert.equal(time.now(), 0);
});

test('progress handles fragmented stderr, ignores unknown events and drains callbacks in order',async()=>{
 const seen=[];let release;const blocked=new Promise(r=>release=r);const p=createVerificationProgress(async text=>{seen.push(text);if(seen.length===1)await blocked;});p.write('noise\nLUMEN_FILL_PRO');p.write('GRESS {"event":"waiting_verification"}\nLUMEN_FILL_PROGRESS {"event":"unknown"}\nLUMEN_FILL_PROGRESS {"event":"verification_ready"}\n');await Promise.resolve();assert.equal(seen.length,1);let finished=false;const drained=p.drain().then(()=>finished=true);await Promise.resolve();assert.equal(finished,false);release();await drained;assert.equal(seen.length,2);assert.match(seen[1],/已完成/);
});
test('public failure text excludes stack traces and progress protocol',()=>{
 assert.equal(fillFailureMessage('LUMEN_FILL_PROGRESS {"event":"waiting_verification"}\nfile:///source:10\n  throw new Error("timeout");\nError: 人机验证超时\n    at file:///source:10\n',1),'人机验证超时');
});
