/* Avvio dell'app: archivio → libreria → interfaccia → ripristino sessione. */
import { $, $$, h, icon, bus, log, toast } from './util.js';
import { S, saveS, initStores } from './store.js';
import * as L from './library.js';
import * as pl from './player.js';
import * as eng from './audio.js';
import { initLists, TAB, setTab, closeDetail, detailOpen, flushNow, isBusy } from './ui/lists.js';
import { exit as exitSelection } from './ui/select.js';
import { mountPlayer } from './ui/nowplaying.js';
import { buildYou, TABYOU, applyTheme } from './ui/you.js';
import { lockAxis, nearestTab, tabDirection, indicatorAt, decideTabSwipe } from './gesture.js';
import { updateAction, reloadAction } from './playstate.js';

/* errori non gestiti: log + avviso discreto, senza bloccare l'app */
let lastErr = 0;
const report = m => { log('Errore: ' + m); if (Date.now() - lastErr > 8000) { lastErr = Date.now(); toast('Qualcosa non ha funzionato. Per i dettagli apri Tu → Impostazioni → Avanzate → Assistenza.'); } };
addEventListener('error', e => report(e.message));
addEventListener('unhandledrejection', e => report(e.reason?.message || String(e.reason)));

applyTheme();
const splash = $('#splash');
if (splash) {
  if (document.documentElement.dataset.eco || matchMedia('(prefers-reduced-motion: reduce)').matches) splash.remove();
  else { const remove = () => splash.remove(); splash.addEventListener('animationend', remove, { once: true }); setTimeout(remove, 850); }
}
/* ---------- schede ----------
   L'elenco è dinamico: 5 schede di base, più quelle aggiunte dalle funzioni beta (js/beta.js). L'ordine è quello dei pulsanti nella barra. */
const BASE = [['lib', 'Libreria'], ['alb', 'Album'], ['art', 'Artisti'], ['pl', 'Playlist'], ['you', 'Tu']];
const tabsEl = $('#tabs');
const tabIds = () => [...tabsEl.querySelectorAll('button[data-v]')].map(b => b.dataset.v);
const tabBounds = () => [...tabsEl.querySelectorAll('button[data-v]')].map(b => { const r = b.getBoundingClientRect(); return { left: r.left, right: r.right }; });
let tab = 'lib';
const scrollMem = new Map();          // memoria per scheda: ogni scheda riprende da dove l'avevi lasciata
const scroller = id => $('#v-' + id + ' .sc');
let ind;                              // indicatore della scheda attiva
function placeIndicator(i = tabIds().indexOf(tab), fingerX = null) {
  if (!ind) return;
  const g = indicatorAt(i, tabBounds(), { tabsLeft: tabsEl.getBoundingClientRect().left, fingerX });
  if (g) { ind.style.width = g.w + 'px'; ind.style.transform = 'translateX(' + g.x + 'px)'; }
}
function showTab(t, { dir } = {}) {
  const ids = tabIds(); if (!ids.includes(t)) return;
  if (t === tab && !detailOpen()) { scroller(t)?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  closeDetail(); exitSelection();
  scrollMem.set(tab, scroller(tab)?.scrollTop || 0);
  const d = dir ?? tabDirection(ids.indexOf(tab), ids.indexOf(t));
  tab = t;
  $$('#tabs button').forEach(b => { const on = b.dataset.v === t; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  for (const k of ids) {
    const v = $('#v-' + k); if (!v) continue;
    const show = k === t; v.hidden = !show;
    if (show) { v.dataset.dir = d > 0 ? 'l' : d < 0 ? 'r' : ''; v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); }
  }
  setTab(t); placeIndicator();
  if (S.start === 'last' && t !== 'disc' && S.lastTab !== t) { S.lastTab = t; saveS(); }
  const y = scrollMem.get(t); if (y) requestAnimationFrame(() => { const sc = scroller(t); if (sc) sc.scrollTop = y; });
}

/* Trascinamento sulla barra inferiore: durante il gesto la scheda sotto il dito si evidenzia e l'indicatore segue il dito;
   al rilascio si apre la scheda più vicina (anche se il dito è uscito dai bordi). */
function wireTabSwipe(tabs) {
  let gesture = null, suppressClick = false;
  const clearPeek = () => { tabs.classList.remove('dragging'); tabs.querySelectorAll('.peek').forEach(b => b.classList.remove('peek')); placeIndicator(); };
  tabs.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || document.body.classList.contains('selecting') || detailOpen() || document.querySelector('dialog[open]')) { gesture = null; clearPeek(); return; }
    const t = e.touches[0]; gesture = { id: t.identifier, x: t.clientX, y: t.clientY, axis: '' };
  }, { passive: true });
  tabs.addEventListener('touchmove', e => {
    if (e.touches.length > 1) { gesture = null; clearPeek(); return; }          // secondo dito: gesto annullato
    if (!gesture) return;
    const touch = [...e.changedTouches, ...e.touches].find(t => t.identifier === gesture.id); if (!touch) return;
    const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
    if (!gesture.axis) gesture.axis = lockAxis(dx, dy, 8);
    if (gesture.axis !== 'h' || Math.abs(dx) <= 8) return;
    if (e.cancelable) e.preventDefault();
    const i = nearestTab(touch.clientX, tabBounds()); if (i == null) return;
    tabs.classList.add('dragging');
    tabs.querySelectorAll('button[data-v]').forEach((b, k) => b.classList.toggle('peek', k === i));
    placeIndicator(i, touch.clientX);
  }, { passive: false });
  tabs.addEventListener('touchend', e => {
    if (!gesture) return;
    const touch = [...e.changedTouches].find(t => t.identifier === gesture.id);
    const moved = touch && gesture.axis === 'h' && Math.abs(touch.clientX - gesture.x) > 8;
    gesture = null;
    if (!moved) { clearPeek(); return; }                                         // un normale tap resta gestito dal pulsante
    const i = nearestTab(touch.clientX, tabBounds()), ids = tabIds();
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 500);
    clearPeek();
    if (i != null && ids[i]) showTab(ids[i]);
  }, { passive: true });
  tabs.addEventListener('touchcancel', () => { gesture = null; clearPeek(); }, { passive: true });   // interruzione di sistema: nessuna scheda cambia
  tabs.addEventListener('click', e => { if (!suppressClick) return; e.preventDefault(); e.stopImmediatePropagation(); suppressClick = false; }, true);
}

