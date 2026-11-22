/* Dati della libreria: brani, importazione, playlist, backup, arricchimento online (copertine/testi). */
import { S, PL, savePL, PLC, savePLC, PLID, plId, PEND, putPend, delPend, delPendMany, saveS, getTracks, putTrack, addTrack, removeTrackData, getBlob, getPlays, putPlaysUnique, delPlaysByKeys, playKey, kvGet, kvSet, kvDel, storesIdle } from './store.js';
import { bus, log, toast, sleep, norm } from './util.js';
import { readTags } from './tags.js';
import { setCover, coverExists, albumKey, dropCache, exportManualImages, importManualImages } from './covers.js';
import { trackArtists, parseArtistString, localSegment, reconcileArtists, segmentations } from './artists.js';
import * as online from './online.js';
import { parseM3U, matchEntries } from './m3u.js';
import { BACKUP_V, checkBackup, settingsForBackup } from './backup.js';

export const lib = { list: [], map: new Map(), ver: 0 };
export const byId = id => lib.map.get(id);
/** Ogni modifica ai dati invalida i raggruppamenti (album/artisti) e avvisa le viste. `soft`: modifica in sottofondo (ricerca online), l'interfaccia la applica senza fretta. */
const touch = (soft = false) => { lib.ver++; bus.emit('data', { soft }); };
export const touchData = () => touch();
/** Un dato di un brano (album, artista, artisti…) è cambiato in modo asincrono: senza questo il raggruppamento in cache restava vecchio fino al riavvio. */
export const metaChanged = () => touch(true);
const keepSet = () => new Set((S.keepArtists || []).map(norm));
export const artistsOf = t => trackArtists(t, { keep: keepSet() });

export async function loadLibrary() {
  lib.list = await getTracks().catch(e => { toast('Non riesco ad aprire la memoria dell\u2019app: ' + e.message); return []; });
  for (const t of lib.list) lib.map.set(t.id, t);
  /* Migrazione cache: la ricerca aggiornata gestisce meglio artisti multipli e album mancanti.
     I precedenti esiti negativi vengono ritentati una sola volta dopo l'aggiornamento. */
  if (S.mig !== 3) { for (const t of lib.list) { if (t.nc) t.nc = 0; if (t.nl) t.nl = 0; putTrack(t).catch(() => {}); } S.mig = 3; saveS(); }
  touch();
}
export const saveTrack = t => putTrack(t).catch(e => { toast('Salvataggio non riuscito: ' + e.message); log('putTrack: ' + e.message); });

/* ---------- durata ---------- */
const duration = f => new Promise(ok => {
  const x = new Audio(), u = URL.createObjectURL(f); let d = 0;
  const end = v => { if (!d) { d = 1; clearTimeout(tm); URL.revokeObjectURL(u); x.removeAttribute('src'); ok(v); } };
  const tm = setTimeout(() => end(0), 6000);
  x.preload = 'metadata'; x.onloadedmetadata = () => end(isFinite(x.duration) ? x.duration : 0); x.onerror = () => end(-1); x.src = u;
});

