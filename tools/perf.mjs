// Real-time check: WebGL renderer + per-frame cost measured with rAF pacing and no canvas readbacks.
// Usage: node tools/perf.mjs [frames...]
import { resolve } from 'node:path';
import { openPage } from './cdp.mjs';
const frames = process.argv.slice(2).map(Number);
const page = await openPage(resolve('index.html'), { query: 'debug=1&noaudio=1' });
const t0 = Date.now();
await page.waitFor('window.SB && window.SB.isReady', 400000);
console.log('ready', ((Date.now() - t0) / 1000).toFixed(1) + 's');
console.log('renderer:', await page.evaluate(`(() => { const gl = ROBOT.gl, d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })()`));
const list = frames.length ? frames : [48, 240, 330, 560, 700, 960, 1250, 1350, 1430, 1490, 1600, 1700, 1800, 2000];
const res = await page.evaluate(`(async () => {
  const out = [];
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  for (const f of ${JSON.stringify(list)}) {
    SCENE.draw(vctx, f / 24, f); await raf(); await raf();
    const n = 12, a = performance.now(); let cpu = 0;
    for (let k = 0; k < n; k++) { const c0 = performance.now(); SCENE.draw(vctx, (f + k) / 24, f + k); cpu += performance.now() - c0; await raf(); }
    out.push(f + ': frame ' + ((performance.now() - a) / n).toFixed(1) + 'ms, cpu ' + (cpu / n).toFixed(1) + 'ms');
  }
  return out;
})()`);
console.log(res.join('\n'));
await page.close(); process.exit(0);
