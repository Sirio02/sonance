import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIDB, installFakeLocalStorage } from './helpers/fake-idb.mjs';

let fail = (n, op) => n === 'pend' && op === 'put';                       // guasto durante la copia dei brani in attesa
const ls = installFakeLocalStorage(), idb = installFakeIDB({ failOn: (...a) => fail?.(...a) });
const initial = { pl: JSON.stringify({ Mix: ['a'] }), plc: JSON.stringify({}), pend: JSON.stringify({ 'x.mp3|10': { title: 'X', pls: [] } }) };
for (const [k, v] of Object.entries(initial)) ls.mem.set(k, v);
const St = await import('../js/store.js');

test('migrazione fallita: si torna da soli al comportamento precedente e non si perde nulla', async () => {
  assert.equal(await St.initStores(), 'ls'); assert.equal(St.storageMode(), 'ls');
  for (const [k, v] of Object.entries(initial)) assert.equal(ls.mem.get(k), v, k + ' intatto in localStorage');
  assert.equal(idb.rows('playlists').length, 0); assert.equal(idb.rows('pend').length, 0);
  assert.ok(!idb.rows('kv').some(([k]) => k === 'migrated:v1'), 'nessun segno di migrazione riuscita');
  St.PL.Altra = ['q']; assert.equal(St.savePL(), true);
  assert.deepEqual(JSON.parse(ls.mem.get('pl')).Altra, ['q'], 'in modalità di ripiego le playlist si salvano ancora in localStorage');
});
test('al riavvio successivo la migrazione viene ritentata e riesce', async () => {
  fail = null;
  assert.equal(await St.initStores(), 'idb');
  assert.equal(idb.rows('playlists').length, 2); assert.equal(ls.mem.has('pl'), false);
});
