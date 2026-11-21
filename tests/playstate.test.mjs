import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRestore, positionToSave, updateAction, reloadAction, uiShouldShowPlaying, resumePosition } from '../js/playstate.js';

test('ripristino: parte solo a freddo; se l\'utente ha già avviato un brano o c\'è una coda, non sovrascrive', () => {
  assert.equal(shouldRestore({ queueLen: 0, loads: 0 }), true);
  assert.equal(shouldRestore({ queueLen: 3, loads: 0 }), false);
  assert.equal(shouldRestore({ queueLen: 0, loads: 1 }), false);
});
test('posizione salvata: in pausa tenuta vale quella congelata; valori strani non finiscono nell\'archivio', () => {
  assert.equal(positionToSave({ held: true, heldPos: 42.5, currentTime: 0 }), 42.5);       // l'elemento è sul silenzio: currentTime sarebbe sbagliato
  assert.equal(positionToSave({ held: false, currentTime: 17 }), 17);
  for (const bad of [NaN, -3, Infinity]) assert.equal(positionToSave({ currentTime: bad }), 0, String(bad));
  assert.equal(positionToSave({ currentTime: 500, duration: 200 }), 200);
});
test('aggiornamento app: con la musica in play si rimanda, in pausa si applica', () => {
  assert.equal(updateAction({ playing: true }), 'defer'); assert.equal(updateAction({ playing: false }), 'apply');
});
test('ricaricamento dopo cambio SW: mai alla prima installazione, mai durante la riproduzione, una sola volta', () => {
  assert.equal(reloadAction({ hadController: false, playing: false }), 'none');
  assert.equal(reloadAction({ hadController: true, playing: true }), 'wait');
  assert.equal(reloadAction({ hadController: true, playing: false }), 'reload');
  assert.equal(reloadAction({ hadController: true, playing: false, alreadyReloaded: true }), 'none');
});
test('sequenza: update accettato in play → attesa → pausa → applicato una volta sola', () => {
  const log = []; let waiting = false, playing = true;
  const onState = () => { if (!playing && waiting) { waiting = false; log.push('apply'); } };
  if (updateAction({ playing }) === 'defer') waiting = true;
  onState(); playing = true; onState();         // ancora in play: niente
  playing = false; onState(); onState();         // pausa: una sola applicazione
  assert.deepEqual(log, ['apply']);
});
test('interruzione di sistema: la UI segue lo stato reale dell\'audio', () => {
  assert.equal(uiShouldShowPlaying({ paused: true, held: false }), false);
  assert.equal(uiShouldShowPlaying({ paused: false, held: true }), false);       // sessione tenuta = pausa
  assert.equal(uiShouldShowPlaying({ paused: false, held: false }), true);
});
test('ritorno in primo piano: vince la posizione reale dell\'audio, mai oltre la durata', () => {
  assert.equal(resumePosition({ saved: 30, current: 31.2, duration: 200 }), 31.2);
  assert.equal(resumePosition({ saved: 30, current: 0, duration: 200 }), 30);
  assert.equal(resumePosition({ saved: 300, current: 0, duration: 200 }), 200);
  assert.equal(resumePosition({ saved: NaN, current: NaN }), 0);
});
