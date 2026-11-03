// Prints per-shot paint timings from a debug load
import { resolve } from 'node:path';
import { openPage } from './cdp.mjs';
const page = await openPage(resolve('index.html'), { query: 'debug=1&noaudio=1' });
const t0 = Date.now();
await page.waitFor('window.SB && window.SB.isReady', 400000);
console.log('ready', ((Date.now() - t0) / 1000).toFixed(1), 's');
page.consoleLog.filter((l) => l.text.startsWith('paint')).forEach((l) => console.log(' ', l.text));
await page.close(); process.exit(0);
