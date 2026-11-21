/* Componenti di interfaccia riutilizzabili: sheet, menu, conferme, segmentati, trascinamento. */
import { h, icon, clamp } from '../util.js';

/** Foglio modale dal basso con animazione in entrata/uscita. build(api) restituisce i figli del contenuto. */
export function openSheet(build, { cls = '' } = {}) {
  const d = h('dialog', { class: 'sheet ' + cls });
  const api = { el: d, close() { if (!d.open || d.classList.contains('out')) return; d.classList.add('out'); setTimeout(() => d.open && d.close(), 190); } };
  const body = h('div', { class: 'sb' }, ...[].concat(build(api)));
  d.append(h('div', { class: 'grab' }), body);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('cancel', e => { e.preventDefault(); api.close(); });
  d.addEventListener('click', e => { if (e.target === d) api.close(); });
  document.body.append(d); d.showModal();
  return api;
}

export function menu(title, items) {
  return openSheet(api => [
    title && h('div', { class: 'sh-title' }, title),
    ...items.filter(Boolean).map(it => h('button', {
      class: 'opt' + (it.danger ? ' danger' : '') + (it.on ? ' on' : ''),
      onclick: () => { if (it.sync) { it.fn(); api.close(); } else { api.close(); setTimeout(it.fn, 120); } },
    }, it.icon ? h('span', { class: 'oi', html: icon(it.icon, { size: 20 }) }) : null, h('span', { class: 'ol' }, it.label, it.sub ? h('small', {}, it.sub) : null), it.on ? h('span', { class: 'ck', html: icon('check', { size: 18 }) }) : null)),
    h('button', { class: 'opt cancel', onclick: () => api.close() }, 'Chiudi'),
  ]);
}

export function ask(title, fields, onOk, { okLabel = 'Salva', extra = [] } = {}) {
  return openSheet(api => {
    const ins = fields.map(([label, value]) => h('input', { class: 'field', value, placeholder: label, 'aria-label': label, autocomplete: 'off' }));
    const go = () => { api.close(); onOk(ins.map(i => i.value.trim())); };
    ins.forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
    setTimeout(() => ins[0]?.focus(), 250);
    return [h('div', { class: 'sh-title' }, title), ...ins, ...extra.map(([l, f, sync]) => h('button', { class: 'opt', onclick: () => { if (sync) { f(); api.close(); } else { api.close(); setTimeout(f, 120); } } }, l)),
      h('div', { class: 'sh-actions' }, h('button', { class: 'btn', onclick: () => api.close() }, 'Annulla'), h('button', { class: 'btn pri', onclick: go }, okLabel))];
  });
}

export const confirmSheet = (msg, { ok = 'Elimina', danger = true, detail = '' } = {}) => new Promise(res => {
  let done = false; const fin = v => { if (!done) { done = true; res(v); } };
  const api = openSheet(a => [h('div', { class: 'sh-title' }, msg), detail && h('p', { class: 'sh-detail' }, detail),
    h('div', { class: 'sh-actions' }, h('button', { class: 'btn', onclick: () => { fin(false); a.close(); } }, 'Annulla'),
      h('button', { class: 'btn ' + (danger ? 'danger-fill' : 'pri'), onclick: () => { fin(true); a.close(); } }, ok))]);
  api.el.addEventListener('close', () => fin(false));
});

/** Controllo segmentato. options: [[valore, etichetta]] */
export function seg(options, value, onChange) {
  const el = h('div', { class: 'seg', role: 'tablist' });
  const set = v => { value = v; for (const b of el.children) { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); } };
  for (const [v, l] of options) el.append(h('button', { role: 'tab', data: { v }, onclick: () => { set(v); onChange(v); } }, l));
  set(value); el.set = set; return el;
}

/** Riordino con trascinamento (pointer events; funziona al tocco). Le righe devono avere altezza uguale. */
export function dragSort(root, { item, handle, scroller = root, onDrop }) {
  root.addEventListener('pointerdown', e => {
    const g = e.target.closest(handle); if (!g || !root.contains(g)) return;
    const row = g.closest(item), rows = [...root.querySelectorAll(item)], from = rows.indexOf(row); if (from < 0) return;
    e.preventDefault(); g.setPointerCapture(e.pointerId);
    const rh = row.getBoundingClientRect().height, y0 = e.clientY, sc0 = scroller.scrollTop; let y = y0, to = from, scrolling = 0;
    row.classList.add('dragging'); root.classList.add('sorting');
    const layout = () => {
      const dy = y - y0 + (scroller.scrollTop - sc0);
      to = clamp(from + Math.round(dy / rh), 0, rows.length - 1);
      row.style.transform = `translateY(${dy}px)`;
      rows.forEach((r, i) => { if (i === from) return; const s = from < to && i > from && i <= to ? -rh : from > to && i < from && i >= to ? rh : 0; r.style.transform = s ? `translateY(${s}px)` : ''; });
    };
    const auto = () => {
      const r = scroller.getBoundingClientRect(), edge = 56;
      const v = y < r.top + edge ? -10 : y > r.bottom - edge ? 10 : 0;
      if (v) { scroller.scrollTop += v; layout(); }
      scrolling = requestAnimationFrame(auto);
    };
    scrolling = requestAnimationFrame(auto);
    const move = ev => { y = ev.clientY; layout(); };
    const up = () => {
      cancelAnimationFrame(scrolling);
      g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
      row.classList.remove('dragging'); root.classList.remove('sorting'); rows.forEach(r => { r.style.transform = ''; });
      if (to !== from) onDrop(from, to);
    };
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
  });
}

/** Cursore verticale (pointer events) usato dall'equalizzatore. */
export function vslider({ min, max, step = 1, value, label, onInput }) {
  const th = h('div', { class: 'vs-thumb' }), fill = h('div', { class: 'vs-fill' });
  const el = h('div', { class: 'vs', role: 'slider', tabindex: 0, 'aria-label': label, 'aria-valuemin': min, 'aria-valuemax': max, 'aria-orientation': 'vertical' }, h('div', { class: 'vs-track' }, h('div', { class: 'vs-zero' }), fill), th);
  const paint = () => { const p = (value - min) / (max - min); th.style.bottom = `calc(${p * 100}% - 11px)`; const z = -min / (max - min); fill.style.bottom = Math.min(p, z) * 100 + '%'; fill.style.height = Math.abs(p - z) * 100 + '%'; el.setAttribute('aria-valuenow', value); };
  let disabled = false;
  const set = (v, emit) => { if (disabled) return; v = clamp(Math.round(v / step) * step, min, max); if (v !== value) { value = v; paint(); if (emit) onInput(v); } };
  const at = ev => { const r = el.getBoundingClientRect(); set(max - (ev.clientY - r.top - 8) / (r.height - 16) * (max - min), true); };
  el.addEventListener('pointerdown', e => { if (disabled) return; e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('act'); at(e); });
  el.addEventListener('pointermove', e => { if (!disabled && el.hasPointerCapture(e.pointerId)) at(e); });
  const end = () => el.classList.remove('act'); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', e => { if (disabled) return; const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]; if (d) { e.preventDefault(); set(value + d * step, true); } });
  paint();
  return { el, set: v => { const was = disabled; disabled = false; set(v, false); disabled = was; }, get: () => value, setDisabled: v => { disabled = !!v; el.setAttribute('aria-disabled', String(disabled)); el.tabIndex = disabled ? -1 : 0; el.classList.toggle('disabled', disabled); } };
}

