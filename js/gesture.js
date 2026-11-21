/* Riconoscimento dei gesti di swipe (puro, testato in Node). */
export const SWIPE = { lock: 10, min: 56, frac: .18, flick: .45, flickMin: 28, ratio: 1.5, up: 40 };

/** Blocca l'asse del gesto: 'h', 'v' oppure '' (ancora incerto: diagonale o movimento troppo piccolo). */
export function lockAxis(dx, dy, t = SWIPE.lock) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < t && ay < t) return '';
  return ax > ay * 1.2 ? 'h' : ay > ax * 1.2 ? 'v' : '';
}

/** Esito al rilascio: 'next' | 'prev' | 'open' | null. Soglia minima, direzione prevalente, oppure scatto veloce. */
export function swipeAction(dx, dy, ms, width = 360) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax > ay * SWIPE.ratio) {
    const far = ax >= Math.max(SWIPE.min, width * SWIPE.frac), flick = ax / Math.max(ms, 1) >= SWIPE.flick && ax >= SWIPE.flickMin;
    return far || flick ? (dx < 0 ? 'next' : 'prev') : null;
  }
  return ay > ax * SWIPE.ratio && dy <= -SWIPE.up ? 'open' : null;
}


/** Decisione pura dello swipe tra schede principali. */
export function decideTabSwipe({ dx, dy, startX, width = 360, index = 0, count = 5,
  excluded = false, hscrollCanMove = false, edge = 24, threshold = 56, fraction = .16 } = {}) {
  if (excluded || !Number.isFinite(dx) || !Number.isFinite(dy) || count < 1) return null;
  if (startX <= edge || startX >= width - edge) return null;
  if (Math.abs(dx) <= Math.abs(dy) * 1.5) return null;
  if (Math.abs(dx) < Math.max(threshold, width * fraction)) return null;
  if (hscrollCanMove) return null;
  const next = dx < 0 ? index + 1 : index - 1;
  return next < 0 || next >= count ? null : next;
}


/** Indice della scheda sotto il dito; bounds è una lista di {left, right}. */
export function tabIndexAtX(x, bounds = []) {
  if (!Number.isFinite(x)) return null;
  const i = bounds.findIndex(b => Number.isFinite(b.left) && Number.isFinite(b.right) && x >= b.left && x < b.right);
  return i < 0 ? null : i;
}

/** Scheda più vicina al punto x, con clamp ai bordi: il dito fuori dalla barra sceglie la prima/ultima scheda (mai "nessuna"). bounds: [{left,right}]. */
export function nearestTab(x, bounds = []) {
  if (!Number.isFinite(x)) return null;
  const ok = bounds.map((b, i) => ({ i, l: b.left, r: b.right })).filter(b => Number.isFinite(b.l) && Number.isFinite(b.r));
  if (!ok.length) return null;
  const inside = ok.find(b => x >= b.l && x < b.r); if (inside) return inside.i;
  return ok.reduce((a, b) => (Math.abs(x - (b.l + b.r) / 2) < Math.abs(x - (a.l + a.r) / 2) ? b : a)).i;
}
/** +1 se la nuova scheda sta a destra (il contenuto entra da destra), -1 a sinistra, 0 se uguale. */
export const tabDirection = (from, to) => (to > from ? 1 : to < from ? -1 : 0);
/** Posizione dell'indicatore della scheda attiva: segue il dito (fingerX) restando dentro la barra, oppure si centra sulla scheda `index`. */
export function indicatorAt(index, bounds, { tabsLeft = 0, fingerX = null, ratio = .5 } = {}) {
  if (!bounds.length) return null;
  const f = bounds[0], l = bounds.at(-1), w = (f.right - f.left) * ratio;
  if (Number.isFinite(fingerX)) return { w, x: Math.min(Math.max(fingerX - w / 2, f.left + (f.right - f.left - w) / 2), l.left + (l.right - l.left - w) / 2) - tabsLeft };
  const b = bounds[Math.min(Math.max(index, 0), bounds.length - 1)];
  return { w: (b.right - b.left) * ratio, x: b.left + (b.right - b.left) * (1 - ratio) / 2 - tabsLeft };
}
