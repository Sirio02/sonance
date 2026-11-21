/* Aggregazioni per statistiche e cronologia (pure). Un "play" è {tid,at,ms,title,artist,album}. */
const bump = (m, key, init, p) => {
  let e = m.get(key); if (!e) { e = { ...init, n: 0, ms: 0 }; m.set(key, e); }
  e.n++; e.ms += p.ms || 0; return e;
};
const top = (m, k = 5) => [...m.values()].sort((a, b) => b.n - a.n || b.ms - a.ms).slice(0, k);

/** `who(play)` (opzionale) restituisce gli artisti da accreditare: un brano con featuring conta per ciascuno. */
export function aggregate(plays, since = 0, who = null) {
  const P = since ? plays.filter(p => p.at >= since) : plays;
  const T = new Map(), A = new Map(), L = new Map(); let ms = 0;
  for (const p of P) {
    ms += p.ms || 0;
    bump(T, p.tid, { tid: p.tid, title: p.title, artist: p.artist }, p);
    const ar = p.artist || 'Artista sconosciuto';
    for (const n of (who && who(p)) || [ar]) bump(A, n, { name: n }, p);
    if (p.album) bump(L, p.album + '\0' + ar, { name: p.album, artist: ar, tid: p.tid }, p);
  }
  return { count: P.length, ms, distinct: T.size, topTracks: top(T), topArtists: top(A), topAlbums: top(L) };
}

/** Ultimi N giorni (oggi incluso): minuti ascoltati e numero ascolti. */
export function perDay(plays, days, now = Date.now()) {
  const out = [], idx = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const b = { t: d.getTime(), ms: 0, n: 0 }; out.push(b); idx.set(d.toDateString(), b);
  }
  for (const p of plays) { const b = idx.get(new Date(p.at).toDateString()); if (b) { b.ms += p.ms || 0; b.n++; } }
  return out;
}

/** Giorni consecutivi con almeno un ascolto, contando da oggi (o da ieri se oggi è ancora vuoto). */
export function streak(plays, now = Date.now()) {
  const days = new Set(plays.map(p => new Date(p.at).toDateString()));
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