/* ---------- importazione ---------- */
const key = t => t.name + '|' + t.size;
export async function importFiles(files, onProgress, { meta = null } = {}) {
  let ok = 0, skip = 0, fail = 0; const added = [];
  navigator.storage?.persist?.();
  for (const [i, f] of files.entries()) {
    onProgress?.(i + 1, files.length);
    if (lib.list.some(x => x.name === f.name && x.size === f.size)) { skip++; continue; }
    try {
      const d = await duration(f);
      if (d < 0) throw Error('formato non riproducibile su questo dispositivo');
      const { art, albumArtist, artistList, ...tags } = await readTags(f);
      const extra = meta instanceof Map ? (meta.get(f) || {}) : {};
      const t = { id: crypto.randomUUID(), ...tags, dur: d, size: f.size, name: f.name, fav: 0, added: Date.now(), p: 1 };
      for (const k of ['title','artist','album','trk']) if (!t[k] && extra[k] !== undefined) t[k] = extra[k];
      if (extra.src) t.src = extra.src;
      if (albumArtist && norm(albumArtist) !== norm(t.artist)) t.aa = albumArtist;          // artista dell'album, distinto dall'artista del brano
      if (artistList?.length > 1) { t.am = artistList; t.av = 1; }                          // elenco esplicito nei tag (valori multipli)
      await addTrack(t, f);
      await claim(t);
      lib.list.push(t); lib.map.set(t.id, t); added.push(t); ok++;
      if (art) setCover(t, new Blob([art.data], { type: art.mime }), t.album ? 'album' : 'track').catch(e => log('copertina incorporata: ' + e.message));
    } catch (e) {
      fail++; log(f.name + ': ' + (e.name === 'QuotaExceededError' ? 'spazio esaurito, importazione interrotta' : e.message));
      if (e.name === 'QuotaExceededError') { toast('Spazio esaurito sul dispositivo: importazione interrotta. Libera spazio e riprova.'); break; }
    }
    if (i % 5 === 4) touch();
  }
  touch();
  enrichQueue(added);
  return meta ? { ok, skip, fail, added } : { ok, skip, fail };
}

export async function removeTrack(t, quiet = false) {
  const sameAlbum = t.album && lib.list.some(x => x !== t && albumKey(x) === albumKey(t));
  await removeTrackData(t.id, t.album && !sameAlbum ? ['cv:A' + albumKey(t), 'ct:A' + albumKey(t)] : []);
  dropCache('T' + t.id);
  lib.list = lib.list.filter(x => x !== t); lib.map.delete(t.id);
  for (const k in PL) PL[k] = PL[k].filter(x => x !== t.id);
  savePL(); bus.emit('removed', t); if (!quiet) touch();
}
/* ---- eliminazione differita (con «Annulla») ----
   Il brano sparisce subito dall'interfaccia; blob, metadati, preferiti, ascolti e playlist restano intatti finché il tempo scade
   (o l'app si chiude). Così «Annulla» ripristina tutto senza perdere nulla. La coda di riproduzione non viene toccata prima della conferma. */
const pendingDel = new Map();     // id -> { t, timer }
export const UNDO_MS = 6000;
async function commitRemove(id) {
  const e = pendingDel.get(id); if (!e) return false;
  clearTimeout(e.timer); pendingDel.delete(id);
  try { await removeTrack(e.t, true); } catch (x) { log('eliminazione: ' + x.message); lib.list.push(e.t); lib.map.set(e.t.id, e.t); touch(); return false; }
  touch(true); return true;
}
/** Nasconde i brani e rimanda l'eliminazione definitiva. Ritorna la funzione che annulla. */
export function softRemove(list, ms = UNDO_MS) {
  const ids = list.map(t => t.id);
  lib.list = lib.list.filter(x => !ids.includes(x.id)); for (const t of list) lib.map.delete(t.id);
  for (const t of list) { const e = { t }; e.timer = setTimeout(() => commitRemove(t.id), ms); pendingDel.set(t.id, e); }
  touch();
  return () => {
    let n = 0; for (const t of list) { const e = pendingDel.get(t.id); if (!e) continue; clearTimeout(e.timer); pendingDel.delete(t.id); lib.list.push(t); lib.map.set(t.id, t); n++; }
    if (n) touch(); return n === list.length;
  };
}
export const flushPendingDeletes = () => Promise.all([...pendingDel.keys()].map(commitRemove));
export const pendingDeletes = () => pendingDel.size;
globalThis.addEventListener?.('pagehide', () => { flushPendingDeletes(); });
/** Rimuove da una playlist con possibilità di annullare (ripristina ogni brano nella posizione di prima). */
export function plRemoveUndoable(n, ids) {
  const arr = PL[n] || [], rm = ids.map(id => [arr.indexOf(id), id]).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0]);
  for (const [, id] of rm) PL[n] = PL[n].filter(x => x !== id);
  savePL(); touch();
  return () => { PL[n] ||= []; for (const [i, id] of rm) if (!PL[n].includes(id)) PL[n].splice(Math.min(i, PL[n].length), 0, id); savePL(); touch(); };
}
/** Elimina più brani con un solo aggiornamento dell'interfaccia. */
export async function removeTracks(list) { for (const t of list) await removeTrack(t, true); touch(); }
/** Unisce le copie in `keep`: preferiti, ascolti, testo e playlist passano al brano tenuto. */
export async function mergeTracks(keep, others) {
  for (const o of others) {
    keep.fav = keep.fav || o.fav ? 1 : 0; keep.pc = (keep.pc || 0) + (o.pc || 0); keep.lp = Math.max(keep.lp || 0, o.lp || 0); if (!keep.lrc && o.lrc) keep.lrc = o.lrc;
    for (const n in PL) { const a = PL[n]; if (a.includes(o.id)) PL[n] = a.includes(keep.id) ? a.filter(x => x !== o.id) : a.map(x => (x === o.id ? keep.id : x)); }
  }
  savePL(); await saveTrack(keep); await removeTracks(others);
}
/** Crea una playlist da un file M3U. Restituisce {name, found, missing[]}. */
export function importM3U(text, fileName) {
  const { name, entries } = parseM3U(text, fileName), { matched, missing } = matchEntries(entries, lib.list);
  let n = name, i = 2; while (PL[n]) n = `${name} (${i++})`;
  plCreate(n, matched.map(t => t.id));
  return { name: n, found: matched.length, missing };
}