/* Swipe orizzontale sulla vista principale: scheda precedente/successiva nell'ordine della barra (prima la funzione era scritta e testata ma non collegata). */
function wireViewSwipe() {
  const app = $('#app'); let s = null;
  const blocked = el => document.body.classList.contains('selecting') || detailOpen() || document.querySelector('dialog[open]') || $('#full')?.classList.contains('open') ||
    !!el.closest?.('input,textarea,[role=slider],.grip,.hscroll,.alpha');
  app.addEventListener('touchstart', e => { const t = e.touches[0]; s = e.touches.length === 1 && !blocked(e.target) ? { id: t.identifier, x: t.clientX, y: t.clientY } : null; }, { passive: true });
  app.addEventListener('touchend', e => {
    const st = s; s = null; if (!st) return;
    const t = [...e.changedTouches].find(x => x.identifier === st.id); if (!t) return;
    const ids = tabIds(), next = decideTabSwipe({ dx: t.clientX - st.x, dy: t.clientY - st.y, startX: st.x, width: innerWidth, index: ids.indexOf(tab), count: ids.length });
    if (next != null) showTab(ids[next]);
  }, { passive: true });
  app.addEventListener('touchcancel', () => { s = null; }, { passive: true });
}

/* ---------- funzioni beta ---------- */
const betaCtx = {
  toast, log,
  addTab({ id, label, iconHtml, after = 'art', build }) {
    if ($('#v-' + id)) return;
    const sec = h('section', { id: 'v-' + id, class: 'view', hidden: true });
    $('#app').insertBefore(sec, $('#dt'));
    try { build(sec); } catch (e) { betaFail(sec, e); }
    const btn = h('button', { 'data-v': id, class: 'tab-beta', onclick: () => showTab(id), html: iconHtml + '<span>' + label + '</span>' });
    const ref = tabsEl.querySelector('button[data-v="' + after + '"]'); ref ? ref.after(btn) : tabsEl.append(btn);
    placeIndicator();
  },
  removeTab(id) {
    if (tab === id) showTab('lib');
    tabsEl.querySelector('button[data-v="' + id + '"]')?.remove(); $('#v-' + id)?.remove(); placeIndicator();
  },
  fail: (f, e) => { toast('«' + f.label + '» non è disponibile al momento'); },
};
/** Un errore nel codice beta non rompe l'app: messaggio nella scheda, registro in Assistenza, pulsante per disattivare. */
function betaFail(sec, e) {
  log('Beta: ' + (e?.message || e));
  sec.textContent = '';
  sec.append(h('div', { class: 'sc' }, h('div', { class: 'empty big' }, h('b', {}, 'Questa funzione beta ha avuto un problema'), h('p', {}, String(e?.message || e)),
    h('button', { class: 'btn pri', onclick: () => { S.beta = 0; saveS(); bus.emit('beta'); } }, 'Disattiva funzioni beta'))));
}
const syncBeta = () => betaMod ? betaMod.sync(betaCtx) : S.beta ? import('./beta.js').then(m => { betaMod = m; return m.sync(betaCtx); }).catch(e => log('Beta: ' + e.message)) : null;
let betaMod = null;
bus.on('beta', syncBeta); bus.on('settings', syncBeta);       // anche dopo il ripristino di un backup o il ripristino dell'aspetto (sync è idempotente)

