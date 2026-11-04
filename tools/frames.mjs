// Renders still frames from index.html through headless Chrome.
// Usage: node tools/frames.mjs <outDir> <t1> [t2 ...]      (times in seconds)
//        node tools/frames.mjs <outDir> --range <t0> <t1> <step>
//        node tools/frames.mjs <outDir> --all              (every frame, for a preview video)
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openPage } from './cdp.mjs';

const [outDir, ...args] = process.argv.slice(2);
if (!outDir) { console.error('usage: frames.mjs <outDir> <times...>'); process.exit(1); }
mkdirSync(outDir, { recursive: true });

let times = [];
if (args[0] === '--range') {
  const [a, b, s] = args.slice(1).map(Number);
  for (let t = a; t <= b + 1e-9; t += s) times.push(+t.toFixed(4));
} else if (args[0] === '--all') {
  for (let f = 0; f < 91 * 24; f++) times.push(f / 24);
} else times = args.map(Number);

const page = await openPage(resolve('index.html'), { query: 'debug=1&noaudio=1' });
const t0 = Date.now();
await page.waitFor('window.SB && window.SB.isReady');
console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const t of times) {
  const frame = Math.round(t * 24);
  const ms = await page.evaluate(`SB.renderFrame(${frame})`);
  times.ms = (times.ms || []).concat(ms);
  const url = await page.evaluate(`SB.canvas.toDataURL('image/png')`);
  const name = args[0] === '--all' ? `f${String(frame).padStart(5, '0')}.png` : `t${t.toFixed(2).padStart(6, '0')}.png`;
  writeFileSync(join(outDir, name), Buffer.from(url.split(',')[1], 'base64'));
  if (args[0] !== '--all') console.log('wrote', name);
}
if (times.ms) console.log('draw ms: max', Math.max(...times.ms).toFixed(1), 'avg', (times.ms.reduce((a, b) => a + b, 0) / times.ms.length).toFixed(1));
const errs = page.consoleLog.filter((l) => ['error', 'exception', 'warning'].includes(l.type));
if (errs.length) console.log('console:', JSON.stringify(errs.slice(0, 10), null, 1));
const ext = page.network.filter((u) => !u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:'));
console.log(`network (non-file/data): ${ext.length}`, ext.slice(0, 5));
await page.close();
process.exit(0);