export async function toggleFav(t, origin = 'external', source = null) { const previous = !!t.fav; t.fav = previous ? 0 : 1; await saveTrack(t); bus.emit('fav', t, { previous, current: !!t.fav, origin, source }); }

/* ---------- playlist ---------- */
export const plTracks = n => (PL[n] || []).map(byId).filter(Boolean);
export const plCreate = (n, ids = []) => { if (!n || PL[n]) return false; PL[n] = [...ids]; savePL(); touch(); return true; };
export const plAdd = (n, id) => { PL[n] ||= []; if (PL[n].includes(id)) return false; PL[n].push(id); savePL(); touch(); return true; };
export const plMove = (n, from, to) => { const a = PL[n]; if (!a) return; a.splice(to, 0, a.splice(from, 1)[0]); savePL(); touch(); };
export const plDelete = n => { delete PL[n]; delete PLC[n]; delete PLID[n]; savePL(); savePLC(); touch(); };
export function plRename(n, v) {
  if (!v || PL[v]) return false;
  PL[v] = PL[n]; delete PL[n];
  if (PLID[n]) { PLID[v] = PLID[n]; delete PLID[n]; }                // l'identificatore stabile segue la playlist
  if (PLC[n]) { PLC[v] = PLC[n]; delete PLC[n]; savePLC(); }
  savePL(); touch(); return true;
}
export const plSetCover = (n, dataUrl) => { if (dataUrl) PLC[n] = dataUrl; else delete PLC[n]; savePLC(); touch(); };

