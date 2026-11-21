/* Decisioni pure sul ciclo di vita della riproduzione (testate in Node con sequenze di eventi simulate).
   Il codice con effetti collaterali (audio, DOM) resta in player.js/main.js e si limita a chiamare queste funzioni. */

/** Il ripristino della sessione parte solo se l'utente non ha già avviato qualcosa (coda non vuota o brano già caricato). */
export const shouldRestore = ({ queueLen = 0, loads = 0 } = {}) => queueLen === 0 && loads === 0;

/** Posizione da salvare: in pausa "tenuta" vale quella congelata; mai valori non finiti o negativi. */
export function positionToSave({ held = false, heldPos = 0, currentTime = 0, duration = 0 } = {}) {
  let p = held ? heldPos : currentTime;
  if (!Number.isFinite(p) || p < 0) p = 0;
  if (Number.isFinite(duration) && duration > 0 && p > duration) p = duration;
  return p;
}

/** Aggiornamento dell'app: con la musica in riproduzione si rimanda alla prossima pausa; fermi si applica subito. */
export const updateAction = ({ playing = false } = {}) => (playing ? 'defer' : 'apply');

/** Dopo il cambio di service worker: ricarica solo se c'era già un controller (non alla prima installazione) e non si sta riproducendo. */
export function reloadAction({ hadController = false, playing = false, alreadyReloaded = false } = {}) {
  if (!hadController || alreadyReloaded) return 'none';
  return playing ? 'wait' : 'reload';
}

/** Un evento `pause` del sistema (chiamata, Siri, altra app) mentre la UI credeva di suonare: lo stato mostrato deve seguire l'audio. */
export const uiShouldShowPlaying = ({ paused = true, held = false } = {}) => !paused && !held;

/** Posizione al ritorno in primo piano: non si riporta mai indietro né avanti oltre ciò che l'audio dichiara. */
export const resumePosition = ({ saved = 0, current = 0, duration = 0 } = {}) => {
  const c = Number.isFinite(current) && current > 0 ? current : 0;
  const s = Number.isFinite(saved) && saved > 0 ? saved : 0;
  const p = c || s;       // se l'elemento audio ha una posizione reale vince lei (è ciò che si sente), altrimenti quella salvata
  return Number.isFinite(duration) && duration > 0 ? Math.min(p, duration) : p;
};
