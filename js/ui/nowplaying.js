/* Mini player, player a schermo intero (testi, gesti, coda riordinabile), timer. */
import { h, icon, iconBtn, $, bus, tf, fmtLong, toast, raf, clamp } from '../util.js';
import { createSeekDrag } from '../seekbar.js';
import { lockAxis, swipeAction } from '../gesture.js';
import { S } from '../store.js';
import * as pl from '../player.js';
import * as eng from '../audio.js';
import * as L from '../library.js';
import { coverURL, dominant } from '../covers.js';
import { parseLrc, lineAt, lyricLabel } from '../lrc.js';
import { menu, openSheet, dragSort } from './kit.js';
import { setImg, thumb, trackItems, saveAsPlaylist } from './lists.js';

let LY = [], li = -1, showLy = false, sk = null, lyKey = '';
const el = {};

/* ---------- costruzione ---------- */
export function mountPlayer() {
  /* mini player */
  const mini = $('#mini');
  el.mc = h('div', { class: 'th' }); el.mt = h('b'); el.ms = h('small'); el.mb = h('div', { class: 'mbar' });
  el.mp = h('button', { class: 'btn icon', 'aria-label': 'Play o pausa', onclick: () => pl.start(L.search('')) });
  el.mn = iconBtn('nx', 'Successivo', () => pl.step(1), { fill: true, size: 22 });
  mini.append(h('div', { id: 'mi', role: 'button', tabindex: 0, 'aria-label': 'Apri player', onclick: () => openFull(true), onkeydown: e => e.key === 'Enter' && openFull(true) }, el.mc, h('div', { class: 't' }, el.mt, el.ms)), el.mp, el.mn, h('div', { class: 'mtrack' }, el.mb));
  /* player */
  const full = $('#full');
  el.art = h('div', { id: 'art', class: 'empty' }, h('img', { alt: '', hidden: true, draggable: 'false' }), h('span', { class: 'art-ph', html: icon('lib', { size: 64 }) }));
  el.ly = h('div', { id: 'ly', hidden: true });
  el.lyTools = h('div', { id: 'ly-tools', hidden: true },
    el.lySrc = h('small', { class: 'ly-src' }), h('small', {}, 'Tocca una riga per andare a quel punto. Se il testo è sfasato, correggilo qui sotto.'),
    h('div', { class: 'rowx' }, h('button', { 'aria-label': 'Anticipa il testo di mezzo secondo', onclick: () => adjustLy(-.5) }, '− 0,5 s'), h('button', { onclick: () => adjustLy(0, true) }, 'Azzera'), h('button', { 'aria-label': 'Ritarda il testo di mezzo secondo', onclick: () => adjustLy(.5) }, '+ 0,5 s'), el.lyOff = h('small', {}, '0,0 s')));
  el.ft = h('span', { id: 'ft' }); el.fa = h('span', { id: 'fa' });
  el.hb = h('button', { class: 'btn icon', 'aria-label': 'Aggiungi ai preferiti', 'aria-pressed': 'false', onclick: () => { const c = pl.cur(); if (c) L.toggleFav(c, 'player', el.hb); } });
  el.hb.innerHTML = icon('heart', { size: 26 });
  el.seek = h('div', { id: 'seek', role: 'slider', tabindex: 0, 'aria-label': 'Posizione', 'aria-valuemin': 0, 'aria-valuemax': 0, 'aria-valuenow': 0 }, h('div', { class: 'sk-track' }, h('i', { class: 'sk-fill' })), h('i', { class: 'sk-thumb' }));
  el.tc = h('span', {}, '0:00'); el.td = h('span', {}, '0:00');
  const pi = (n, c) => h('span', { class: 'i ' + c, html: icon(n, { fill: true, size: 30 }) });
  el.pp = h('button', { id: 'pp', class: 'btn pri round', 'aria-label': 'Play o pausa', onclick: () => pl.start(L.search('')) }, pi('play', 'i-play'), pi('pause', 'i-pause'));
  el.sh = iconBtn('sh', 'Casuale', pl.toggleShuffle); el.rp = h('button', { class: 'btn icon', 'aria-label': 'Ripeti', onclick: pl.cycleRepeat });
  el.lb = iconBtn('lyr', 'Testo', toggleLyrics, { cls: 'sm' });
    el.slp = iconBtn('moon', 'Timer di spegnimento', sleepMenu, { cls: 'sm' });
  el.up = h('small', { id: 'upnext' });
  full.append(h('div', { id: 'fbg' }),
    h('div', { id: 'fh' }, iconBtn('down', 'Riduci', () => openFull(false)), h('small', {}, 'In riproduzione'), iconBtn('more', 'Altro', () => { const c = pl.cur(); if (c) menu(c.title, trackItems(c)); })),
    h('div', { id: 'mid' }, el.art, el.ly, el.lyTools),
    h('div', { id: 'inf' }, h('div', {}, el.ft, el.fa), el.hb),
    el.seek, h('div', { id: 'tm' }, el.tc, el.td),
    h('div', { class: 'ctl' }, el.sh, iconBtn('pv', 'Precedente', pl.prev, { fill: true }), el.pp, iconBtn('nx', 'Successivo', () => pl.step(1), { fill: true }), el.rp),
    h('div', { class: 'util' }, el.lb, el.slp, iconBtn('queue', 'Coda', openQueue, { cls: 'sm' })), el.up);
  wireSeek(); wireGestures(full); wireMini(); wireEvents(); state();
}
const fullOpen = () => $('#full').classList.contains('open');
export const openFull = o => { $('#full').classList.toggle('open', !!o); if (o) { upnext(); const e = eng.el(); bus.emit('time', e.currentTime, e.duration || 0); } };