/* ---------- raggruppamenti ---------- */
const memo = {};
const group = (name, fn) => { const m = memo[name]; if (m && m.ver === lib.ver) return m.v; const v = fn(); memo[name] = { ver: lib.ver, v }; return v; };
/** Collator condivisi: stesso ordinamento di localeCompare('it'), ma molto più veloce (localeCompare ne crea uno a ogni confronto). */
const COLL = new Intl.Collator('it'), COLN = new Intl.Collator('it', { numeric: true });
export const byTrackNo = (a, b) => (a.trk || 999) - (b.trk || 999) || COLN.compare(a.title, b.title);
export const albumGroupKey = t => (t.album || 'Album sconosciuto') + '\0' + (t.aa || t.artist || '');
export const albums = () => group('albums', () => {
  const g = new Map();
  for (const t of lib.list) { const k = albumGroupKey(t); (g.get(k) || g.set(k, []).get(k)).push(t); }
  return [...g].map(([k, list]) => ({ key: k, name: k.split('\0')[0], artist: list[0].aa || list[0].artist || 'Artista sconosciuto', tracks: list.sort(byTrackNo) }))
    .sort((a, b) => COLL.compare(a.name, b.name));
});
/** Un brano compare sotto ognuno dei suoi artisti (principali e partecipanti), senza duplicarlo. */
export const artists = () => group('artists', () => {
  const g = new Map(), keep = keepSet();
  for (const t of lib.list) {
    const names = trackArtists(t, { keep }); if (!names.length) names.push('Artista sconosciuto');
    for (const n of names) { const k = norm(n); let e = g.get(k); if (!e) g.set(k, e = { name: n, tracks: [] }); e.tracks.push(t); }
  }
  return [...g.values()].map(a => ({ name: a.name, tracks: a.tracks.sort((x, y) => COLL.compare(x.album || '', y.album || '') || byTrackNo(x, y)) }))
    .sort((a, b) => COLL.compare(a.name, b.name));
});
export const findArtist = name => artists().find(a => norm(a.name) === norm(name));

export const SORTS = {
  az: ['Titolo (A→Z)', (a, b) => COLN.compare(a.title, b.title)],
  artist: ['Artista', (a, b) => COLL.compare(a.artist + a.album, b.artist + b.album) || byTrackNo(a, b)],
  recent: ['Aggiunti di recente', (a, b) => (b.added || 0) - (a.added || 0)],
  plays: ['Più ascoltati', (a, b) => (b.pc || 0) - (a.pc || 0) || COLL.compare(a.title, b.title)],
  last: ['Ascoltati di recente', (a, b) => (b.lp || 0) - (a.lp || 0)],
  dur: ['Durata', (a, b) => (b.dur || 0) - (a.dur || 0)],
};
export function search(q, { favOnly = false, sort = S.sort || 'az' } = {}) {
  const n = norm(q);
  const l = lib.list.filter(t => (!favOnly || t.fav) && (!n || norm(t.title + ' ' + t.artist + ' ' + t.album).includes(n)));
  return l.sort((SORTS[sort] || SORTS.az)[1]);
}
export const smart = {
  fav: () => lib.list.filter(t => t.fav).sort(SORTS.az[1]),
  recent: () => [...lib.list].sort(SORTS.recent[1]).slice(0, 50),
  top: () => lib.list.filter(t => t.pc).sort(SORTS.plays[1]).slice(0, 50),
  last: () => lib.list.filter(t => t.lp).sort(SORTS.last[1]).slice(0, 50),
};

/* ---------- backup ---------- */
export const META = ['title', 'artist', 'album', 'trk', 'fav', 'lrc', 'lyricOffset', 'nc', 'nl', 'ncv', 'nlv', 'cu', 'p', 'pc', 'lp', 'added', 'src', 'aa', 'am', 'af', 'av', 'lsrc', 'll'];
const bkey = key;
export async function exportBackup({ full = false } = {}) {
  const data = { v: BACKUP_V, date: new Date().toISOString(), tracks: lib.list, playlists: { ...PL }, plid: Object.fromEntries(Object.keys(PL).map(n => [n, plId(n)])), covers: { ...PLC }, plays: await getPlays(), settings: settingsForBackup(S) };
  if (full) data.images = await exportManualImages();                // «Backup completo»: copertine e immagini artista scelte a mano
  return new File([JSON.stringify(data)], 'sonance-backup.json', { type: 'application/json' });
}
/** Da chiamare solo quando il file è stato davvero salvato o condiviso: creare il file non basta (l'utente può annullare la condivisione). */
export const markBackupSaved = () => { S.lastBackup = Date.now(); saveS(); bus.emit('settings'); };

