/* Validazione e normalizzazione dei backup JSON (pura, testata in Node).
   Un backup può arrivare da una versione precedente, da una futura o da un file qualsiasi: qui si decide cosa è importabile. */
export const BACKUP_V = 6;
const num = (v, a, b, d) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.min(b, Math.max(a, +v)) : d);
const flag = v => (v ? 1 : 0);
const str = (v, max = 40) => (typeof v === 'string' && v.length <= max ? v : undefined);
const BAD_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

/** Impostazioni salvate nel backup: chiave → funzione che restituisce il valore valido oppure undefined (da scartare). */
export const SETTINGS = {
  eq: v => (Array.isArray(v) && v.length === 6 && v.every(Number.isFinite) ? v.map(x => num(x, -15, 15, 0)) : undefined),
  eqOn: v => (v === undefined ? undefined : flag(v)),
  cp: v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object').slice(0, 100) : undefined),
  cf: v => (v === undefined ? undefined : num(v, 0, 12, 0)),
  th: v => str(v, 24),
  ac: v => (typeof v === 'string' && (v === '' || /^#[0-9a-f]{3,8}$/i.test(v)) ? v : undefined),
  sort: v => str(v, 16),
  keepArtists: v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.length < 200).slice(0, 500) : undefined),
  eco: v => (v === undefined ? undefined : flag(v)),
  shuffle: v => (v === undefined ? undefined : flag(v)),
  repeat: v => (v === undefined ? undefined : num(v, 0, 2, 0)),
  keep: v => (v === undefined ? undefined : num(v, 0, 60, 0)),
  auto: v => (v === undefined ? undefined : flag(v)),
  /* aspetto e funzioni opzionali (introdotte nella v5) */
  beta: v => (v === undefined ? undefined : flag(v)),
  dens: v => (['c', 'n', 'w'].includes(v) ? v : undefined),
  cr: v => (['s', 'r', 'x'].includes(v) ? v : undefined),
  ly: v => (v && typeof v === 'object' ? { sz: num(v.sz, 0, 2, 1), al: v.al === 'l' ? 'l' : 'c', bl: flag(v.bl ?? 1) } : undefined),
  mv: v => (['n', 'r', 'z'].includes(v) ? v : undefined),
  start: v => (['lib', 'last'].includes(v) ? v : undefined),
  cc: v => (v === undefined ? undefined : flag(v)),
  src: v => (v && typeof v === 'object' && !Array.isArray(v) ? { ia:flag(v.ia), wc:flag(v.wc), ov:flag(v.ov), jm:flag(v.jm) } : undefined),
  dlWarn: v => (v === undefined ? undefined : [50,150,300].includes(+v) ? +v : 150),
  dlWake: v => (v === undefined ? undefined : flag(v)),
};

/** Controlla il file e restituisce solo dati ben formati. Lancia un Error con messaggio italiano comprensibile. */
export function checkBackup(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j) || !Array.isArray(j.tracks)) throw Error('formato non riconosciuto');
  const v = j.v === undefined ? 0 : Number(j.v);
  if (!Number.isFinite(v)) throw Error('formato non riconosciuto');
  if (v > BACKUP_V) throw Error('questo backup è stato creato da una versione più recente di Sonance (v' + v + '): aggiorna l\u2019app e riprova');
  const tracks = j.tracks.filter(t => t && typeof t === 'object' && typeof t.id === 'string' && typeof t.name === 'string' && t.name)
    .map(t => { const x = { ...t, size: Number.isFinite(+t.size) ? +t.size : 0 }; const z=t.src; if (!z || !['ia','wc','ov','jm'].includes(z.p) || typeof z.id !== 'string' || z.id.length>200 || typeof z.url !== 'string' || !/^https:\/\//i.test(z.url)) delete x.src; return x; });
  if (!tracks.length && j.tracks.length) throw Error('nessun brano valido nel file');
  const playlists = {};
  if (j.playlists && typeof j.playlists === 'object' && !Array.isArray(j.playlists))
    for (const [n, ids] of Object.entries(j.playlists)) if (!BAD_NAMES.has(n) && n.length <= 120 && Array.isArray(ids)) playlists[n] = ids.filter(x => typeof x === 'string');
  const covers = {};
  if (j.covers && typeof j.covers === 'object' && !Array.isArray(j.covers))
    for (const [n, u] of Object.entries(j.covers)) if (!BAD_NAMES.has(n) && typeof u === 'string' && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(u)) covers[n] = u;
  /* v6: identificatori stabili delle playlist e immagini scelte a mano («Backup completo»). I backup fino alla v5 non li hanno: restano validi. */
  const plid = {};
  if (j.plid && typeof j.plid === 'object' && !Array.isArray(j.plid))
    for (const [n, id] of Object.entries(j.plid)) if (!BAD_NAMES.has(n) && typeof id === 'string' && /^[0-9a-f-]{8,64}$/i.test(id)) plid[n] = id;
  const images = checkImages(j.images);
  const plays = Array.isArray(j.plays) ? j.plays.filter(p => p && typeof p === 'object' && typeof p.tid === 'string' && Number.isFinite(+p.at)) : [];
  const settings = {};
  if (j.settings && typeof j.settings === 'object') for (const [k, f] of Object.entries(SETTINGS)) { const x = f(j.settings[k]); if (x !== undefined) settings[k] = x; }
  return { v, tracks, playlists, plid, covers, plays, settings, images, dropped: j.tracks.length - tracks.length };
}

/** Immagini scelte a mano: solo data URL di immagini, chiavi brevi, quantità e dimensione limitate. Restituisce undefined se non ce ne sono. */
const IMG_RE = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i, IMG_MAX_LEN = 700000, IMG_MAX_N = 3000;
function checkImages(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined;
  const pick = o => {
    const out = {}; let n = 0;
    if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, u] of Object.entries(o)) {
      if (n >= IMG_MAX_N) break;
      if (!BAD_NAMES.has(k) && k.length > 0 && k.length <= 240 && typeof u === 'string' && u.length <= IMG_MAX_LEN && IMG_RE.test(u)) { out[k] = u; n++; }
    }
    return out;
  };
  const covers = pick(x.covers), artists = pick(x.artists);
  return Object.keys(covers).length || Object.keys(artists).length ? { covers, artists } : undefined;
}

/** Impostazioni da scrivere nel backup (solo chiavi note e definite). */
export function settingsForBackup(S) {
  const o = {}; for (const k of Object.keys(SETTINGS)) if (S[k] !== undefined) o[k] = S[k]; return o;
}
