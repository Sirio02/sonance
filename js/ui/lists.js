/* Libreria, album, artisti, playlist e schermata di dettaglio: tutte costruite con le stesse "schede" e righe. */
import { h, icon, iconBtn, $, $$, bus, fmt, fmtLong, toast, debounce, norm } from '../util.js';
import { S, saveS, PL, PLC } from '../store.js';
import * as L from '../library.js';
import * as pl from '../player.js';
import { coverURL, setCover, clearCover, shrink, blobToDataURL, artistImageURL, setArtistImage, resetArtistImage } from '../covers.js';
import { menu, ask, confirmSheet, dragSort } from './kit.js';
import { sel, isOn, enter, toggle, longPress } from './select.js';
import { exportPlaylist, pickM3U } from './m3uui.js';
import { openDuplicates, countDuplicates } from './dups.js';
import { lyricsMenu, infoSheet } from './lyricsui.js';
import { logoSvg } from '../logo.js';

const PAGE = 60;

/* ---------- miniature con caricamento pigro ---------- */
const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); e.target._fill?.(); } }, { rootMargin: '300px' });
export function setImg(d, u) {
  if (!u) return;
  if (d.dataset.u === u && d.classList.contains('has')) return;
  d.textContent = ''; d.classList.add('has'); d.dataset.u = u;
  const img = h('img', { src: u, alt: '', decoding: 'async', draggable: 'false' });
  img.onload = () => img.classList.add('ld'); img.onerror = () => { img.remove(); d.classList.remove('has'); d.innerHTML = icon('lib', { size: 22 }); };
  d.prepend(img);
}
export function thumb(t, cls = '') {
  const d = h('div', { class: 'th ' + cls, html: icon('lib', { size: 22 }) });
  d._t = t; d._fill = () => coverURL(t, 't').then(u => setImg(d, u)); io.observe(d); return d;
}
export function avatar(name, cls = '') {
  const d = h('div', { class: 'th round ' + cls }, name === 'Artista sconosciuto' ? '♪' : name.trim().slice(0, 1).toUpperCase());
  d._fill = () => artistImageURL(name, L.online.findArtistImage).then(u => setImg(d, u)); io.observe(d); return d;
}

/* ---------- elenco a pagine (scorrimento fluido anche con migliaia di brani) ---------- */
export function fillList(sc, list, mk, { empty, keep = false, head = null } = {}) {
  const prev = keep ? sc._n || 0 : 0, top = keep ? sc.scrollTop : 0;
  sc._mo?.disconnect(); sc.textContent = ''; sc._n = 0;
  if (!list.length) { sc.append(typeof empty === 'string' ? h('p', { class: 'empty' }, empty) : empty); return; }
  if (head) sc.append(head);
  const sent = h('div', { class: 'sentinel' }); sc.append(sent);
  const more = n => {
    const end = Math.min(list.length, sc._n + n), f = document.createDocumentFragment();
    for (let i = sc._n; i < end; i++) f.append(mk(list[i], i));
    sc._n = end; sent.before(f);
    if (sc._n >= list.length) { sent.remove(); sc._mo.disconnect(); } else { sc._mo.unobserve(sent); sc._mo.observe(sent); }
  };
  sc._mo = new IntersectionObserver(es => { if (es[0].isIntersecting) more(PAGE); }, { root: sc, rootMargin: '700px' });
  sc._mo.observe(sent);
  more(Math.max(PAGE, prev));
  if (keep) sc.scrollTop = top;
}