const sameVal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const UNDO_KEY = 'snapshot:prerestore', UNDO_INFO = 'snapshot:prerestore:info', UNDO_HOURS = 24;   // l'info è piccola: si legge senza caricare l'istantanea
/** Che cosa farebbe il ripristino, senza modificare nulla: serve alla schermata di conferma. */
export async function planRestore(raw) {
  const j = checkBackup(raw), have = new Map(lib.list.map(t => [bkey(t), t]));
  const hit = j.tracks.filter(bt => have.has(bkey(bt))).length, known = new Set((await getPlays()).map(playKey)), fresh = new Set();
  for (const p of j.plays) { const k = playKey(p); if (!known.has(k)) fresh.add(k); }
  const names = Object.keys(PL), ids = new Set(names.map(plId)), pln = Object.keys(j.playlists);
  const newPlaylists = pln.filter(n => !(j.plid?.[n] && ids.has(j.plid[n])) && !names.includes(n)).length;
  return { version: j.v, tracks: j.tracks.length, hit, wait: j.tracks.length - hit, playlists: pln.length, newPlaylists, plays: j.plays.length, newPlays: fresh.size,
    images: Object.keys(j.images?.covers || {}).length + Object.keys(j.images?.artists || {}).length, dropped: j.dropped };
}
/** Ripristino non distruttivo e ripetibile: unisce i dati del backup a quelli presenti (nulla viene cancellato), non raddoppia la cronologia,
    salva prima un'istantanea (per «Annulla ripristino») e, se qualcosa va storto a metà, torna da solo allo stato precedente. */
