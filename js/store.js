/* Persistenza: impostazioni (localStorage) e archivio brani/audio/ascolti (IndexedDB). */
import { log } from './util.js';

const jget = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
export const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { log('localStorage ' + k + ': ' + e.message); return false; } };

/* ---- impostazioni ---- */
export const S = jget('mm', {});
export const saveS = () => jset('mm', S);
export const PL = jget('pl', {});            // playlist: nome -> [id]
export const savePL = () => jset('pl', PL);
export const PLC = jget('plc', {});          // copertine playlist (data URL)
export const savePLC = () => jset('plc', PLC);
export const PEND = jget('pend', {});        // metadati di backup in attesa del file audio
export const savePend = () => jset('pend', PEND);

/* La coda e la posizione hanno chiavi proprie: si scrivono spesso e sono piccole. */
export const Q = jget('mq', { ids: [], i: -1 });
export const saveQ = () => jset('mq', Q);
export const POS = jget('mp', { id: null, pos: 0 });
export const savePos = () => jset('mp', POS);

/** Migrazioni dal vecchio formato (v6). */
(function migrate() {
  if (S.queue) { Q.ids = S.queue; Q.i = S.qi ?? -1; POS.id = S.id ?? null; POS.pos = S.pos || 0; saveQ(); savePos(); }
  for (const k of ['queue', 'qi', 'id', 'pos']) delete S[k];
  if (S.eqOn === undefined) S.eqOn = S.adv === 1 ? 1 : 0;          // prima "audio avanzato" accendeva tutto
  delete S.adv;
  if (Array.isArray(S.eq) && S.eq.length === 5) {                    // da 5 a 6 bande (interpolazione)
    const o = S.eq; S.eq = Array.from({ length: 6 }, (_, i) => { const p = i * 4 / 5, a = Math.floor(p), f = p - a; return Math.round(o[a] * (1 - f) + (o[Math.min(a + 1, 4)] ?? o[a]) * f); });
  }
  S.eq = Array.isArray(S.eq) && S.eq.length === 6 ? S.eq : [0, 0, 0, 0, 0, 0];
  S.cp ||= [];                                                        // preset personalizzati
  S.cf ||= 0; delete S.rate; S.sort ||= 'az';
  try { localStorage.removeItem('sonance.artistImages'); } catch { /* ok */ }  // erano quasi tutte sbagliate
  saveS();
})();

/* ---- IndexedDB ---- */
const DB = new Promise((ok, ko) => {
  const r = indexedDB.open('mymusic', 2);
  r.onupgradeneeded = () => {
    const d = r.result;
    if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'id' });
    if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
    if (!d.objectStoreNames.contains('plays')) d.createObjectStore('plays', { keyPath: 'n', autoIncrement: true });
  };
  r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); ok(r.result); };
  r.onerror = () => ko(r.error);
  r.onblocked = () => ko(Error('archivio bloccato da un\u2019altra scheda'));
});

async function tx(stores, mode, fn) {
  const d = await DB;
  return new Promise((ok, ko) => {
    const t = d.transaction(stores, mode); let r;
    try { r = fn(t); } catch (e) { ko(e); return; }
    t.oncomplete = () => ok(r && 'result' in r ? r.result : r);
    t.onerror = t.onabort = () => ko(t.error || Error('transazione annullata'));
  });
}

export const getTracks = () => tx('tracks', 'readonly', t => t.objectStore('tracks').getAll()).then(x => x || []);
export const putTrack = t => tx('tracks', 'readwrite', s => s.objectStore('tracks').put(t));
export const getBlob = k => tx('blobs', 'readonly', s => s.objectStore('blobs').get(k));
export const putBlob = (k, b) => tx('blobs', 'readwrite', s => s.objectStore('blobs').put(b, k));
export const hasBlob = k => tx('blobs', 'readonly', s => s.objectStore('blobs').count(k)).then(n => n > 0);
export const delBlobs = keys => tx('blobs', 'readwrite', s => { for (const k of keys) s.objectStore('blobs').delete(k); });

/** Salva brano + audio e verifica la scrittura (su iOS le scritture possono fallire in silenzio). */
export async function addTrack(t, file) {
  await tx(['tracks', 'blobs'], 'readwrite', s => { s.objectStore('tracks').put(t); s.objectStore('blobs').put(file, t.id); });
  const c = await getBlob(t.id);
  if (!c || c.size !== file.size) { await removeTrackData(t.id); throw Error('verifica di scrittura fallita'); }
}
export const removeTrackData = (id, extra = []) =>
  tx(['tracks', 'blobs'], 'readwrite', s => { s.objectStore('tracks').delete(id); for (const k of [id, 'c:' + id, 'cv:T' + id, 'ct:T' + id, ...extra]) s.objectStore('blobs').delete(k); });

/* ---- cronologia ascolti ---- */
const PLAYS_MAX = 8000;
export const addPlay = p => tx('plays', 'readwrite', s => s.objectStore('plays').add(p)).then(k => k);
export async function updatePlay(n, patch) {
  try {
    const d = await DB;
    await new Promise((ok, ko) => {
      const t = d.transaction('plays', 'readwrite'), st = t.objectStore('plays'), g = st.get(n);
      g.onsuccess = () => { if (g.result) st.put({ ...g.result, ...patch }); };
      t.oncomplete = ok; t.onerror = t.onabort = () => ko(t.error);
    });
  } catch (e) { log('updatePlay: ' + e.message); }
}
export const getPlays = () => tx('plays', 'readonly', s => s.objectStore('plays').getAll()).then(x => x || []);
export const clearPlays = () => tx('plays', 'readwrite', s => s.objectStore('plays').clear());
export async function prunePlays() {
  const all = await getPlays();
  if (all.length <= PLAYS_MAX) return;
  const drop = all.slice(0, all.length - PLAYS_MAX).map(p => p.n);
  await tx('plays', 'readwrite', s => { for (const n of drop) s.objectStore('plays').delete(n); });
}
export const putPlaysBulk = list => tx('plays', 'readwrite', s => { for (const p of list) { const { n, ...r } = p; s.objectStore('plays').add(r); } });