/* ---------- aggiornamento ---------- */
function wireEvents() {
  bus.on('open-full', () => openFull(true)); bus.on('track', paint); bus.on('state', state); bus.on('queue', upnext); bus.on('sleep', state);
  bus.on('time', (ct, d) => {
    el.mb.style.transform = `scaleX(${d ? ct / d : 0})`;
    if (!fullOpen()) return;                                   // a player chiuso non si tocca il DOM del player a schermo intero
    if (!sk.active) {
      el.seek.style.setProperty('--p', (d ? ct / d * 100 : 0) + '%'); el.seek.setAttribute('aria-valuemax', Math.round(d || 0)); el.seek.setAttribute('aria-valuenow', Math.round(ct));
      el.tc.textContent = tf(ct);
    }
    el.td.textContent = tf(d);
    syncLy(ct);
  });
  /* aggiornamenti mirati: niente ricostruzione del testo o dei colori quando cambia solo una cosa */
  bus.on('enriched', t => { if (pl.cur() === t) { paintText(t); lyrics(); } });
  bus.on('fav', (t, action = {}) => {
    if (pl.cur() !== t) return;
    updateHeart();
    if (action.origin === 'player' && action.source === el.hb && !document.documentElement.dataset.eco && !matchMedia('(prefers-reduced-motion: reduce)').matches) animateHeart(el.hb, action.current ? 'add' : 'remove');
  });
  bus.on('covers', () => { const t = pl.cur(); if (t) paintCover(t); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) sk?.cancel(); else { const e = eng.el(); bus.emit('time', e.currentTime, e.duration || 0); } });
  addEventListener('pagehide', () => sk?.cancel());
}
function animateHeart(button, kind) {
  button.classList.remove('heart-add', 'heart-remove'); void button.offsetWidth;
  button.classList.add(kind === 'add' ? 'heart-add' : 'heart-remove');
  let timer; const clear = () => { clearTimeout(timer); button.classList.remove('heart-add', 'heart-remove'); button.removeEventListener('animationend', clear); };
  button.addEventListener('animationend', clear); timer = setTimeout(clear, 550);
}
function updateHeart() {
  const c = pl.cur(), on = !!c?.fav, svg = el.hb.querySelector('svg');
  el.hb.classList.toggle('on-t', on); el.hb.setAttribute('aria-pressed', String(on));
  el.hb.setAttribute('aria-label', on ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti');
  if (svg) svg.setAttribute('fill', on ? 'currentColor' : 'none');
}
function state() {
  const on = pl.isPlaying();
  for (const b of [el.pp]) b.classList.toggle('playing', on);
  el.mp.innerHTML = icon(on ? 'pause' : 'play', { fill: true, size: 22 });
  $('#full').classList.toggle('paused', !on);
  el.sh.classList.toggle('on-t', !!S.shuffle);
  el.rp.innerHTML = icon(S.repeat === 2 ? 'rep1' : 'rep') + (S.repeat ? '<i class="dot"></i>' : ''); el.rp.classList.toggle('on-t', !!S.repeat);
  updateHeart();
  el.slp.classList.toggle('on-t', !!(pl.P.sleepAt || pl.P.sleepEnd));
}
function upnext() {
  const i = pl.P.queue.length ? pl.peekNext() : -1, t = pl.P.queue[i];
  el.up.textContent = t ? 'Poi: ' + t.title + (t.artist ? ' · ' + t.artist : '') : pl.cur() ? 'Ultimo brano della coda' : '';
}
function paintText(t) {
  el.mt.textContent = el.ft.textContent = t.title; el.ms.textContent = t.artist || ''; el.fa.textContent = t.artist || 'Artista sconosciuto';
  state(); upnext();
}
let coverTok = 0;
async function paintCover(t) {
  const my = ++coverTok;
  const [tu, lu] = await Promise.all([coverURL(t, 't'), coverURL(t, 'l')]);
  if (pl.cur() !== t || my !== coverTok) return;
  const key = (tu || '') + '|' + (lu || '');
  if (el.mc.dataset.k === key) return;                           // stessa immagine: nessun ridisegno né nuovo calcolo del colore
  el.mc.dataset.k = key;
  el.mc.textContent = ''; el.mc.classList.remove('has'); if (tu) setImg(el.mc, tu); else el.mc.innerHTML = icon('lib', { size: 20 });
  setArt(lu || tu); tint(lu || tu);
}
function paint(t) {
  const mini = $('#mini');
  if (!t) { mini.hidden = true; openFull(false); return; }
  mini.hidden = false; el.mc.dataset.k = '';
  paintText(t); lyrics(); paintCover(t);
}
function setArt(u) {
  const img = el.art.firstChild; el.art.classList.toggle('empty', !u);
  if (!u) { img.hidden = true; img.removeAttribute('src'); return; }
  img.hidden = false; img.classList.remove('ld'); img.onload = () => img.classList.add('ld'); img.src = u;
}
async function tint(u) {
  const c = S.cc === 0 ? null : await dominant(u), [r, g, b] = c || [44, 44, 54], f = $('#full');
  f.style.setProperty('--g1', `rgb(${r * .6 | 0},${g * .6 | 0},${b * .6 | 0})`); f.style.setProperty('--g2', `rgb(${r * .18 | 0},${g * .18 | 0},${b * .18 | 0})`);
}

/* ---------- barra di avanzamento ----------
   Barra a puntatore unico (touch-action:none + pointer capture). Il seek avviene una sola volta, al rilascio, e solo
   per un trascinamento iniziato sulla barra: nessun listener globale che possa spostare la riproduzione. */
function wireSeek() {
  const s = el.seek; let rect = null;
  const dur = () => { const e = eng.el(), c = pl.cur(); return Number.isFinite(e.duration) && e.duration > 0 ? e.duration : c?.dur > 0 ? c.dur : 0; };
  const frac = x => (rect && rect.width > 0 ? clamp((x - rect.left) / rect.width, 0, 1) : 0);
  const stop = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', cn); s.classList.remove('act'); };
  sk = createSeekDrag({
    onPreview: f => { s.style.setProperty('--p', f * 100 + '%'); el.tc.textContent = tf(f * dur()); },
    onCommit: f => { const d = dur(); if (d) { pl.seekTo(f * d); s.style.setProperty('--p', f * 100 + '%'); } },
    onEnd: stop,
  });
  const mv = e => sk.move(e.pointerId, frac(e.clientX));
  const up = e => { sk.up(e.pointerId, frac(e.clientX)); };
  const cn = e => { if (sk.cancel(e.pointerId)) { const e2 = eng.el(); bus.emit('time', e2.currentTime, e2.duration || 0); } };
  s.addEventListener('pointerdown', e => {
    if ((e.button && e.button > 0) || !dur()) return;
    e.preventDefault(); sk.cancel();
    try { s.setPointerCapture(e.pointerId); } catch { /* i listener su window coprono comunque il gesto */ }
    rect = s.getBoundingClientRect(); s.classList.add('act');
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', cn);
    sk.down(e.pointerId, frac(e.clientX));
  });
  s.addEventListener('keydown', e => {
    const d = dur(), c = eng.el().currentTime, k = { ArrowLeft: c - 5, ArrowDown: c - 5, ArrowRight: c + 5, ArrowUp: c + 5, Home: 0, End: d };
    if (d && e.key in k) { e.preventDefault(); pl.seekTo(k[e.key]); }
  });
}

/* ---------- gesti: chiudi trascinando, scorri la copertina per cambiare brano ---------- */
function wireGestures(full) {
  let y0 = null, x0 = 0, mode = '';
  full.addEventListener('touchstart', e => {
    if (e.target.closest('#ly,#ly-tools,#seek,input,button,.util')) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; mode = '';
  }, { passive: true });
  full.addEventListener('touchmove', e => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if (!mode && (Math.abs(dy) > 10 || Math.abs(dx) > 10)) mode = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
    if (mode === 'v' && dy > 0) { full.style.transition = 'none'; full.style.transform = `translateY(${dy}px)`; }
    if (mode === 'h' && e.target.closest('#art')) el.art.style.transform = `translateX(${dx * .5}px)`;
  }, { passive: true });
  const end = e => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0, dx = e.changedTouches[0].clientX - x0;
    full.style.transition = ''; full.style.transform = ''; el.art.style.transform = '';
    if (mode === 'v' && dy > 110) openFull(false);
    else if (mode === 'h' && Math.abs(dx) > 70 && e.target.closest('#art')) { dx < 0 ? pl.step(1) : pl.step(-1); }
    y0 = null; mode = '';
  };
  full.addEventListener('touchend', end); full.addEventListener('touchcancel', end);
}