export async function restoreBackup(raw) {
  const j = checkBackup(raw);                       // lancia se il file non è valido o proviene da una versione futura
  const byIdB = new Map(j.tracks.map(t => [t.id, t])), have = new Map(lib.list.map(t => [bkey(t), t]));
  /* 1) piano: nulla viene modificato finché l'istantanea non è salvata */
  const changes = [];
  for (const bt of j.tracks) {
    const t = have.get(bkey(bt)); if (!t) continue;
    const before = {}, after = {};
    for (const k of META) if (bt[k] !== undefined && !sameVal(t[k], bt[k])) { before[k] = t[k]; after[k] = bt[k]; }
    if (Object.keys(after).length) changes.push({ t, before, after });
  }
  let hit = 0; const pendNew = {};
  for (const bt of j.tracks) {
    const k = bkey(bt);
    if (have.has(k)) { hit++; continue; }
    pendNew[k] = { ...Object.fromEntries(META.filter(x => bt[x] !== undefined).map(x => [x, bt[x]])), pls: [...(PEND[k]?.pls || [])] };
  }
  const wait = j.tracks.length - hit;
  const target = new Map();                          // nome nella playlist del backup -> nome locale (prima per id stabile, poi per nome)
  for (const n of Object.keys(j.playlists)) { const id = j.plid?.[n]; target.set(n, (id && Object.keys(PL).find(x => PLID[x]?.id === id)) || n); }
  const tn = n => target.get(n) || n, plNames = [...new Set(target.values())];
  const snap = {
    at: Date.now(), tracks: changes.map(c => ({ id: c.t.id, before: c.before })),
    pl: Object.fromEntries(plNames.map(n => [n, PL[n] ? [...PL[n]] : undefined])), plc: Object.fromEntries(Object.keys(j.covers).map(n => [tn(n), PLC[tn(n)]])),
    pend: Object.fromEntries(Object.keys(pendNew).map(k => [k, PEND[k]])), settings: Object.fromEntries(Object.keys(j.settings).map(k => [k, S[k]])), playKeys: [],
  };
  await kvSet(UNDO_KEY, snap); await kvSet(UNDO_INFO, { at: snap.at });
  try {
    /* 2) applicazione */
    for (const c of changes) { Object.assign(c.t, c.after); await saveTrack(c.t); }
    for (const [n, ids] of Object.entries(j.playlists)) {
      const to = tn(n); PL[to] ||= [];
      if (j.plid?.[n] && !PLID[to]) PLID[to] = { id: j.plid[n], created: Date.now() };
      for (const id of ids) {
        const bt = byIdB.get(id); if (!bt) continue;
        const k = bkey(bt), t = have.get(k);
        if (t) { if (!PL[to].includes(t.id)) PL[to].push(t.id); }
        else if (pendNew[k] && !pendNew[k].pls.includes(to)) pendNew[k].pls.push(to);
      }
    }
    for (const [n, u] of Object.entries(j.covers)) PLC[tn(n)] = u;
    await putPend(pendNew);                          // lancia se non riesce a salvare: niente perdite silenziose
    const idMap = new Map([...have].map(([k, t]) => [k, t.id]));
    const pr = j.plays.length ? await putPlaysUnique(j.plays.map(p => ({ ...p, tid: idMap.get(bkey(byIdB.get(p.tid) || {})) || p.tid }))) : { added: 0, skipped: 0, keys: [] };
    Object.assign(S, j.settings); saveS();
    if (!savePL() || !savePLC()) throw Error('spazio insufficiente per salvare le playlist');
    if (j.images) await importManualImages(j.images);
    await storesIdle();
    snap.playKeys = pr.keys; await kvSet(UNDO_KEY, snap);
    touch(); bus.emit('settings');
    return { hit, wait, ...(j.dropped ? { dropped: j.dropped } : {}), playsAdded: pr.added, playsSkipped: pr.skipped };
  } catch (e) {
    log('ripristino: ' + e.message);
    try { await undoRestore(); } catch (u) { log('ripristino: ritorno allo stato precedente non riuscito: ' + u.message); }
    throw Error('ripristino interrotto e annullato (' + e.message + ')');
  }
}
/** Annulla l'ultimo ripristino (entro 24 ore): rimette i valori precedenti dei brani, delle playlist, dei brani in attesa e delle impostazioni e toglie gli ascolti aggiunti. */
export async function undoRestore() {
  const s = await kvGet(UNDO_KEY); if (!s) { await kvDel(UNDO_INFO); return false; }
  for (const { id, before } of s.tracks) { const t = byId(id); if (!t) continue; for (const [k, v] of Object.entries(before)) { if (v === undefined) delete t[k]; else t[k] = v; } await saveTrack(t); }
  for (const [n, ids] of Object.entries(s.pl)) { if (ids === undefined) { delete PL[n]; delete PLID[n]; } else PL[n] = ids; }
  for (const [n, u] of Object.entries(s.plc)) { if (u === undefined) delete PLC[n]; else PLC[n] = u; }
  const put = {}, del = []; for (const [k, v] of Object.entries(s.pend)) { if (v === undefined) del.push(k); else put[k] = v; }
  if (Object.keys(put).length) await putPend(put);
  if (del.length) await delPendMany(del);
  for (const [k, v] of Object.entries(s.settings)) { if (v === undefined) delete S[k]; else S[k] = v; }
  saveS(); savePL(); savePLC();
  if (s.playKeys?.length) await delPlaysByKeys(s.playKeys);
  await storesIdle(); await kvDel(UNDO_KEY); await kvDel(UNDO_INFO); touch(); bus.emit('settings');
  return true;
}
/** C'è un ripristino annullabile? (restituisce {at} oppure null; dopo 24 ore l'istantanea viene eliminata) */
export async function restoreUndoInfo() {
  try { const i = await kvGet(UNDO_INFO); if (!i) return null; if (Date.now() - i.at > UNDO_HOURS * 36e5) { await kvDel(UNDO_KEY); await kvDel(UNDO_INFO); return null; } return { at: i.at }; } catch { return null; }
}
const applyMeta = (t, m) => { for (const k of META) if (m[k] !== undefined) t[k] = m[k]; return saveTrack(t); };
async function claim(t) {
  const m = PEND[key(t)]; if (!m) return;
  const { pls, ...r } = m; await applyMeta(t, r);
  for (const n of pls || []) { PL[n] ||= []; if (!PL[n].includes(t.id)) PL[n].push(t.id); }
  savePL(); await delPend(key(t)).catch(e => log('brani in attesa: ' + e.message));
}

