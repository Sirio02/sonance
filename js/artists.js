/* Artisti multipli e featuring (logica pura, testata in Node).
   Principio: mai dividere senza prove. Un nome si divide solo se
   (1) contiene un separatore esplicito (feat., ft., &, +, virgola, ;, x, con, vs) e non è un nome noto composto, oppure
   (2) un servizio online / la libreria confermano che le parti sono artisti distinti e l'intero non lo è. */
import { norm } from './util.js';

/* nomi che contengono separatori ma sono un solo artista */
export const COMPOUND = ['simon & garfunkel', 'hall & oates', 'earth, wind & fire', 'florence + the machine', 'florence & the machine', 'mumford & sons', 'tyler, the creator',
  'crosby, stills & nash', 'crosby, stills, nash & young', 'brooks & dunn', 'sly & the family stone', 'kool & the gang', 'echo & the bunnymen', 'years & years', 'seals & crofts',
  'ike & tina turner', 'angus & julia stone', 'mike + the mechanics', 'huey lewis & the news', 'gladys knight & the pips', 'bob marley & the wailers', 'sam & dave', 'ac/dc'].map(norm);

const SEP = /(\s*(?:&|\+|,|;|\s\/\s)\s*|\s+(?:feat(?:uring)?\.?|ft\.?|con|vs\.?|x)\s+)/i;
const FEAT = /^\s*(?:feat(?:uring)?\.?|ft\.?|con)\s*$/i;
const uniq = list => { const seen = new Set(), out = []; for (const n of list) { const k = norm(n); if (k && !seen.has(k)) { seen.add(k); out.push(n); } } return out; };

/** Divide una stringa artista in {main, feat}. `keep`: Set di nomi normalizzati da non dividere. */
export function parseArtistString(raw, { keep } = {}) {
  let s = (raw || '').replace(/[([]\s*((?:feat(?:uring)?|ft)\.?\s[^)\]]*)[)\]]/gi, ' $1 ').replace(/\s+/g, ' ').trim();
  if (!s) return { main: [], feat: [] };
  if (COMPOUND.includes(norm(s)) || keep?.has(norm(s))) return { main: [s], feat: [] };
  const bits = s.split(SEP), parts = [];                       // [nome, sep, nome, sep, …]
  for (let i = 0; i < bits.length; i += 2) parts.push({ name: bits[i].trim(), sep: i ? bits[i - 1] : '' });
  const merged = [];                                           // "X & The Y" e "Tyler, The Creator" sono nomi unici
  for (const p of parts) {
    const prev = merged.at(-1);
    if (prev && /^(?:&|\+|,)$/.test(p.sep.trim()) && /^the\s/i.test(p.name)) prev.name += p.sep + p.name;
    else merged.push({ ...p });
  }
  const main = [], feat = []; let inFeat = false;
  for (const p of merged) {
    if (p.sep && FEAT.test(p.sep)) inFeat = true;
    if (p.name) (inFeat ? feat : main).push(p.name);
  }
  return { main: uniq(main), feat: uniq(feat) };
}

/** Artisti citati nel titolo: "Titolo (feat. A & B)", "Titolo - ft. A". */
export function featFromTitle(title) {
  const m = /[([-]\s*(?:feat(?:uring)?|ft)\.?\s+([^)\]]+)/i.exec(title || '');
  return m ? parseArtistString(m[1]).main : [];
}

/** Tutti gli artisti associati a un brano: principali, poi partecipanti. Un brano compare sotto ognuno. */
export function trackArtists(t, opts = {}) {
  const p = t.am?.length ? { main: t.am, feat: t.af || [] } : parseArtistString(t.artist, opts);
  return uniq([...p.main, ...p.feat, ...(t.af ? [] : featFromTitle(t.title))]);
}

/** Tutte le divisioni in 2+ gruppi contigui di parole. */
export function segmentations(tokens) {
  const out = [];
  const rec = (i, cur) => { if (i === tokens.length) { if (cur.length > 1) out.push(cur); return; } for (let j = i + 1; j <= tokens.length; j++) rec(j, [...cur, tokens.slice(i, j).join(' ')]); };
  rec(0, []); return out.sort((a, b) => a.length - b.length);
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'le', 'la', 'lo', 'il', 'i', 'gli', 'un', 'una', 'di', 'del', 'de', 'dei', 'el', 'los', 'las', 'les', 'der', 'die', 'das', 'one', 'two', 'x']);
/** Evidenza locale: divide "Dolcenera Lazza" solo se ogni parte è un artista già noto e la divisione è univoca. */
export function localSegment(original, known) {
  const tokens = (original || '').trim().split(/\s+/);
  if (tokens.length < 2 || tokens.length > 5 || known.has(norm(original))) return null;
  const ok = segmentations(tokens).filter(seg => seg.every(p => !STOP.has(norm(p)) && known.has(norm(p))));   // articoli e congiunzioni non sono mai artisti
  if (!ok.length) return null;
  const best = ok.filter(s => s.length === ok[0].length);
  return best.length === 1 ? best[0] : null;
}

/** Confronta il nome del file con i crediti di un servizio online per lo stesso brano.
    exists(name): Promise<boolean> (l'artista esiste davvero). Restituisce {names} oppure null se non conclusivo. */
export async function reconcileArtists(original, credited, exists, opts = {}) {
  const raw = (original || '').trim(), oTok = raw.split(/\s+/).map(norm), o = norm(raw);
  const p = parseArtistString(credited, opts), names = [...p.main, ...p.feat];
  if (!o || !names.length) return null;
  if (names.length === 1 && norm(names[0]) === o) return { names: [raw] };                   // stesso nome: artista unico
  if (names.length > 1) {
    const used = names.filter(n => norm(n).split(' ').every(w => oTok.includes(w)));
    const cover = new Set(used.flatMap(n => norm(n).split(' ')));
    if (used.length >= 2 && oTok.every(w => cover.has(w))) return { names: used.sort((a, b) => oTok.indexOf(norm(a).split(' ')[0]) - oTok.indexOf(norm(b).split(' ')[0])) };
    return null;
  }
  const c = norm(names[0]).split(' '), toks = raw.split(/\s+/);                            // un solo credito: copre una parte del nome?
  if (c.length >= oTok.length) return null;
  if (oTok.slice(0, c.length).join(' ') === c.join(' ')) { const rest = toks.slice(c.length).join(' '); if (await exists(rest)) return { names: [names[0], rest] }; }
  else if (oTok.slice(-c.length).join(' ') === c.join(' ')) { const rest = toks.slice(0, -c.length).join(' '); if (await exists(rest)) return { names: [rest, names[0]] }; }
  return null;
}