/* ---------- mini-player: swipe sinistra = successivo, destra = precedente, su = apri ----------
   Pointer events con touch-action:none sulla barra. Il gesto si decide solo dopo una soglia e un asse prevalente;
   il tap normale e i pulsanti play/successivo non vengono toccati. */
function wireMini() {
  const mini = $('#mini'), mi = $('#mi'); let st = null, swiped = false;
  const rest = anim => { mi.classList.toggle('snap', !!anim); mi.style.transform = ''; mi.style.opacity = ''; };
  mini.addEventListener('pointerdown', e => {
    swiped = false;
    if ((e.button && e.button > 0) || e.target.closest('button')) { st = null; return; }
    st = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), axis: '', w: mini.clientWidth || 360 };
  });
  mini.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.axis) { st.axis = lockAxis(dx, dy); if (st.axis === 'h') { try { mini.setPointerCapture(e.pointerId); } catch { /* ok */ } mi.classList.remove('snap'); } }
    if (st.axis === 'h') { mi.style.transform = `translateX(${dx * .6}px)`; mi.style.opacity = String(1 - Math.min(.5, Math.abs(dx) / st.w)); }
  });
  const finish = (e, cancelled) => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y, act = cancelled ? null : swipeAction(dx, dy, performance.now() - st.t, st.w), axis = st.axis; st = null;
    if (axis || act) swiped = true;                                  // dopo un gesto il click successivo viene ignorato
    if (act === 'open') { openFull(true); return; }
    const dir = act === 'next' ? 1 : act === 'prev' ? -1 : 0;
    if (!dir || !pl.canStep(dir)) { rest(true); return; }             // niente brano in quella direzione: torna al posto
    mi.classList.add('snap'); mi.style.transform = `translateX(${dir > 0 ? -100 : 100}%)`; mi.style.opacity = '0';
    setTimeout(() => {
      pl.step(dir); mi.classList.remove('snap'); mi.style.transform = ''; mi.style.opacity = '';
      mi.classList.remove('in-l', 'in-r'); void mi.offsetWidth; mi.classList.add(dir > 0 ? 'in-r' : 'in-l');
    }, 140);
  };
  mini.addEventListener('pointerup', e => finish(e, false)); mini.addEventListener('pointercancel', e => finish(e, true));
  mini.addEventListener('click', e => { if (swiped) { swiped = false; e.stopPropagation(); e.preventDefault(); } }, true);
}

