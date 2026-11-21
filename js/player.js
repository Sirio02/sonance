/* Stato di riproduzione: coda, passaggio tra brani, ascolti, timer di spegnimento, Media Session. */
import { S, saveS, Q, saveQ, POS, savePos, getBlob, addPlay, updatePlay, prunePlays } from './store.js';
import * as eng from './audio.js';
import { bus, log, toast, debounce } from './util.js';
import { byId, saveTrack, enrichOne } from './library.js';
import { coverURL } from './covers.js';
import { shouldRestore, positionToSave } from './playstate.js';

export const P = { queue: [], qi: -1, hist: [], played: new Set(), tok: 0, upNext: -1, miss: 0, xf: false, acc: 0, lastCt: 0, counted: false, playKey: null, sleepEnd: false, sleepAt: 0 };
export const cur = () => P.queue[P.qi];
export const isPlaying = () => !eng.el().paused && !eng.isHeld();

/* ---------- persistenza ---------- */
/* La coda può avere migliaia di id: la scrittura sincrona in localStorage a ogni cambio brano bloccava il thread principale. */
const saveQSoon = debounce(saveQ, 500);
export function persistQueue() { Q.ids = P.queue.map(t => t.id); Q.i = P.qi; saveQSoon(); bus.emit('queue'); }
addEventListener('pagehide', () => { saveQ(); persistPos(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { saveQ(); persistPos(true); } });
let posT = 0;
const persistPos = (force = false) => { const n = Date.now(); if (!force && n - posT < 5000) return; posT = n; const t = cur(); if (t) { const e = eng.el(); POS.id = t.id; POS.pos = positionToSave({ held: eng.isHeld(), heldPos: eng.heldPos(), currentTime: e.currentTime, duration: e.duration }); savePos(); } };
/** Salva subito coda e posizione (prima di un aggiornamento dell'app o di un ricaricamento). */
export const flushState = () => { saveQ(); persistPos(true); };

/* ---------- ascolti (statistiche) ---------- */
function commitPlay() {
  if (P.playKey != null && P.acc > 0) updatePlay(P.playKey, { ms: Math.round(P.acc * 1000) });
  P.acc = 0; P.lastCt = 0; P.counted = false; P.playKey = null;
}
async function recordPlay(t) {
  P.counted = true;
  t.pc = (t.pc || 0) + 1; t.lp = Date.now(); saveTrack(t);
  try {
    P.playKey = await addPlay({ tid: t.id, at: Date.now(), ms: Math.round(P.acc * 1000), title: t.title, artist: t.artist || '', album: t.album || '' });
    prunePlays().catch(() => {}); bus.emit('plays');
  } catch (e) { log('cronologia: ' + e.message); }
}

/* ---------- selezione brano successivo ---------- */
/** Con "casuale" si scorre una sequenza mescolata senza ripetizioni; la coda finisce quando tutti i brani sono stati ascoltati. */
export function peekNext() {
  const n = P.queue.length; if (!n) return -1;
  if (P.upNext >= 0 && P.upNext < n && P.upNext !== P.qi) return P.upNext;
  let r = -1;
  if (S.shuffle && n > 1) {
    let c = P.queue.map((t, i) => i).filter(i => i !== P.qi && !P.played.has(P.queue[i].id));
    if (!c.length && S.repeat === 1) { P.played = new Set([cur()?.id]); c = P.queue.map((t, i) => i).filter(i => i !== P.qi); }
    r = c.length ? c[Math.random() * c.length | 0] : -1;
  } else { r = P.qi + 1; if (r >= n) r = S.repeat === 1 ? 0 : -1; }
  P.upNext = r; return r;
}

/* ---------- caricamento ---------- */
const warmTok = () => P.tok;
async function warmNext() {
  if (S.repeat === 2) return;
  const i = peekNext(), t = P.queue[i], my = warmTok(); if (!t) return;
  const s = eng.idle(); if (s.id === t.id) return;
  try { const b = await getBlob(t.id); if (my !== warmTok() || !b || eng.idle() !== s) return; eng.attach(s, b, t.id); }
  catch (e) { log('preparazione brano successivo: ' + e.message); }
}
export const invalidateNext = () => { P.upNext = -1; bus.emit('queue'); warmNext(); };

export async function load(i, { play = true, back = false, fade = 0, at = 0 } = {}) {
  const t = P.queue[i]; if (!t) return;
  if (!back && P.qi >= 0 && P.qi !== i) { P.hist.push(P.qi); if (P.hist.length > 100) P.hist.shift(); }
  commitPlay();
  P.qi = i; P.upNext = -1; P.played.add(t.id);
  const my = ++P.tok; persistQueue();
  const slot = eng.idle();
  if (slot.id !== t.id) {
    let b; try { b = await getBlob(t.id); } catch (e) { log('lettura file: ' + e.message); }
    if (my !== P.tok) return;
    if (!b) { toast('Il file di «' + t.title + '» non è più nell\u2019app: importalo di nuovo'); log('file mancante: ' + t.title); if (++P.miss < P.queue.length) return step(1); return; }
    eng.attach(slot, b, t.id);
  }
  const old = eng.active(), fading = fade > 0 && eng.hasGraph() && !old.el.paused && !eng.isHeld() && old !== slot;
  eng.clearHold(); eng.swap(slot); eng.wake(play);
  slot.el.loop = S.repeat === 2;
  if (!fading) { eng.resetGain(slot); if (old !== slot) eng.release(old); }
  if (at) { const f = () => { slot.el.currentTime = at; }; slot.el.readyState >= 1 ? f() : slot.el.addEventListener('loadedmetadata', f, { once: true }); }
  if (fading) slot.el.currentTime = 0;
  POS.id = t.id; POS.pos = at || 0; savePos();
  bus.emit('track', t); bus.emit('state');
  setupMediaSession(t);
  if (play) {
    try {
      await slot.el.play();
      // Avvia la curva solo dopo che il nuovo elemento ha iniziato a riprodurre:
      // altrimenti la dissolvenza in ingresso può consumarsi mentre il browser carica il file.
      if (fading && old !== eng.active() && eng.hasGraph()) {
        eng.crossfade(old, slot, fade);
        setTimeout(() => { if (old !== eng.active()) eng.release(old); }, fade * 1000 + 350);
      }
    } catch (e) { if (e.name !== 'AbortError') { log('play(): ' + e.name); toast('Tocca Play per avviare la riproduzione'); } }
  }
  bus.emit('state');
  warmNext();
  if (!t.lrc && !t.nl) enrichOne(t).catch(() => {});      // brano nuovo senza testo: tentativo immediato
}

export function step(d = 1) {
  if (!P.queue.length) return;
  if (d < 0) {
    if (S.shuffle && P.hist.length) return load(P.hist.pop(), { back: true });
    let i = P.qi - 1;
    if (i < 0) { if (S.repeat === 1) i = P.queue.length - 1; else { seekTo(0); return; } }
    return load(i);
  }
  const n = peekNext();
  if (n < 0) { P.played = new Set(); toast('Fine della coda'); return load(0, { play: false }); }
  return load(n);
}
export const prev = () => (eng.el().currentTime > 3 ? seekTo(0) : step(-1));
export function seekTo(s) {
  const e = eng.el(); if (eng.isHeld() || !Number.isFinite(s)) return;
  const d = e.duration, v = Math.max(0, Number.isFinite(d) && d > 0 ? Math.min(s, d - .05) : s);
  if (Math.abs(e.currentTime - v) < .05) return;          // nessun salto inutile
  e.currentTime = v; P.lastCt = v; setPositionState();
}
/** Può esistere un brano precedente/successivo? (usato dallo swipe del mini-player per evitare cambi a vuoto) */
export function canStep(d) {
  if (!P.queue.length) return false;
  if (d > 0) return peekNext() >= 0;
  return S.shuffle ? P.hist.length > 0 : P.qi > 0 || S.repeat === 1;
}

/* ---------- play / pausa ---------- */
export async function play() {
  eng.wake(true);
  const s = eng.active(); if (!s.url) return;
  try {
    if (eng.isHeld()) await eng.unhold(S.repeat === 2);
    await s.el.play();
  } catch (e) { if (e.name !== 'AbortError') { log('play(): ' + e.name); toast('Non riesco ad avviare la riproduzione: riprova'); } }
  bus.emit('state');
}
export function pause() {
  const e = eng.el();
  if (S.keep !== 0 && !e.paused && !eng.isHeld() && P.qi >= 0) { eng.hold(); } else e.pause();
  persistPos(true); bus.emit('state');                       // la pausa salva subito la posizione (prima restava fino a 5 s indietro)
}
export const togglePlay = () => (eng.el().paused || eng.isHeld() ? play() : pause());
export function start(list) {
  if (P.qi < 0 || !cur()) { if (list?.length) setQueue(list, 0); return; }
  togglePlay();
}

/* ---------- coda ---------- */
export function setQueue(list, startIdx = 0, opts) {
  P.queue = list.slice(); P.hist = []; P.played = new Set(); P.upNext = -1; P.miss = 0;
  return load(startIdx, opts);
}
export function playFrom(list, t) {
  if (cur() === t && eng.active().url) return togglePlay();
  return setQueue(list, Math.max(0, list.indexOf(t)));
}
export function shuffleAll(list) {
  if (!list.length) return;
  S.shuffle = 1; saveS(); bus.emit('state');
  setQueue(list, Math.random() * list.length | 0);
}
export function enqueueNext(t) {
  if (!P.queue.length) return setQueue([t], 0);
  const at = P.qi + 1; const dup = P.queue.findIndex((x, i) => x.id === t.id && i > P.qi);
  if (dup >= 0) P.queue.splice(dup, 1);
  P.queue.splice(at, 0, t); persistQueue(); invalidateNext(); toast('Suonerà subito dopo');
}
export function enqueueEnd(t) {
  if (!P.queue.length) return setQueue([t], 0);
  P.queue.push(t); persistQueue(); invalidateNext(); toast('Aggiunto in coda');
}
export function enqueueMany(list, next = false) {
  if (!list.length) return;
  if (!P.queue.length) return setQueue(list, 0);
  const ids = new Set(list.map(t => t.id));
  if (next) { P.queue = P.queue.filter((t, i) => i <= P.qi || !ids.has(t.id)); P.queue.splice(P.qi + 1, 0, ...list); }
  else P.queue.push(...list);
  persistQueue(); invalidateNext(); toast(list.length + (next ? ' brani suoneranno subito dopo' : ' brani aggiunti in coda'));
}
export function removeAt(i) {
  if (i < 0 || i >= P.queue.length) return;
  const wasCur = i === P.qi; P.queue.splice(i, 1);
  if (i < P.qi) P.qi--;
  if (wasCur) {
    if (P.queue.length) { P.qi = Math.min(i, P.queue.length - 1); P.hist = P.hist.filter(x => x !== i); load(P.qi, { play: isPlaying() }); }
    else { P.qi = -1; eng.release(eng.active()); eng.clearHold(); bus.emit('track', null); bus.emit('state'); }
  }
  P.hist = P.hist.filter(x => x < P.queue.length);
  persistQueue(); invalidateNext();
}
export function moveQ(from, to) {
  if (from === to) return;
  const cu = cur(); P.queue.splice(to, 0, P.queue.splice(from, 1)[0]); P.qi = P.queue.indexOf(cu);
  P.hist = []; persistQueue(); invalidateNext();
}
/** Svuota i prossimi in coda. Ritorna la funzione che li ripristina (solo se la coda non è cambiata nel frattempo). */
export function clearUpcoming() {
  const cut = Math.max(0, P.qi + 1), rest = P.queue.slice(cut); P.queue.length = cut; persistQueue(); invalidateNext();
  return () => { if (P.queue.length !== cut || !rest.length) return false; P.queue.push(...rest); persistQueue(); invalidateNext(); return true; };
}
export function shuffleUpcoming() {
  const rest = P.queue.splice(P.qi + 1);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [rest[i], rest[j]] = [rest[j], rest[i]]; }
  P.queue.push(...rest); persistQueue(); invalidateNext();
}
bus.on('removed', t => { const i = P.queue.indexOf(t); if (i >= 0) removeAt(i); });

