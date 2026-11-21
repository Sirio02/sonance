/* Servizi online: copertine, immagini artista, testi. Pensato per essere robusto:
   - più fornitori in sequenza (iTunes → Deezer), ognuno con limite di richieste e pausa se risponde 403/429;
   - fetch normale, con ripiego JSONP quando il browser blocca la risposta (CORS);
   - distingue "non trovato" da "errore di rete" (solo il primo viene ricordato). */
import { sleep, log, norm } from './util.js';
import { jset } from './store.js';
import { cleanTitle, stripFeat, mainArtist, artistVariants, pickBest, pickAlbum, matchArtist, isMusicDesc, titleVariants, artistNames, pickLyric, coverMark, pickOriginalLyric, pickOriginal, pickCorrected, coverArtistHint, COVER_DUR, COVER_DUR_CONFIRMED, artistSim, rankOriginals, SYNC_MAX, toPlain, titleSim } from './match.js';
import { trackArtists } from './artists.js';

export class NetError extends Error { constructor(msg, kind, status) { super(msg); this.kind = kind; this.status = status; } }

export const STATUS = {};                   // fornitore -> {ok, msg, at, via}
const cooldown = {}, fails = {}, chain = {};
const note = (p, ok, msg, via) => { STATUS[p] = { ok, msg, via, at: Date.now() }; };

/** Serializza le richieste di un fornitore, rispettando una pausa minima tra l'una e l'altra. */
const last = {};
function gated(p, gap, fn) {
  const run = (chain[p] || Promise.resolve()).then(async () => {
    const w = (last[p] || 0) + gap - Date.now();
    if (w > 0) await sleep(w);
    last[p] = Date.now();
    return fn();
  });
  chain[p] = run.catch(() => {});
  return run;
}

