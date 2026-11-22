/* Aiuti per i test end-to-end (browser reale). Richiedono: `npm i -D playwright`, `npx playwright install chromium` e ffmpeg.
   Se manca qualcosa i test vengono SALTATI con un messaggio, non falliscono.
   L'app sotto prova è la cartella del progetto; con SONANCE_APP=/percorso si prova un'altra copia (utile per confrontare con la versione originale). */
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../..');
export const APP = process.env.SONANCE_APP ? resolve(process.env.SONANCE_APP) : ROOT;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const DEPLOY = ['index.html', 'sw.js', 'manifest.webmanifest', 'css', 'js', 'icons'];

export async function playwright() { try { return await import('playwright'); } catch { return null; } }
export const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
/** Restituisce false se si può eseguire, altrimenti il motivo per saltare i test (node:test salta con qualunque valore diverso da false/undefined, null compreso). */
export async function skipReason() {
  const pw = await playwright(); if (!pw) return 'playwright non installato (npm i -D playwright)';
  try { const b = await pw.chromium.launch(); await b.close(); } catch { return 'Chromium non disponibile (npx playwright install chromium)'; }
  if (!hasFfmpeg()) return 'ffmpeg non disponibile';
  return false;
}

/** Copia le sole cartelle pubblicate e, come il workflow di pubblicazione, stampa il numero di versione nel service worker (sed senza flag g). */
export function stampedCopy(dest, { build, marker, drop = [] } = {}) {
  rmSync(dest, { recursive: true, force: true }); mkdirSync(dest, { recursive: true });
  for (const f of DEPLOY) cpSync(join(APP, f), join(dest, f), { recursive: true });
  const sw = join(dest, 'sw.js');
  execFileSync('sed', ['-i', `s/__BUILD__/${build}/`, sw]);
  if (marker) execFileSync('sed', ['-i', `1i window.__VER = '${marker}';`, join(dest, 'js/main.js')]);
  for (const f of drop) rmSync(join(dest, f), { force: true });
  return dest;
}
export const tmp = name => join(os.tmpdir(), 'sonance-e2e-' + process.pid + '-' + name);

/** Server statico; `rootRef.root` può cambiare mentre gira (simula un nuovo deploy). `headers` emula GitHub Pages: Cache-Control max-age=600. */
export function serve(rootRef, { headers = {}, log } = {}) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(rootRef.root, p)); log?.push(p);
    if (!f.startsWith(rootRef.root) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', ...headers }); res.end(readFileSync(f));
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ url: 'http://127.0.0.1:' + srv.address().port + '/', close: () => new Promise(r => srv.close(r)) })));
}

/** Browser senza rete esterna: i nomi di dominio diversi da localhost non si risolvono (nessuna intercettazione: la cache HTTP resta attiva). */
export async function launch(pw, extra = []) {
  return pw.chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', ...extra] });
}
export async function openApp(browser, url, { viewport = { width: 390, height: 844 }, settings, mobile = true } = {}) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'allow', hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  if (settings) { await page.evaluate(s => localStorage.setItem('mm', JSON.stringify(s)), settings); await page.reload(); }
  await page.waitForSelector('#tabs button[data-v]'); page.errors = errors;
  return { ctx, page };
}

/* ---- file audio di prova (ffmpeg), creati una volta sola in tests/e2e/.cache ---- */
const CACHE = join(HERE, '.cache');
export function fixtures() {
  const out = join(CACHE, 'media'); mkdirSync(out, { recursive: true });
  const f = n => join(out, n);
  const run = args => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
  if (!existsSync(f('cover.jpg'))) run(['-f', 'lavfi', '-i', 'testsrc2=size=600x600:rate=1', '-frames:v', '1', f('cover.jpg')]);
  const mp3 = (name, freq, dur, meta, cover) => {
    if (existsSync(f(name))) return;
    const m = Object.entries(meta).flatMap(([k, v]) => ['-metadata', `${k}=${v}`]);
    run(cover ? ['-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${dur}`, '-i', f('cover.jpg'), '-map', '0', '-map', '1', '-c:a', 'libmp3lame', '-b:a', '64k', '-c:v', 'copy', '-id3v2_version', '3', '-metadata:s:v', 'title=cover', ...m, f(name)]
      : ['-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${dur}`, '-c:a', 'libmp3lame', '-b:a', '64k', '-id3v2_version', '3', ...m, f(name)]);
  };
  mp3('01-sinfonia.mp3', 300, 3, { title: 'Cenere', artist: 'Lazza', album: 'Sinfonia', track: '1/3' }, true);
  mp3('02-sinfonia.mp3', 340, 3, { title: 'Zero', artist: 'Lazza feat. Sfera Ebbasta', album: 'Sinfonia', track: '2/3' });
  mp3('03-sinfonia.mp3', 380, 3, { title: 'Ouv', artist: 'Lazza', album: 'sinfonia', track: '3/3' });
  mp3('d1t1.mp3', 420, 2, { title: 'Alba', artist: 'Elena', album: 'Doppio', track: '1/2', disc: '1/2' });
  mp3('d1t2.mp3', 440, 2, { title: 'Giorno', artist: 'Elena', album: 'Doppio', track: '2/2', disc: '1/2' });
  mp3('d2t1.mp3', 460, 2, { title: 'Sera', artist: 'Elena', album: 'Doppio', track: '1/2', disc: '2/2' });
  mp3('d2t2.mp3', 480, 2, { title: 'Notte', artist: 'Elena', album: 'Doppio', track: '2/2', disc: '2/2' });
  mp3('c1.mp3', 500, 2, { title: 'Uno', artist: 'Band A', album: 'Hits 2020', track: '1/3' });
  mp3('c2.mp3', 520, 2, { title: 'Due', artist: 'Band B', album: 'Hits 2020', track: '2/3' }, true);
  mp3('c3.mp3', 540, 2, { title: 'Tre', artist: 'Band C', album: 'Hits 2020', track: '3/3' });
  mp3('long.mp3', 220, 12, { title: 'Lungo', artist: 'Test', album: 'Long', track: '1/1' });
  if (!existsSync(f('flac1.flac'))) run(['-f', 'lavfi', '-i', 'sine=frequency=600:duration=2', '-c:a', 'flac', '-metadata', 'title=Brano Flac', '-metadata', 'artist=Marco', '-metadata', 'album=Album Flac', '-metadata', 'track=1', f('flac1.flac')]);
  return n => f(n);
}
/** Importa file dal selettore dell'app e attende il messaggio finale. */
export async function importFiles(page, paths) {
  await page.setInputFiles('#file', paths);
  await page.waitForFunction(() => /Importati \d+ di \d+/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 90000 });
}