/* ---------- testi ---------- */
function lyrics() {
  const t = pl.cur(), box = el.ly, key = (t?.id || '') + '|' + (t?.lrc?.length || 0) + '|' + (t?.nl ? 1 : 0) + '|' + (t?.ll ? 1 : 0) + '|' + (t?.lsrc?.a || '');
  if (key === lyKey) return;                      // stesso brano e stesso testo: niente ricostruzione del DOM
  lyKey = key; box.textContent = '';
  LY = t?.lrc ? parseLrc(t.lrc) : []; li = -1;
  box.classList.toggle('plain', !!LY.length && LY[0].t == null);
  if (el.lySrc) el.lySrc.textContent = lyricLabel(t);
  if (!LY.length) { box.append(h('p', { class: 'ly-empty' }, t && !t.nl ? 'Ricerca del testo in corso…' : 'Nessun testo trovato. Puoi cercarlo o caricarlo da ⋯ → Modifica brano.')); updateLyOff(); return; }
  LY.forEach(l => box.append(h('p', { role: 'button', tabindex: 0, 'aria-label': 'Vai a ' + tf(l.t), onclick: () => { if (l.t != null) { pl.seekTo(Math.max(0, l.t - (t.lyricOffset || 0))); if (!pl.isPlaying()) pl.play(); } } }, l.x || '♪')));
  updateLyOff();
}
function syncLy(ct) {
  if (!showLy || !LY.length || LY[0].t == null) return;
  const i = lineAt(LY, ct + (pl.cur()?.lyricOffset || 0));
  if (i === li) return;
  const ps = el.ly.children; ps[li]?.classList.remove('cur'); li = i;
  if (ps[i]) { ps[i].classList.add('cur'); ps[i].scrollIntoView({ block: 'center', inline: 'nearest', behavior: document.documentElement.dataset.eco ? 'auto' : 'smooth' }); }
}
const updateLyOff = () => { const o = pl.cur()?.lyricOffset || 0; el.lyOff.textContent = (o >= 0 ? '+' : '') + o.toFixed(1).replace('.', ',') + ' s'; };
async function adjustLy(d, zero) {
  const t = pl.cur(); if (!t) return;
  t.lyricOffset = zero ? 0 : Math.max(-30, Math.min(30, (t.lyricOffset || 0) + d)); await L.saveTrack(t); li = -1; updateLyOff(); syncLy(eng.el().currentTime);
}
function toggleLyrics() {
  showLy = !showLy; el.ly.hidden = el.lyTools.hidden = !showLy; el.art.hidden = showLy; el.lb.classList.toggle('on-t', showLy); li = -1; syncLy(eng.el().currentTime);
}

