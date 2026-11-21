/* Scheda "Tu": statistiche, cronologia e impostazioni (audio, aspetto, dati, diagnostica). */
import { h, icon, $, bus, toast, fmtLong, dayLabel, getLog, debounce, shareOrDownload } from '../util.js';
import { S, saveS, getPlays, clearPlays } from '../store.js';
import { aggregate, perDay, streak } from '../stats.js';
import * as L from '../library.js';
import * as pl from '../player.js';
import * as eng from '../audio.js';
import { seg, vslider, ask, confirmSheet } from './kit.js';
import { thumb, avatar, openAlbum, openArtist } from './lists.js';
import { openDuplicates, countDuplicates } from './dups.js';
import { exportAll, pickM3U } from './m3uui.js';
import { applyPrefs, prefPanels } from './prefs.js';
import { FEATURES } from '../beta.js';

let sub = 'stats', period = '7', body, subSeg, plays = [], playsDirty = true, renderSeq = 0;
bus.on('plays', () => { playsDirty = true; if ($('#v-you') && !$('#v-you').hidden) render(); });

export function buildYou() {
  const v = $('#v-you');
  body = h('div', { class: 'sc you-body' });
  subSeg = seg([['stats', 'Statistiche'], ['hist', 'Cronologia'], ['set', 'Impostazioni']], sub, x => { sub = x; render(); });
  v.append(h('header', { class: 'vh' }, h('h1', {}, 'Tu')), h('div', { class: 'segwrap' }, subSeg), body);
  render(); // Il primo accesso mostra subito la sottoscheda selezionata, senza dover cambiare tab.
}
export const TABYOU = { render: () => render() };
async function render() {
  const seq = ++renderSeq, view = sub, top = body.scrollTop;
  if (playsDirty && (view === 'stats' || view === 'hist')) {
    body.textContent = '';
    body.append(h('div', { class: 'empty big', role: 'status' }, 'Caricamento ascolti…'));
    const fresh = await getPlays().catch(e => { console.warn('Lettura cronologia:', e); return []; });
    if (seq !== renderSeq || view !== sub) return;
    plays = fresh; playsDirty = false;
  }
  if (seq !== renderSeq) return;
  body.textContent = '';
  (view === 'stats' ? stats : view === 'hist' ? history : settings)();
  body.scrollTop = view === 'set' ? top : 0;
}

/* ---------- statistiche ---------- */
const panel = (title, ...kids) => h('section', { class: 'panel' }, title && h('h3', {}, title), ...kids);
function stats() {
  const days = period === 'all' ? 0 : +period, since = days ? Date.now() - days * 864e5 : 0;
  const who = p => { const t = L.byId(p.tid); return t ? (L.artistsOf(t).length ? L.artistsOf(t) : [p.artist || 'Artista sconosciuto']) : null; };
  const a = aggregate(plays, since, who);
  body.append(h('div', { class: 'segwrap tight' }, seg([['7', '7 giorni'], ['30', '30 giorni'], ['all', 'Sempre']], period, x => { period = x; render(); })));
  if (!plays.length) { body.append(h('div', { class: 'empty big' }, h('div', { class: 'em-ic', html: icon('you', { size: 44 }) }), h('b', {}, 'Ancora nessun ascolto'), h('p', {}, 'Un brano viene conteggiato dopo 30 secondi di ascolto (o metà del brano, se è più corto).'))); return; }
  const k = (v, l) => h('div', { class: 'kpi' }, h('b', {}, v), h('small', {}, l));
  body.append(h('div', { class: 'kpis' }, k(a.count, 'ascolti'), k(fmtLong(a.ms / 1000) || '0 min', 'di musica'), k(a.distinct, 'brani diversi'), k(streak(plays) + ' g', 'giorni di fila')));
  const n = days === 0 ? 30 : Math.min(days, 30), pd = perDay(plays, n), mx = Math.max(1, ...pd.map(d => d.ms));
  body.append(panel('Minuti per giorno', h('div', { class: 'bars' }, pd.map(d => h('div', { class: 'bar', title: new Date(d.t).toLocaleDateString('it') + ': ' + Math.round(d.ms / 60000) + ' min' }, h('i', { style: { height: Math.max(3, d.ms / mx * 100) + '%' } }), n <= 7 && h('small', {}, new Date(d.t).toLocaleDateString('it', { weekday: 'narrow' })))))));
  const list = (title, items, mk) => items.length ? panel(title, ...items.map((x, i) => mk(x, i))) : null;
  const rank = (i, th, t1, t2, n, fn) => h('div', { class: 'row', onclick: fn }, h('span', { class: 'rk' }, i + 1), th, h('div', { class: 't' }, h('b', {}, t1), h('small', {}, t2)), h('small', { class: 'cnt' }, n + '×'));
  body.append(list('Brani più ascoltati', a.topTracks, (x, i) => { const t = L.byId(x.tid); return rank(i, t ? thumb(t) : h('div', { class: 'th' }), x.title, x.artist || 'Artista sconosciuto', x.n, () => t && pl.setQueue([t], 0)); }));
  body.append(list('Artisti preferiti', a.topArtists, (x, i) => rank(i, avatar(x.name), x.name, fmtLong(x.ms / 1000), x.n, () => L.findArtist(x.name) && openArtist(x.name))));
  body.append(list('Album più ascoltati', a.topAlbums, (x, i) => { const t = L.byId(x.tid); return rank(i, t ? thumb(t) : h('div', { class: 'th' }), x.name, x.artist, x.n, () => { const al = L.albums().find(r => r.name === x.name); al && openAlbum(al); }); }));
}

