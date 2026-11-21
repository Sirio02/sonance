/* Logica di confronto testi/artisti per le ricerche online (pura, testata in tests/). */
import { norm } from './util.js';
import { parseArtistString, trackArtists } from './artists.js';

export const cleanTitle = s => (s || '')
  .replace(/\(.*?\)|\[.*?\]/g, ' ')
  .replace(/\b(official|video|lyrics?|audio|hd|hq|remaster(?:ed)?(?: \d{4})?)\b/gi, ' ')
  .replace(/\s+/g, ' ').trim();
export const stripFeat = s => (s || '').replace(/\s*[([]?\s*(?:feat|ft|featuring)\.?\s.*$/i, '').trim();
/** Separatori fra artisti nel nome file (un'unica definizione per artistVariants e mainArtist). */
const ARTIST_SPLIT = /\s*(?:&|\+|,|;)\s*|\s+\b(?:feat(?:uring)?\.?|ft\.?|con)\s+|\s+x\s+/i;
export const artistVariants = s => {
  const raw = (s || '').trim();
  if (!raw) return [];
  const explicit = raw.split(ARTIST_SPLIT).map(x => x.trim()).filter(Boolean);
  // Il nome file può omettere il separatore tra due artisti (es. "Dolcenera Lazza").
  // I singoli token sono solo candidati di fallback: non vengono mai assunti come artista principale.
  const tokens = raw.split(/\s+/).filter(Boolean);
  return [...new Set([raw, ...explicit, ...(explicit.length === 1 && tokens.length > 1 ? tokens : [])])];
};
export const mainArtist = s => {
  const raw = (s || '').trim();
  return raw.split(ARTIST_SPLIT)[0].trim();
};

/** Somiglianza 0..1: uguaglianza, contenimento per parole intere, oppure Jaccard sulle parole. */
export function sim(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if ((' ' + a + ' ').includes(' ' + b + ' ') || (' ' + b + ' ').includes(' ' + a + ' ')) return .75;
  const A = new Set(a.split(' ')), B = new Set(b.split(' '));
  let i = 0; for (const w of A) if (B.has(w)) i++;
  return i / (A.size + B.size - i);
}

export function scoreItem(it, q) {
  const st = sim(cleanTitle(it.title), cleanTitle(q.title));
  const sa = q.artist ? Math.max(.0, ...[...(q.artists || []), ...artistVariants(q.artist)].map(a => sim(it.artist, a))) : .5;
  const sl = q.album ? sim(it.album, q.album) : 0;
  return { score: st * 2 + sa * 2 + sl, st, sa, sl };
}

/** Sceglie il risultato migliore tra {title,artist,album,art}; null se nessuno è abbastanza affidabile. */
export function pickBest(items, q) {
  const minTitle = q.artist ? .6 : .9, minArtist = .5;
  let best = null;
  for (const it of items) {
    const s = scoreItem(it, q);
    if (q.artist && s.sa < minArtist) continue;
    if (s.st < minTitle && !(q.album && s.sl >= .9)) continue;
    if (!best || s.score > best.s.score) best = { it, s };
  }
  return best && best.it;
}

/** Per le ricerche di album: item {album,artist,art}. */
export function pickAlbum(items, q) {
  let best = null;
  for (const it of items) {
    const sl = sim(it.album, q.album), sa = q.artist ? Math.max(.0, ...artistVariants(q.artist).map(a => sim(it.artist, a))) : .5;
    if (sl < .8 || sa < .5) continue;
    const sc = sl * 2 + sa;
    if (!best || sc > best.sc) best = { it, sc };
  }
  return best && best.it;
}

/** Artista: nome identico (o identico all'artista principale). Mai "il più simile": meglio nessuna immagine che una sbagliata. */
export function matchArtist(cands, name) {
  const variants = artistVariants(name).map(norm);
  return cands.find(c => norm(c.name) === norm(name)) || cands.find(c => variants.includes(norm(c.name))) || null;
}

const MUSIC = /\b(singer|musician|band|rapper|composer|songwriter|dj|producer|vocalist|guitarist|pianist|duo|group|orchestra|cantante|cantautore|cantautrice|musicista|gruppo|compositore|chitarrista|pianista|disc jockey)\b/i;
export const isMusicDesc = d => MUSIC.test(d || '');


/* ---------- testi: varianti del titolo e punteggio dei risultati ---------- */
const VERSION = /\b(?:cover|tribute|radio|single|album|extended|original|explicit|clean|live|acoustic|remix(?:ed)?|remaster(?:ed)?(?: \d{4})?|version|edit|mix|mono|stereo|deluxe|bonus|instrumental|demo|karaoke)\b/gi;
export const stripVersion = s => (s || '').replace(/\s+[-–—]\s+[^-–—]*\b(?:radio|single|remaster|live|remix|edit|version|mix|acoustic|mono|stereo|deluxe|bonus|cover|tribute|karaoke)\b.*$/i, '').trim();

/* ---------- cover e versioni ---------- */
/** Marcatori forti (la voce NON è dell'originale): (Cover), [Tribute], - Karaoke, "cover by …". Deboli: live/acoustic/remix (di solito stesso artista). */
const STRONG = /(?:[([]\s*[^)\]]*\b(?:cover|tribute|karaoke|originale)\b[^)\]]*[)\]])|(?:\s[-–—]\s*[^-–—]*\b(?:cover|tribute|karaoke)\b)|(?:\bcover\s+(?:by|of|di)\b)|(?:\boriginale\s+(?:di|of)\b)|(?:\s(?:cover|karaoke)\s*$)/i;
const WEAK = /(?:[([]\s*[^)\]]*\b(?:live|acoustic|remix|unplugged)\b[^)\]]*[)\]])|(?:\s[-–—]\s*[^-–—]*\b(?:live|acoustic|remix|unplugged)\b)/i;
/** 'cover' | 'version' | '' */
export const coverMark = title => STRONG.test(title || '') ? 'cover' : WEAK.test(title || '') ? 'version' : '';
/** Artista indicato nel marcatore (es. "(Lazza Cover)"): è un indizio, mai una prova da solo. */
export const coverArtistHint = title => {
  const groups = [...(title || '').matchAll(/\(([^()]*)\)|\[([^\]]*)\]/g)].map(m => m[1] ?? m[2] ?? '');
  groups.push(title || '');
  for (const inner of groups) {
    const bySuffix = inner.match(/\bcover\s+(?:di|of|by)\s+(.+)$/i);
    const after = inner.match(/^(?:cover|tribute|karaoke)\s+(?:di|of|by)\s+(.+)$/i);
    const original = inner.match(/(?:^|\s)originale\s+(?:di|of)\s+(.+)$/i);
    const before = inner.match(/^(.+?)\s+(?:cover|tribute|karaoke)\b/i);
    const hit = bySuffix || after || original || before;
    if (hit) return (hit[1] || '').trim().replace(/[)\]]+$/, '');
  }
  return '';
};
/** Toglie "cover by X" e il suffisso " cover" non racchiusi da parentesi. */
export const stripCover = s => (s || '').replace(/\s+(?:cover\s+(?:by|of|di)|originale\s+(?:di|of))\b.*$/i, '').replace(/\s+(?:cover|karaoke)\s*$/i, '').trim();
export const fold = s => (s || '').replace(/[’‘´`]/g, "'").normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
/** Titolo "nucleo": senza parentesi, featuring, versioni, accenti e punteggiatura. */
export const coreTitle = s => norm(stripFeat(cleanTitle(stripVersion(stripCover(s))))).replace(VERSION, ' ').replace(/\s+/g, ' ').trim();

/** Varianti del titolo, dalla più fedele alla più ripulita (senza duplicati). */
export function titleVariants(raw) {
  const out = [], add = x => { x = (x || '').replace(/\s+/g, ' ').trim(); if (x && !out.includes(x)) out.push(x); };
  raw = (raw || '').trim();
  add(raw); add(raw.replace(/[’‘´`]/g, "'"));
  const clean = stripFeat(cleanTitle(stripVersion(stripCover(raw))));
  add(clean); add(clean.replace(/[’‘´`]/g, "'")); add(fold(clean));
  add(clean.split(/\s+[-–—]\s+/)[0]);
  add(clean.replace(/[^\p{L}\p{N}\s']/gu, ' '));
  return out;
}
/** Nomi artista da provare: stringa originale, singoli artisti, forma senza accenti. */
export function artistNames(t) {
  const out = [], add = x => { x = (x || '').replace(/\s+/g, ' ').trim(); if (x && !out.includes(x)) out.push(x); };
  add(t.artist); trackArtists(t).forEach(add); artistVariants(t.artist).forEach(add);
  [...out].forEach(x => add(fold(x)));
  return out;
}
const tokSet = s => new Set(norm(s).split(' ').filter(Boolean));
const jac = (a, b) => { a = tokSet(a); b = tokSet(b); let i = 0; for (const w of a) if (b.has(w)) i++; return a.size + b.size - i ? i / (a.size + b.size - i) : 0; };
/** Titolo: 1 identico, .95 uguale a meno di versioni/featuring; altrimenti solo sovrapposizione di parole (niente "Love" = "Love Story"). */
export function titleSim(a, b) {
  const x = coreTitle(a), y = coreTitle(b);
  if (!x || !y) return 0;
  if (norm(a) === norm(b)) return 1;
  return x === y ? .95 : jac(x, y);
}
/** Artista: stesso insieme di parole = 1; condivide almeno un artista = .85; contenuto/contenitore = .8; altrimenti Jaccard. */
export function artistSim(candidate, names) {
  if (!candidate || !names.length) return 0;
  const cp = parseArtistString(candidate), parts = [candidate, ...cp.main, ...cp.feat]; let best = 0;
  for (const n of names) for (const c of parts) {
    const a = tokSet(n), b = tokSet(c); if (!a.size || !b.size) continue;
    const inter = [...a].filter(w => b.has(w)).length;
    if (inter === a.size && inter === b.size) best = Math.max(best, c === candidate && parts.length > 1 && n === names[0] ? 1 : .9 + (c === candidate ? .1 : 0));
    else if (inter === a.size || inter === b.size) best = Math.max(best, .8);
    else best = Math.max(best, jac(n, c) * .7);
  }
  return Math.min(1, best);
}
export const durScore = (a, b) => { if (!(a > 0) || !(b > 0)) return null; const d = Math.abs(a - b); return d <= 2 ? 1 : d <= 5 ? .8 : d <= 10 ? .5 : d <= 20 ? .2 : 0; };

/** Valuta un risultato LRCLIB {trackName, artistName, duration}. q: {titles, names, dur}. Restituisce null se non affidabile. */
export function scoreLyric(x, q) {
  let t = Math.max(0, ...q.titles.map(ti => titleSim(x.trackName, ti)));
  const a = q.names.length ? artistSim(x.artistName, q.names) : null, d = durScore(x.duration, q.dur);
  if (t < .8 && q.titles.some(ti => typoMatch(x.trackName, ti))) {                       // refuso nel nome del file: solo se artista E/O durata lo confermano
    if (!((a != null && a >= .8) && (d == null || d >= .5)) && !(d != null && d >= .8 && (a == null || a >= .5))) return null;
    t = .85;
  }
  if (t < .8) return null;
  if (q.dur > 0 && x.duration > 0 && Math.abs(x.duration - q.dur) > 30) return null;
  if (a == null) { if (!(t >= .95 && d != null && d >= .8)) return null; }              // artista ignoto: serve anche una durata quasi identica
  else if (a < .5 && !(t >= .95 && d === 1 && !isGenericTitle(x.trackName))) return null;                               // artista diverso: solo con durata praticamente identica
  return { score: t * 3 + (a ?? .5) * 2 + (d ?? .5) * 1.5, t, a, d };
}
export function pickLyric(list, q) {
  const rows = (Array.isArray(list) ? list : []).filter(x => x && !x.instrumental && (x.syncedLyrics || x.plainLyrics))
    .map(x => ({ x, s: scoreLyric(x, q) })).filter(r => r.s).sort((a, b) => b.s.score - a.s.score);
  if (!rows.length) return null;
  const top = rows[0].s.score, near = rows.filter(r => top - r.s.score < .25);
  return (near.find(r => r.x.syncedLyrics) || rows[0]).x;
}

/* ---------- refusi nel titolo ---------- */
export function lev(a, b) {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const isNum = w => /\d/.test(w);
/** Titoli uguali a meno di UN refuso in una sola parola ("Porto Cerco" ≈ "Porto Cervo"). Mai su numeri, parole corte o titoli di una parola breve:
    "Song 2"/"Song 3", "Love"/"Live" restano diversi. È un indizio debole: va sempre confermato da artista e/o durata. */
export function typoMatch(a, b) {
  const x = coreTitle(a).split(' '), y = coreTitle(b).split(' ');
  if (x.length !== y.length || !x[0] || x.join('').length < 8) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === y[i]) continue;
    if (isNum(x[i]) || isNum(y[i]) || Math.min(x[i].length, y[i].length) < 4 || lev(x[i], y[i]) > 1) return false;
    if (++diff > 1) return false;
  }
  return diff === 1;
}

/* ---------- versione originale di una cover ---------- */
const GENERIC = new Set(['intro', 'outro', 'interlude', 'interludio', 'skit', 'untitled', 'senza titolo', 'instrumental', 'strumentale', 'demo', 'track', 'song', 'canzone', 'prologue', 'epilogue', 'prologo', 'epilogo', 'medley', 'live', 'remix', 'acoustic', 'bonus', 'hidden track']);
/** Titoli troppo generici per essere associati solo dal titolo ("Intro", "Track 1", "Traccia 03"…). */
export const isGenericTitle = s => { const c = coreTitle(s); return !c || GENERIC.has(c) || /^(?:track|traccia|pista|audio)\s*\d*$/.test(c) || /^\d+$/.test(c); };
export const COVER_DUR = 15;      // tolleranza standard in secondi quando l'artista originale non è confermato
export const COVER_DUR_CONFIRMED = 120; // tetto per titolo identico + artista originale confermato

/** Valuta un risultato LRCLIB come "originale" di una cover. L'artista del file NON è un vincolo; lo sono titolo e durata.
    q: {titles, dur, origArtist?}. Con origArtist (da iTunes/Deezer) si richiede anche quell'artista. null se non affidabile. */
export function scoreOriginal(x, q) {
  const t = Math.max(0, ...q.titles.map(ti => titleSim(x.trackName, ti)));
  const typo = t < .95 && q.titles.some(ti => typoMatch(x.trackName, ti));
  const a = q.origArtist ? artistSim(x.artistName, [q.origArtist]) : null;
  if (t < .95 && !(typo && a != null && a >= .8)) return null;                          // titolo identico (o con un refuso, ma solo con l'artista originale confermato)
  if (q.titles.every(isGenericTitle) && a == null) return null;                          // "Intro", "Track 1"…
  if (!(q.dur > 0) || !(x.duration > 0)) return null;                                    // senza durata non c'è conferma
  const dd = Math.abs(x.duration - q.dur), words = coreTitle(q.titles[0]).split(' ').length, single = words < 2;
  if (q.minWords && words < q.minWords && a == null) return null;                       // senza marcatore di cover: niente titoli di una sola parola
  if (dd > (single && a == null ? 5 : (q.maxDur ?? COVER_DUR))) return null;             // titolo di una sola parola: durata quasi identica                           // titolo di una sola parola: durata quasi identica
  if (q.origArtist && a < .8) return null;
  return { score: (typo ? .85 : t) * 3 + (a ?? .5) * 2 + (1 - dd / 20) * 1.5, t, a, dd };
}
export function pickOriginalLyric(list, q) {
  const rows = (Array.isArray(list) ? list : []).filter(x => x && !x.instrumental && (x.syncedLyrics || x.plainLyrics) &&
      (!(q.preferPlainBeyond > 0 && q.dur > 0 && x.duration > 0 && Math.abs(x.duration - q.dur) > q.preferPlainBeyond) || !!x.plainLyrics))
    .map(x => ({ x, s: scoreOriginal(x, q) })).filter(r => r.s).sort((a, b) => b.s.score - a.s.score);
  if (!rows.length) return null;
  /* se i migliori candidati sono di artisti diversi e quasi alla pari, il titolo è ambiguo: meglio nessun testo che uno sbagliato */
  const top = rows[0], rival = rows.find(r => r !== top && top.s.score - r.s.score < .15 && artistSim(r.x.artistName, [top.x.artistName]) < .8);
  if (rival && !q.origArtist) return null;
  const near = rows.filter(r => top.s.score - r.s.score < .25 && artistSim(r.x.artistName, [top.x.artistName]) >= .8);
  return (near.find(r => r.x.syncedLyrics) || top).x;
}
/** Dai risultati di Deezer/iTunes [{title, artist, dur}] ricava l'artista dell'ORIGINALE: titolo identico, durata vicina, non ambiguo. */
export function pickOriginal(items, q) {
  const rows = (items || []).filter(x => x && x.artist && titleSim(x.title, q.titles[0]) >= .95 && !isVersionTitle(x.title) && x.dur > 0 && q.dur > 0 && Math.abs(x.dur - q.dur) <= (q.maxDur ?? COVER_DUR))
    .map(x => ({ x, dd: Math.abs(x.dur - q.dur) })).sort((a, b) => a.dd - b.dd);
  if (!rows.length || isGenericTitle(q.titles[0])) return null;
  let pool = rows;
  if (q.hint) {
    const hinted = rows.filter(r => artistSim(r.x.artist, [q.hint]) >= .8);
    if (hinted.length) pool = hinted; // il nome nel marcatore orienta la scelta, ma titolo e durata restano obbligatori
  }
  const best = pool[0];
  if (pool.some(r => r !== best && r.dd - best.dd <= 3 && artistSim(r.x.artist, [best.x.artist]) < .8)) return null;
  return best.x;
}
const isVersionTitle = s => /\b(?:cover|tribute|karaoke|live|acoustic|remix|instrumental)\b/i.test(s || '');
/** Tra i risultati di un servizio, cerca il titolo corretto di un brano scritto con un refuso, confermato da artista (e durata se nota). */
export function pickCorrected(items, q) {
  const raw = q.titles[0];
  for (const x of [...(items || [])].sort((a, b) => Math.abs((a.dur || 0) - q.dur) - Math.abs((b.dur || 0) - q.dur))) {
    if (!x || !x.title || !typoMatch(x.title, raw)) continue;
    if (!(artistSim(x.artist, q.names) >= .8)) continue;
    if (q.dur > 0 && x.dur > 0 && Math.abs(x.dur - q.dur) > 10) continue;
    return x;
  }
  return null;
}

/* ---------- originale di una cover con artisti diversi: classifica dei candidati ---------- */
export const SYNC_MAX = 6;           // oltre questa differenza di durata i tempi del testo sincronizzato non sono affidabili: si usa il testo semplice
const WIDE_DUR = 45;                 // durata massima di scarto per un originale con titolo identico (il 2° segnale può compensare solo entro questo limite)
const durGap = (x, dur) => (x.dur > 0 && dur > 0 ? Math.abs(x.dur - dur) : Infinity);
/** Rimuove i tempi da un testo LRC. */
export const toPlain = lrc => String(lrc || '').split(/\r?\n/).map(l => l.replace(/\[[^\]]*\]/g, '').replace(/<\d+:\d+(?:\.\d+)?>/g, '').trim()).filter(Boolean).join('\n');

/** Da una lista di brani del servizio [{title, artist, dur, rank?}] sceglie l'artista dell'originale quando il file ha artisti diversi.
    Segnali: titolo identico (obbligatorio), durata, popolarità (rank), unicità. L'artista del file non è un vincolo, ma non può essere il candidato.
    Ritorna {artist, title, dur, plain, dd, alts[]} oppure null se il caso è ambiguo o poco affidabile. */
export function rankOriginals(items, { title, dur, names = [] } = {}) {
  if (!title || !(dur > 0) || isGenericTitle(title)) return null;
  const words = coreTitle(title).split(' ').filter(Boolean).length;
  const rows = (items || []).filter(x => x && x.artist && x.title && titleSim(x.title, title) >= .95 && !isVersionTitle(x.title) && !(names.length && artistSim(x.artist, names) >= .8));
  if (!rows.length) return null;
  const g = new Map();
  for (const x of rows) { const k = norm(mainArtist(x.artist)) || norm(x.artist); (g.get(k) || g.set(k, []).get(k)).push(x); }
  let groups = [...g.values()].map(list => {
    const best = list.reduce((a, b) => (durGap(b, dur) < durGap(a, dur) ? b : a));
    return { x: best, dd: durGap(best, dur), rank: Math.max(0, ...list.map(i => +i.rank || 0)) };
  });
  const tot = groups.reduce((s, e) => s + e.rank, 0);
  groups = groups.map(e => {
    const pop = tot > 0 ? e.rank / tot : 1 / groups.length;
    const ds = e.dd <= 5 ? 1 : e.dd <= 15 ? .7 : e.dd <= WIDE_DUR ? .35 : 0;
    return { ...e, pop, score: ds * 2 + pop * 1.5 };
  }).sort((a, b) => b.score - a.score);
  const [top, second] = groups;
  if (!(top.dd <= WIDE_DUR)) return null;
  if (words < 2 && !(top.dd <= 5 && groups.length === 1)) return null;                      // una sola parola: serve durata quasi identica e nessun omonimo
  if (second && top.score - second.score < .35) return null;                                 // ambiguo: più originali plausibili alla pari
  if (top.dd > 15 && second && top.pop < .6) return null;                                    // durata lontana: serve un secondo segnale forte (popolarità dominante)
  return { artist: top.x.artist, title: top.x.title, dur: top.x.dur, plain: top.dd > SYNC_MAX, dd: top.dd, alts: groups.slice(1, 4).map(e => e.x) };
}