/* ---------- arricchimento online (copertine, testi, artisti) ---------- */
/* Gli esiti negativi valgono solo per la versione della strategia che li ha prodotti: migliorare la ricerca li rende subito riprovabili. */
const COV_V = 4, LYR_V = 8, ART_V = 1;
const WEEK2 = 14 * 864e5, recent = ts => ts > 1 && Date.now() - ts < WEEK2;
const jobs = [], queued = new Set(), albumDone = new Map();   // albumDone: chiave album -> esito di questa sessione
let running = false, stopUntil = 0, busyProbe = () => false;
/** L'interfaccia indica se l'utente sta interagendo: la ricerca in sottofondo aspetta (non compete con audio e gesti). */
export const setBusyProbe = f => { busyProbe = f; };
export const enrichState = { running: false, left: 0, lastError: '' };

const canBulk = () => {
  if (!navigator.onLine || S.auto === 0) return false;
  if (navigator.connection?.saveData) return false;
  return true;
};
export function enrichQueue(list, force = false) {
  for (const t of list) { if (!queued.has(t.id) || force) { queued.add(t.id); jobs.push({ t, force }); } }
  enrichState.left = jobs.length; bus.emit('enrich');
  run();
}
async function run() {
  if (running) return; running = true; enrichState.running = true;
  try {
    while (jobs.length) {
      if (!canBulk() && !jobs[0].force) { break; }
      if (Date.now() < stopUntil && !jobs[0].force) break;
      for (let i = 0; i < 40 && busyProbe() && !jobs[0].force; i++) await sleep(250);
      const { t, force } = jobs.shift(); enrichState.left = jobs.length; queued.delete(t.id);
      if (!lib.map.has(t.id)) continue;
      await enrichOne(t, force);
      bus.emit('enrich');
    }
  } finally { running = false; enrichState.running = false; bus.emit('enrich'); }
}

/** Nomi di artisti "sicuramente singoli": parole singole e nomi già verificati. Servono come prova locale per dividere "Nome1 Nome2". */
function knownArtists() {
  const k = new Set();
  for (const t of lib.list) for (const n of t.am?.length ? t.am : [t.artist]) { const x = (n || '').trim(); if (x && (t.av || !/\s/.test(x))) k.add(norm(x)); }
  return k;
}
/** Risolve gli artisti di un brano il cui nome non ha separatori ("Dolcenera Lazza" o "Pinguini Tattici Nucleari"). Ritorna true se ha cambiato qualcosa. */
async function resolveArtists(t, force) {
  const raw = (t.artist || '').trim();
  if (!raw || t.av || (t.arv === ART_V && recent(t.arn) && !force)) return false;
  const keep = keepSet(), p = parseArtistString(raw, { keep });
  const single = () => { t.av = 1; return true; };
  if (p.main.length + p.feat.length > 1 || keep.has(norm(raw)) || !/\s/.test(raw) || raw.split(/\s+/).length > 5) { t.av = 1; return false; }   // già esplicito o nome a parola singola
  const apply = names => { t.am = names; t.av = 1; delete t.arn; return true; };
  const loc = localSegment(raw, knownArtists());                                         // prova locale: parti già note nella libreria
  if (loc) return apply(loc);
  try {
    if (await online.artistFans(raw)) return single();                                    // l'intero è un artista (es. Pinguini Tattici Nucleari)
    const exists = async n => (await online.artistFans(n)) > 0;
    const hit = await online.findSong(t);                                                 // crediti del servizio per titolo+artista
    const r = hit?.artist ? await reconcileArtists(raw, hit.artist, exists, { keep }) : null;
    if (r) return r.names.length === 1 ? single() : apply(r.names);
    const toks = raw.split(/\s+/);                                                       // ultima prova: ogni parte è un artista affermato
    if (toks.length <= 3) {
      for (const seg of segmentations(toks)) { let ok = true; for (const part of seg) { if ((await online.artistFans(part)) < 3000) { ok = false; break; } } if (ok) return apply(seg); }
    }
  } catch (e) { if (e.kind === 'offline' || e.kind === 'cooldown') return false; log('artisti «' + t.title + '»: ' + e.message); return false; }
  t.arv = ART_V; t.arn = Date.now(); return true;                                         // nessuna prova: resta un nome unico, nuovo tentativo tra 14 giorni
}

