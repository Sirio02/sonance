import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIDB, installFakeLocalStorage } from './helpers/fake-idb.mjs';

/* Modalità di ripiego: la migrazione non è riuscita e tutto resta in localStorage (con il suo limite di spazio). */
let failMig = true;
const ls = installFakeLocalStorage({ limit: 30000 }), idb = installFakeIDB({ failOn: (n, op) => failMig && n === 'kv' && op === 'put' });
const St = await import('../js/store.js');
const L = await import('../js/library.js');
test('localStorage pieno: il ripristino non perde dati in silenzio, fallisce con un errore chiaro e torna indietro', async () => {
  assert.equal(await St.initStores(), 'ls'); failMig = false;
  L.lib.list = [{ id: 'a1', name: 'uno.mp3', size: 10, title: 'Uno', artist: 'Lazza' }]; L.lib.map = new Map([['a1', L.lib.list[0]]]);
  const lyr = 'verso di prova lungo\n'.repeat(190);
  const tracks = Array.from({ length: 60 }, (_, i) => ({ id: 'bk' + i, name: 'f' + i + '.mp3', size: 100 + i, title: 'B' + i, lrc: lyr }));
  await assert.rejects(() => L.restoreBackup({ v: 6, tracks, playlists: {}, covers: {}, plays: [], settings: {} }), /ripristino interrotto e annullato \(spazio insufficiente/);
  assert.equal(Object.keys(St.PEND).length, 0, 'nessun brano in attesa a metà');
  assert.ok(!ls.mem.has('pend') || Object.keys(JSON.parse(ls.mem.get('pend'))).length === 0);
});
