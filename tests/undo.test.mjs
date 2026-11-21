import test from 'node:test';
import assert from 'node:assert/strict';
const mem = new Map(), db = { tracks: new Map(), blobs: new Map(), plays: [] };
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const store = n => ({
  put: (v, k) => { if (n === 'tracks') db.tracks.set(v.id, v); else db.blobs.set(k, v); return {}; }, add: v => { db.plays.push(v); return {}; },
  getAll: () => ({ result: n === 'tracks' ? [...db.tracks.values()] : db.plays }), get: k => ({ result: db.blobs.get(k) }), count: k => ({ result: db.blobs.has(k) ? 1 : 0 }),
  delete: k => { if (n === 'tracks') db.tracks.delete(k); else db.blobs.delete(k); return {}; },
});
const fakeDb = { objectStoreNames: { contains: () => true }, transaction: () => { const t = { objectStore: store }; setTimeout(() => t.oncomplete?.(), 0); return t; } };
globalThis.indexedDB = { open: () => { const r = {}; setTimeout(() => { r.result = fakeDb; r.onsuccess(); }, 0); return r; } };
const L = await import('../js/library.js');
const { PL } = await import('../js/store.js');
const mk = i => ({ id: 'id' + i, name: i + '.mp3', size: i, title: 'T' + i, artist: 'A', album: '', dur: 100, fav: i === 1 ? 1 : 0, pc: 4 });
const setup = () => { const l = [1, 2, 3].map(mk); L.lib.list = l; L.lib.map = new Map(l.map(t => [t.id, t])); db.tracks.clear(); db.blobs.clear(); for (const t of l) { db.tracks.set(t.id, t); db.blobs.set(t.id, new Blob(['x'])); } for (const k of Object.keys(PL)) delete PL[k]; PL.Mix = ['id1', 'id2', 'id3']; return l; };
const wait = ms => new Promise(r => setTimeout(r, ms));

test('annulla eliminazione: il brano torna con preferiti, ascolti, playlist e file intatti', async () => {
  const [a] = setup(); const undo = L.softRemove([a], 50);
  assert.equal(L.byId('id1'), undefined); assert.ok(!L.lib.list.includes(a));          // sparito subito dall'interfaccia
  assert.ok(db.blobs.has('id1'), 'il file non è ancora stato cancellato'); assert.deepEqual(PL.Mix, ['id1', 'id2', 'id3']);
  assert.equal(undo(), true); await wait(120);
  assert.equal(L.byId('id1'), a); assert.equal(a.fav, 1); assert.equal(a.pc, 4); assert.ok(db.blobs.has('id1')); assert.ok(db.tracks.has('id1'));
});
test('senza annullare: allo scadere il brano viene eliminato davvero (archivio e playlist)', async () => {
  const [a] = setup(); L.softRemove([a], 20); await wait(150);
  assert.ok(!db.blobs.has('id1')); assert.ok(!db.tracks.has('id1')); assert.deepEqual(PL.Mix, ['id2', 'id3']); assert.equal(L.pendingDeletes(), 0);
});
test('eliminazione multipla annullabile; flush alla chiusura conferma subito', async () => {
  const [a, b, c] = setup(); const undo = L.softRemove([a, b], 5000); assert.equal(L.lib.list.length, 1); assert.equal(L.pendingDeletes(), 2);
  assert.equal(undo(), true); assert.equal(L.lib.list.length, 3);
  L.softRemove([c], 5000); await L.flushPendingDeletes(); assert.ok(!db.tracks.has('id3')); assert.equal(L.pendingDeletes(), 0);
});
test('annullare dopo la scadenza non ripristina nulla e lo dichiara', async () => {
  const [a] = setup(); const undo = L.softRemove([a], 10); await wait(120); assert.equal(undo(), false); assert.equal(L.byId('id1'), undefined);
});
test('playlist: rimuovere e annullare rimette i brani nella posizione originale', () => {
  setup(); const undo = L.plRemoveUndoable('Mix', ['id1', 'id3']);
  assert.deepEqual(PL.Mix, ['id2']); undo(); assert.deepEqual(PL.Mix, ['id1', 'id2', 'id3']);
});
