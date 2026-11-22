/* Persistenza: impostazioni (localStorage) e archivio brani/audio/ascolti/playlist (IndexedDB). */
import { log, toast } from './util.js';

const jget = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
export const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { log('localStorage ' + k + ': ' + e.message); return false; } };
/** Oggetto senza prototipo: un nome come «constructor» o «__proto__» è un nome qualunque, non una proprietà ereditata. */
const dict = o => Object.assign(Object.create(null), o);

/* ---- impostazioni ---- */
export const S = jget('mm', {});
export const saveS = () => jset('mm', S);

/* Playlist, copertine delle playlist e metadati in attesa del file audio.
   In memoria sono oggetti (nome → dati), quindi il resto dell'app non cambia. Su disco: in localStorage finché initStores() non ha
   migrato tutto in IndexedDB (o se la migrazione fallisce: in quel caso si continua esattamente come prima); dopo, in IndexedDB. */
export const PL = dict(jget('pl', {}));       // playlist: nome -> [id]
export const PLC = dict(jget('plc', {}));     // copertine playlist (data URL)
export const PLID = dict({});                 // nome -> { id, created }: identificatore stabile, sopravvive alla rinomina
export const PEND = dict(jget('pend', {}));   // metadati di backup in attesa del file audio: chiave nome|dimensione -> dati
let mode = 'ls';                              // 'ls' (localStorage) | 'idb' (IndexedDB)
export const storageMode = () => mode;

/** Identificatore stabile di una playlist (creato al primo bisogno). */
export const plId = name => (PLID[name] ||= { id: crypto.randomUUID(), created: Date.now() }).id;

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
  const r = indexedDB.open('mymusic', 3);
  let blockedTimer = 0;
  r.onupgradeneeded = () => {
    const d = r.result, has = n => d.objectStoreNames.contains(n);
    if (!has('tracks')) d.createObjectStore('tracks', { keyPath: 'id' });
    if (!has('blobs')) d.createObjectStore('blobs');
    if (!has('plays')) d.createObjectStore('plays', { keyPath: 'n', autoIncrement: true });
    if (!has('playlists')) d.createObjectStore('playlists', { keyPath: 'id' });   // v3: playlist con id stabile
    if (!has('pend')) d.createObjectStore('pend');                                // v3: metadati in attesa (prima in localStorage)
    if (!has('kv')) d.createObjectStore('kv');                                    // v3: valori vari (esito migrazione, istantanea pre-ripristino)
  };
  r.onsuccess = () => { clearTimeout(blockedTimer); r.result.onversionchange = () => r.result.close(); ok(r.result); };
  r.onerror = () => ko(r.error);
  /* "blocked" è solo un avviso: l'apertura prosegue appena l'altra scheda si chiude. Si rinuncia dopo 8 secondi. */
  r.onblocked = () => { blockedTimer = setTimeout(() => ko(Error('archivio bloccato da un\u2019altra scheda')), 8000); };
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

/* ---- valori vari (esito migrazione, istantanea prima del ripristino) ---- */
export const kvGet = k => tx('kv', 'readonly', s => s.objectStore('kv').get(k));
export const kvSet = (k, v) => tx('kv', 'readwrite', s => s.objectStore('kv').put(v, k));
export const kvDel = k => tx('kv', 'readwrite', s => s.objectStore('kv').delete(k));

/* ---- scritture serializzate ----
   Se ne arriva una mentre un'altra è in corso, ne parte una sola subito dopo: nessuna sovrapposizione e nessuna scrittura persa. */
const writers = [];
function saver(write, what) {
  let running = null, dirty = false, warned = false;
  const loop = async () => {
    try { do { dirty = false; await write(); } while (dirty); }
    catch (e) { log(what + ': ' + e.message); if (!warned) { warned = true; try { toast('Non riesco a salvare ' + what + '. Libera spazio sul telefono e riprova.', { ms: 6000 }); } catch { /* senza interfaccia */ } } }
    finally { running = null; }
  };
  const run = () => { if (running) { dirty = true; return running; } running = loop(); return running; };
  writers.push(() => running);
  return run;
}
/** Attende le scritture in corso (usata dai test e prima di operazioni delicate). */
export async function storesIdle() { for (let i = 0; i < 5; i++) { const r = writers.map(w => w()).filter(Boolean); if (!r.length) return; await Promise.all(r); } }

