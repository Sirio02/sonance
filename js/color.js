/* Colori: luminanza, contrasto WCAG e testo leggibile sull'accento scelto (puro, testato). */
export const parseHex = s => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s || '').trim()); if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};
const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
export const luminance = ([r, g, b]) => .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b);
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
/** Colore del testo sopra l'accento: bianco o quasi nero, quello con più contrasto. */
export const onAccent = hex => { const c = parseHex(hex); if (!c) return '#fff'; return contrast(c, [255, 255, 255]) >= contrast(c, [20, 20, 20]) ? '#fff' : '#141414'; };
