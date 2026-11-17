const prefix = 'LUMEN_FILL_PROGRESS ';
export const verificationMessages = {
  waiting_verification: '等待人工人机验证：请在服务器 Chrome 的 addrs.xyz 页面完成 Turnstile。程序最多等待 5 分钟，完成后会继续当前订单，请勿刷新页面或重复提交。',
  verification_ready: '人机验证已完成，继续自动填表和创建订单',
};
export function emitVerificationEvent(event) {
  process.stderr.write(prefix + JSON.stringify({event}) + '\n');
}
export async function waitForVerification(readState, {
  timeoutMs = 300_000,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onEvent = emitVerificationEvent,
} = {}) {
  const start = now(); let notified = false;
  while (now() - start < timeoutMs) {
    let state; try { state = await readState(); } catch (error) {
      if (error?.code === 'BROWSER_CONNECTION_LOST') throw error;
      /* Navigation may invalidate the context. */
    }
    if (state?.widgetPresent && Number(state.responseLength) > 0) {
      if (notified) onEvent('verification_ready');
      return state;
    }
    if (!notified && now() - start >= 5_000) { notified = true; onEvent('waiting_verification'); }
    await sleep(Math.min(1000, timeoutMs - (now() - start)));
  }
  throw new Error('人机验证等待超时（5 分钟）：本次未创建支付订单、未付款。请联系管理员，在新订单处理时及时到服务器 Chrome 完成验证；当前失败订单不会自动重试。');
}
// Serialize callbacks and drain them before publishing a final order status.
export function createVerificationProgress(onProgress = async () => {}) {
  let buffer = '', pending = Promise.resolve();
  return {
    write(chunk) {
      buffer += String(chunk);
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
        if (!line.startsWith(prefix)) continue;
        try {
          const {event} = JSON.parse(line.slice(prefix.length));
          if (!Object.hasOwn(verificationMessages, event)) continue;
          pending = pending.then(() => onProgress(verificationMessages[event])).catch(() => {});
        } catch { /* Non-protocol stderr remains diagnostic text only. */ }
      }
      if (buffer.length > 16384) buffer = buffer.slice(-16384);
    },
    drain() { return pending; },
  };
}
export function fillFailureMessage(stderr, code) {
  const error = String(stderr).match(/(?:^|\n)(?:\w*Error):\s*([^\r\n]+)/)?.[1];
  return error || `填表进程失败 (${code})，请联系管理员查看服务器日志`;
}