/* ---- playlist ---- */
function playlistRecords() {
  const out = []; let ord = 0;
  for (const name of Object.keys(PL)) {
    plId(name);
    out.push({ id: PLID[name].id, name, ids: Array.isArray(PL[name]) ? PL[name] : [], cover: typeof PLC[name] === 'string' ? PLC[name] : undefined, created: PLID[name].created, ord: ord++ });
  }
  return out;
}
async function writePlaylists() {
  const recs = playlistRecords(), keep = new Set(recs.map(r => r.id));
  await tx('playlists', 'readwrite', s => {
    const st = s.objectStore('playlists'), keys = st.getAllKeys();
    keys.onsuccess = () => { for (const k of keys.result) if (!keep.has(k)) st.delete(k); };      // playlist eliminate
    for (const r of recs) st.put(r);
    return keys;
  });
}
const savePlaylistsIdb = saver(writePlaylists, 'le playlist');
/* Le funzioni savePL/savePLC restano sincrone per i chiamanti: in IndexedDB la scrittura parte subito e i guasti vengono segnalati. */
export const savePL = () => (mode === 'idb' ? (savePlaylistsIdb(), true) : jset('pl', PL));
export const savePLC = () => (mode === 'idb' ? (savePlaylistsIdb(), true) : jset('plc', PLC));

/* ---- metadati in attesa del file audio: una voce per volta (mai riscrivere tutto a ogni brano importato) ---- */
export const savePend = () => (mode === 'idb' ? true : jset('pend', PEND));
/** Aggiunge/aggiorna voci. Lancia se non riesce a salvarle: un ripristino non deve mai perdere dati in silenzio. */
export async function putPend(entries) {
  Object.assign(PEND, entries);
  if (mode !== 'idb') { if (!jset('pend', PEND)) throw Error('spazio insufficiente per salvare i brani in attesa'); return; }
  const list = Object.entries(entries);
  await tx('pend', 'readwrite', s => { const st = s.objectStore('pend'); for (const [k, v] of list) st.put(v, k); });
}
export async function delPend(key) {
  delete PEND[key];
  if (mode !== 'idb') { jset('pend', PEND); return; }
  await tx('pend', 'readwrite', s => s.objectStore('pend').delete(key));
}

export async function delPendMany(keys) {
  for (const k of keys) delete PEND[k];
  if (mode !== 'idb') { jset('pend', PEND); return; }
  await tx('pend', 'readwrite', s => { const st = s.objectStore('pend'); for (const k of keys) st.delete(k); });
}

/* ---- migrazione localStorage -> IndexedDB ---- */
const clearObj = o => { for (const k of Object.keys(o)) delete o[k]; };
const MIG_FLAG = 'migrated:v1', MIG_COPY = 'sonance.migbak.v1', MIG_COPY_DAYS = 30;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function readBack() {
  const [recs, pend] = await Promise.all([
    tx('playlists', 'readonly', s => s.objectStore('playlists').getAll()).then(x => x || []),
    tx('pend', 'readonly', s => { const st = s.objectStore('pend'), k = st.getAllKeys(), v = st.getAll(); return { get result() { return k.result.map((key, i) => [key, v.result[i]]); } }; }).then(x => x || []),
  ]);
  return { recs: [...recs].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0)), pend };
}
async function loadFromIdb() {
  const { recs, pend } = await readBack();
  clearObj(PL); clearObj(PLC); clearObj(PLID); clearObj(PEND);
  for (const r of recs) {
    let n = r.name; while (n in PL) n += ' ·';                                     // due playlist con lo stesso nome non dovrebbero esistere: le teniamo entrambe
    PL[n] = Array.isArray(r.ids) ? r.ids : []; PLID[n] = { id: r.id, created: r.created || Date.now() };
    if (typeof r.cover === 'string') PLC[n] = r.cover;
  }
  for (const [k, v] of pend) PEND[k] = v;
}