/* ---------- timer ---------- */
function sleepMenu() {
  const rem = pl.P.sleepAt ? Math.max(1, Math.round((pl.P.sleepAt - Date.now()) / 60000)) : 0;
  menu('Timer di spegnimento', [
    (rem || pl.P.sleepEnd) && { label: 'Disattiva timer', sub: pl.P.sleepEnd ? 'Fine del brano' : 'Mancano circa ' + rem + ' min', icon: 'x', fn: () => pl.setSleep(0) },
    ...[15, 30, 45, 60].map(m => ({ label: m + ' minuti', fn: () => pl.setSleep(m) })),
    { label: 'Alla fine del brano', fn: () => pl.setSleep('end') },
  ]);
}

/* ---------- coda riordinabile ---------- */
export function openQueue() {
  let box, listEl;
  const build = () => {
    const P = pl.P, rest = P.queue.slice(P.qi + 1), restDur = rest.reduce((s, t) => s + (t.dur > 0 ? t.dur : 0), 0);
    box.textContent = '';
    box.append(h('div', { class: 'sh-title row-between' }, h('span', {}, 'Coda'), h('small', { class: 'mut' }, P.queue.length ? `${rest.length} in arrivo · ${fmtLong(restDur)}` : '')),
      h('div', { class: 'qacts' },
        h('button', { class: 'chip', onclick: () => { pl.shuffleUpcoming(); }, html: icon('sh', { size: 16 }) + '<span>Mescola i prossimi</span>' }),
        h('button', { class: 'chip', onclick: () => { const undo = pl.clearUpcoming(); toast('Prossimi svuotati', { action: { label: 'Annulla', fn: () => { if (!undo()) toast('Non è più possibile annullare'); } } }); }, html: icon('trash', { size: 16 }) + '<span>Svuota i prossimi</span>' }),
        h('button', { class: 'chip', onclick: () => { saveAsPlaylist('Coda del ' + new Date().toLocaleDateString('it'), P.queue); }, html: icon('plus', { size: 16 }) + '<span>Salva</span>' })));
    listEl = h('div', { class: 'qlist' });
    box.append(listEl);
    if (!P.queue.length) { listEl.append(h('p', { class: 'empty' }, 'La coda è vuota. Avvia un brano dalla libreria o da una playlist.')); return; }
    P.queue.forEach((t, i) => {
      const th = thumb(t);
      const r = h('div', { class: 'qrow' + (i === P.qi ? ' current' : '') + (i < P.qi ? ' past' : '') },
        h('span', { class: 'grip', 'aria-label': 'Trascina per riordinare', html: icon('grip', { size: 20 }) }), th,
        h('div', { class: 't', role: 'button', tabindex: 0, onclick: () => pl.load(i) }, h('b', {}, t.title), h('small', {}, t.artist || 'Artista sconosciuto')),
        h('button', { class: 'btn icon sm', 'aria-label': 'Rimuovi dalla coda', onclick: () => pl.removeAt(i), html: icon('x', { size: 18 }) }));
      listEl.append(r);
    });
    dragSort(listEl, { item: '.qrow', handle: '.grip', scroller: listEl, onDrop: (a, b) => pl.moveQ(a, b) });
    raf(() => listEl.querySelector('.current')?.scrollIntoView({ block: 'center' }));
  };
  const api = openSheet(() => [box = h('div', { class: 'qbox' })], { cls: 'tall' });
  build();
  const off = bus.on('queue', () => { const top = listEl?.scrollTop || 0; build(); if (listEl) listEl.scrollTop = top; });
  api.el.addEventListener('close', off);
}