/* ---------- cronologia ---------- */
function history() {
  if (!plays.length) { body.append(h('div', { class: 'empty big' }, h('div', { class: 'em-ic', html: icon('clock', { size: 44 }) }), h('b', {}, 'La cronologia è vuota'), h('p', {}, 'Qui compariranno i brani che ascolti.'))); return; }
  let last = '';
  for (const p of [...plays].reverse().slice(0, 300)) {
    const d = dayLabel(p.at); if (d !== last) { body.append(h('h2', { class: 'sec' }, d)); last = d; }
    const t = L.byId(p.tid);
    body.append(h('div', { class: 'row' + (t ? '' : ' gone'), onclick: () => t && pl.setQueue([t], 0) }, t ? thumb(t) : h('div', { class: 'th' }), h('div', { class: 't' }, h('b', {}, p.title), h('small', {}, [p.artist, new Date(p.at).toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')))));
  }
  body.append(h('button', { class: 'btn danger-text wide', onclick: async () => { if (await confirmSheet('Cancellare la cronologia?', { ok: 'Cancella', detail: 'Le statistiche ripartiranno da zero. I conteggi per brano restano.' })) { await clearPlays(); playsDirty = true; render(); } } }, 'Cancella cronologia'));
}

/* ---------- impostazioni ---------- */
export const THEMES = {
  auto: ['Automatico', '#fbfaf7', '#14181d'], light: ['Chiaro', '#fbfaf7', '#16181c'], dark: ['Scuro', '#14181d', '#eef0f2'], oled: ['OLED', '#000', '#f2f2f2'],
  ocean: ['Oceano', '#0b1b2b', '#e6f1fb'], sunset: ['Tramonto', '#1f1320', '#fbeee6'], forest: ['Foresta', '#0f1d17', '#e8f3ec'],
  graphite: ['Grafite', '#26282b', '#eceef0'], notte: ['Viola notte', '#161226', '#ece6fb'], carta: ['Carta', '#f3ead8', '#2b2418'],
};
const ACC = ['', '#fb923c', '#f43f5e', '#a855f7', '#3b82f6', '#10b981', '#eab308'];
export function applyTheme() {
  const r = document.documentElement;
  S.th && S.th !== 'auto' ? r.dataset.theme = S.th : delete r.dataset.theme;
  S.ac ? r.style.setProperty('--acc', S.ac) : r.style.removeProperty('--acc');
  S.eco || S.mv === 'z' || matchMedia('(prefers-reduced-motion:reduce)').matches ? r.dataset.eco = '1' : delete r.dataset.eco;
  applyPrefs();
  const color = getComputedStyle(r).getPropertyValue('--bg').trim() || '#14181d';
  document.querySelectorAll('meta[name=theme-color]').forEach(m => { m.content = color; });
}

export const PRESETS = {
  Piatto: [0, 0, 0, 0, 0, 0], 'Bassi potenziati': [6, 5, 2, 0, 0, 0], 'Bassi ridotti': [-6, -5, -2, 0, 0, 0], 'Alti potenziati': [0, 0, 0, 2, 4, 6], 'Alti ridotti': [0, 0, 0, -2, -4, -6],
  Voce: [-2, -1, 2, 4, 3, 0], Loudness: [6, 3, 0, 0, 2, 4], Acustica: [4, 3, 2, 1, 3, 3], Classica: [3, 2, -1, -1, 2, 3], Dance: [6, 4, 1, 0, 3, 4],
  Elettronica: [5, 3, 0, 2, 3, 4], 'Hip-hop': [6, 4, 1, 2, 0, 2], Jazz: [3, 2, -1, 2, 3, 3], Pop: [-1, 2, 4, 2, 0, -1], Rock: [4, 3, -1, 0, 3, 4], 'Piccoli altoparlanti': [5, 3, 1, 0, -1, -2],
};
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function audioStatus() {
  const st = eng.status(), parts = [];
  if (S.eqOn) parts.push('equalizzatore attivo'); if (S.cf > 0) parts.push('dissolvenza ' + S.cf + ' s');
  if (!parts.length) return 'Audio nativo, nessun effetto attivo (consumo minimo).';
  if (st.error) return 'Effetti non disponibili: ' + st.error;
  if (!st.built) return 'Pronto: ' + parts.join(' e ') + '. Si attiva al primo Play.';
  return (st.state === 'running' ? 'In uso: ' : 'In attesa del tocco su Play: ') + parts.join(' e ') + '.';
}

function settings() {
  /* aspetto */
  const themes = h('div', { class: 'themes' }, Object.entries(THEMES).map(([k, [n, bg, fg]]) => h('button', { class: 'theme' + ((S.th || 'auto') === k ? ' on' : ''), onclick: e => { S.th = k; saveS(); applyTheme(); [...e.currentTarget.parentElement.children].forEach(c => c.classList.toggle('on', c === e.currentTarget)); } }, h('i', { style: { background: `linear-gradient(135deg,${bg} 50%,${fg} 50%)` } }), n)));
  const sw = h('div', { class: 'rowx' }, ACC.map(c => h('button', { class: 'sw' + ((S.ac || '') === c ? ' selected' : ''), style: { background: c || 'var(--acc)' }, 'aria-label': 'Colore ' + (c || 'predefinito'), onclick: e => { S.ac = c; saveS(); applyTheme(); [...e.currentTarget.parentElement.children].forEach(x => x.classList.toggle('selected', x === e.currentTarget)); } })));
  const G = { play: [], lib: [], look: [], data: [], adv: [] };      // gruppi delle Impostazioni, assemblati in ordine in fondo

  G.look.push(...prefPanels({ panel, toggle, applyTheme, themes, accents: sw }));
  /* spazio e backup */
  const stor = h('small', { class: 'status' }, 'Calcolo dello spazio…'), bk = h('small', { class: 'status' });
  const paintBk = () => { const n = S.lastBackup ? Math.floor((Date.now() - S.lastBackup) / 864e5) : -1; bk.textContent = n < 0 ? 'Non hai ancora salvato nessun backup.' : 'Ultimo backup: ' + (n === 0 ? 'oggi' : n === 1 ? 'ieri' : n + ' giorni fa') + '.'; };
  paintBk(); whileShown(bk, 'settings', paintBk);
  (async () => { try { const e = await navigator.storage.estimate(), p = await navigator.storage.persisted?.(); stor.textContent = `Spazio occupato: ${(e.usage / 1e6) | 0} MB (disponibili circa ${(e.quota / 1e6) | 0} MB). ` + (p ? 'La memoria dell\u2019app è protetta: il sistema non la cancella da solo.' : 'La memoria dell\u2019app non è protetta: se il dispositivo ha poco spazio il sistema potrebbe cancellarla. Fai ogni tanto un backup.'); } catch { stor.textContent = 'Informazioni sullo spazio non disponibili su questo dispositivo.'; } })();
  G.data.push(panel('Spazio e backup', stor, bk, h('small', { class: 'hint' }, 'Il backup salva l\u2019elenco dei brani, le playlist, i preferiti, la cronologia e le impostazioni, ma non i file musicali: quelli restano solo in questa app. Se la cancelli, dovrai importarli di nuovo dall\u2019app File.')));
  /* funzioni in prova */
  G.adv.push(panel('Funzioni in prova', toggle('Mostra le funzioni sperimentali', 'Sono ancora in sviluppo: possono avere difetti, cambiare o sparire.', !!S.beta, v => { S.beta = v ? 1 : 0; saveS(); bus.emit('beta'); }),
    h('small', { class: 'hint' }, 'Al momento: ' + FEATURES.map(f => f.label).join(', ') + '.')));

  /* audio */
  const status = h('small', { class: 'status' }, audioStatus()), refresh = () => { status.textContent = audioStatus(); };
  whileShown(status, 'audio-state', refresh);
  const cfv = h('b', { class: 'val' }, S.cf ? S.cf + ' s' : 'Disattivata');
  const cf = h('input', { type: 'range', class: 'range', min: 0, max: 12, step: 1, value: S.cf || 0, 'aria-label': 'Dissolvenza', oninput: e => { S.cf = +e.target.value; cfv.textContent = S.cf ? S.cf + ' s' : 'Disattivata'; cf.style.setProperty('--p', S.cf / 12 * 100 + '%'); }, onchange: () => { saveS(); eng.applyEffects(true); eng.wake(true); refresh(); } });
  cf.style.setProperty('--p', (S.cf || 0) / 12 * 100 + '%');
  const eqBox = h('div', { class: 'eqbox' + (S.eqOn ? '' : ' off') });
  const eqT = toggle('Equalizzatore', 'Regola bassi, medi e acuti a tuo gusto', !!S.eqOn, v => { S.eqOn = v ? 1 : 0; saveS(); syncEQEnabled(v); eng.applyEffects(true); eng.wake(true); refresh(); drawEQ(); });
  G.play.push(panel('Riproduzione',
    h('div', { class: 'lbl row-between' }, h('span', {}, 'Dissolvenza tra i brani'), cfv), cf,
    h('small', { class: 'hint' }, 'Il brano che finisce sfuma mentre quello nuovo parte. Se la imposti su «Disattivata», i brani si susseguono comunque senza pause.'),
    eqT, eqBox, status));

  /* equalizzatore */
  const curve = h('div', { class: 'eqcurve' });
  const sliders = BANDS_UI.map((lab, i) => {
    const v = h('small', { class: 'eq-value' }, S.eq[i] + ' dB');
    const s = vslider({ min: -12, max: 12, value: S.eq[i], label: lab, onInput: x => { S.eq[i] = x; v.textContent = x + ' dB'; saveS(); eng.applyEffects(); drawEQ(); markPreset(); pre.textContent = preamp(); } });
    return { s, v, node: h('div', { class: 'band' }, v, s.el, h('small', {}, lab)) };
  });
  const pre = h('small', { class: 'hint' }), preamp = () => { const p = eng.autoPreamp(); return p ? 'Livello ridotto automaticamente di ' + p + ' dB per evitare distorsioni.' : ''; }; pre.textContent = preamp();
  const chips = h('div', { class: 'chips' });
  const setGains = g => {
    if (!S.eqOn) return; // preset inerte: non accende mai l'equalizzatore di nascosto
    S.eq = [...g]; saveS();
    sliders.forEach((x, i) => { x.s.set(g[i]); x.v.textContent = g[i] + ' dB'; });
    eng.applyEffects(true); drawEQ(); markPreset(); pre.textContent = preamp(); refresh();
  };
  const syncEQEnabled = on => {
    eqBox.classList.toggle('off', !on);
    sliders.forEach(x => x.s.setDisabled(!on));
    chips.querySelectorAll('.chip').forEach(b => { b.disabled = !on; });
    eqBox.querySelectorAll('.eq-actions button').forEach(b => { b.disabled = !on; });
    eqT.querySelector('input').checked = !!on;
  };
  function markPreset() { for (const c of chips.children) c.classList.toggle('on', c._g && same(c._g, S.eq)); }
  const chip = (name, g, own) => {
    const c = h('button', { class: 'chip', disabled: !S.eqOn, onclick: () => setGains(g) }, name); c._g = g;
    if (own) c.setAttribute('aria-label', name + ', applica preset');
    return c;
  };
  for (const [n, g] of Object.entries(PRESETS)) chips.append(chip(n, g));
  for (const p of S.cp) {
    const wrap = h('div', { class: 'preset-own' });
    wrap.append(chip('★ ' + p.n, p.g, true),
      h('button', { class: 'btn icon sm preset-delete', 'aria-label': 'Elimina preset ' + p.n, title: 'Elimina preset', html: icon('trash', { size: 16 }), onclick: async () => {
        if (!await confirmSheet('Eliminare il preset «' + p.n + '»?', { ok: 'Elimina', detail: 'Questa azione non modifica i valori attuali dell’equalizzatore.' })) return;
        S.cp = S.cp.filter(x => x.n !== p.n); saveS(); render();
      } }));
    chips.append(wrap);
  }
  eqBox.append(curve, h('div', { class: 'bands' }, sliders.map(x => x.node)), pre, h('div', { class: 'chips-wrap' }, chips),
    h('div', { class: 'rowx eq-actions' }, h('button', { class: 'btn', onclick: () => ask('Salva preset', [['Nome del preset', '']], ([n]) => { if (!n) return; S.cp = S.cp.filter(p => p.n !== n); S.cp.push({ n, g: [...S.eq] }); saveS(); render(); toast('Preset «' + n + '» salvato'); }), html: icon('save', { size: 18 }) + '<span>Salva come preset</span>' }), h('button', { class: 'btn', onclick: () => setGains(PRESETS.Piatto) }, 'Azzera')),
    h('small', { class: 'hint' }, 'I preset con la stella (★) sono i tuoi: usa il cestino accanto per eliminarli.'));
  function drawEQ() {
    const g = S.eqOn ? S.eq : [0, 0, 0, 0, 0, 0], xs = g.map((_, i) => 25 + i * 50), ys = g.map(v => 40 - v / 12 * 32);
    let d = `M0 ${ys[0]}`; const pts = [[0, ys[0]], ...xs.map((x, i) => [x, ys[i]]), [300, ys[5]]];
    d = `M${pts[0][0]} ${pts[0][1]}`; for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2; d += ` C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`; }
    curve.innerHTML = `<svg viewBox="0 0 300 80" preserveAspectRatio="none"><line x1="0" x2="300" y1="40" y2="40" class="zero"/><path d="${d} L300 80 L0 80Z" class="fill"/><path d="${d}" class="line"/></svg>`;
  }
  drawEQ(); markPreset(); syncEQEnabled(!!S.eqOn);

  /* libreria */
  const enrichSt = h('small', { class: 'hint' });
  const upd = () => { enrichSt.textContent = L.enrichState.running ? `Ricerca in corso… ${L.enrichState.left} brani in attesa` : (L.enrichState.lastError || ''); };
  whileShown(enrichSt, 'enrich', upd); upd();
  G.lib.push(panel('Copertine e testi',
    toggle('Cerca copertine e testi su internet', 'Quando importi nuovi brani, l\u2019app li cerca da sola, con qualche pausa per non appesantire i servizi', S.auto !== 0, v => { S.auto = v ? 1 : 0; saveS(); }),
    h('button', { class: 'btn wide', onclick: () => { if (!navigator.onLine) return toast('Sei offline: collegati a internet e riprova'); L.lib.list.forEach(t => { t.nc = 0; t.nl = 0; }); L.enrichQueue(L.lib.list, true); toast('Ricerca avviata per ' + L.lib.list.length + ' brani'); } }, 'Cerca di nuovo per tutti i brani'), enrichSt,
    h('small', { class: 'hint' }, 'Utile se hai cambiato titoli o artisti, o se prima non avevi connessione.')),
  panel('Gestione libreria',
    toggle('Pronta a ripartire dopo una pausa', 'Per 10 minuti dopo uno stop l\u2019app resta pronta, così il Play dai controlli del telefono o delle cuffie funziona sempre. Consuma un po\u2019 più batteria.', S.keep !== 0, v => { S.keep = v ? 1 : 0; saveS(); }),
    h('button', { class: 'btn wide', onclick: () => { const n = countDuplicates(); n ? openDuplicates() : toast('Nessun brano duplicato'); } }, 'Cerca brani duplicati')));

  /* dati */
  const info = h('pre', { class: 'info' });
  G.data.push(panel('Salva e ripristina',
    h('button', { class: 'btn wide', onclick: doExport }, 'Salva un backup'),
    h('label', { class: 'btn wide', for: 'bi' }, 'Ripristina da un backup'),
    h('input', { id: 'bi', type: 'file', accept: '.json,application/json', hidden: true, onchange: doImport }),
    h('small', { class: 'hint' }, 'Il backup è un file che puoi conservare in iCloud Drive o inviare a te stesso.'),
    h('button', { class: 'btn wide', onclick: exportAll }, 'Esporta le playlist per altre app'),
    h('button', { class: 'btn wide', onclick: pickM3U }, 'Importa una playlist da un file'),
    h('small', { class: 'hint' }, 'Le playlist si scambiano con altri lettori musicali tramite file .m3u.')));

  /* diagnostica */
  const diag = h('div', { class: 'diag' }), logEl = h('pre', { class: 'info' }, getLog());
  const off = bus.on('log', debounce(() => { logEl.isConnected ? logEl.textContent = getLog() : off(); }, 300));
  G.adv.push(h('details', { class: 'panel' }, h('summary', {}, 'Assistenza e informazioni tecniche'), h('small', { class: 'hint' }, 'Servono solo se qualcosa non funziona o se devi segnalare un problema: controllano i servizi online e mostrano il registro degli eventi.'),
    h('button', { class: 'btn wide', onclick: async e => { const btn = e.currentTarget; btn.disabled = true; diag.textContent = 'Test in corso…'; const r = await L.online.diagnose(); diag.textContent = ''; r.forEach(x => diag.append(h('div', { class: 'dg ' + (x.ok ? 'ok' : 'ko') }, h('b', {}, (x.ok ? '✓ ' : '✗ ') + x.name), h('small', {}, x.ok ? x.ms + ' ms' : x.msg)))); btn.disabled = false; } }, 'Verifica connessione ai servizi'),
    h('button', { class: 'btn wide', onclick: async () => { try { await navigator.clipboard.writeText(getLog() + '\n' + info.textContent); toast('Registro copiato'); } catch { toast('Copia non riuscita: seleziona il testo a mano'); } } }, 'Copia il registro negli appunti'),
    diag, info, logEl));
  const group = (title, desc, nodes) => { if (!nodes.length) return; body.append(h('h2', { class: 'sec' }, title)); if (desc) body.append(h('p', { class: 'hint sec-d' }, desc)); body.append(...nodes); };
  group('Riproduzione', 'Dissolvenza tra i brani ed equalizzatore.', G.play);
  group('Libreria', 'Copertine, testi e ordine della tua musica.', G.lib);
  group('Aspetto', 'Colori, dimensioni e animazioni dell\u2019app.', G.look);
  group('Backup e dati', 'Metti al sicuro la tua libreria.', G.data);
  group('Avanzate', null, G.adv);
  storageInfo(info);
}
/** Aggiorna un elemento a un evento finché l'elemento è nella pagina; poi smette (le Impostazioni vengono ricostruite spesso: niente ascoltatori accumulati). */
function whileShown(el, ev, fn) { const off = bus.on(ev, (...a) => { if (el.isConnected) fn(...a); else off(); }); }
const BANDS_UI = ['60 Hz', '150 Hz', '400 Hz', '1 kHz', '2,4 kHz', '15 kHz'];

function toggle(label, hint, on, fn, disabled = false) {
  const i = h('input', { type: 'checkbox', class: 'sw-in', checked: on || null, disabled: disabled || null, onchange: e => fn(e.target.checked) });
  return h('label', { class: 'tg' }, h('span', { class: 'tg-t' }, h('b', {}, label), hint && h('small', {}, hint)), i, h('span', { class: 'tg-s' }));
}
async function storageInfo(el) {
  const s = navigator.storage; let x = '';
  try { if (s?.estimate) { const e = await s.estimate(); x += `Spazio: ${(e.usage / 1e6) | 0} MB usati su ~${(e.quota / 1e6) | 0} MB\n`; } if (s?.persisted) x += 'Archivio persistente: ' + await s.persisted() + '\n'; } catch { /* ok */ }
  x += 'Installata: ' + (navigator.standalone === true || matchMedia('(display-mode:standalone)').matches) + '\nAudioSession: ' + (navigator.audioSession ? navigator.audioSession.type : 'non disponibile') + '\nWeb Audio: ' + eng.status().supported + '\n' + navigator.userAgent;
  el.textContent = x;
}
async function doExport() { try { await shareOrDownload(await L.exportBackup()); } catch (e) { toast('Esportazione non riuscita: ' + e.message); } }
async function doImport(e) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const r = await L.restoreBackup(JSON.parse(await f.text())); toast(`Backup importato: ${r.hit} brani ripristinati` + (r.wait ? `, ${r.wait} in attesa dei file audio` : '') + (r.dropped ? `, ${r.dropped} voci non valide ignorate` : ''), { ms: 4500 }); playsDirty = true; render(); }
  catch (x) { toast('Backup non valido: ' + x.message); }
}
bus.on('settings', () => { applyTheme(); });
