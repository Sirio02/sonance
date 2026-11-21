/* Testo e informazioni del brano: provenienza, scelta manuale fra candidati, blocco, «Riprova». */
import { h, bus, toast, fmt, dayLabel } from '../util.js';
import * as L from '../library.js';
import { openSheet, menu } from './kit.js';
import { lyricLabel } from '../lrc.js';
import { norm } from '../util.js';

const kind = (t, c) => (L.artistsOf(t).some(a => norm(a) === norm(c.artist)) || norm(t.artist) === norm(c.artist) ? 'own' : 'original');
async function save(t) { await L.saveTrack(t); bus.emit('enriched', t); }

/** Foglio con i testi candidati (artista, titolo, durata, sincronizzato sì/no). La scelta viene bloccata: l'arricchimento automatico non la sovrascrive. */
export function chooseLyric(t) {
  openSheet(api => {
    const box = h('div', { class: 'lylist' }, h('p', { class: 'empty' }, 'Ricerca dei testi in corso…'));
    L.online.lyricCandidates(t).then(list => {
      box.textContent = '';
      if (!list.length) { box.append(h('p', { class: 'empty' }, 'Nessun testo candidato trovato.')); return; }
      for (const c of list) box.append(h('button', { class: 'opt', onclick: async () => {
        t.lrc = c.text; t.nl = 0; t.ll = 1; t.lsrc = { k: kind(t, c), a: c.artist, s: c.synced ? 1 : 0 }; await save(t); api.close(); toast('Testo scelto e bloccato');
      } }, h('span', { class: 'ol' }, c.artist + ' – ' + c.title, h('small', {}, (c.dur ? fmt(c.dur) + ' · ' : '') + (c.synced ? 'sincronizzato' : 'non sincronizzato')))));
    }).catch(e => { box.textContent = ''; box.append(h('p', { class: 'empty' }, L.online.explain(e))); });
    return [h('div', { class: 'sh-title' }, 'Scegli il testo'), h('p', { class: 'sh-detail' }, 'Brano: ' + t.title + (t.dur ? ' (' + fmt(t.dur) + ')' : '')), box,
      h('button', { class: 'opt cancel', onclick: () => api.close() }, 'Chiudi')];
  });
}

export function lyricsMenu(t, { importFile, pickCover } = {}) {
  const lab = lyricLabel(t);
  menu('Testo e copertina', [
    { label: 'Riprova la ricerca online', sub: lab || 'Nessun testo', icon: 'lyr', fn: () => { if (t.ll) { t.ll = 0; } toast('Ricerca in corso…'); L.enrichOne(t, true).then(({ err, changed }) => toast(err ? L.online.explain(err) : changed ? 'Trovato' : 'Nessun risultato affidabile')); } },
    { label: 'Scegli il testo tra i candidati…', icon: 'lyr', fn: () => chooseLyric(t) },
    t.lrc && { label: t.ll ? 'Sblocca il testo' : 'Blocca il testo', sub: t.ll ? 'Può essere aggiornato dalla ricerca automatica' : 'Non verrà più sovrascritto', icon: 'check', fn: async () => { t.ll = t.ll ? 0 : 1; await save(t); toast(t.ll ? 'Testo bloccato' : 'Testo sbloccato'); } },
    importFile && { label: 'Importa testo da file…', icon: 'upload', fn: importFile },
    pickCover && { label: 'Scegli copertina…', icon: 'alb', fn: pickCover },
  ]);
}

const ext = n => (/\.([a-z0-9]{2,5})$/i.exec(n || '')?.[1] || '').toUpperCase();
const size = b => (b > 0 ? (b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.round(b / 1024) + ' KB') : '');
/** «Informazioni brano». */
export function infoSheet(t) {
  const rows = [['Titolo', t.title], ['Artisti', L.artistsOf(t).join(', ') || t.artist || '—'], ['Album', t.album || '—'],
    ['Formato', ext(t.name) || '—'], ['Durata', fmt(t.dur) || '—'], ['Dimensione', size(t.size) || '—'],
    ...(t.src ? [['Fonte', ({ia:'Internet Archive',wc:'Wikimedia Commons',ov:'Openverse',jm:'Jamendo'})[t.src.p] || t.src.p], ['Licenza', t.src.lic?.label || '—'], ['Autore', t.src.by || '—']] : []),
    ['Aggiunto', t.added ? dayLabel(t.added) : '—'], ['Ascolti', String(t.pc || 0)], ['Ultimo ascolto', t.lp ? dayLabel(t.lp) : '—'],
    ['Testo', lyricLabel(t) || (t.nl ? 'Non trovato' : 'Non ancora cercato')], ['Preferito', t.fav ? 'Sì' : 'No']];
  openSheet(api => [h('div', { class: 'sh-title' }, 'Informazioni brano'),
    h('dl', { class: 'info' }, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    t.src && h('button', { class: 'btn wide', onclick: () => navigator.clipboard?.writeText(`“${t.title}” di ${t.src.by || t.artist || 'Autore sconosciuto'}, licenza ${t.src.lic?.label || 'non indicata'}, fonte: ${t.src.p} — ${t.src.url}`).then(() => toast('Attribuzione copiata')).catch(() => toast('Impossibile copiare l’attribuzione')) }, 'Copia attribuzione'),
    h('button', { class: 'opt cancel', onclick: () => api.close() }, 'Chiudi')]);
}
