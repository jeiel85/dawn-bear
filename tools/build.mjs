// Inlines src/*.js into src/shell.html and writes the single-file deliverable index.html.
// Usage: node tools/build.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => readFileSync(join(root, 'src', f), 'utf8');

let html = src('shell.html');
// markers may nest (a module can inline a data file), so expand until none remain
for (let pass = 0; pass < 4 && /@INLINE /.test(html); pass++) {
  html = html.replace(/\/\*@INLINE ([\w.-]+)\*\//g, (_, name) => {
    const p = join(root, 'src', name);
    if (!existsSync(p)) throw new Error(`missing src/${name}`);
    return src(name).trim();
  });
  html = html.replace(/<!--@INLINE ([\w.-]+)-->/g, (_, name) => src(name));
}

writeFileSync(join(root, 'index.html'), html);
console.log(`index.html ${(html.length / 1024).toFixed(1)} KB`);
