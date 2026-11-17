import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function startBrowserTask() {
  if (process.platform !== 'win32') throw new Error('Automatic browser startup requires Windows');
  await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference='Stop';$t=Get-ScheduledTask -TaskName 'SafeTGDemoBrowser';if($t.State -ne 'Running'){Start-ScheduledTask -TaskName 'SafeTGDemoBrowser'}"],
  { timeout: 15000, windowsHide: true });
}

// Run only before touching the form. Never restart/replay a partially submitted order.
export async function ensureBrowserReady(port, {
  fetchImpl = fetch, start = startBrowserTask, sleep = pause, attempts = 15,
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid browser port');
  const probe = async () => {
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/json/version`, {signal: AbortSignal.timeout(2000)});
      if (!response.ok) return false;
      const data = await response.json();
      return typeof data.webSocketDebuggerUrl === 'string' && !!data.Browser;
    } catch { return false; }
  };
  if (await probe()) return;
  try { await start(); } catch { /* Report the verified port state, not shell output. */ }
  for (let i = 0; i < attempts; i++) {
    await sleep(1000);
    if (await probe()) return;
  }
  throw new Error(`填表浏览器未就绪（本机端口 ${port} 无法连接），自动启动未成功。请管理员登录服务器并启动 SafeTGDemoBrowser；本次未提交上游订单、未付款。`);
}

export function browserConnectionError(detail = '连接已断开') {
  const error = new Error(`填表浏览器${detail}，处理已停止，未自动重试。请管理员核对上游订单和付款记录后再操作。`);
  error.code = 'BROWSER_CONNECTION_LOST';
  return error;
}

export function createBrowserConnection(socket, {timeoutMs = 30000} = {}) {
  let sequence = 0, terminalError;
  const pending = new Map();
  function fail(error) {
    terminalError ||= error;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(terminalError); }
    pending.clear();
  }
  socket.addEventListener('close', () => fail(browserConnectionError()));
  socket.addEventListener('error', () => fail(browserConnectionError()));
  socket.addEventListener('message', event => {
    let response;
    try { response = JSON.parse(event.data); } catch { return; }
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id); clearTimeout(entry.timer);
    if (response.error) entry.reject(new Error(response.error.message));
    else entry.resolve(response.result);
  });
  const ready = new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); socket.removeEventListener('open', opened); socket.removeEventListener('close', closed); socket.removeEventListener('error', closed); };
    const opened = () => { cleanup(); resolve(); };
    const closed = () => { cleanup(); reject(terminalError || browserConnectionError()); };
    const timer = setTimeout(() => { fail(browserConnectionError('连接超时')); closed(); socket.close(); }, timeoutMs);
    socket.addEventListener('open', opened, {once: true});
    socket.addEventListener('close', closed, {once: true});
    socket.addEventListener('error', closed, {once: true});
    if (socket.readyState === 1) opened();
    else if (socket.readyState >= 2) closed();
  });
  return {
    ready,
    call(method, params = {}) {
      if (terminalError || socket.readyState !== 1) return Promise.reject(terminalError || browserConnectionError());
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { fail(browserConnectionError('响应超时')); socket.close(); }, timeoutMs);
        pending.set(id, {resolve, reject, timer});
        try { socket.send(JSON.stringify({id, method, params})); }
        catch { fail(browserConnectionError()); }
      });
    },
  };
}
