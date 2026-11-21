import test from 'node:test';
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
globalThis.indexedDB = { open: () => ({}) };
const L = await import('../js/library.js');
const mk = (title, extra = {}) => ({ id: title, name: title + '.mp3', size: 1, title, artist: 'A', album: '', ...extra });
const set = l => { L.lib.list = l; L.lib.map = new Map(l.map(t => [t.id, t])); L.touchData(); };

test('ordinamento A→Z: italiano, senza distinguere maiuscole, accenti ordinati con la lettera base, numeri in ordine numerico', () => {
  set(['Zeta', 'città', 'Album 10', 'Album 2', 'album', 'Èco', 'eco', 'Città 3', 'Ápice', 'Bar'].map(t => mk(t)));
  assert.deepEqual(L.search('', { sort: 'az' }).map(t => t.title), ['album', 'Album 2', 'Album 10', 'Ápice', 'Bar', 'città', 'Città 3', 'eco', 'Èco', 'Zeta']);
});
test('ordinamento per artista: artista+album, poi numero di traccia', () => {
  set([mk('b', { artist: 'Zed', trk: 1 }), mk('a2', { artist: 'Alfa', album: 'X', trk: 2 }), mk('a1', { artist: 'Alfa', album: 'X', trk: 1 }), mk('c', { artist: 'élan' })]);
  assert.deepEqual(L.search('', { sort: 'artist' }).map(t => t.title), ['a1', 'a2', 'c', 'b']);
});
test('album: tracce nell\'ordine del disco; elenco album in ordine alfabetico', () => {
  set([mk('t3', { album: 'Beta', trk: 3 }), mk('t1', { album: 'Beta', trk: 1 }), mk('x', { album: 'Alfa', trk: 1 }), mk('t2', { album: 'Beta', trk: 2 })]);
  const al = L.albums(); assert.deepEqual(al.map(a => a.name), ['Alfa', 'Beta']); assert.deepEqual(al[1].tracks.map(t => t.title), ['t1', 't2', 't3']);
});
