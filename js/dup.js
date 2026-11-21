/* Rilevamento duplicati (puro). Due brani sono duplicati se sono lo stesso file (stessa dimensione e durata)
   oppure hanno lo stesso titolo e artista con durata quasi uguale. */
import { norm } from './util.js';
import { cleanTitle, mainArtist, stripFeat } from './match.js';

/** Punteggio per scegliere quale copia tenere: più ascolti, preferito, testo, album noto, file più grande. */
export const keepScore = t => (t.pc || 0) * 1000 + (t.fav ? 500 : 0) + (t.lrc ? 20 : 0) + (t.album ? 10 : 0) + (t.size || 0) / 1e7 - (t.name || '').length / 1e4;   // a parità vince il nome file più corto (non «… (copia)»)

export function findDuplicates(tracks) {
  const p = tracks.map((_, i) => i), f = i => { while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; }, u = (a, b) => { p[f(a)] = f(b); };
  const near = (a, b, tol) => !(a.dur > 0 && b.dur > 0) || Math.abs(a.dur - b.dur) <= tol;
  const bySize = new Map(), byKey = new Map(), push = (m, k, i) => (m.get(k) || m.set(k, []).get(k)).push(i);
  tracks.forEach((t, i) => {
    if (t.size > 0) push(bySize, t.size, i);
    const ar = norm(mainArtist(t.artist)), ti = norm(stripFeat(cleanTitle(t.title)));
    if (ar && ti) push(byKey, ti + '|' + ar, i);                     // senza artista il titolo da solo non basta ("Traccia 01")
  });
  for (const g of bySize.values()) for (let k = 1; k < g.length; k++) if (near(tracks[g[0]], tracks[g[k]], 1)) u(g[0], g[k]);
  for (const g of byKey.values()) for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) if (near(tracks[g[a]], tracks[g[b]], 3)) u(g[a], g[b]);
  const groups = new Map();
  tracks.forEach((t, i) => { const r = f(i); (groups.get(r) || groups.set(r, []).get(r)).push(t); });
  return [...groups.values()].filter(g => g.length > 1).map(items => {
    items.sort((a, b) => keepScore(b) - keepScore(a));
    return { items, exact: items.every(t => t.size > 0 && t.size === items[0].size) };
  });
}