async function viaFetch(url, ms = 8000) {
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), ms);
  let res;
  try { res = await fetch(url, { signal: ac.signal, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' }); }
  catch (e) { throw new NetError(e.name === 'AbortError' ? 'timeout' : 'richiesta bloccata o rete assente', e.name === 'AbortError' ? 'timeout' : 'net'); }
  finally { clearTimeout(timer); }
  if (!res.ok) throw new NetError('HTTP ' + res.status, 'http', res.status);
  try { return await res.json(); } catch { throw new NetError('risposta non valida', 'format'); }
}

function viaJsonp(url, ms = 8000) {
  return new Promise((ok, ko) => {
    const cb = 'cb' + Math.random().toString(36).slice(2), sc = document.createElement('script');
    const end = (f, v) => { clearTimeout(tm); delete window[cb]; sc.remove(); f(v); };
    const tm = setTimeout(() => end(ko, new NetError('timeout', 'timeout')), ms);
    window[cb] = d => end(ok, d);
    sc.onerror = () => end(ko, new NetError('script bloccato o rete assente', 'net'));
    sc.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.append(sc);
  });
}

/** Richiesta con pausa/ripiego. jsonp: true | false | 'only' (per servizi senza CORS). */
async function request(p, url, { jsonp = false, gap = 400 } = {}) {
  if (!navigator.onLine) throw new NetError('dispositivo offline', 'offline');
  if ((cooldown[p] || 0) > Date.now()) throw new NetError('servizio in pausa per limite richieste', 'cooldown');
  return gated(p, gap, async () => {
    let err;
    try {
      if (jsonp === 'only') { const d = await viaJsonp(url); note(p, true, 'ok', 'jsonp'); fails[p] = 0; return d; }
      try { const d = await viaFetch(url); note(p, true, 'ok', 'fetch'); fails[p] = 0; return d; } catch (e) { err = e; }
      if (err.kind === 'http' || err.kind === 'timeout' || !jsonp) throw err;
      const d = await viaJsonp(url); note(p, true, 'ok (ripiego JSONP)', 'jsonp'); fails[p] = 0; return d;
    } catch (e) {
      const ee = e instanceof NetError ? e : new NetError(e.message, 'net');
      if (ee.kind === 'http' && [403, 429, 503].includes(ee.status)) { fails[p] = (fails[p] || 0) + 1; cooldown[p] = Date.now() + Math.min(600, 60 * fails[p]) * 1000; }
      note(p, false, ee.message); log(p + ': ' + ee.message);
      throw ee;
    }
  });
}

export const explain = e => ({
  offline: 'Sei offline.', cooldown: 'Il servizio ha limitato le richieste: riprovo tra poco.', timeout: 'Il servizio non risponde.',
  http: 'Servizio non disponibile (' + e.message + ').', net: 'Connessione bloccata o assente.', format: 'Risposta del servizio non valida.',
}[e.kind] || e.message);

const q = o => new URLSearchParams(o).toString();

/* ---------- copertine ---------- */
const bigITunes = u => (u || '').replace(/\/\d+x\d+(bb)?\./, '/600x600bb.');

const itunes = {
  album: async (t, query) => {
    const r = await request('iTunes', 'https://itunes.apple.com/search?' + q({ media: 'music', entity: 'album', limit: 10, term: query }), { jsonp: true, gap: 3200 });
    const it = pickAlbum((r.results || []).map(x => ({ album: x.collectionName, artist: x.artistName, art: bigITunes(x.artworkUrl100) })), t);
    return it && it.art;
  },
  song: async (t, query) => {
    const r = await request('iTunes', 'https://itunes.apple.com/search?' + q({ media: 'music', entity: 'song', limit: 20, term: query }), { jsonp: true, gap: 3200 });
    return pickBest((r.results || []).map(x => ({ title: x.trackName, artist: x.artistName, album: x.collectionName, art: bigITunes(x.artworkUrl100) })), t);
  },
};
const deezer = {
  song: async (t, query) => {
    const r = await request('Deezer', 'https://api.deezer.com/search?' + q({ q: query, limit: 20, output: 'jsonp' }), { jsonp: 'only', gap: 500 });
    return pickBest((r.data || []).map(x => ({ title: x.title, artist: x.artist?.name, album: x.album?.title, art: x.album?.cover_xl || x.album?.cover_big })), t);
  },
};

const songHits = new Map();   // (limitata: vedi capped)   // id brano -> miglior risultato musicale trovato in questa sessione (crediti artisti)

/** Cerca il brano (titolo+artista) per conoscere i crediti reali. Lancia solo se nessun servizio ha risposto. */
export async function findSong(t) {
  if (songHits.has(t.id)) return songHits.get(t.id);
  const title = stripFeat(cleanTitle(t.title)), query = { title, artist: t.artist, artists: trackArtists(t) };
  let answered = false, lastErr = null;
  for (const fn of [() => itunes.song(query, (t.artist + ' ' + title).trim()), () => deezer.song(query, (t.artist + ' ' + title).trim())]) {
    try { const it = await fn(); answered = true; if (it) { capped(songHits, t.id, it); return it; } } catch (e) { lastErr = e; if (e.kind === 'offline') break; }
  }
  if (!answered && lastErr) throw lastErr;
  return null;
}

/** Ritorna metadati/coperina del risultato più affidabile. Lancia solo se nessun servizio ha risposto. */
export async function findCover(t) {
  const title = stripFeat(cleanTitle(t.title)), artists = artistVariants(t.artist || ''), artist = mainArtist(t.artist || '');
  const query = { title, artist: t.artist, album: t.album, artists: trackArtists(t) };
  const searches = [...new Set([t.artist, ...trackArtists(t), ...artists].filter(Boolean))];
  const steps = [];
  if (t.album && artist) steps.push(() => itunes.album(query, artist + ' ' + t.album).then(url => url ? { art: url, album: t.album } : null));
  for (const a of searches.length ? searches : ['']) {
    const term = (a + ' ' + title).trim();
    steps.push(() => itunes.song(query, term));
    steps.push(() => deezer.song(query, a ? `artist:"${a}" track:"${title}"` : title));
    if (a) steps.push(() => deezer.song(query, term));
  }
  let answered = false, lastErr = null;
  for (const fn of steps) {
    try {
      const it = await fn(); answered = true;
      if (it?.art) { capped(songHits, t.id, it); return { url: it.art, album: it.album || '', artist: it.artist || '' }; }
    } catch (e) { lastErr = e; if (e.kind === 'offline') break; }
  }
  if (!answered && lastErr) throw lastErr;
  return null;
}

/** Scarica l'immagine come Blob se il server lo permette (CORS); altrimenti null e si userà l'URL. */
export async function fetchBlob(url) {
  try {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 10000);
    const res = await fetch(url, { signal: ac.signal, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
    clearTimeout(tm);
    if (!res.ok) return null;
    const b = await res.blob();
    return b.type.startsWith('image/') ? b : null;
  } catch { return null; }
}

/* ---------- immagine artista ---------- */
async function deezerArtist(name) {
  const r = await request('Deezer', 'https://api.deezer.com/search/artist?' + q({ q: name, limit: 8, output: 'jsonp' }), { jsonp: 'only', gap: 500 });
  const m = matchArtist((r.data || []).map(x => ({ name: x.name, img: x.picture_xl || x.picture_big })), name);
  return m && m.img && !/\/artist\/\//.test(m.img) ? m.img : null;       // l'immagine segnaposto di Deezer ha l'hash vuoto
}
async function wikiArtist(name, lang) {
  const url = `https://${lang}.wikipedia.org/w/api.php?` + q({
    action: 'query', generator: 'search', gsrsearch: name, gsrlimit: 5, prop: 'pageimages|description', piprop: 'thumbnail', pithumbsize: 600, format: 'json', origin: '*',
  });
  const r = await request('Wikipedia', url, { gap: 400 });
  const pages = Object.values(r.query?.pages || {});
  const m = matchArtist(pages.map(p => ({ name: p.title.replace(/\s*\(.*?\)\s*$/, ''), p })), name);   // il titolo deve coincidere; "(band)" ecc. si ignorano
  return m && m.p.thumbnail?.source && isMusicDesc(m.p.description) ? m.p.thumbnail.source : null;      // e la pagina deve parlare di musica
}

/** Ritorna {url, blob?} | null (non trovata). Lancia solo se nessun servizio ha risposto. */
export async function findArtistImage(name) {
  const names = artistVariants(name);
  let answered = false, lastErr = null;
  const tries = names.flatMap(n => [() => deezerArtist(n), () => wikiArtist(n, 'it'), () => wikiArtist(n, 'en')]);
  for (const fn of tries) {
    try { const u = await fn(); answered = true; if (u) { const blob = await fetchBlob(u); return { url: u, blob }; } }
    catch (e) { lastErr = e; if (e.kind === 'offline') break; }
  }
  if (!answered && lastErr) throw lastErr;
  return null;
}

/* ---------- verifica dell'identità di un artista (nome identico su Deezer) ---------- */
const AX = (() => { try { return JSON.parse(localStorage.getItem('sonance.ax')) || {}; } catch { return {}; } })();
/** Ritorna il numero di fan dell'artista con questo nome esatto (0 = non trovato). Lancia se il servizio non risponde. */
export async function artistFans(name) {
  const k = norm(name), e = AX[k];
  if (e && Date.now() - e.t < 30 * 864e5) return e.f;
  const r = await request('Deezer', 'https://api.deezer.com/search/artist?' + q({ q: name, limit: 8, output: 'jsonp' }), { jsonp: 'only', gap: 500 });
  const m = (r.data || []).find(x => norm(x.name) === k);
  const f = m ? Math.max(1, m.nb_fan || 1) : 0;
  AX[k] = { f, t: Date.now() };
  const ks = Object.keys(AX); if (ks.length > 500) for (const x of ks.slice(0, 100)) delete AX[x];
  jset('sonance.ax', AX); return f;
}

/* ---------- testi (LRCLIB) ---------- */
/** Brani Deezer [{title, artist, dur}] per una ricerca (serve a trovare l'artista dell'originale o il titolo senza refusi). */
const deezerSongs = async (query, limit = 25) => {
  const r = await request('Deezer', 'https://api.deezer.com/search?' + q({ q: query, limit, output: 'jsonp' }), { jsonp: 'only', gap: 500 });
  return (r.data || []).map(x => ({ title: x.title, artist: x.artist?.name, dur: x.duration, rank: x.rank, album: x.album?.title }));
};
/** Cache con tetto: le Map di sessione non crescono senza limite (si scarta il più vecchio). */
const capped = (m, k, v, max = 300) => { m.set(k, v); if (m.size > max) m.delete(m.keys().next().value); return v; };
const songsCache = new Map();
/** Brani con titolo identico: UNA sola richiesta (50 risultati) serve sia al passo «originale con durata vicina» sia a quello «fra tutte le versioni». */
const songsByTitle = async (title, dur) => {
  const k = norm(title) + '|' + Math.round(dur / 5);
  return songsCache.has(k) ? songsCache.get(k) : capped(songsCache, k, await deezerSongs(`track:"${title}"`, 50));
};
export const clearOnlineCaches = () => songsCache.clear();
/** Tutti i brani con titolo identico, classificati per verosimiglianza di «originale». null se non conclusivo. */
export async function originalCandidates(title, dur, names) {
  return rankOriginals(await songsByTitle(title, dur), { title, dur, names });
}
/** Artista (e titolo/durata) della versione originale di una cover: titolo identico, durata vicina, non ambiguo. Una sola richiesta; null se non conclusivo. */
export async function originalOf(title, dur, hint = '', maxDur = 15) {
  return pickOriginal(await songsByTitle(title, dur), { titles: [title], dur, hint, maxDur });
}

/** Strategia progressiva (si ferma al primo risultato attendibile; ogni risposta passa dal punteggio titolo/artista/durata):
    1 originali · 2 normalizzati (senza accenti, versioni, featuring) · 3 artista principale · 4 ricerca libera · 5 solo titolo (verificato)
    · 6 \"versione originale\" (cover: l'artista del file non è un vincolo, lo sono titolo identico e durata) · 7 titolo corretto da un refuso (confermato da artista).
    Con un marcatore di cover nel titolo (\"(Cover)\", \"- Tribute\", \"cover by\"…) il passo 6 viene subito dopo il primo tentativo: i passi con l'artista del file non possono riuscire. */
export async function findLyrics(t, { budget = 8, meta = null } = {}) {
  const titles = titleVariants(t.title), names = artistNames(t), main = trackArtists(t)[0] || mainArtist(t.artist || ''), d = t.dur > 0 ? t.dur : 0;
  const Q = { titles, names: (t.artist || '').trim() ? names : [], dur: d };
  const mark = coverMark(t.title), base = titles[1] || titles[0];
  const txt = j => j.__preferPlain ? (j.plainLyrics || toPlain(j.syncedLyrics)) : j.syncedLyrics || j.plainLyrics;
  const far = f => Math.abs(f.duration - d) > COVER_DUR && f.plainLyrics;
  const mk = f => (f ? { ...f, __orig: true, ...(far(f) && { __preferPlain: true }) } : null);     // testo di un'altra versione (l'originale): lo si segnala nel risultato
  let origDone = false;
  let used = 0, sawAnswer = false, cap = Math.max(1, budget - 2); const seen = new Set();      // gli ultimi 2 invii sono riservati ai passi 6-7 (altrimenti i passi normali li esaurirebbero)
  const call = async u => {
    if (seen.has(u) || used >= cap) return null;
    seen.add(u); used++;
    try { const r = await request('LRCLIB', 'https://lrclib.net/api/' + u, { gap: 300 }); sawAnswer = true; return r; }
    catch (e) { if (e.kind === 'http' && e.status === 404) { sawAnswer = true; return null; } throw e; }
  };
  const get = async (artist, title, Qx = Q, dur = d) => { const r = await call('get?' + q({ artist_name: artist, track_name: title, ...(t.album && { album_name: t.album }), ...(dur && { duration: Math.round(dur) }) })); return r && pickLyric([r], Qx); };
  const search = async (params, Qx = Q) => { const r = await call('search?' + q(params)); return pickLyric(r, Qx); };

  /* 6. versione originale: titolo identico + durata; si allarga solo con artista originale confermato */
  const reserved = fn => async () => { const prev = cap; cap = budget; try { return await fn(); } finally { cap = prev; } };
  const originalStep = reserved(async () => {
    if (origDone || !(d > 0) || used >= budget) return null;
    origDone = true;
    let o = null;
    const hint = coverArtistHint(t.title);
    const hintConfirmed = !!hint && names.some(n => artistSim(hint, [n]) >= .8);
    /* Il nome nel marcatore è un indizio forte solo se compare anche nei crediti del file. */
    try { o = await originalOf(base, d, hintConfirmed ? hint : '', hintConfirmed ? COVER_DUR_CONFIRMED : 15); } catch (e) { if (e.kind === 'offline') throw e; }
    /* Senza un marcatore esplicito non allarghiamo LRCLIB al solo titolo se Deezer
       non ha identificato un originale univoco: i titoli comuni sono troppo ambigui. */
    if (!mark && !o) {
      /* Nessun originale con durata vicina: si cerca fra TUTTE le versioni con quel titolo (cover/duetti/rifacimenti con durata diversa). Il testo sincronizzato
         si usa solo se la durata combacia entro SYNC_MAX; altrimenti testo semplice. */
      let w = null; try { w = await originalCandidates(base, d, names); } catch (e) { if (e.kind === 'offline') throw e; }
      if (!w) return null;
      const Qw = { titles, dur: w.dur, origArtist: w.artist, maxDur: 8 };               // deve essere la stessa registrazione indicata dal servizio musicale
      const r = await call('get?' + q({ artist_name: w.artist, track_name: w.title, duration: Math.round(w.dur) }));
      const f = (r && pickOriginalLyric([r], Qw)) || pickOriginalLyric(await call('search?' + q({ track_name: base, artist_name: w.artist })), Qw);
      if (!f) return null;
      return { ...f, __orig: true, ...((w.plain || Math.abs(f.duration - d) > SYNC_MAX) && { __preferPlain: true }) };
    }
    const confirmedArtist = o?.artist || (hintConfirmed ? hint : '');
    const wide = !!confirmedArtist && mark === 'cover';
    const Qo = { titles, dur: d, origArtist: confirmedArtist, ...(wide && { maxDur: COVER_DUR_CONFIRMED, preferPlainBeyond: COVER_DUR }), ...(!mark && { minWords: 2, maxDur: 6 }) };
    if (o) { const r = await call('get?' + q({ artist_name: o.artist, track_name: o.title, duration: Math.round(o.dur) })); const f = r && pickOriginalLyric([r], Qo); if (f) return mk(f); }
    const f = pickOriginalLyric(await call('search?' + q({ track_name: base, ...(confirmedArtist && { artist_name: confirmedArtist }) })), Qo);
    return mk(f);
  });
  /* 7. refuso nel titolo del file: Deezer (tollerante) propone il titolo corretto solo se artista e durata lo confermano */
  const typoStep = reserved(async () => {
    if (!sawAnswer || !Q.names.length || used >= budget) return null;
    let c = null;
    try { c = pickCorrected(await deezerSongs(`${(t.artist || '').trim()} ${base}`), { titles: [base], names: Q.names, dur: d }); } catch (e) { if (e.kind === 'offline') throw e; }
    if (!c) return null;
    log('Testi: titolo corretto «' + base + '» → «' + c.title + '»');
    const Qc = { ...Q, titles: [c.title, ...titles] };
    return (await get(main || t.artist, c.title, Qc)) || (await search({ track_name: c.title, artist_name: main }, Qc));
  });

  const steps = [];
  const a0 = (t.artist || '').trim();
  if (a0) steps.push(() => get(a0, titles[0]));                                                    // 1. originali
  /* cover dichiarata, oppure file con più artisti (duetto/rifacimento: l'originale ha spesso artisti diversi): l'originale subito, prima dei tentativi costosi */
  if (mark === 'cover' || (!mark && trackArtists(t).length > 1)) steps.push(originalStep);
  for (const a of [...new Set([a0, main, ...names.slice(0, 3)])].filter(Boolean)) for (const ti of titles.slice(1, 4)) steps.push(() => get(a, ti));   // 2. normalizzati
  for (const ti of titles.slice(0, 3)) if (main) steps.push(() => search({ track_name: ti, artist_name: main }));  // 3. artista principale
  for (const a of [main, a0].filter((x, i, l) => x && l.indexOf(x) === i)) steps.push(() => search({ q: a + ' ' + titles.at(-1) }));   // 4. ricerca libera
  steps.push(() => search({ track_name: titles[1] || titles[0] }), () => search({ q: titles[1] || titles[0] }));   // 5. solo titolo, con verifica
  if (mark !== 'cover') steps.push(originalStep);                                                   // 6. ripiego "versione originale"
  steps.push(typoStep);                                                                             // 7. refuso
  for (const s of steps) {
    const f = await s();
    if (f) {
      const out = txt(f);
      if (meta) Object.assign(meta, { kind: f.__orig ? 'original' : 'own', from: f.__orig ? f.artistName : '', synced: /\[\d{1,3}:\d{2}(?:\.\d+)?\]/.test(out || '') });
      return out;
    }          // i passi normali si fermano da soli a budget esaurito (call → null)
  }
  return null;
}

/** Candidati per la scelta manuale del testo: {artist, title, dur, synced, text}. Al massimo due richieste; ordinati per verosimiglianza. */
export async function lyricCandidates(t) {
  const base = titleVariants(t.title)[1] || titleVariants(t.title)[0], names = artistNames(t), out = [], seen = new Set();
  const add = list => { for (const x of Array.isArray(list) ? list : []) {
    if (!x || x.instrumental || !(x.syncedLyrics || x.plainLyrics)) continue;
    const k = x.id ?? [x.artistName, x.trackName, x.duration].join('|'); if (seen.has(k)) continue; seen.add(k);
    out.push({ artist: x.artistName || '', title: x.trackName || '', dur: x.duration || 0, synced: !!x.syncedLyrics, text: x.syncedLyrics || x.plainLyrics, plain: x.plainLyrics || toPlain(x.syncedLyrics) });
  } };
  add(await request('LRCLIB', 'https://lrclib.net/api/search?' + q({ track_name: base }), { gap: 300 }));
  if (out.length < 6 && names[0]) add(await request('LRCLIB', 'https://lrclib.net/api/search?' + q({ q: base + ' ' + mainArtist(names[0]) }), { gap: 300 }));
  const score = c => titleSim(c.title, base) * 3 + (names.length ? artistSim(c.artist, names) : 0) * 2 + (t.dur > 0 && c.dur > 0 ? Math.max(0, 1 - Math.abs(c.dur - t.dur) / 40) * 1.5 : 0) + (c.synced ? .1 : 0);
  return out.map(c => ({ ...c, _s: score(c) })).filter(c => c._s > 1).sort((a, b) => b._s - a._s).slice(0, 12);
}

/* ---------- diagnostica: dice esattamente cosa funziona e cosa no ---------- */
export async function diagnose() {
  const probes = [
    ['iTunes (fetch)', () => viaFetch('https://itunes.apple.com/search?term=radiohead+creep&entity=song&limit=1')],
    ['iTunes (JSONP)', () => viaJsonp('https://itunes.apple.com/search?term=radiohead+creep&entity=song&limit=1')],
    ['Deezer (JSONP)', () => viaJsonp('https://api.deezer.com/search/artist?q=radiohead&limit=1&output=jsonp')],
    ['LRCLIB (fetch)', () => viaFetch('https://lrclib.net/api/search?q=radiohead+creep')],
    ['Wikipedia (fetch)', () => viaFetch('https://it.wikipedia.org/w/api.php?action=query&list=search&srsearch=radiohead&format=json&origin=*')],
  ];
  const out = [];
  for (const [name, fn] of probes) {
    const t0 = performance.now();
    try { await fn(); out.push({ name, ok: true, ms: Math.round(performance.now() - t0) }); }
    catch (e) { out.push({ name, ok: false, ms: Math.round(performance.now() - t0), msg: e.message }); }
  }
  return out;
}