export async function enrichOne(t, force = false) {
  let changed = false, shape = false, err = null;
  const covFresh = recent(t.nc) && t.ncv === COV_V, lyrFresh = recent(t.nl) && t.nlv === LYR_V;
  /* copertina: una ricerca per album */
  try {
    const ak = albumKey(t) || t.id;
    if (force || (!covFresh && (!t.album || !(await coverExists(t))))) {
      if (!force && albumDone.has(ak)) { /* già tentato in questa sessione per l'album */ }
      else {
        const hadCover = await coverExists(t);
        const r = await online.findCover(t); albumDone.set(ak, !!r);
        if (r) {
          // Se il file non contiene l'album, ricavarlo dal risultato musicale e salvarlo nei metadati locali.
          const albumWasMissing = !t.album;
          if (albumWasMissing && r.album) { t.album = r.album; changed = shape = true; }
          if ((!t.artist || t.artist.trim() === '') && r.artist) { t.artist = r.artist; changed = shape = true; }
          if (!hadCover) {
            const blob = await online.fetchBlob(r.url);
            if (blob) await setCover(t, blob, t.album ? 'album' : 'track');
            else { t.cu = r.url; dropCache(t.album ? 'A' + albumKey(t) : 'T' + t.id); }
          } else if (albumWasMissing && t.album) {
            // Una copertina incorporata resta prioritaria, ma viene condivisa anche con il nuovo album.
            const embedded = await getBlob('cv:T' + t.id);
            if (embedded) await setCover(t, embedded, 'album');
          }
          changed = true; t.nc = 0; await saveTrack(t);
        } else { t.nc = Date.now(); t.ncv = COV_V; await saveTrack(t); }
      }
    }
  } catch (e) { err = e; log('copertina «' + t.title + '»: ' + e.message); }
  /* artisti multipli / featuring */
  if (!err || err.kind !== 'offline') {
    try { if (await resolveArtists(t, force)) { changed = shape = true; await saveTrack(t); } } catch (e) { log('artisti «' + t.title + '»: ' + e.message); }
  }
  /* testo */
  if (!err || err.kind !== 'offline') {
    try {
      if (!t.ll && (force || (!t.lrc && !lyrFresh))) {        // t.ll: testo scelto/bloccato dall'utente, mai sovrascritto in automatico
        const meta = {}, l = await online.findLyrics(t, { budget: force ? 12 : 8, meta });
        if (l) { t.lrc = l; t.nl = 0; t.lsrc = { k: meta.kind, a: meta.from || '', s: meta.synced ? 1 : 0 }; changed = true; } else { t.nl = Date.now(); t.nlv = LYR_V; }
        await saveTrack(t);
      }
    } catch (e) { err ||= e; log('testo «' + t.title + '»: ' + e.message); }
  }
  enrichState.lastError = err ? online.explain(err) : '';
  if (err?.kind === 'offline') stopUntil = Date.now() + 15000;
  if (err?.kind === 'cooldown') stopUntil = Date.now() + 60000;
  if (shape) metaChanged();                                  // album/artisti cambiati: invalida i raggruppamenti e aggiorna Album/Artisti subito
  if (changed) bus.emit('enriched', t);
  return { changed, err };
}
export { online };
