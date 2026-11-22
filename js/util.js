/* Utility condivise. Nessun accesso al DOM a livello di modulo: si può importare anche da Node (test). */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Crea un elemento: h('div',{class:'x',onclick:fn,data:{id:1}}, figli...) */
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'data') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat(Infinity).filter(x => x != null && x !== false));
  return e;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
export const raf = f => requestAnimationFrame(f);

/** Normalizza per i confronti: minuscolo, senza accenti né punteggiatura. */
export const norm = s => (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const fmt = s => (s > 0 ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '');
export const tf = s => fmt(s) || '0:00';
export const fmtLong = s => {
  const m = Math.round(s / 60);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
};
export const dayLabel = (t, now = Date.now()) => {
  const d = new Date(t), n = new Date(now);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const diff = Math.round((b - a) / 864e5);
  if (diff === 0) return 'Oggi';
  if (diff === 1) return 'Ieri';
  return d.toLocaleDateString('it', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== n.getFullYear() && { year: 'numeric' }) });
};

/* ---- bus di eventi minimale ---- */
const L = {};
export const bus = {
  on(e, f) { (L[e] ||= []).push(f); return () => { L[e] = L[e].filter(x => x !== f); }; },
  emit(e, ...a) { for (const f of L[e] || []) { try { f(...a); } catch (x) { console.error(e, x); } } },
};

/* ---- log diagnostico in memoria ---- */
const LOG = [];
export const log = m => { LOG.unshift(new Date().toLocaleTimeString('it') + ' ' + m); if (LOG.length > 150) LOG.length = 150; bus.emit('log'); };
export const getLog = () => LOG.join('\n');

/* ---- toast ---- */
let tt;
export function toast(msg, o = {}) {
  const e = $('#toast'); if (!e) return;
  e.textContent = '';
  e.append(h('span', {}, msg));
  if (o.action) e.append(h('button', { class: 'toast-act', onclick: () => { o.action.fn(); hideToast(); } }, o.action.label));
  e.classList.add('show');
  clearTimeout(tt);
  if (!o.sticky) tt = setTimeout(hideToast, o.ms || (o.action ? 5000 : 2800));
}
export const hideToast = () => { clearTimeout(tt); $('#toast')?.classList.remove('show'); };

/* ---- icone ---- */
export const IC = {
  sh: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  pv: '<path d="M19 20 9 12l10-8z"/><path d="M5 19V5"/>',
  nx: '<path d="M5 4l10 8-10 8z"/><path d="M19 5v14"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  rep: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
  rep1: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/><path d="M11 10h1v4"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  lyr: '<path d="M4 6h16M4 12h10M4 18h13"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  grip: '<path d="M5 9h14M5 15h14"/>',
  queue: '<path d="M3 6h13M3 12h13M3 18h7M18 14v6l5-3z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  sort: '<path d="M3 6h18M6 12h12M10 18h4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  speed: '<path d="M12 14l4-4"/><path d="M3.3 17a10 10 0 1 1 17.4 0"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',            // freccia in su: ESPORTA
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',          // freccia in giù: IMPORTA
  lib: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  alb: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  art: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M23 11h-6"/>',
  pl: '<path d="M3 6h13M3 12h13M3 18h7M18 14v6l5-3z"/>',
  you: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  save: '<path d="M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7"/>',
  /* icone delle playlist automatiche (prima mancavano: il nome non esisteva in IC e il riquadro restava vuoto) */
  'calendar-plus': '<path d="M8 2v4"/><path d="M16 2v4"/><path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16v6"/>',
  'chart-no-axes-combined': '<path d="M12 16v5"/><path d="M16 14v7"/><path d="M20 10v11"/><path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15"/><path d="M4 18v3"/><path d="M8 14v7"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
};
export const icon = (n, { fill = false, size = 24 } = {}) => {
  if (!IC[n]) console.warn('icona mancante: ' + n);
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
};
export const iconBtn = (name, label, onclick, { cls = '', fill = false, size = 24 } = {}) =>
  h('button', { class: 'btn icon ' + cls, 'aria-label': label, title: label, onclick, html: icon(name, { fill, size }) });

/** Condivide file con il foglio di condivisione (iOS) oppure li scarica. */
export async function shareOrDownload(files) {
  const arr = [].concat(files);
  try { if (navigator.canShare?.({ files: arr })) { await navigator.share({ files: arr }); return true; } } catch (e) { if (e.name === 'AbortError') return false; }   // false = l'utente ha annullato
  for (const f of arr) { const u = URL.createObjectURL(f), a = h('a', { href: u, download: f.name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); }
  return true;
}
