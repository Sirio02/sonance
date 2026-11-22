import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIDB, installFakeLocalStorage } from './helpers/fake-idb.mjs';

/* Su iOS una scrittura può riuscire "sulla carta" e non esserlo davvero: la migrazione rilegge e confronta prima di liberare localStorage. */
const ls = installFakeLocalStorage(), idb = installFakeIDB({ corrupt: (n, v) => (n === 'playlists' ? { ...v, ids: [] } : v) });
ls.mem.set('pl', JSON.stringify({ Mix: ['a', 'b'] }));
const St = await import('../js/store.js');
test('scrittura silenziosamente errata: la verifica la rileva, localStorage resta intatto e si annulla tutto', async () => {
  assert.equal(await St.initStores(), 'ls');
  assert.deepEqual(JSON.parse(ls.mem.get('pl')), { Mix: ['a', 'b'] });
  assert.deepEqual(St.PL.Mix, ['a', 'b']);
  assert.equal(idb.rows('playlists').length, 0); assert.ok(!idb.rows('kv').some(([k]) => k === 'migrated:v1'));
});
