/* Motore audio.
   - Due elementi <audio> alternati: il prossimo brano viene preparato in anticipo (riproduzione senza pause) e
     può sfumare sopra quello in corso (dissolvenza).
   - Web Audio si attiva solo quando serve (equalizzatore o dissolvenza): su iOS è l'unico modo, perché il volume
     degli <audio> è fisso. Con tutto spento l'audio resta quello nativo, a consumo minimo. */
import { S } from './store.js';
import { bus, log, sleep, clamp } from './util.js';

export const BANDS = [60, 150, 400, 1000, 2400, 15000];

export const slots = [0, 1].map(() => {
  const el = new Audio(); el.preload = 'auto'; el.playsInline = true; el.preservesPitch = true; el.playbackRate = 1;
  return { el, url: null, id: null, g: null };
});
let cur = 0;
export const active = () => slots[cur];
export const idle = () => slots[1 - cur];
export const el = () => slots[cur].el;
export const swap = slot => { cur = slots.indexOf(slot); };

const EV = ['timeupdate', 'ended', 'error', 'play', 'pause', 'playing', 'waiting', 'stalled', 'loadedmetadata', 'durationchange', 'seeked'];
for (const s of slots) for (const ev of EV) s.el.addEventListener(ev, e => { if (s === slots[cur]) bus.emit('a:' + ev, e); });
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* non supportato */ }

/* ---- caricamento ---- */
export function attach(slot, blob, id) {
  if (slot.url) URL.revokeObjectURL(slot.url);
  slot.url = URL.createObjectURL(blob); slot.id = id; slot.el.loop = false; slot.el.src = slot.url;
}
/** Ferma e libera uno slot (memoria e buffer). */
export function release(slot) {
  slot.el.pause();
  if (slot.url) URL.revokeObjectURL(slot.url);
  slot.url = null; slot.id = null; slot.el.removeAttribute('src'); slot.el.load();
}

/* ---- Web Audio ---- */
let ctx = null, graph = null, graphError = '', routedEq = null, routeSeq = 0;
export const wantGraph = () => !!(S.eqOn || S.cf > 0);
export const hasGraph = () => !!graph && ctx.state !== 'closed';

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw Error('Web Audio non disponibile su questo browser');
  ctx = new AC({ latencyHint: 'playback' });
  ctx.onstatechange = () => bus.emit('audio-state');
  const sum = ctx.createGain(), pre = ctx.createGain();
  const filters = BANDS.map((f, i) => {
    const n = ctx.createBiquadFilter();
    n.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
    n.frequency.value = f; n.Q.value = .9; n.gain.value = 0; return n;
  });
  pre.connect(filters[0]); filters.reduce((p, n) => (p.connect(n), n)); filters.at(-1).connect(ctx.destination);
  for (const s of slots) { const src = ctx.createMediaElementSource(s.el); s.g = ctx.createGain(); src.connect(s.g); s.g.connect(sum); }
  graph = { sum, pre, filters };
}

