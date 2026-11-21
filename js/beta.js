/* Registro delle funzioni beta («Sperimentale»). A flag spento (S.beta = 0) nessun modulo viene caricato né eseguito.
   Aggiungere una funzione = una riga in FEATURES + un modulo con init(ctx) e destroy() in js/beta/ (e il file in SHELL di sw.js).
   ctx (fornito da main.js): { addTab({id,label,iconHtml,after,build}), removeTab(id), toast, log }. */
import { S } from './store.js';
import { log } from './util.js';

export const FEATURES = [
  { id: 'youtube', label: 'Scheda YouTube', description: 'Cerca nel catalogo YouTube e apri i risultati su YouTube.', load: () => import('./beta/yt-tab.js') },
];
const live = new Map();
let chain = Promise.resolve();

async function run(ctx) {
  if (S.beta) {
    for (const f of FEATURES) {
      if (live.has(f.id)) continue;
      try { const m = await f.load(); await m.init(ctx); live.set(f.id, m); }
      catch (e) { log('Beta «' + f.id + '»: ' + e.message); ctx.fail?.(f, e); }
    }
  } else {
    for (const [id, m] of [...live]) { try { await m.destroy?.(ctx); } catch (e) { log('Beta «' + id + '» (chiusura): ' + e.message); } live.delete(id); }
  }
}
/** Porta lo stato delle funzioni beta in linea con S.beta. Le chiamate vengono messe in fila (nessuna corsa fra attiva/disattiva). */
export const sync = ctx => (chain = chain.then(() => run(ctx)).catch(() => {}));
export const active = () => [...live.keys()];