/* ---------- impostazioni di riproduzione ---------- */
export function toggleShuffle() { S.shuffle = S.shuffle ? 0 : 1; P.played = new Set([cur()?.id]); saveS(); invalidateNext(); bus.emit('state'); }
export function cycleRepeat() {
  S.repeat = ((S.repeat || 0) + 1) % 3; saveS();
  if (!eng.isHeld()) eng.el().loop = S.repeat === 2;
  toast(['Ripetizione disattivata', 'Ripeti tutta la coda', 'Ripeti questo brano'][S.repeat]); invalidateNext(); bus.emit('state');
}

/* ---------- timer di spegnimento ---------- */
let sleepT = 0;
export function setSleep(min) {
  clearTimeout(sleepT); P.sleepEnd = false; P.sleepAt = 0;
  if (min === 'end') { P.sleepEnd = true; toast('Si fermerà alla fine del brano'); }
  else if (min > 0) {
    P.sleepAt = Date.now() + min * 60000;
    sleepT = setTimeout(async () => { await eng.fadeOutActive(4); pause(); eng.el().pause(); eng.resetGain(eng.active()); P.sleepAt = 0; bus.emit('sleep'); toast('Timer di spegnimento: riproduzione fermata'); }, min * 60000);
    toast('Si fermerà tra ' + min + ' minuti');
  }
  bus.emit('sleep');
}