/** Prepara/aggiorna il grafo secondo le impostazioni. Chiamare da un gesto dell'utente la prima volta. */
export function applyEffects(fromGesture = true) {
  if (!wantGraph()) { if (graph) route(); return true; }
  if (!graph) {
    if (!fromGesture) return false;
    try { build(); graphError = ''; } catch (e) { graphError = e.message; log('Audio avanzato: ' + e.message); bus.emit('audio-state'); return false; }
  }
  route(); bus.emit('audio-state'); return true;
}
function route() {
  const { sum, pre, filters } = graph, t = ctx.currentTime, eq = !!S.eqOn;
  /* Il collegamento si cambia SOLO se è cambiato davvero (prima si scollegava e ricollegava a ogni play/impostazione: scatto udibile).
     Quando serve, il segnale viene abbassato per pochi ms attorno al cambio, per evitare il click. */
  if (routedEq !== eq) {
    const seq = ++routeSeq, link = () => { try { sum.disconnect(); } catch { /* già scollegato */ } sum.connect(eq ? pre : ctx.destination); routedEq = eq; };   // EQ spento: percorso diretto
    if (routedEq === null || ctx.state !== 'running') link();
    else {
      sum.gain.cancelScheduledValues(t); sum.gain.setValueAtTime(sum.gain.value, t); sum.gain.linearRampToValueAtTime(0, t + .015);
      setTimeout(() => { if (seq !== routeSeq) return; link(); const n = ctx.currentTime; sum.gain.setValueAtTime(0, n); sum.gain.linearRampToValueAtTime(1, n + .02); }, 25);
    }
  }
  const g = S.eqOn ? S.eq : [0, 0, 0, 0, 0, 0];
  filters.forEach((f, i) => f.gain.setTargetAtTime(g[i] || 0, t, .03));
  pre.gain.setTargetAtTime(Math.pow(10, -Math.max(0, ...g) / 20), t, .03);   // compensa il guadagno: niente distorsione
}
export const autoPreamp = () => (S.eqOn ? Math.max(0, ...S.eq) : 0);
export function wake(create = false) {
  if (create && wantGraph() && !graph) applyEffects(true);      // il grafo si crea una volta; le chiamate successive non toccano i collegamenti
  if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(e => log('AudioContext: ' + e.message));
}
export function status() {
  return { supported: !!(window.AudioContext || window.webkitAudioContext), built: !!graph, state: ctx?.state || 'none', error: graphError, wanted: wantGraph() };
}

/* ---- dissolvenza ---- */
const curve = (fn, n = 48) => Float32Array.from({ length: n }, (_, i) => fn(i / (n - 1)));
const FADE_IN = curve(x => Math.sin(x * Math.PI / 2)), FADE_OUT = curve(x => Math.cos(x * Math.PI / 2));   // potenza costante
export function resetGain(slot) { if (slot.g) { slot.g.gain.cancelScheduledValues(0); slot.g.gain.value = 1; } }
export function crossfade(from, to, secs) {
  if (!graph || !ctx || ctx.state === 'closed' || !from.g || !to.g) return false;
  const t = ctx.currentTime;
  for (const [s, c] of [[to, FADE_IN], [from, FADE_OUT]]) {
    s.g.gain.cancelScheduledValues(t);
    s.g.gain.setValueCurveAtTime(c, t, Math.max(.05, secs));
  }
  return true;
}
export async function fadeOutActive(secs) {
  const s = active();
  if (graph && ctx.state === 'running') { const t = ctx.currentTime; s.g.gain.cancelScheduledValues(t); s.g.gain.setValueCurveAtTime(FADE_OUT, t, secs); await sleep(secs * 1000 + 100); }
}

/* ---- sessione attiva in pausa (workaround WebKit) ----
   Dopo qualche secondo di pausa in background la ripresa può restare muta. Si tiene viva la sessione con un
   silenzio in loop, ma solo per un tempo limitato così non si consuma batteria all'infinito. */
const SIL = (() => {
  const n = 22050, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 22050, true); v.setUint32(28, 44100, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
})();
const HOLD_MS = 10 * 60 * 1000;
let held = null, holdTimer = 0;
export const isHeld = () => held != null;
export const heldPos = () => held?.pos ?? 0;
export function hold() {
  const s = active(); held = { pos: s.el.currentTime };
  s.el.loop = true; s.el.src = SIL; s.el.play().catch(() => {});
  clearTimeout(holdTimer); holdTimer = setTimeout(() => { if (held) { s.el.pause(); log('sessione in pausa rilasciata dopo 10 minuti'); bus.emit('a:pause'); } }, HOLD_MS);
}
export function clearHold() { held = null; clearTimeout(holdTimer); }
/** Esce dalla pausa "tenuta": ricarica il brano alla posizione salvata. */
export async function unhold(loop) {
  const s = active(), p = held.pos; clearHold();
  s.el.loop = loop; s.el.src = s.url;
  await Promise.race([new Promise(r => s.el.addEventListener('loadedmetadata', r, { once: true })), sleep(2000)]);
  s.el.currentTime = clamp(p, 0, s.el.duration || p);
}
