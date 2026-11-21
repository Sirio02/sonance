import test from 'node:test';
import assert from 'node:assert/strict';

/* La libreria usa localStorage/IndexedDB: per i test basta uno stub (non si toccano mai i dati reali). */
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
globalThis.indexedDB = { open: () => ({}) };
const L = await import('../js/library.js');
const { bus } = await import('../js/util.js');

const T = (id, o) => ({ id, title: 'T' + id, artist: '', album: '', dur: 100, ...o });
const reset = list => { L.lib.list = list; L.lib.map = new Map(list.map(t => [t.id, t])); L.touchData(); };

test('F: album recuperato online → Album e Artisti si aggiornano subito (prima la cache restava vecchia fino al riavvio)', () => {
  const t = T('1', { artist: 'Lazza' }); reset([t]);
  assert.equal(L.albums()[0].name, 'Album sconosciuto');
  const events = []; const off = bus.on('data', e => events.push(e));
  t.album = 'Sinfonia'; L.metaChanged();                            // è ciò che enrichOne chiama quando cambia album/artista
  off();
  assert.equal(L.albums()[0].name, 'Sinfonia');
  assert.equal(events.length, 1); assert.equal(events[0].soft, true);   // le viste vengono avvisate (in modo "soft")
});
test('F: senza metaChanged la vecchia cache sarebbe rimasta (documenta la causa)', () => {
  const t = T('1', { artist: 'Lazza' }); reset([t]); L.albums();
  t.album = 'X'; assert.equal(L.albums()[0].name, 'Album sconosciuto');    // memo legato a lib.ver
  L.metaChanged(); assert.equal(L.albums()[0].name, 'X');
});
test('H: un brano con due artisti compare sotto entrambi, una sola traccia; nomi composti intatti', () => {
  const a = T('1', { artist: 'Dolcenera Lazza', title: 'Porto Cervo', am: ['Dolcenera', 'Lazza'], av: 1 });
  const b = T('2', { artist: 'Pinguini Tattici Nucleari', title: 'Ricordi' });
  const c = T('3', { artist: 'Lazza feat. Dolcenera', title: 'Altro' });
  reset([a, b, c]);
  const by = n => L.findArtist(n).tracks.map(t => t.id).sort();
  assert.deepEqual(by('Dolcenera'), ['1', '3']); assert.deepEqual(by('Lazza'), ['1', '3']);
  assert.deepEqual(by('Pinguini Tattici Nucleari'), ['2']);
  assert.equal(L.lib.list.length, 3);                               // nessun brano duplicato
  assert.equal(L.findArtist('lazza').tracks[0] === a || L.findArtist('lazza').tracks[1] === a, true);
});
test('H: album con artista dell\'album (aa) raggruppa le tracce di artisti diversi', () => {
  reset([T('1', { artist: 'A', album: 'Raccolta', aa: 'Vari' }), T('2', { artist: 'B', album: 'Raccolta', aa: 'Vari' })]);
  assert.equal(L.albums().length, 1); assert.equal(L.albums()[0].artist, 'Vari');
});
test('backup: i campi artisti e le versioni delle ricerche vengono salvati/ripristinati', () => {
  for (const k of ['am', 'af', 'aa', 'av', 'nlv', 'ncv']) assert.ok(L.META.includes(k), k);
});
