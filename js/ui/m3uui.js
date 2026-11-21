/* Importazione ed esportazione delle playlist in formato M3U. */
import { h, toast, shareOrDownload } from '../util.js';
import { PL } from '../store.js';
import * as L from '../library.js';
import { toM3U, safeFileName } from '../m3u.js';
import { openSheet } from './kit.js';

const file = (name, tracks) => new File([toM3U(name, tracks)], safeFileName(name) + '.m3u8', { type: 'audio/x-mpegurl' });

export const exportPlaylist = n => shareOrDownload(file(n, L.plTracks(n)));
export const exportAll = () => { const names = Object.keys(PL); if (!names.length) return toast('Nessuna playlist da esportare'); return shareOrDownload(names.map(n => file(n, L.plTracks(n)))); };

/** Apre il selettore file (da chiamare direttamente dal tocco dell'utente). */
export function pickM3U() {
  const i = h('input', { type: 'file', accept: '.m3u,.m3u8,audio/x-mpegurl,audio/mpegurl,text/plain', multiple: true, hidden: true, onchange: () => { const fs = [...i.files]; i.remove(); importFiles(fs); } });
  document.body.append(i); i.click();
}

async function importFiles(fs) {
  let ok = 0, missing = [];
  for (const f of fs) {
    try { const r = await L.importM3U(await f.text(), f.name); ok++; missing.push(...r.missing.map(m => ({ ...m, pl: r.name }))); toast(`Playlist «${r.name}»: ${r.found} brani trovati` + (r.missing.length ? `, ${r.missing.length} non trovati` : ''), { ms: 4500, action: r.missing.length ? { label: 'Dettagli', fn: () => showMissing(missing) } : null }); }
    catch (e) { toast('Questo file non è una playlist valida: ' + e.message); }
  }
  if (fs.length > 1) toast(`${ok} playlist importate` + (missing.length ? `, ${missing.length} brani non trovati` : ''), { ms: 4500, action: missing.length ? { label: 'Dettagli', fn: () => showMissing(missing) } : null });
}
function showMissing(list) {
  openSheet(api => [h('div', { class: 'sh-title' }, 'Brani non trovati'), h('p', { class: 'sh-detail' }, 'Importa prima i file audio mancanti, poi ripeti l\u2019importazione della playlist.'),
    h('div', { class: 'qlist miss' }, list.map(m => h('div', { class: 'mrow' }, h('b', {}, m.title || m.file), h('small', {}, [m.artist, m.pl].filter(Boolean).join(' · '))))),
    h('div', { class: 'sh-actions' }, h('button', { class: 'btn', onclick: () => api.close() }, 'Chiudi'))]);
}
