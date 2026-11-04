// Contact sheet of every PNG in a folder: node tools/sheet.mjs <dir> [cols=4] [width=480] [out=<dir>/sheet.png]
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const [dir, cols = '4', width = '480', out] = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.endsWith('.png') && !f.startsWith('sheet')).sort();
const n = files.length, c = +cols, rows = Math.ceil(n / c), w = +width, h = Math.round(w * 9 / 16);
const args = ['-loglevel', 'error', '-y'];
files.forEach((f) => args.push('-i', join(dir, f)));
let fc = files.map((_, i) => `[${i}]scale=${w}:${h}[s${i}]`).join(';');
for (let i = n; i < rows * c; i++) fc += `;color=black:s=${w}x${h}[s${i}]`;
fc += ';' + Array.from({ length: rows * c }, (_, i) => `[s${i}]`).join('') + `xstack=inputs=${rows * c}:layout=` +
  Array.from({ length: rows * c }, (_, i) => `${(i % c) * w}_${Math.floor(i / c) * h}`).join('|');
args.push('-filter_complex', fc, '-frames:v', '1', join(out || join(dir, 'sheet.png')));
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log('sheet', files.length, 'frames');
