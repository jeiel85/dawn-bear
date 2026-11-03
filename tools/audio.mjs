// Renders the soundtrack in headless Chrome, writes a 24-bit WAV, and reports loudness, peaks and event timing.
// Usage: node tools/audio.mjs [out.wav]
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openPage } from './cdp.mjs';

const out = resolve(process.argv[2] || 'soundtrack.wav');
let events;
if (process.argv.includes('--analyze')) events = JSON.parse(readFileSync(out + '.events.json', 'utf8'));
else {
  const stem = process.argv.find((x) => x.startsWith('--stem='))?.slice(7);
  const page = await openPage(resolve('index.html'), { query: 'debug=1' + (stem ? '&stem=' + stem : '') });
  await page.waitFor('window.SB && window.SB.isReady', 600000);
  const len = await page.evaluate('SB.prepareWav()');
  let b64 = '';
  for (let i = 0; i < len; i += 4_000_000) b64 += await page.evaluate(`SB.wavPart(${i}, 4000000)`);
  writeFileSync(out, Buffer.from(b64, 'base64'));
  events = await page.evaluate('SB.events()');
  writeFileSync(out + '.events.json', JSON.stringify(events));
  const errs = page.consoleLog.filter((l) => ['error', 'exception'].includes(l.type));
  await page.close();
  console.log('wav', out);
  if (errs.length) console.log('console errors:', errs);
}

// ── loudness (ffmpeg ebur128) ──
const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', out, '-af', 'ebur128=peak=true:framelog=info', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1e9 });
const log = r.stderr;
const series = [];
for (const m of log.matchAll(/t:\s*([\d.]+)\s+TARGET.*?M:\s*(-?[\d.]+|-inf)\s+S:\s*(-?[\d.]+|-inf)/g)) series.push([+m[1], +m[2], m[3] === '-inf' ? -120 : +m[3]]);
const summary = log.slice(log.lastIndexOf('Summary:'));
const I = +(summary.match(/I:\s*(-?[\d.]+) LUFS/) || [])[1];
const TP = +(summary.match(/Peak:\s*(-?[\d.]+) dBFS/) || [])[1];
const sMax = series.reduce((a, b) => (b[2] > a[2] ? b : a), [0, 0, -120]);
const win = (a, b) => series.filter((x) => x[0] >= a && x[0] <= b && x[2] > -100).map((x) => x[2]);
const rng = (a, b) => { const v = win(a, b); return v.length ? `${Math.min(...v).toFixed(1)} … ${Math.max(...v).toFixed(1)}` : 'n/a'; };
console.log(`integrated ${I} LUFS, true peak ${TP} dBTP`);
console.log(`short-term max ${sMax[2]} LUFS at ${sMax[0]} s`);
console.log(`short-term 3–20 s (opening): ${rng(3, 20)}`);
console.log(`short-term 60.5–62.5 s (pass-by): ${rng(60.5, 62.5)}`);
for (const [a, b] of [[20, 31], [31, 36], [36, 48], [48, 53], [53, 58], [58, 64], [64, 72], [72, 86], [86, 91]]) console.log(`  ${a}–${b}s: ${rng(a, b)}`);

// ── sample peak + event onsets from the PCM ──
const buf = readFileSync(out), sr = buf.readUInt32LE(24), ch = buf.readUInt16LE(22), n = (buf.length - 44) / (3 * ch);
const mono = new Float32Array(n);
let peak = 0;
for (let i = 0; i < n; i++) {
  let s = 0;
  for (let c = 0; c < ch; c++) { const o = 44 + (i * ch + c) * 3; let v = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16); if (v & 0x800000) v -= 0x1000000; const f = v / 8388607; peak = Math.max(peak, Math.abs(f)); s += f; }
  mono[i] = s / ch;
}
console.log(`sample peak ${(20 * Math.log10(peak)).toFixed(2)} dBFS, clipping: ${peak >= 0.9999 ? 'YES' : 'no'}`);
console.log(`last 0.1 s max |x|: ${Math.max(...Array.from(mono.slice(n - sr / 10)).map(Math.abs)).toExponential(2)}`);
const hop = Math.round(sr * 0.005), env = [];
for (let i = 0; i + hop < n; i += hop) { let e = 0; for (let k = 0; k < hop; k++) e += mono[i + k] * mono[i + k]; env.push(e / hop); }
console.log('event onsets (first 5 ms hop within ±120 ms whose level jumps ≥4 dB over the preceding 250 ms):');
for (const ev of events) {
  const c = Math.round(ev.t / 0.005);
  let base = 0; for (let j = c - 74; j < c - 24; j++) base += env[j] || 0; base /= 50;
  let hit = null;
  for (let j = c - 24; j <= c + 24; j++) { const lvl = ((env[j] || 0) + (env[j + 1] || 0)) / 2; if (lvl > base * 2.5 && lvl > 1e-7) { hit = j; break; } }
  console.log(`  ${ev.t.toFixed(2)}s ${ev.name.padEnd(24)} ${hit === null ? '  (masked)' : (((hit * 0.005) - ev.t) * 1000).toFixed(0).padStart(5) + ' ms'}`);
}
process.exit(0);
