/* Copertine e immagini artista: archivio locale con miniature (liste leggere) e versione grande (player). */
import { getBlob, putBlob, delBlobs, hasBlob, jset } from './store.js';
import { norm, bus, log } from './util.js';
import { mainArtist } from './match.js';

/* ---- ridimensionamento ---- */
/** Ridimensiona in JPEG. `sizes`: [[lato massimo, qualità], …]; l'immagine viene decodificata UNA volta sola e restituisce un Blob per misura. */
export async function shrinkMany(blob, sizes) {
  let src, w, h, close = () => {};
  if (window.createImageBitmap) {
    try { src = await createImageBitmap(blob); w = src.width; h = src.height; close = () => src.close?.(); } catch { src = null; }
  }
  if (!src) {
    const u = URL.createObjectURL(blob);
    try { src = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(Error('immagine non valida')); i.src = u; }); }
    catch (e) { URL.revokeObjectURL(u); throw e; }
    w = src.naturalWidth; h = src.naturalHeight; close = () => URL.revokeObjectURL(u);
  }
  try {
    const out = [];
    for (const [max, q] of sizes) {
      const k = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, c.width, c.height);
      out.push(await new Promise((ok, ko) => c.toBlob(x => x ? ok(x) : ko(Error('conversione immagine fallita')), 'image/jpeg', q)));
    }
    return out;
  } finally { close(); }
}
export const shrink = async (blob, max, q = .85) => (await shrinkMany(blob, [[max, q]]))[0];
export const blobToDataURL = b => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });

/* ---- copertine dei brani ---- */
/** I brani dello stesso album condividono la copertina (una sola ricerca, una sola copia su disco). */
export const albumKey = t => (t.album ? norm(mainArtist(t.artist)) + '|' + norm(t.album) : '');
const base = t => (t.album ? 'A' + albumKey(t) : 'T' + t.id);

const cache = new Map();   // 'size:base' -> Promise<url|null>
function cached(ck, fn) { if (!cache.has(ck)) cache.set(ck, fn()); return cache.get(ck); }
export function dropCache(prefix) { for (const [k, v] of cache) if (k.includes(prefix)) { v.then(u => u?.startsWith('blob:') && URL.revokeObjectURL(u)); cache.delete(k); } }

/** size: 't' miniatura (~256px) | 'l' grande (~640px). Restituisce un URL da usare in <img>/background, o null. */
export function coverURL(t, size = 't') {
  const b = base(t);
  return cached(size + b, async () => {
    try {
      let blob = await getBlob((size === 't' ? 'ct:' : 'cv:') + b);
      if (!blob) {
        const full = await getBlob('cv:' + b) || await getBlob('c:' + t.id);   // 'c:' = formato precedente
        if (full) {
          if (size === 't') { blob = await shrink(full, 256, .8); putBlob('ct:' + b, blob).catch(() => {}); } else blob = full;
        }
      }
      if (blob) return URL.createObjectURL(blob);
    } catch (e) { log('copertina: ' + e.message); }
    return t.cu || null;                                                       // URL remoto (fallback quando il download diretto è bloccato)
  });
}

/** Salva una copertina. scope 'album' (predefinito se il brano ha un album) o 'track'. */
export async function setCover(t, blob, scope) {
  const useAlbum = scope ? scope === 'album' : !!t.album;
  const b = useAlbum && t.album ? 'A' + albumKey(t) : 'T' + t.id;
  const [full, thumb] = await shrinkMany(blob, [[640, .88], [256, .8]]);      // una sola decodifica
  await putBlob('cv:' + b, full); await putBlob('ct:' + b, thumb);
  dropCache(b);
  bus.emit('covers');
}
export async function clearCover(t) {
  const b = base(t);
  await delBlobs(['cv:' + b, 'ct:' + b, 'c:' + t.id]);
  dropCache(b); t.cu = null; bus.emit('covers');
}
/** Verifica leggera (solo esistenza delle chiavi): non decodifica né crea URL, quindi è adatta ai controlli in blocco. */
export async function coverExists(t) {
  if (t.cu) return true;
  const b = base(t);
  try { return (await hasBlob('cv:' + b)) || (await hasBlob('ct:' + b)) || (await hasBlob('c:' + t.id)); } catch { return false; }
}

/* ---- colore dominante (sfondo del player, senza filtri blur costosi) ---- */
export function dominant(url) {
  return new Promise(ok => {
    if (!url) return ok(null);
    const i = new Image(); i.crossOrigin = 'anonymous';
    i.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 12;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0, 12, 12);
        const d = g.getImageData(0, 0, 12, 12).data; let r = 0, gg = 0, b = 0, w = 0;
        for (let p = 0; p < d.length; p += 4) {
          const mx = Math.max(d[p], d[p + 1], d[p + 2]), mn = Math.min(d[p], d[p + 1], d[p + 2]), wt = 1 + (mx - mn) / 32;
          r += d[p] * wt; gg += d[p + 1] * wt; b += d[p + 2] * wt; w += wt;
        }
        ok([r / w, gg / w, b / w].map(Math.round));
      } catch { ok(null); }
    };
    i.onerror = () => ok(null); i.src = url;
  });
}

/* ---- immagini artista ---- */
const AI = (() => { try { return JSON.parse(localStorage.getItem('sonance.ai2')) || {}; } catch { return {}; } })();
const saveAI = () => jset('sonance.ai2', AI);
const MISS_TTL = 7 * 864e5, aiCache = new Map();

/** Restituisce un URL immagine per l'artista (da archivio locale), oppure null. `finder` è la ricerca online. */
export function artistImageURL(name, finder) {
  const k = norm(name);
  if (aiCache.has(k)) return aiCache.get(k);
  const p = (async () => {
    const e = AI[k];
    if (e?.b) { const b = await getBlob('ai:' + k); if (b) return URL.createObjectURL(b); }
    if (e?.u) return e.u;
    if (e && Date.now() - e.t < MISS_TTL) return null;                         // già cercata di recente senza esito
    if (!finder) return null;
    const r = await finder(name).catch(err => { log('immagine artista ' + name + ': ' + err.message); return undefined; });
    if (r === undefined) { aiCache.delete(k); return null; }                    // errore transitorio: riproverà
    if (!r) { AI[k] = { t: Date.now() }; saveAI(); return null; }
    if (r.blob) {
      try { await putBlob('ai:' + k, await shrink(r.blob, 400, .82)); AI[k] = { b: 1, t: Date.now() }; saveAI(); return URL.createObjectURL(await getBlob('ai:' + k)); } catch { /* ripiega sull'URL */ }
    }
    AI[k] = { u: r.url, t: Date.now() }; saveAI(); return r.url;
  })();
  aiCache.set(k, p);
  return p;
}
export async function setArtistImage(name, blob) {
  const k = norm(name);
  await putBlob('ai:' + k, await shrink(blob, 400, .85));
  AI[k] = { b: 1, t: Date.now(), m: 1 }; saveAI(); aiCache.delete(k); bus.emit('covers');
}
export async function resetArtistImage(name) {
  const k = norm(name); await delBlobs(['ai:' + k]); delete AI[k]; saveAI(); aiCache.delete(k); bus.emit('covers');
}
