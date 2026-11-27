const prefix = 'LUMEN_FILL_PROGRESS ';
const verificationTimeoutSeconds = 60;
export const verificationMessages = {
  waiting_verification: `正在等待页面自动验证，最多 ${verificationTimeoutSeconds} 秒。`,
  verification_ready: '页面自动验证已完成，继续处理订单。',
};
export function emitVerificationEvent(event) {
  process.stderr.write(prefix + JSON.stringify({event}) + '\n');
}
const monotonicNow = () => performance.now();

export async function waitForOrderConfirmation(readState, {
  timeoutMs = verificationTimeoutSeconds * 1000,
  now = monotonicNow,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onEvent = emitVerificationEvent,
} = {}) {
  const start = now();
  const deadline = start + timeoutMs;
  const expired = Symbol('verification deadline');
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(resolve, timeoutMs, expired); });
  let notified = false;
  try {
    while (now() < deadline) {
      let state;
      try {
        state = await Promise.race([readState(), timeout]);
      } catch (error) {
        if (error?.code === 'BROWSER_CONNECTION_LOST') throw error;
        // Navigation can briefly invalidate the execution context.
      }
      if (state === expired || now() >= deadline) break;
      if (state?.error) throw new Error(state.error);
      if (state?.confirmationReady) {
        if (notified) onEvent('verification_ready');
        return state;
      }
      if (!notified && now() - start >= 5_000) {
        notified = true;
        onEvent('waiting_verification');
      }
      await sleep(Math.min(1000, deadline - now()));
    }
  } finally {
    clearTimeout(timer);
  }
  throw new Error(`等待订单确认窗口超时（${verificationTimeoutSeconds} 秒），本次未确认创建上游订单、未向上游付款。`);
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