/** Da chiamare una volta all'avvio, prima di mostrare l'interfaccia. Restituisce 'idb' o 'ls' (se la migrazione non è riuscita: nulla cambia). */
export async function initStores() {
  try {
    await DB;
    if (await kvGet(MIG_FLAG)) {
      await loadFromIdb(); mode = 'idb';
      /* se l'app era stata chiusa dopo la verifica ma prima di ripulire localStorage, le vecchie copie restano: IndexedDB è la fonte, si liberano */
      if (!jget(MIG_COPY, null) && (localStorage.getItem('pl') || localStorage.getItem('plc'))) jset(MIG_COPY, { at: Date.now(), pl: jget('pl', {}), plc: jget('plc', {}) });
      for (const k of ['pl', 'plc', 'pend']) { try { localStorage.removeItem(k); } catch { /* ok */ } }
      const c = jget(MIG_COPY, null); if (c && Date.now() - (c.at || 0) > MIG_COPY_DAYS * 864e5) { try { localStorage.removeItem(MIG_COPY); } catch { /* ok */ } }
      return mode;
    }
    /* prima volta: si copia TUTTO in una sola transazione (o tutto o niente), poi si rilegge e si confronta. Solo se coincide si libera localStorage. */
    const recs = playlistRecords(), pend = { ...PEND };
    await tx(['playlists', 'pend', 'kv'], 'readwrite', s => {
      const sp = s.objectStore('playlists'), sd = s.objectStore('pend'), sk = s.objectStore('kv');
      sp.clear(); sd.clear();
      for (const r of recs) sp.put(r);
      for (const [k, v] of Object.entries(pend)) sd.put(v, k);
      sk.put({ at: Date.now(), playlists: recs.length, pend: Object.keys(pend).length }, MIG_FLAG);
    });
    const back = await readBack();
    const ok = back.recs.length === recs.length && back.recs.every((r, i) => r.id === recs[i].id && r.name === recs[i].name && same(r.ids, recs[i].ids) && r.cover === recs[i].cover)
      && back.pend.length === Object.keys(pend).length && back.pend.every(([k, v]) => same(v, pend[k]));
    if (!ok) throw Error('verifica della migrazione fallita');
    jset(MIG_COPY, { at: Date.now(), pl: { ...PL }, plc: { ...PLC } });            // copia di sicurezza delle sole playlist (piccola)
    for (const k of ['pl', 'plc', 'pend']) { try { localStorage.removeItem(k); } catch { /* ok */ } }
    mode = 'idb'; log('archivio: playlist e metadati migrati in IndexedDB (' + recs.length + ' playlist, ' + back.pend.length + ' in attesa)');
    return mode;
  } catch (e) {
    /* ritorno automatico al comportamento precedente: localStorage non è stato toccato e qui si annulla anche ciò che fosse stato scritto */
    log('archivio: migrazione non riuscita (' + e.message + '), si continua con localStorage');
    mode = 'ls';
    try { await tx(['playlists', 'pend', 'kv'], 'readwrite', s => { s.objectStore('playlists').clear(); s.objectStore('pend').clear(); s.objectStore('kv').delete(MIG_FLAG); }); } catch { /* ok */ }
    return mode;
  }
}

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
/** Mantiene gli ultimi PLAYS_MAX ascolti PER DATA: si scartano i più vecchi, non i primi inseriti (dopo un ripristino i due ordini non coincidono). */
export async function prunePlays() {
  const all = await getPlays();
  if (all.length <= PLAYS_MAX) return;
  const drop = [...all].sort((a, b) => (a.at - b.at) || (a.n - b.n)).slice(0, all.length - PLAYS_MAX).map(p => p.n);
  await tx('plays', 'readwrite', s => { for (const n of drop) s.objectStore('plays').delete(n); });
}
export const putPlaysBulk = list => tx('plays', 'readwrite', s => { for (const p of list) { const { n, ...r } = p; s.objectStore('plays').add(r); } });
/** Identità di un ascolto, uguale su dispositivi diversi (l'id del brano può cambiare dopo una reinstallazione). */
export const playKey = p => (+p.at) + '|' + Math.round(+p.ms || 0) + '|' + (p.title || '') + '|' + (p.artist || '');
/** Aggiunge solo gli ascolti non ancora presenti: ripristinare due volte lo stesso backup non raddoppia la cronologia. */
export async function putPlaysUnique(list) {
  const have = new Set((await getPlays()).map(playKey)), fresh = [], keys = [];
  for (const p of list) { const k = playKey(p); if (!have.has(k)) { have.add(k); fresh.push(p); keys.push(k); } }
  if (fresh.length) await putPlaysBulk(fresh);
  return { added: fresh.length, skipped: list.length - fresh.length, keys };
}
/** Elimina gli ascolti con queste chiavi (usata da «Annulla ripristino»). */
export async function delPlaysByKeys(keys) {
  const set = new Set(keys), drop = (await getPlays()).filter(p => set.has(playKey(p))).map(p => p.n);
  if (drop.length) await tx('plays', 'readwrite', s => { for (const n of drop) s.objectStore('plays').delete(n); });
  return drop.length;
}
