import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import vm from 'node:vm';

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
test('SW: precache atomico e fresco (cache:reload, Promise.all, cache parziale eliminata se fallisce)', () => {
  assert.match(sw, /cache: 'reload'/); assert.match(sw, /Promise\.all\(SHELL\.map/); assert.match(sw, /caches\.delete\(V\)/);
  assert.doesNotMatch(sw, /\.addAll\(/); assert.doesNotMatch(sw, /c\.add\(f\)\.catch/);
});

const evalHead = src => new Function(src.match(/const BUILD = [^\n]+/)[0] + '; return { V, DEV };')();
test('SW: la versione stampata dal workflow spegne DEV, con o senza flag g di sed', () => {
  assert.equal(evalHead(sw).DEV, true);                                    // in locale (segnaposto intatto): modalità sviluppo
  for (const g of [false, true]) {                                         // sed "s/__BUILD__/hash/" e la variante globale
    const stamped = sw.split('\n').map(l => l.replace(g ? /__BUILD__/g : /__BUILD__/, 'abc12345')).join('\n');
    const r = evalHead(stamped); assert.equal(r.V, 'sonance-abc12345'); assert.equal(r.DEV, false, 'flag g = ' + g);
  }
  assert.match(readFileSync('.github/workflows/deploy-pages.yml', 'utf8'), /__BUILD__/);   // il workflow stampa ancora il segnaposto
});

/* esegue davvero sw.js in un contesto simulato (caches, fetch, Request) */
function loadSW(fetchImpl) {
  const handlers = {}, store = new Map(), deleted = [];
  const caches = {
    open: async n => { if (!store.has(n)) store.set(n, new Map()); const m = store.get(n); return { put: async (u, r) => { m.set(String(u), r); }, keys: async () => [...m.keys()] }; },
    delete: async n => { deleted.push(n); return store.delete(n); }, keys: async () => [...store.keys()],
  };
  class Req { constructor(u, o) { this.url = u; this.cache = o && o.cache; } }
  vm.runInNewContext(sw, { addEventListener: (t, f) => { handlers[t] = f; }, caches, fetch: fetchImpl, Request: Req, URL, location: { origin: 'https://x' }, clients: { claim: async () => {} }, skipWaiting() {}, Response, console });
  return { handlers, store, deleted };
}
test('SW install: ogni file dell\'app è richiesto con cache:reload e finisce nella cache nuova', async () => {
  const seen = []; const { handlers, store } = loadSW(async r => { seen.push(r); return { ok: true, status: 200 }; });
  let p; handlers.install({ waitUntil: x => { p = x; } }); await p;
  assert.equal(seen.length, shell.length); assert.ok(seen.every(r => r.cache === 'reload'));
  assert.equal([...store.values()][0].size, shell.length);
});
test('SW install: se un file fallisce l\'installazione fallisce e la cache parziale viene eliminata', async () => {
  const { handlers, store, deleted } = loadSW(async r => r.url === 'js/player.js' ? { ok: false, status: 404 } : { ok: true, status: 200 });
  let p; handlers.install({ waitUntil: x => { p = x; } });
  await assert.rejects(p, /js\/player\.js/); assert.equal(deleted.length, 1); assert.equal(store.size, 0);
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
