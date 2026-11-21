import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const sw = readFileSync('sw.js', 'utf8');
const shell = [...sw.slice(sw.indexOf('const SHELL'), sw.indexOf('const IMG')).matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== 'SHELL');
const dirs = ['js', 'js/ui', 'js/beta'].filter(existsSync);

test('SHELL: ogni file .js in js/, js/ui/ e js/beta/ è precaricato', () => {
  const files = dirs.flatMap(d => readdirSync(d).filter(f => f.endsWith('.js')).map(f => d + '/' + f));
  assert.deepEqual(files.filter(f => !shell.includes(f)), []);
});
test('SHELL: ogni voce esiste davvero (niente refusi che bloccherebbero l\'installazione)', () => {
  const missing = shell.filter(f => f !== './' && !existsSync(f));
  assert.deepEqual(missing, []);
});
test('SHELL: il CSS, l\'indice e le icone usate da index.html/manifest sono precaricati', () => {
  const html = readFileSync('index.html', 'utf8'), man = readFileSync('manifest.webmanifest', 'utf8');
  for (const m of [...html.matchAll(/(?:href|src)="((?:css|icons|js)\/[^"]+)"/g)]) assert.ok(shell.includes(m[1]), m[1]);
  for (const m of [...man.matchAll(/"src":\s*"([^"]+)"/g)]) assert.ok(shell.includes(m[1]), m[1]);
});
test('SW: precache atomico (addAll) e nessun catch che nasconde i file mancanti', () => {
  assert.match(sw, /c\.addAll\(SHELL\)/); assert.doesNotMatch(sw, /c\.add\(f\)\.catch/);
});
test('repo: il .gitignore esiste con il nome giusto e non c\'è più il file "download"', () => {
  assert.ok(existsSync('.gitignore')); assert.ok(!existsSync('download'));
  assert.match(readFileSync('.gitignore', 'utf8'), /node_modules/);
});
test('logo: SVG accessibile (role=img, aria-label) in header e splash, colori da variabili CSS, h1 presente per gli screen reader', async () => {
  const { logoSvg } = await import('../js/logo.js');
  const a = logoSvg(), b = logoSvg({ wave: true });
  for (const s of [a, b, readFileSync('index.html', 'utf8')]) { assert.match(s, /role="img"/); assert.match(s, /aria-label="Sonance"/); assert.match(s, /var\(--acc\)/); assert.match(s, /var\(--fg\)/); assert.doesNotMatch(s, /<image|href="http/); }
  assert.notEqual(a.match(/id="(lg\d+)"/)[1], b.match(/id="(lg\d+)"/)[1]);          // id univoci: più loghi nella pagina non si disturbano
  assert.match(readFileSync('js/ui/lists.js', 'utf8'), /h\('h1', \{ class: 'sr' \}, 'Sonance'\)/);
  assert.doesNotMatch(readFileSync('index.html', 'utf8'), /splash-brand"><img/);
});
