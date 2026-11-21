/* Preferenze di aspetto e avvio: applicazione (variabili CSS / attributi su <html>) e pannelli delle Impostazioni. */
import { h, toast, bus } from '../util.js';
import { S, saveS } from '../store.js';
import { seg } from './kit.js';
import { onAccent, parseHex } from '../color.js';

export const DEFAULTS = { dens: 'n', cr: 'r', cc: 1, mv: 'n', start: 'lib', ly: { sz: 1, al: 'c', bl: 1 } };
const DENS = { c: '2px 8px', n: '6px 8px', w: '11px 10px' }, RAD = { s: '0px', r: '10px', x: '20px' }, LYS = ['19px', '24px', '30px'];
export const ly = () => ({ ...DEFAULTS.ly, ...(S.ly || {}) });

/** Applica le preferenze (richiamata da applyTheme). */
export function applyPrefs() {
  const r = document.documentElement, st = r.style;
  st.setProperty('--row-pad', DENS[S.dens] || DENS.n);
  st.setProperty('--cover-r', RAD[S.cr] || RAD.r);
  st.setProperty('--ly-size', LYS[ly().sz] || LYS[1]);
  st.setProperty('--ly-align', ly().al === 'l' ? 'left' : 'center');
  r.dataset.lyblur = ly().bl ? '1' : '0';
  if (S.cc === 0) r.dataset.nocc = '1'; else delete r.dataset.nocc;
  S.mv === 'r' ? r.dataset.mv = 'r' : delete r.dataset.mv;
  st.setProperty('--on-acc', S.ac && parseHex(S.ac) ? onAccent(S.ac) : '#fff');   // testo leggibile sull'accento scelto
}
/** «Animazioni: Nessuna» equivale al Risparmio energia (stesso attributo data-eco, nessuna logica duplicata). */

const set = (k, v) => { S[k] = v; saveS(); bus.emit('prefs'); };
export function resetAppearance() {
  for (const k of ['th', 'ac', 'dens', 'cr', 'cc', 'mv', 'ly', 'start', 'eco']) delete S[k];
  saveS(); bus.emit('settings');
}

/** Pannelli del gruppo «Aspetto». `themes` e `accents` (griglie di scelta) arrivano da you.js. */
export function prefPanels({ panel, toggle, applyTheme, themes, accents }) {
  const re = () => { applyTheme(); };
  const color = h('input', { type: 'color', class: 'colorpick', value: S.ac && parseHex(S.ac) && S.ac.length === 7 ? S.ac : '#c2410c', 'aria-label': 'Scegli un colore tuo', oninput: e => { S.ac = e.target.value; saveS(); re(); } });
  const lyv = (k, v) => { S.ly = { ...ly(), [k]: v }; saveS(); re(); };
  const motion = S.eco ? 'z' : (S.mv || 'n');                         // «Minime» = Risparmio energia (un solo controllo, nessuna logica doppia)
  const setMotion = v => { S.eco = v === 'z' ? 1 : 0; v === 'r' ? S.mv = 'r' : delete S.mv; saveS(); bus.emit('prefs'); re(); };
  return [
    panel('Tema e colori', h('div', { class: 'lbl' }, 'Tema'), themes, h('div', { class: 'lbl' }, 'Colore principale'), accents,
      h('div', { class: 'lbl' }, 'Oppure scegline uno a piacere'), h('div', { class: 'rowx' }, color, h('small', { class: 'hint' }, 'Il testo sui pulsanti resta sempre leggibile.'))),
    panel('Elenchi e copertine', h('div', { class: 'lbl' }, 'Spazio tra le righe'), seg([['c', 'Compatto'], ['n', 'Normale'], ['w', 'Ampio']], S.dens || 'n', v => { set('dens', v); re(); }),
      h('div', { class: 'lbl' }, 'Forma delle copertine'), seg([['s', 'Quadrate'], ['r', 'Arrotondate'], ['x', 'Molto tonde']], S.cr || 'r', v => { set('cr', v); re(); })),
    panel('Schermata del player', toggle('Sfondo dai colori della copertina', 'Il player prende le tinte dell\u2019immagine del brano', S.cc !== 0, v => { set('cc', v ? 1 : 0); re(); }),
      h('div', { class: 'lbl' }, 'Dimensione del testo del brano'), seg([['0', 'Piccola'], ['1', 'Media'], ['2', 'Grande']], String(ly().sz), v => lyv('sz', +v)),
      h('div', { class: 'lbl' }, 'Posizione del testo'), seg([['l', 'A sinistra'], ['c', 'Al centro']], ly().al, v => lyv('al', v)),
      toggle('Sfuma le altre righe', 'Mette in risalto la riga che sta cantando', !!ly().bl, v => lyv('bl', v ? 1 : 0))),
    panel('Animazioni', seg([['n', 'Complete'], ['r', 'Ridotte'], ['z', 'Minime']], motion, setMotion),
      h('small', { class: 'hint' }, '«Minime» toglie quasi tutti i movimenti e aggiorna meno spesso lo schermo: risparmia batteria. Se hai attivato «Riduci movimento» nel sistema, l\u2019app lo rispetta.')),
    panel('Quando apri l\u2019app', h('div', { class: 'lbl' }, 'Mostra'), seg([['lib', 'La Libreria'], ['last', 'L\u2019ultima scheda usata']], S.start || 'lib', v => set('start', v))),
    h('button', { class: 'btn wide', onclick: () => { resetAppearance(); toast('Aspetto riportato alle impostazioni iniziali'); } }, 'Ripristina l\u2019aspetto predefinito'),
  ];
}
