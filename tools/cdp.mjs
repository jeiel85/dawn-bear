// Minimal Chrome DevTools Protocol driver (Node 22+, no dependencies).
// Launches a headless Chrome, opens index.html in debug mode and exposes eval/screenshot helpers.
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export async function openPage(htmlPath, { query = 'debug=1', port = 9333 + Math.floor(Math.random() * 500) } = {}) {
  const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chrome) throw new Error('Chrome not found; set CHROME_PATH');
  const userDir = mkdtempSync(join(process.env.CDP_TMP || tmpdir(), 'sbcdp-'));
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`,
    '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
    '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--window-size=1920,1080',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
  }
  if (!wsUrl) { proc.kill(); throw new Error('CDP did not come up'); }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  const consoleLog = [];
  const network = [];
  listeners.push((m) => {
    if (m.method === 'Runtime.consoleAPICalled') consoleLog.push({ type: m.params.type, text: m.params.args.map((a) => a.value ?? a.description).join(' ') });
    if (m.method === 'Runtime.exceptionThrown') consoleLog.push({ type: 'exception', text: m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text });
    if (m.method === 'Log.entryAdded') consoleLog.push({ type: m.params.entry.level, text: m.params.entry.text });
    if (m.method === 'Network.requestWillBeSent') network.push(m.params.request.url);
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const url = (/^https?:/.test(htmlPath) ? htmlPath : pathToFileURL(htmlPath).href) + (query ? `?${query}` : '');
  await send('Page.navigate', { url });

  async function evaluate(expression, { timeout = 600000 } = {}) {
    const r = await Promise.race([
      send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('eval timeout: ' + expression.slice(0, 80))), timeout)),
    ]);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async function waitFor(expr, timeout = 600000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (await evaluate(expr, { timeout: 20000 })) return; } catch { /* page loading */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('waitFor timeout: ' + expr);
  }
  async function close() { try { ws.close(); } catch {} proc.kill(); }
  return { send, evaluate, waitFor, close, consoleLog, network, url };
}
