// Prints framing probes (screen positions of key robot points, robot/head bounds) for given times.
// Usage: node tools/probe.mjs <t1> [t2 ...]
import { resolve } from 'node:path';
import { openPage } from './cdp.mjs';
const page = await openPage(resolve('index.html'), { query: 'debug=1&noaudio=1' });
await page.waitFor('window.SB && window.SB.isReady', 400000);
for (const t of process.argv.slice(2).map(Number)) console.log(t.toFixed(2), JSON.stringify(await page.evaluate(`SB.probe(${Math.round(t * 24)})`)));
await page.close(); process.exit(0);
