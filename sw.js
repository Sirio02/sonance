/* Service worker: l'app si avvia subito dalla cache; un nuovo deploy installa una nuova cache completa.
   Il numero di versione viene scritto dal workflow di pubblicazione (commit); in locale resta "dev". */
const V = 'sonance-__BUILD__', DEV = V.endsWith('__BUILD__');
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'js/main.js', 'js/util.js', 'js/store.js', 'js/match.js', 'js/lrc.js', 'js/stats.js', 'js/tags.js',
  'js/covers.js', 'js/online.js', 'js/library.js', 'js/audio.js', 'js/player.js', 'js/ui/kit.js', 'js/ui/lists.js', 'js/ui/nowplaying.js', 'js/ui/you.js', 'js/ui/select.js', 'js/ui/dups.js', 'js/ui/m3uui.js', 'js/ui/lyricsui.js', 'js/m3u.js', 'js/dup.js', 'js/seekbar.js', 'js/gesture.js', 'js/artists.js', 'js/backup.js', 'js/playstate.js', 'js/beta.js', 'js/logo.js', 'js/color.js', 'js/ui/prefs.js', 'js/beta/youtube.js', 'js/beta/youtube-config.js', 'js/beta/yt-tab.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const IMG = 'sonance-img', IMG_MAX = 300;

addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))));   // atomico: se un file manca l'installazione fallisce e resta la versione precedente (niente cache incompleta)
addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V && x !== IMG).map(x => caches.delete(x)))).then(() => clients.claim())));
addEventListener('message', e => { if (e.data === 'skip') skipWaiting(); });

async function trim(c) { const k = await c.keys(); for (let i = 0; i < k.length - IMG_MAX; i++) await c.delete(k[i]); }

addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) {                       // immagini esterne (copertine, artisti): cache-first, con limite
    if (r.destination === 'image') e.respondWith(caches.open(IMG).then(async c => {
      const hit = await c.match(r); if (hit) return hit;
      try { const res = await fetch(r); if (res.ok || res.type === 'opaque') { c.put(r, res.clone()).then(() => trim(c)); } return res; } catch { return hit || Response.error(); }
    }));
    return;
  }
  /* file dell'app: cache-first (ogni versione ha la propria cache completa, quindi niente file "misti").
     In sviluppo (versione non stampata dal workflow) si usa invece la rete, per vedere subito le modifiche. */
  e.respondWith(caches.open(V).then(async c => {
    if (!DEV) { const hit = await c.match(r, { ignoreSearch: true }); if (hit) return hit; }
    try { const res = await fetch(r); if (res.ok) c.put(r, res.clone()); return res; }
    catch { return (await c.match(r, { ignoreSearch: true })) || Response.error(); }
  }));
});
