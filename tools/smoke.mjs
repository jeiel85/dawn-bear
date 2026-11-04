// Smoke test of the real player: load without debug flags, click to start, play, seek, mute, pause;
// report console errors and any network request other than the page itself.
import { resolve } from 'node:path';
import { openPage } from './cdp.mjs';
// Usage: node tools/smoke.mjs [url]   (defaults to the local index.html)
const target = process.argv[2] || resolve('index.html');
const page = await openPage(target, { query: '' });
const t0 = Date.now();
await page.waitFor(`document.getElementById('msg').textContent.includes('클릭하면')`, 600000);
console.log('ready to play in', ((Date.now() - t0) / 1000).toFixed(1), 's');
const click = async () => { for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', clickCount: 1 }); };
const key = async (code, k) => { for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, code, key: k }); };
const now = () => page.evaluate('Math.round(now() * 100) / 100');
await click();
await new Promise((r) => setTimeout(r, 3000));
console.log('after click + 3 s, t =', await now(), 'state =', await page.evaluate('player.state'));
await key('ArrowRight', 'ArrowRight'); await key('ArrowRight', 'ArrowRight');
await new Promise((r) => setTimeout(r, 1000));
console.log('after 2× → and 1 s, t =', await now());
await key('KeyM', 'm'); console.log('muted =', await page.evaluate('player.muted'));
await key('Space', ' '); const tp = await now();
await new Promise((r) => setTimeout(r, 800));
console.log('paused at', tp, '→ still', await now(), 'state =', await page.evaluate('player.state'));
await key('Space', ' '); await new Promise((r) => setTimeout(r, 1000));
console.log('resumed, t =', await now());
const errs = page.consoleLog.filter((l) => ['error', 'exception', 'warning'].includes(l.type));
console.log('console errors/warnings:', errs.length ? errs : 'none');
// blob: URLs are the in-memory worker scripts made from the page itself, not network traffic
const ext = page.network.filter((u) => !u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:') && u.split('?')[0] !== target && !u.endsWith('/favicon.ico'));
console.log('requests:', page.network.length, '| besides the page itself:', ext.length ? ext : 'none');
await page.close(); process.exit(0);