/** Promemoria discreto: libreria non vuota e nessun backup da oltre 30 giorni → un solo avviso ogni 7 giorni. */
function backupReminder() {
  const day = 864e5, now = Date.now();
  if (!L.lib.list.length || (S.lastBackup && now - S.lastBackup < 30 * day) || (S.bkNag && now - S.bkNag < 7 * day)) return;
  if (!S.lastBackup && !S.bkNag) { S.bkNag = now - 6 * day; saveS(); return; }   // primo avvio con libreria: nessun avviso subito
  S.bkNag = now; saveS();
  setTimeout(() => toast(S.lastBackup ? 'L\u2019ultimo backup risale a più di un mese fa' : 'Non hai ancora salvato un backup della tua libreria', { ms: 6000, action: { label: 'Salva ora', fn: () => showTab('you') } }), 4000);
}
(async () => {
  initLists(); buildYou(); TAB.you = TABYOU;
  for (const [k, label] of BASE) tabsEl.append(h('button', { 'data-v': k, class: k === 'lib' ? 'on' : '', onclick: () => showTab(k), html: icon(k) + '<span>' + label + '</span>' }));
  ind = h('i', { class: 'tab-ind', 'aria-hidden': 'true' }); tabsEl.append(ind); placeIndicator();
  wireTabSwipe(tabsEl); wireViewSwipe(); addEventListener('resize', () => placeIndicator());
  if (S.beta) syncBeta();
  mountPlayer();
  await initStores();                 // playlist e metadati in attesa: da localStorage a IndexedDB (verificato, con ritorno automatico se non riesce)
  await L.loadLibrary();
  setTab('lib');
  if (S.start === 'last' && S.lastTab && S.lastTab !== 'lib' && tabIds().includes(S.lastTab)) showTab(S.lastTab, { dir: 0 });
  backupReminder();
  try { await pl.restoreSession(); } catch (e) { log('ripristino sessione: ' + e.message); }
  /* ricerca online in sottofondo (rispetta limiti, rete, risparmio dati) */
  L.setBusyProbe(isBusy);
  L.enrichQueue(L.lib.list);
})();

/* ritorno in primo piano: riattiva l'audio e applica gli aggiornamenti accumulati in background (album, artisti, copertine) */
document.addEventListener('visibilitychange', () => { if (!document.hidden) { eng.wake(); flushNow(); } });
addEventListener('pageshow', e => { if (e.persisted) { eng.wake(); flushNow(); } });
document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
addEventListener('online', () => { L.enrichQueue(L.lib.list); });

/* aggiornamenti: il service worker nuovo resta in attesa finché l'utente lo accetta; con la musica in riproduzione
   l'applicazione viene rimandata alla prossima pausa (mai un ricaricamento che interrompe l'audio). */
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let waiting = null, reloaded = false, reloadWait = false;
  const apply = w => { pl.flushState(); w.postMessage('skip'); };
  const request = w => {
    if (updateAction({ playing: pl.isPlaying() }) === 'apply') apply(w);
    else { waiting = w; toast('Aggiornamento pronto: verrà installato alla prossima pausa, senza fermare la musica', { ms: 5000 }); }
  };
  const doReload = () => {
    const a = reloadAction({ hadController, playing: pl.isPlaying(), alreadyReloaded: reloaded });
    if (a === 'reload') { reloaded = true; pl.flushState(); location.reload(); } else if (a === 'wait') reloadWait = true;
  };
  bus.on('state', () => {
    if (pl.isPlaying()) return;
    if (waiting) { const w = waiting; waiting = null; apply(w); }
    else if (reloadWait) { reloadWait = false; doReload(); }
  });
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const offer = w => toast('Nuova versione disponibile', { sticky: true, action: { label: 'Aggiorna', fn: () => request(w) } });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); }); });
      navigator.serviceWorker.addEventListener('controllerchange', doReload);
      /* una PWA su iPhone resta viva per giorni: oltre che ogni 6 ore, si controlla al ritorno in primo piano (al massimo ogni 30 minuti) */
      let lastCheck = Date.now();
      const check = () => { lastCheck = Date.now(); reg.update().catch(() => {}); };
      document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastCheck > 30 * 60e3) check(); });
      setInterval(check, 6 * 3600e3);
    } catch (e) { log('SW: ' + e.message); }
  });
}
