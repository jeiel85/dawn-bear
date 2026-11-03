// Every frame: is the robot's head (cap, brim, ears, glasses) cut by the frame edge in shots where it must be whole?
// Usage: node tools/check_framing.mjs
import { resolve } from 'node:path';
import { openPage } from './cdp.mjs';
// 'eyes' is an extreme close-up (brim to muzzle) and the feet/lift-off shots frame the legs by design
const MUST_BE_WHOLE = ['city-wide', 'sparrow', 'sunray', 'rise', 'look-up', 'pass-by', 'follow', 'cloud-punch', 'space-awe', 'space-wide'];
const page = await openPage(resolve('index.html'), { query: 'debug=1&noaudio=1' });
await page.waitFor('window.SB && window.SB.isReady', 400000);
const res = await page.evaluate(`(() => {
  const bad = {}, seen = {};
  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const t = f / FPS, sh = SHOTS.find((x) => t >= x.t0 && t < x.t1);
    if (!${JSON.stringify(MUST_BE_WHOLE)}.includes(sh.name)) continue;
    const p = SB.probe(f); if (!p) continue;
    seen[sh.name] = (seen[sh.name] || 0) + 1;
    const [x0, y0, x1, y1] = p.headBounds;
    if (x0 < 0 || y0 < 0 || x1 > W || y1 > H) (bad[sh.name] = bad[sh.name] || []).push(f + ':' + p.headBounds.join(','));
  }
  return { seen, bad };
})()`, { timeout: 900000 });
console.log('frames checked per shot:', res.seen);
for (const [k, v] of Object.entries(res.bad)) console.log(`HEAD CUT in ${k}: ${v.length} frames, e.g. ${v.slice(0, 4).join('  ')}`);
if (!Object.keys(res.bad).length) console.log('OK: the head is whole in every frame where it must be');
await page.close(); process.exit(0);