/* ---------- eventi audio ---------- */
let lastPS = 0;
bus.on('a:timeupdate', () => {
  const e = eng.el(), t = cur(); if (!t || eng.isHeld()) return;
  const ct = e.currentTime, d = e.duration || 0;
  const dt = ct - P.lastCt; if (dt > 0 && dt < 1.5) P.acc += dt; P.lastCt = ct;
  if (!P.counted && P.acc >= Math.min(30, (d || 60) / 2)) recordPlay(t);
  if (e.loop !== (S.repeat === 2)) e.loop = S.repeat === 2;
  /* dissolvenza: parte quando mancano `cf` secondi alla fine */
  const rem = d - ct;
  if (S.cf > 0 && !P.xf && !P.sleepEnd && S.repeat !== 2 && d > S.cf * 2 + 1 && rem <= S.cf + .15 && eng.hasGraph()) {
    const n = peekNext(); if (n >= 0) { P.xf = true; load(n, { fade: S.cf }).finally(() => { P.xf = false; }); return; }
  }
  if (!document.hidden) bus.emit('time', ct, d);
  persistPos();
  const now = Date.now();
  if (now - lastPS > 4000 && d) { lastPS = now; setPositionState(); }
});
bus.on('a:ended', () => {
  log('fine brano → ' + (S.repeat === 2 ? 'ripeti' : 'successivo'));
  if (S.repeat === 2) { seekTo(0); eng.el().play(); return; }
  if (P.sleepEnd) { P.sleepEnd = false; bus.emit('sleep'); bus.emit('state'); toast('Timer di spegnimento: riproduzione fermata'); return; }
  step(1);
});
const ERR = { 1: 'la riproduzione è stata interrotta', 2: 'problema nella lettura del file', 3: 'il file sembra danneggiato', 4: 'formato non supportato' };
bus.on('a:error', () => {
  if (eng.isHeld()) return;
  const t = cur(), c = eng.el().error?.code; log('errore audio ' + c + ': ' + (t?.title || ''));
  if (!t) return;
  toast('Non riesco a riprodurre «' + t.title + '»: ' + (ERR[c] || 'motivo sconosciuto'));
  if (++P.miss < P.queue.length) step(1);
});
for (const ev of ['play', 'pause', 'playing']) bus.on('a:' + ev, () => { if (ev === 'playing') P.miss = 0; bus.emit('state'); });
bus.on('a:waiting', () => log('in attesa dati a ' + eng.el().currentTime.toFixed(1) + 's'));