/* ---------- riga brano ---------- */
const sub = t => [t.artist || 'Artista sconosciuto', t.album, fmt(t.dur)].filter(Boolean).join(' · ');
export function trackRow(t, { list, drag = false, playlist = null }) {
  const th = thumb(t); th.append(h('i', { class: 'eqb' }, h('i'), h('i'), h('i')));
  const m = h('div', { class: 't', role: 'button', tabindex: 0 }, h('b', {}, t.title), h('small', {}, sub(t)));
  const r = h('div', { class: 'row' + (pl.cur()?.id === t.id ? ' on' : '') + (sel.ids.has(t.id) ? ' sel' : ''), data: { id: t.id } });
  const go = () => { if (r._lp) { r._lp = false; return; } if (isOn()) { toggle(t); return; } pl.playFrom(list, t); };
  th.onclick = m.onclick = go; m.onkeydown = e => { if (e.key === 'Enter') go(); };
  longPress(r, () => enter(t, list, playlist));
  r.append(...[
    drag && h('span', { class: 'grip', 'aria-label': 'Trascina per riordinare', html: icon('grip', { size: 20 }) }),
    h('span', { class: 'chk', html: icon('check', { size: 16 }) }),
    th, m,
    h('button', { class: 'btn icon sm heart rowact' + (t.fav ? ' on-t' : ''), 'aria-label': t.fav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti', 'aria-pressed': !!t.fav, onclick: e => L.toggleFav(t, 'row', e.currentTarget), html: icon('heart', { fill: t.fav, size: 20 }) }),
    h('button', { class: 'btn icon sm rowact', 'aria-label': 'Altro', onclick: () => trackMenu(t, { playlist }), html: icon('more', { size: 20 }) })].filter(Boolean));
  return r;
}
function markPlaying() {
  const id = pl.cur()?.id;
  for (const r of $$('.row.on')) if (r.dataset.id !== id) r.classList.remove('on');
  if (id) for (const r of $$('.row')) if (r.dataset.id === id) r.classList.add('on');
  document.body.classList.toggle('is-playing', pl.isPlaying());
}
function animateHeart(button, kind) {
  button.classList.remove('heart-add', 'heart-remove');
  void button.offsetWidth; button.classList.add(kind === 'add' ? 'heart-add' : 'heart-remove');
  let timer; const clear = () => { clearTimeout(timer); button.classList.remove('heart-add', 'heart-remove'); button.removeEventListener('animationend', clear); };
  button.addEventListener('animationend', clear); timer = setTimeout(clear, 550);
}
function hearts(t, action = {}) {
  for (const r of $$('.row')) if (r.dataset.id === t.id) {
    const b = r.querySelector('.heart'); if (!b) continue;
    b.classList.toggle('on-t', !!t.fav); b.setAttribute('aria-pressed', String(!!t.fav));
    b.setAttribute('aria-label', t.fav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti');
    const svg = b.querySelector('svg'); if (svg) svg.setAttribute('fill', t.fav ? 'currentColor' : 'none');
    if (action.origin === 'row' && action.source === b && !document.documentElement.dataset.eco && !matchMedia('(prefers-reduced-motion: reduce)').matches) animateHeart(b, action.current ? 'add' : 'remove');
  }
  if (favOnly) renderLibrary(true);
}
bus.on('track', markPlaying); bus.on('state', markPlaying); bus.on('fav', hearts);

/* ---------- menu brano, modifica, playlist ---------- */
export const pickFile = (accept, cb) => {
  const i = h('input', { type: 'file', accept, hidden: true, onchange: () => { const f = i.files[0]; i.remove(); if (f) cb(f); } });
  document.body.append(i); i.click();
};
const pickImg = cb => pickFile('image/*', async f => { try { cb(f); } catch (x) { toast(x.message); } });

export function trackMenu(t, o = {}) { menu(t.title, trackItems(t, o)); }
export function trackItems(t, { playlist } = {}) {
  return [
    { label: 'Riproduci dopo', icon: 'play', fn: () => pl.enqueueNext(t) },
    { label: 'Aggiungi alla coda', icon: 'queue', fn: () => pl.enqueueEnd(t) },
    { label: t.fav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti', icon: 'heart', sync: true, fn: () => L.toggleFav(t, 'menu') },
    { label: 'Aggiungi a una playlist', icon: 'plus', fn: () => toPlaylist(t) },
    playlist && { label: 'Rimuovi da «' + playlist + '»', icon: 'x', fn: () => { const undo = L.plRemoveUndoable(playlist, [t.id]); toast('Rimosso da «' + playlist + '»', { action: { label: 'Annulla', fn: undo } }); } },
    L.artistsOf(t).length && { label: L.artistsOf(t).length > 1 ? 'Artisti del brano…' : 'Vai all\u2019artista', icon: 'art', fn: () => artistsMenu(t) },
    t.album && { label: 'Vai all\u2019album', icon: 'alb', fn: () => goAlbum(t) },
    { label: 'Informazioni brano', icon: 'clock', fn: () => infoSheet(t) },
    { label: 'Testo e copertina…', icon: 'lyr', fn: () => lyricsMenu(t, { importFile: () => importLyricsFile(t), pickCover: () => pickImg(async f => { await setCover(t, f, undefined, { manual: true }); toast('Copertina aggiornata'); }) }) },
    { label: 'Modifica brano…', icon: 'edit', fn: () => editTrack(t) },
    { label: 'Elimina dall\u2019app', icon: 'trash', danger: true, fn: () => removeTrack(t) },
  ];
}
/** «Vai all'album»: cerca per chiave e, se i raggruppamenti sono rimasti indietro (metadati cambiati da poco), per identità del brano. */
function goAlbum(t) {
  const al = L.albums().find(a => a.key === L.albumGroupKey(t)) || L.albums().find(a => a.tracks.includes(t));
  if (al) openAlbum(al); else toast('Album non trovato: il brano potrebbe essere stato eliminato');
}
const importLyricsFile = t => pickFile('.lrc,.txt,text/plain', async f => { t.lrc = await f.text(); t.nl = 0; t.ll = 1; t.lsrc = undefined; await L.saveTrack(t); bus.emit('enriched', t); toast('Testo importato e bloccato'); });
/** Artisti associati al brano: vai alla scheda di ciascuno, oppure correggi la divisione (nome unico / elenco manuale). */
function artistsMenu(t) {
  const names = L.artistsOf(t), raw = (t.artist || '').trim();
  const together = () => { S.keepArtists = [...new Set([...(S.keepArtists || []), norm(raw)])]; saveS(); t.am = [raw]; t.af = undefined; t.av = 1; L.saveTrack(t); L.touchData(); toast('«' + raw + '» è ora un artista unico'); };
  const manual = () => ask('Artisti del brano', [['Artisti separati da virgola', names.join(', ')]], ([v]) => {
    const list = v.split(',').map(x => x.trim()).filter(Boolean); if (!list.length) return;
    t.am = list; t.af = []; t.av = 1; L.saveTrack(t); L.touchData(); toast('Artisti aggiornati');
  });
  menu(names.length > 1 ? 'Artisti del brano' : t.title, [
    ...names.map((n, i) => ({ label: n, sub: i === 0 ? 'Principale' : 'Partecipante', icon: 'art', fn: () => openArtist(n) })),
    names.length > 1 && raw && { label: 'Considera «' + raw + '» un artista unico', icon: 'x', fn: together },
    { label: 'Modifica l\u2019elenco degli artisti…', icon: 'edit', fn: manual },
  ]);
}
async function removeTrack(t) {
  if (!await confirmSheet('Eliminare «' + t.title + '»?', { detail: 'Il file originale sul dispositivo non viene toccato.' })) return;
  const undo = L.softRemove([t]);
  toast('Brano eliminato', { action: { label: 'Annulla', fn: () => { if (!undo()) toast('Non è più possibile annullare'); } }, ms: L.UNDO_MS - 500 });
}
export function editTrack(t) {
  ask('Modifica brano', [['Titolo', t.title], ['Artista', t.artist], ['Album', t.album]], async ([ti, ar, al]) => {
    t.title = ti || t.title; if (ar !== t.artist) { t.artist = ar; delete t.am; delete t.af; delete t.av; delete t.arv; delete t.arn; delete t.aa; }   // artista modificato: si rivalutano gli artisti
    t.album = al; await L.saveTrack(t); L.touchData();
    if (pl.cur() === t) bus.emit('track', t);
  }, { extra: [
    ['Scegli copertina…', () => pickImg(async f => { await setCover(t, f, undefined, { manual: true }); toast('Copertina aggiornata'); }), true],
    ['Cerca copertina e testo online', () => { toast('Ricerca in corso…'); L.enrichOne(t, true).then(({ err, changed }) => toast(err ? L.online.explain(err) : changed ? 'Trovato' : 'Nessun risultato affidabile')); }],
    ['Importa testo da file…', () => importLyricsFile(t), true],
    ['Rimuovi copertina', () => clearCover(t)],
  ] });
}
export function toPlaylist(t) {
  const names = Object.keys(PL);
  const add = n => { toast(L.plAdd(n, t.id) ? 'Aggiunto a «' + n + '»' : 'Già in «' + n + '»'); };
  menu('Aggiungi a playlist', [
    { label: 'Nuova playlist…', icon: 'plus', fn: () => ask('Nuova playlist', [['Nome', '']], ([n]) => { if (n && L.plCreate(n)) add(n); else if (n) toast('Esiste già una playlist con questo nome'); }) },
    ...names.map(n => ({ label: n, sub: PL[n].length + ' brani', on: PL[n].includes(t.id), fn: () => add(n) })),
  ]);
}

/* ---------- viste a schede ----------
   Aggiornamenti senza ricostruzioni inutili: le modifiche dell'utente si applicano subito; quelle in sottofondo (ricerca online)
   vengono raggruppate, rimandate mentre l'utente tocca lo schermo e sospese quando l'app è in background (si recupera al ritorno).
   Le copertine si aggiornano sul posto, senza rifare le liste. */
const dirty = new Set(['lib', 'alb', 'art', 'pl', 'you']);
let tab = 'lib', q = '', favOnly = false, flushT = 0, lastFlush = 0, busyUntil = 0;
export const TAB = {};
const MIN_GAP = 1200, QUIET = 800;
export const isBusy = () => Date.now() < busyUntil;
for (const ev of ['pointerdown', 'touchstart', 'scroll', 'wheel']) addEventListener(ev, () => { busyUntil = Date.now() + QUIET; }, { passive: true, capture: true });
function schedule(soft) {
  if (flushT) { if (!soft) { clearTimeout(flushT); flushT = 0; } else return; }
  const now = Date.now(), wait = soft ? Math.max(80, lastFlush + MIN_GAP - now, busyUntil - now) : 0;
  flushT = setTimeout(() => {
    flushT = 0;
    if (document.hidden) return;                               // in background non si ridisegna: lo si farà al ritorno (flushNow)
    if (soft && isBusy()) return schedule(true);
    flush();
  }, wait);
}
export const invalidate = (...n) => { n.forEach(x => dirty.add(x)); schedule(false); };
const invalidateSoft = (...n) => { n.forEach(x => dirty.add(x)); schedule(true); };
export function flush() {
  lastFlush = Date.now();
  if (TAB[tab] && dirty.has(tab)) { dirty.delete(tab); TAB[tab].render(true); }
  if (D && dirty.has('dt')) { dirty.delete('dt'); renderDetail(true); }
}
export const flushNow = () => { clearTimeout(flushT); flushT = 0; flush(); refreshThumbs(); };
export const setTab = t => { tab = t; flush(); };
bus.on('data', e => { const f = e?.soft ? invalidateSoft : invalidate; f('lib', 'alb', 'art', 'pl'); if (D) f('dt'); });
bus.on('enriched', () => invalidateSoft('lib', 'alb', 'art', 'pl'));

/** Riassegna le copertine già a schermo (senza ricostruire le liste) quando ne arriva una nuova. */
const refreshThumbs = debounce(() => {
  if (document.hidden) return;
  for (const d of $$('.th')) {
    if (!d.isConnected) continue;
    if (!d._t) { if (d._fill && d.classList.contains('round')) d._fill(); continue; }      // avatar artista
    const big = d.classList.contains('big');
    coverURL(d._t, big ? 'l' : 't').then(u => { if (u && d.dataset.u !== u && d.isConnected) setImg(d, u); });
  }
}, 250);
bus.on('covers', refreshThumbs);

const header = (title, ...right) => h('header', { class: 'vh' }, h('h1', {}, title), h('span', { class: 'sp' }), ...right);

/* ----- mensole in cima alla libreria (la ripresa dell'ultimo brano è affidata al mini-player) ----- */
function shelf(title, list) {
  if (!list.length) return null;
  return [h('h2', { class: 'sec' }, title), h('div', { class: 'hscroll' }, list.map(t => {
    const th = thumb(t), c = h('div', { class: 'hcard', role: 'button', tabindex: 0, onclick: () => pl.setQueue(list, list.indexOf(t)), onkeydown: e => e.key === 'Enter' && pl.setQueue(list, list.indexOf(t)) }, th, h('b', {}, t.title), h('small', {}, t.artist || 'Artista sconosciuto'));
    return c;
  }))];
}
function homeBlock() {
  const recent = L.smart.last().slice(0, 12), added = L.smart.recent().slice(0, 12);
  const el = h('div', { id: 'home' }, shelf('Ascoltati di recente', recent), shelf('Aggiunti di recente', added), h('h2', { class: 'sec' }, 'Tutti i brani'));
  return el;
}

/* ----- libreria ----- */
let favBtn, countEl, listEl;
function buildLibrary() {
  const v = $('#v-lib');
  countEl = h('small', { class: 'mut' });
  favBtn = iconBtn('heart', 'Solo preferiti', () => { favOnly = !favOnly; favBtn.classList.toggle('on-t', favOnly); favBtn.innerHTML = icon('heart', { fill: favOnly }); renderLibrary(); });
  const imp = h('label', { class: 'btn pri icon', for: 'file', 'aria-label': 'Importa brani', title: 'Importa brani', html: icon('plus') });
  const file = h('input', { id: 'file', type: 'file', accept: 'audio/*,.mp3,.m4a,.aac,.wav,.flac', multiple: true, hidden: true, onchange: onImport });
  const head = h('header', { class: 'vh' }, h('div', { class: 'brand' }, h('div', {}, h('span', { class: 'brand-logo', html: logoSvg({ height: 34 }) }), h('h1', { class: 'sr' }, 'Sonance'), countEl)), h('span', { class: 'sp' }), favBtn, imp, file);
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Cerca titolo, artista, album', 'aria-label': 'Cerca', oninput: debounce(e => { q = e.target.value; renderLibrary(); }, 120) });
  const sortBtn = h('button', { class: 'chip', onclick: sortMenu });
  const play = iconBtn('play', 'Riproduci tutto', () => { const l = L.search(q, { favOnly }); if (l.length) { S.shuffle = 0; saveS(); pl.setQueue(l, 0); } }, { fill: true, cls: 'pri sm' });
  const selBtn = h('button', { class: 'chip', onclick: () => enter(null, L.search(q, { favOnly })), html: icon('check', { size: 16 }) + '<span>Seleziona</span>' });
  const shuf = iconBtn('sh', 'Riproduzione casuale', () => pl.shuffleAll(L.search(q, { favOnly })), { cls: 'sm' });
  listEl = h('div', { class: 'sc', id: 'list' });
  v.append(head, search, h('div', { class: 'toolbar' }, sortBtn, selBtn, h('span', { class: 'sp' }), shuf, play), listEl);
  TAB.lib = { render: renderLibrary, sortBtn };
}
function sortMenu() {
  menu('Ordina per', Object.entries(L.SORTS).map(([k, [label]]) => ({ label, on: (S.sort || 'az') === k, fn: () => { S.sort = k; saveS(); renderLibrary(); } })));
}
export function renderLibrary(keep = false) {
  const list = L.search(q, { favOnly });
  const total = L.lib.list.reduce((s, t) => s + (t.dur > 0 ? t.dur : 0), 0);
  countEl.textContent = L.lib.list.length ? L.lib.list.length + ' brani · ' + fmtLong(total) : '';
  TAB.lib.sortBtn.innerHTML = icon('sort', { size: 16 }) + '<span>' + L.SORTS[S.sort || 'az'][0] + '</span>';
  let empty;
  if (!L.lib.list.length) empty = h('div', { class: 'empty big' }, h('div', { class: 'em-ic', html: icon('lib', { size: 44 }) }), h('b', {}, 'La libreria è vuota'), h('p', {}, 'Importa i file audio dall\u2019app File: restano solo su questo dispositivo, nel database dell\u2019app (il backup salva l\u2019elenco, non i file audio).'), h('label', { class: 'btn pri', for: 'file' }, 'Importa brani'), h('p', { class: 'mut hint' }, 'Su iPhone: per usarla come app apri questa pagina in Safari, tocca Condividi → «Aggiungi alla schermata Home».'));
  else empty = favOnly && !q ? 'Nessun preferito: tocca il cuore accanto a un brano.' : 'Nessun risultato.';
  fillList(listEl, list, t => trackRow(t, { list }), { empty, keep, head: !q && !favOnly && L.lib.list.length ? homeBlock() : null });
}
async function onImport(e) {
  const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return;
  const r = await L.importFiles(fs, (i, n) => toast(`Importazione: ${i} di ${n}…`, { sticky: true }));
  const dups = r.ok ? countDuplicates() : 0;
  toast(`Importati ${r.ok} di ${fs.length}` + (r.skip ? `, ${r.skip} già presenti` : '') + (r.fail ? `, ${r.fail} non riusciti (dettagli in Tu → Impostazioni → Avanzate → Assistenza)` : '') + (dups ? ` · ${dups} possibili duplicati` : ''), { ms: 5500, action: dups ? { label: 'Controlla', fn: openDuplicates } : null });
  bus.emit('storage');
}

/* ----- album ----- */
function card(cover, title, subtitle, onclick) {
  const c = h('div', { class: 'card', role: 'button', tabindex: 0, onclick }, cover, h('b', {}, title), h('small', {}, subtitle));
  c.onkeydown = e => { if (e.key === 'Enter') onclick(); }; return c;
}
function buildAlbums() {
  const v = $('#v-alb'), cnt = h('small', { class: 'mut' }), g = h('div', { class: 'grid sc' });
  v.append(header('Album', cnt), g);
  TAB.alb = { render(keep) { const a = L.albums(); cnt.textContent = a.length + ' album'; fillList(g, a, al => card(thumb(al.tracks[0]), al.name, al.artist + ' · ' + al.tracks.length + ' brani', () => openAlbum(al)), { empty: 'Gli album compaiono automaticamente dai metadati dei brani.', keep }); } };
}
function buildArtists() {
  const v = $('#v-art'), cnt = h('small', { class: 'mut' }), g = h('div', { class: 'grid sc' });
  v.append(header('Artisti', cnt), g);
  TAB.art = { render(keep) { const a = L.artists(); cnt.textContent = a.length + ' artisti'; fillList(g, a, ar => card(avatar(ar.name), ar.name, ar.tracks.length + ' brani', () => openArtist(ar.name)), { empty: 'Gli artisti compaiono automaticamente dai metadati dei brani.', keep }); } };
}

/* ----- playlist ----- */
const SMART = [
  ['fav', 'Preferiti', 'heart', 'linear-gradient(135deg,#f43f5e,#fb923c)'],
  ['recent', 'Aggiunti di recente', 'calendar-plus', 'linear-gradient(135deg,#2563eb,#06b6d4)'],
  ['top', 'Più ascoltati', 'chart-no-axes-combined', 'linear-gradient(135deg,#7c3aed,#c026d3)'],
  ['last', 'Ascoltati di recente', 'history', 'linear-gradient(135deg,#d97706,#ea580c)'],
];
export function plCover(el, n) {
  if (PLC[n]) { setImg(el, PLC[n]); return; }
  const t = L.plTracks(n)[0]; if (t) coverURL(t, 't').then(u => setImg(el, u));
}
function buildPlaylists() {
  const v = $('#v-pl'), g = h('div', { class: 'sc' });
  const add = iconBtn('plus', 'Nuova playlist', () => ask('Nuova playlist', [['Nome', '']], ([n]) => { if (!n) return; if (!L.plCreate(n)) toast('Esiste già una playlist con questo nome'); }), { cls: 'pri' });
  const imp = iconBtn('download', 'Importa playlist M3U', pickM3U);
  v.append(header('Playlist', imp, add), g);
  TAB.pl = { render() {
    g.textContent = '';
    const smart = SMART.map(([k, name, ic, bg]) => [k, name, ic, bg, L.smart[k]()]).filter(x => x[4].length);
    if (smart.length) {
      g.append(h('h2', { class: 'sec' }, 'Automatiche'));
      g.append(h('div', { class: 'grid' }, smart.map(([k, name, ic, bg, l]) =>
        card(h('div', { class: 'th smart', style: { background: bg }, html: icon(ic, { size: 40, fill: ic === 'heart' }) }), name, l.length + ' brani', () => openSmart(k, name, ic, bg)))));
    }
    const names = Object.keys(PL);
    g.append(h('h2', { class: 'sec' }, 'Le tue playlist'));
    if (!names.length) g.append(h('p', { class: 'empty' }, 'Nessuna playlist. Tocca + per crearne una, oppure usa ⋯ su un brano.'));
    else g.append(h('div', { class: 'grid' }, names.map(n => { const th = h('div', { class: 'th', html: icon('pl', { size: 32 }) }); plCover(th, n); return card(th, n, L.plTracks(n).length + ' brani', () => openPlaylist(n)); })));
  } };
}

/* ---------- schermata di dettaglio (album, artista, playlist, automatiche) ---------- */
let D = null;
export function openDetail(desc) {
  D = desc; const dt = $('#dt'); renderDetail(false);
  dt.hidden = false; dt.classList.remove('out'); requestAnimationFrame(() => requestAnimationFrame(() => dt.classList.add('in')));
}
export function closeDetail() {
  const dt = $('#dt'); if (!D) return; D = null; dt.classList.remove('in'); dt.classList.add('out');
  setTimeout(() => { if (!D) { dt.hidden = true; dt.textContent = ''; } }, 320);
}
function renderDetail(keep) {
  if (!D) return;
  const dt = $('#dt'), d = D, list = d.tracks();
  if (d.gone?.(list)) { closeDetail(); return; }
  const prevTop = keep ? dt.querySelector('.dt-body')?.scrollTop : 0;
  dt.textContent = '';
  const cover = d.cover(); cover.classList.add('hero-cover');
  const play = h('button', { class: 'btn pri grow', onclick: () => { if (list.length) { S.shuffle = 0; saveS(); pl.setQueue(list, 0); } }, html: icon('play', { fill: true, size: 20 }) + '<span>Riproduci</span>' });
  const shuf = h('button', { class: 'btn grow', onclick: () => pl.shuffleAll(list), html: icon('sh', { size: 20 }) + '<span>Casuale</span>' });
  const body = h('div', { class: 'sc dt-body' },
    h('div', { class: 'hero' }, cover, h('div', { class: 'hero-t' }, h('h2', {}, d.title), h('small', {}, d.sub(list)))),
    h('div', { class: 'acts' }, play, shuf));
  const rows = h('div', { class: 'rows' });
  body.append(rows);
  dt.append(h('header', { class: 'dth' }, iconBtn('back', 'Indietro', closeDetail), h('span', { class: 'sp' }), d.menu && iconBtn('more', 'Altro', () => menu(d.title, d.menu(list)))), body);
  if (!list.length) rows.append(h('p', { class: 'empty' }, d.empty || 'Nessun brano.'));
  else {
    const mk = t => trackRow(t, { list, drag: !!d.reorder, playlist: d.reorder });
    list.slice(0, 400).forEach(t => rows.append(mk(t)));                    // le schermate di dettaglio sono brevi; oltre 400 si taglia per la fluidità
    if (list.length > 400) rows.append(h('p', { class: 'empty' }, `…e altri ${list.length - 400} brani`));
    if (d.reorder) dragSort(rows, { item: '.row', handle: '.grip', scroller: body, onDrop: (from, to) => { const ids = list.map(t => t.id), a = PL[d.reorder]; L.plMove(d.reorder, a.indexOf(ids[from]), a.indexOf(ids[to])); } });
  }
  if (keep && prevTop) body.scrollTop = prevTop;
  markPlaying();
}

export function openAlbum(al) {
  if (!al) return;
  openDetail({
    title: al.name, tracks: () => (L.albums().find(a => a.key === al.key)?.tracks || []), gone: l => !l.length,
    cover: () => { const c = thumb(al.tracks[0], 'big'); coverURL(al.tracks[0], 'l').then(u => setImg(c, u)); return c; },
    sub: l => al.artist + ' · ' + l.length + ' brani · ' + fmtLong(l.reduce((s, t) => s + (t.dur > 0 ? t.dur : 0), 0)),
    menu: l => [{ label: 'Riproduci dopo', icon: 'play', fn: () => pl.enqueueMany(l, true) }, { label: 'Aggiungi alla coda', icon: 'queue', fn: () => pl.enqueueMany(l) },
      { label: 'Salva come playlist', icon: 'plus', fn: () => saveAsPlaylist(al.name, l) }, { label: 'Scegli copertina…', icon: 'edit', sync: true, fn: () => pickImg(f => setCover(l[0], f, 'album', { manual: true })) }],
  });
}
export function openArtist(name) {
  const find = () => L.findArtist(name);
  openDetail({
    title: name, tracks: () => find()?.tracks || [], gone: l => !l.length,
    cover: () => { const a = avatar(name, 'big'); artistImageURL(name, L.online.findArtistImage).then(u => setImg(a, u)); return a; },
    sub: l => l.length + ' brani · ' + new Set(l.map(t => t.album).filter(Boolean)).size + ' album',
    menu: l => [{ label: 'Aggiungi alla coda', icon: 'queue', fn: () => pl.enqueueMany(l) }, { label: 'Salva come playlist', icon: 'plus', fn: () => saveAsPlaylist(name, l) },
      { label: 'Scegli immagine…', icon: 'edit', sync: true, fn: () => pickImg(f => setArtistImage(name, f)) },
      { label: 'Cerca di nuovo l\u2019immagine online', icon: 'search', fn: async () => { await resetArtistImage(name); toast('Ricerca in corso…'); const u = await artistImageURL(name, L.online.findArtistImage); toast(u ? 'Immagine trovata' : 'Nessuna immagine affidabile trovata'); bus.emit('covers'); } },
      { label: 'Rimuovi immagine', icon: 'trash', fn: () => resetArtistImage(name) }],
  });
}
function openSmart(k, name, ic, bg) {
  openDetail({ title: name, tracks: L.smart[k], cover: () => h('div', { class: 'th smart big', style: { background: bg }, html: icon(ic, { size: 56, fill: ic === 'heart' }) }), sub: l => l.length + ' brani', empty: 'Ancora nessun brano.' });
}
export function openPlaylist(n) {
  openDetail({
    title: n, reorder: n, tracks: () => L.plTracks(n), gone: () => !PL[n],
    cover: () => { const c = h('div', { class: 'th big', html: icon('pl', { size: 44 }) }); plCover(c, n); return c; },
    sub: l => l.length + ' brani · ' + fmtLong(l.reduce((s, t) => s + (t.dur > 0 ? t.dur : 0), 0)),
    empty: 'Playlist vuota. Aggiungi brani dal menu ⋯ di un brano.',
    menu: l => [
      { label: 'Aggiungi alla coda', icon: 'queue', fn: () => pl.enqueueMany(l) },
      { label: 'Esporta come M3U', icon: 'upload', sync: true, fn: () => exportPlaylist(n) },
      { label: 'Rinomina', icon: 'edit', fn: () => ask('Rinomina playlist', [['Nome', n]], ([v]) => { if (v && v !== n) { if (L.plRename(n, v)) { closeDetail(); openPlaylist(v); } else toast('Esiste già una playlist con questo nome'); } }) },
      { label: 'Scegli copertina…', icon: 'edit', sync: true, fn: () => pickImg(async f => { L.plSetCover(n, await blobToDataURL(await shrink(f, 300, .8))); }) },
      PLC[n] && { label: 'Usa la copertina dei brani', icon: 'x', fn: () => L.plSetCover(n, null) },
      { label: 'Elimina playlist', icon: 'trash', danger: true, fn: async () => { if (await confirmSheet('Eliminare la playlist «' + n + '»?', { detail: 'I brani restano nella libreria.' })) { L.plDelete(n); closeDetail(); } } },
    ],
  });
}
export async function saveAsPlaylist(name, list) {
  ask('Salva come playlist', [['Nome', name]], ([n]) => { if (!n) return; if (L.plCreate(n, list.map(t => t.id))) toast('Playlist «' + n + '» creata'); else toast('Esiste già una playlist con questo nome'); });
}
export const detailOpen = () => !!D;

export function initLists() { buildLibrary(); buildAlbums(); buildArtists(); buildPlaylists(); }
