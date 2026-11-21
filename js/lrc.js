/* Parser dei testi LRC (puro). */
export function parseLrc(text) {
  const out = []; let off = 0;
  for (const l of String(text || '').split(/\r?\n/)) {
    const o = /^\[offset:\s*(-?\d+)\]/i.exec(l);
    if (o) { off = +o[1]; continue; }
    const re = /\[(\d+):(\d+(?:\.\d+)?)\]/g, ts = []; let m;
    while ((m = re.exec(l))) ts.push(+m[1] * 60 + +m[2]);
    const x = l.replace(/\[[^\]]*\]/g, '').replace(/<\d+:\d+(?:\.\d+)?>/g, '').trim();
    if (ts.length) ts.forEach(v => out.push({ t: v - off / 1000, x }));
    else if (x && !/^\[/.test(l)) out.push({ t: null, x });
  }
  return out.some(v => v.t != null) ? out.filter(v => v.t != null).sort((p, q) => p.t - q.t) : out;
}

/** Indice della riga corrente (ricerca binaria); -1 prima della prima riga. */
export function lineAt(lines, t) {
  let lo = 0, hi = lines.length - 1, r = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].t <= t) { r = mid; lo = mid + 1; } else hi = mid - 1; }
  return r;
}

/** Etichetta della provenienza del testo (per il player e «Informazioni brano»). t.lsrc = { k: 'own'|'original', a: artista, s: 1 se sincronizzato }. */
export function lyricLabel(t) {
  if (!t?.lrc) return '';
  const synced = t.lsrc ? !!t.lsrc.s : parseLrc(t.lrc).some(l => l.t != null);
  const base = t.lsrc?.k === 'original' && t.lsrc.a ? 'Testo della versione originale (' + t.lsrc.a + ')' : synced ? 'Testo sincronizzato' : 'Testo non sincronizzato';
  const sync = t.lsrc?.k === 'original' ? (synced ? ' · sincronizzato' : ' · non sincronizzato') : '';
  return base + sync + (t.ll ? ' · bloccato' : '');
}