/* ---------- Media Session (schermata di blocco, cuffie) ---------- */
const MS = () => ('mediaSession' in navigator ? navigator.mediaSession : null);
const H = (k, f) => { try { MS()?.setActionHandler(k, f); } catch { /* azione non supportata */ } };
/** Registra i comandi. È idempotente e viene richiamata a ogni brano e a ogni avvio di riproduzione: su iOS i comandi registrati
    prima che esista una sessione audio attiva possono non essere recepiti (tasti grigi). Non si registrano seekbackward/seekforward:
    su iOS sostituirebbero i tasti precedente/successivo con "±10 s". */
function bindSession() {
  if (!MS()) return;
  H('play', () => play()); H('pause', () => pause()); H('stop', () => pause());
  H('previoustrack', () => step(-1)); H('nexttrack', () => step(1));
  H('seekbackward', null); H('seekforward', null);
  H('seekto', e => { if (e.seekTime != null) seekTo(e.seekTime); });
}
/** Posizione/durata per il cursore della schermata di blocco. */
export function setPositionState() {
  const ms = MS(), e = eng.el(), d = e.duration;
  if (!ms?.setPositionState || eng.isHeld() || !Number.isFinite(d) || d <= 0) return;
  try { ms.setPositionState({ duration: d, position: Math.min(Math.max(0, e.currentTime), d) }); } catch { /* ok */ }
}
let metaKey = '';
async function setupMediaSession(t) {
  if (!MS()) return;
  bindSession();
  const u = await coverURL(t, 'l');
  if (cur() !== t) return;
  const key = [t.id, t.title, t.artist, t.album, u].join('|');
  if (key === metaKey && MS().metadata) return;           // metadati invariati: non ricrearli (inutile lavoro durante la riproduzione)
  metaKey = key;
  try { MS().metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album, artwork: u ? [{ src: u, sizes: '640x640' }] : [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] }); } catch { /* ok */ }
  setPositionState();
}
bindSession();
bus.on('state', () => { try { MS().playbackState = isPlaying() ? 'playing' : 'paused'; } catch { /* ok */ } });
bus.on('covers', () => { const t = cur(); if (t) setupMediaSession(t); });
bus.on('a:loadedmetadata', setPositionState); bus.on('a:durationchange', setPositionState); bus.on('a:seeked', setPositionState);
bus.on('a:play', setPositionState); bus.on('a:pause', setPositionState);
bus.on('a:playing', () => { bindSession(); const t = cur(); if (t && MS()?.metadata?.title !== t.title) setupMediaSession(t); });
bus.on('enriched', t => { if (cur() === t) setupMediaSession(t); });

/** Ripristina coda e posizione dell'ultima sessione (in pausa). */
export async function restoreSession() {
  if (!shouldRestore({ queueLen: P.queue.length, loads: P.tok })) return false;    // l'utente ha già avviato qualcosa mentre la libreria si caricava: non sovrascrivere
  const list = (Q.ids || []).map(byId).filter(Boolean);
  if (!list.length) return false;
  P.queue = list; let i = Q.i;
  if (POS.id) { const j = list.findIndex(t => t.id === POS.id); if (j >= 0) i = j; }
  if (i < 0 || i >= list.length) i = 0;
  await load(i, { play: false, at: POS.id === list[i].id ? POS.pos : 0 });
  return true;
}
