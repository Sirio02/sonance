/* Schermata dei duplicati: per ogni gruppo si sceglie quale copia tenere. */
import { h, fmt, toast } from '../util.js';
import * as L from '../library.js';
import { findDuplicates } from '../dup.js';
import { openSheet, confirmSheet } from './kit.js';

export const countDuplicates = () => findDuplicates(L.lib.list).length;

export function openDuplicates() {
  let groups = findDuplicates(L.lib.list), api, box;
  const keep = new Map(groups.map((g, i) => [i, g.items[0].id]));
  const hidden = new Set();
  const detail = t => [t.artist, t.album, fmt(t.dur), t.size ? (t.size / 1e6).toFixed(1) + ' MB' : '', t.pc ? t.pc + ' ascolti' : '', t.fav ? '♥' : ''].filter(Boolean).join(' · ');
  const build = () => {
    const live = groups.map((g, i) => [g, i]).filter(([, i]) => !hidden.has(i));
    const toDelete = live.reduce((s, [g]) => s + g.items.length - 1, 0);
    box.textContent = '';
    box.append(h('div', { class: 'sh-title' }, 'Possibili duplicati'),
      h('p', { class: 'sh-detail' }, live.length ? 'Tocca la copia da tenere: preferiti, ascolti e playlist passano a quella.' : 'Nessun duplicato da controllare.'));
    const list = h('div', { class: 'qlist' });
    for (const [g, gi] of live) {
      list.append(h('div', { class: 'dgroup' },
        h('div', { class: 'row-between' }, h('small', {}, g.exact ? 'File identici' : 'Stesso titolo e artista'), h('button', { class: 'chip', onclick: () => { hidden.add(gi); build(); } }, 'Ignora')),
        g.items.map(t => h('button', { class: 'dup' + (keep.get(gi) === t.id ? ' keep' : ''), onclick: () => { keep.set(gi, t.id); build(); } },
          h('span', { class: 'rad' }), h('span', { class: 'dt' }, h('b', {}, t.title), h('small', {}, detail(t)), h('small', {}, t.name)), h('span', { class: 'bdg' }, keep.get(gi) === t.id ? 'Tieni' : 'Elimina')))));
    }
    box.append(list);
    if (live.length) box.append(h('div', { class: 'sh-actions' }, h('button', { class: 'btn', onclick: () => api.close() }, 'Chiudi'),
      h('button', { class: 'btn danger-fill', onclick: apply }, 'Elimina ' + toDelete + (toDelete === 1 ? ' copia' : ' copie'))));
    else box.append(h('div', { class: 'sh-actions' }, h('button', { class: 'btn', onclick: () => api.close() }, 'Chiudi')));
  };
  const apply = async () => {
    const live = groups.map((g, i) => [g, i]).filter(([, i]) => !hidden.has(i)), n = live.reduce((s, [g]) => s + g.items.length - 1, 0);
    if (!await confirmSheet('Eliminare ' + n + ' copie?', { detail: 'I file originali sul dispositivo non vengono toccati.' })) return;
    for (const [g, gi] of live) { const k = L.byId(keep.get(gi)); if (k) await L.mergeTracks(k, g.items.filter(t => t.id !== k.id).map(t => L.byId(t.id)).filter(Boolean)); }
    toast(n + (n === 1 ? ' copia eliminata' : ' copie eliminate')); api.close();
  };
  api = openSheet(() => [box = h('div', { class: 'qbox' })], { cls: 'tall' });
  build();
}
