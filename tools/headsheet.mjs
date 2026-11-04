// Contact sheet of the robot's head in every cut (cap/glasses continuity check)
// Usage: node tools/headsheet.mjs <out.png>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openPage } from './cdp.mjs';
const out = resolve(process.argv[2] || 'heads.png'), dir = join(dirname(out), 'heads_tmp');
mkdirSync(dir, { recursive: true });
const times = [3, 10, 17, 23, 28.2, 30.5, 40, 45, 50, 56, 59.5, 61.4, 66, 69.5, 75, 83];
const page = await openPage(resolve('index.html'), { query: 'debug=1&noaudio=1' });
await page.waitFor('window.SB && window.SB.isReady', 400000);
const inputs = [];
for (const [i, t] of times.entries()) {
  const p = await page.evaluate(`SB.probe(${Math.round(t * 24)})`);
  if (!p) continue;
  const url = await page.evaluate(`SB.canvas.toDataURL('image/png')`);
  const f = join(dir, `h${i}.png`); writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
  let [x0, y0, x1, y1] = p.headBounds; const s = Math.max(x1 - x0, y1 - y0) * 1.15 + 8, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  inputs.push([f, Math.round(cx - s / 2), Math.round(cy - s / 2), Math.round(s)]);
}
await page.close();
const args = ['-loglevel', 'error', '-y'];
inputs.forEach(([f]) => args.push('-i', f));
const n = inputs.length, cols = 8, rows = Math.ceil(n / cols);
let fc = inputs.map(([, x, y, s], i) => `[${i}]pad=iw+4000:ih+4000:2000:2000,crop=${s}:${s}:${x + 2000}:${y + 2000},scale=240:240[s${i}]`).join(';');
for (let i = n; i < rows * cols; i++) fc += `;color=black:s=240x240[s${i}]`;
fc += ';' + Array.from({ length: rows * cols }, (_, i) => `[s${i}]`).join('') + `xstack=inputs=${rows * cols}:layout=` + Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * 240}_${Math.floor(i / cols) * 240}`).join('|');
args.push('-filter_complex', fc, '-frames:v', '1', out);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log('wrote', out);
process.exit(0);
