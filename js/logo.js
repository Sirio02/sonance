/* Logo di Sonance: nota musicale con scia d'onda e scritta, in SVG vettoriale inline (nessun file, nessun font esterno).
   Colori da variabili CSS: scritta in --fg che sfuma nell'accento (--acc, ambra di default); leggibile in tutti i temi.
   La larghezza della scritta è fissata (textLength): le proporzioni non cambiano fra dispositivi/font. */
let n = 0;
export function logoSvg({ height = 36, wave = false } = {}) {
  const id = 'lg' + ++n;
  return `<svg class="logo" viewBox="0 0 148 40" height="${height}" role="img" aria-label="Sonance" focusable="false" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><linearGradient id="${id}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:var(--fg)"/><stop offset=".5" style="stop-color:var(--fg)"/><stop offset="1" style="stop-color:var(--acc)"/></linearGradient></defs>` +
    `<g fill="var(--acc)"><ellipse cx="9" cy="29" rx="6.2" ry="4.6" transform="rotate(-20 9 29)"/><path d="M13.6 27V8.5l9.4 3.2v4.2l-5.2-1.8V27z"/></g>` +
    `<text x="30" y="29" textLength="110" lengthAdjust="spacingAndGlyphs" font-size="27" font-weight="800" letter-spacing="-1" fill="url(#${id})" style="font-family:ui-rounded,-apple-system,system-ui,sans-serif">Sonance</text>` +
    `<path class="logo-wave${wave ? ' draw' : ''}" d="M30 36.5q3.5-4.6 7 0t7 0 7 0 7 0 7 0 7 0 7 0 7 0 7 0 7 0 7 0 7 0 7 0 7 0" fill="none" stroke="var(--acc)" stroke-width="1.7" stroke-linecap="round" opacity=".9"/></svg>`;
}
