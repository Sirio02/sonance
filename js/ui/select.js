/* Selezione multipla: pressione lunga su un brano (o "Seleziona") → barra con azioni di gruppo. */
import { h, icon, $, $$, bus, toast } from '../util.js';
import { PL } from '../store.js';
import * as L from '../library.js';
import * as pl from '../player.js';
import { menu, ask, confirmSheet } from './kit.js';

export const sel = { on: false, ids: new Set(), list: [], playlist: null };
export const isOn = () => sel.on;
let bar, countEl;

export function longPress(el, fn) {
  let tm, x = 0, y = 0; const c = () => clearTimeout(tm);
  el.addEventListener('pointerdown', e => { x = e.clientX; y = e.clientY; el._lp = false; tm = setTimeout(() => { el._lp = true; fn(); }, 480); });
  el.addEventListener('pointermove', e => { if (Math.abs(e.clientX - x) > 8 || Math.abs(e.clientY - y) > 8) c(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, c);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

const chosen = () => {
  const order = new Map(sel.list.map((t, i) => [t.id, i]));
  return [...sel.ids].map(L.byId).filter(Boolean).sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
};

/** Entra in modalità selezione (con t = primo brano già selezionato). */
export function enter(t, list, playlist) {
  sel.list = list; sel.playlist = playlist || null;
  if (!sel.on) { sel.on = true; sel.ids.clear(); document.body.classList.add('selecting'); build(); }
  if (t) toggle(t); else update();
}
export function toggle(t) { sel.ids.has(t.id) ? sel.ids.delete(t.id) : sel.ids.add(t.id); paint(); update(); }
export function exit() {
  if (!sel.on) return;
  sel.on = false; sel.ids.clear(); document.body.classList.remove('selecting'); bar?.remove(); bar = null; paint();
}
const paint = () => $$('.row').forEach(r => r.classList.toggle('sel', sel.ids.has(r.dataset.id)));
const update = () => { if (countEl) countEl.textContent = sel.ids.size ? sel.ids.size + (sel.ids.size === 1 ? ' selezionato' : ' selezionati') : 'Seleziona i brani'; if (bar) bar.classList.toggle('none', !sel.ids.size); };

function build() {
  countEl = h('b');
  const act = (ic, label, fn) => h('button', { class: 'sa', onclick: fn, html: icon(ic, { size: 22 }) + '<span>' + label + '</span>' });
  bar = h('div', { id: 'selbar', class: 'none' },
    h('div', { class: 'sel-top' }, countEl, h('span', { class: 'sp' }),
      h('button', { class: 'chip', onclick: () => { sel.list.forEach(t => sel.ids.add(t.id)); paint(); update(); } }, 'Tutti'), h('button', { class: 'chip on', onclick: exit }, 'Fine')),
    h('div', { class: 'sel-acts' },
      act('play', 'Dopo', () => pl.enqueueMany(chosen(), true)), act('queue', 'In coda', () => pl.enqueueMany(chosen())),
      act('plus', 'Playlist', toPlaylist), act('heart', 'Preferiti', toggleFav), act('more', 'Altro', more)));
  document.body.insertBefore(bar, $('#full')); update();
}

function toPlaylist() {
  const list = chosen(); if (!list.length) return;
  const add = n => { let k = 0; for (const t of list) if (L.plAdd(n, t.id)) k++; toast(k + (k === 1 ? ' brano aggiunto' : ' brani aggiunti') + ' a «' + n + '»'); exit(); };
  menu('Aggiungi a playlist', [
    { label: 'Nuova playlist…', icon: 'plus', fn: () => ask('Nuova playlist', [['Nome', '']], ([n]) => { if (n && L.plCreate(n)) add(n); else if (n) toast('Esiste già una playlist con questo nome'); }) },
    ...Object.keys(PL).map(n => ({ label: n, sub: PL[n].length + ' brani', fn: () => add(n) })),
  ]);
}
async function toggleFav() {
  const list = chosen(); if (!list.length) return;
  const v = list.every(t => t.fav) ? 0 : 1;
  for (const t of list) { t.fav = v; await L.saveTrack(t); bus.emit('fav', t); }
  toast(v ? list.length + ' brani nei preferiti' : 'Tolti dai preferiti');
}
function more() {
  const list = chosen(); if (!list.length) return;
  menu(list.length + ' brani', [
    { label: 'Imposta artista / album…', icon: 'edit', fn: () => ask('Modifica ' + list.length + ' brani', [['Artista (vuoto = invariato)', ''], ['Album (vuoto = invariato)', '']], async ([ar, al]) => {
      if (!ar && !al) return;
      for (const t of list) { if (ar) { t.artist = ar; delete t.am; delete t.af; delete t.av; delete t.arv; delete t.arn; delete t.aa; } if (al) t.album = al; await L.saveTrack(t); }
      L.touchData(); toast('Brani aggiornati'); exit();
    }) },
    sel.playlist && { label: 'Rimuovi da «' + sel.playlist + '»', icon: 'x', fn: () => { const name = sel.playlist, undo = L.plRemoveUndoable(name, list.map(t => t.id)); toast(list.length + (list.length === 1 ? ' brano rimosso' : ' brani rimossi') + ' da «' + name + '»', { action: { label: 'Annulla', fn: undo } }); exit(); } },
    { label: 'Elimina dall\u2019app', icon: 'trash', danger: true, fn: async () => {
      if (!await confirmSheet('Eliminare ' + list.length + ' brani?', { detail: 'I file originali sul dispositivo non vengono toccati.' })) return;
      const undo = L.softRemove(list); toast(list.length + ' brani eliminati', { action: { label: 'Annulla', fn: () => { if (!undo()) toast('Non è più possibile annullare'); } }, ms: L.UNDO_MS - 500 }); exit();
    } },
  ]);
}
