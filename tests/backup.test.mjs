import test from 'node:test';
import assert from 'node:assert/strict';

/* Archivio in memoria al posto di IndexedDB (i dati reali non vengono mai toccati). */
const mem = new Map(), db = { tracks: new Map(), blobs: new Map(), plays: [] };
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const store = n => ({
  put: (v, k) => { if (n === 'tracks') db.tracks.set(v.id, v); else db.blobs.set(k, v); return {}; }, add: v => { db.plays.push(v); return {}; },
  getAll: () => ({ result: n === 'tracks' ? [...db.tracks.values()] : db.plays }), get: k => ({ result: db.blobs.get(k) }), count: k => ({ result: db.blobs.has(k) ? 1 : 0 }), delete: () => ({}),
});
const fakeDb = { objectStoreNames: { contains: () => true }, transaction: () => { const t = { objectStore: store }; setTimeout(() => t.oncomplete?.(), 0); return t; } };
globalThis.indexedDB = { open: () => { const r = {}; setTimeout(() => { r.result = fakeDb; r.onsuccess(); }, 0); return r; } };
const L = await import('../js/library.js');
const { PEND, PL } = await import('../js/store.js');

const have = { id: 'a1', name: 'uno.mp3', size: 10, title: 'Uno', artist: 'Lazza', album: '', dur: 100 };
const setup = () => { L.lib.list = [{ ...have }]; L.lib.map = new Map([[have.id, L.lib.list[0]]]); L.touchData(); for (const k of Object.keys(PEND)) delete PEND[k]; for (const k of Object.keys(PL)) delete PL[k]; };

test('backup: un backup VECCHIO (senza am/af/aa/av/nlv/ncv) si ripristina senza errori', async () => {
  setup();
  const old = { v: 2, tracks: [{ id: 'x1', name: 'uno.mp3', size: 10, title: 'Uno (rev)', artist: 'Lazza', fav: 1, p: 3 }, { id: 'x2', name: 'due.mp3', size: 20, title: 'Due', artist: 'Altro' }], playlists: { Mix: ['x1', 'x2'] } };
  const r = await L.restoreBackup(old);
  assert.equal(r.hit, 1); assert.equal(r.wait, 1);
  const t = L.lib.list[0]; assert.equal(t.fav, 1); assert.equal(t.title, 'Uno (rev)'); assert.equal(t.am, undefined);
  assert.deepEqual(PL.Mix, ['a1']); assert.equal(Object.values(PEND)[0].pls[0], 'Mix');             // il brano mancante resta in attesa, con la sua playlist
});
test('backup: i campi recenti (am, af, aa, av, nlv, ncv) vengono ripristinati', async () => {
  setup();
  const nu = { v: 4, tracks: [{ id: 'x1', name: 'uno.mp3', size: 10, title: 'Uno', artist: 'Dolcenera Lazza', am: ['Dolcenera', 'Lazza'], af: [], aa: 'Lazza', av: 1, nlv: 5, ncv: 4, nl: 123, nc: 456 }, { id: 'x2', name: 'due.mp3', size: 20, am: ['A'], av: 1, nlv: 5 }] };
  await L.restoreBackup(nu);
  const t = L.lib.list[0];
  assert.deepEqual(t.am, ['Dolcenera', 'Lazza']); assert.equal(t.aa, 'Lazza'); assert.equal(t.av, 1); assert.equal(t.nlv, 5); assert.equal(t.ncv, 4);
  const p = Object.values(PEND)[0]; assert.deepEqual(p.am, ['A']); assert.equal(p.nlv, 5);          // anche per i brani in attesa del file audio
});
test('backup: formato non valido → errore chiaro, nessuna modifica', async () => {
  setup(); await assert.rejects(() => L.restoreBackup({ tracks: 'no' }), /formato/);
});

/* ---- v5: validazione, andata e ritorno, compatibilità ---- */
const { checkBackup, BACKUP_V, settingsForBackup } = await import('../js/backup.js');
test('backup v6: esporta con versione e impostazioni complete, e si reimporta', async () => {
  setup();
  const { S } = await import('../js/store.js');
  Object.assign(S, { eqOn: 1, eco: 1, shuffle: 1, repeat: 2, th: 'oled', ac: '#ff8800', cf: 4 });
  const f = await L.exportBackup(), j = JSON.parse(await f.text());
  assert.equal(j.v, BACKUP_V); assert.equal(BACKUP_V, 6);
  for (const k of ['eqOn', 'eco', 'shuffle', 'repeat']) assert.ok(k in j.settings, k);
  Object.assign(S, { eqOn: 0, eco: 0, shuffle: 0, repeat: 0 });
  await L.restoreBackup(j);
  assert.equal(S.eqOn, 1); assert.equal(S.eco, 1); assert.equal(S.repeat, 2); assert.equal(S.ac, '#ff8800');
});
test('backup: file non valido o di versione futura → errore chiaro e nessuna modifica', async () => {
  setup();
  for (const bad of [null, 5, 'x', [], {}, { tracks: {} }, { v: 'abc', tracks: [] }]) await assert.rejects(() => L.restoreBackup(bad), /formato/, JSON.stringify(bad));
  await assert.rejects(() => L.restoreBackup({ v: 99, tracks: [] }), /versione più recente/);
  await assert.rejects(() => L.restoreBackup({ v: 5, tracks: [null, 3, { id: 1 }] }), /nessun brano valido/);
  assert.equal(L.lib.list[0].title, 'Uno');
});
test('backup: campi malevoli o malformati vengono scartati (nomi playlist speciali, copertine non immagine, impostazioni fuori range)', () => {
  const r = checkBackup({ v: 4, tracks: [{ id: 'a', name: 'a.mp3', size: '7' }, { id: 2, name: 'x' }],
    playlists: { __proto__x: ['a'], ['__proto__']: ['a'], Buona: ['a', 5, null] },
    covers: { Buona: 'data:image/png;base64,AAAA', Mia: 'javascript:alert(1)', Altra: 'data:text/html;base64,AAAA' },
    plays: [{ tid: 'a', at: 5 }, { tid: 3 }, null], settings: { cf: 999, eq: [1, 2], ac: 'red;}', repeat: 7, th: 'x'.repeat(99), eco: 'si', dens: 'zzz' } });
  assert.equal(r.tracks.length, 1); assert.equal(r.tracks[0].size, 7); assert.equal(r.dropped, 1);
  assert.deepEqual(Object.keys(r.playlists).sort(), ['Buona', '__proto__x']);   // '__proto__' vero scartato
  assert.deepEqual(r.playlists.Buona, ['a']);
  assert.deepEqual(Object.keys(r.covers), ['Buona']); assert.equal(r.plays.length, 1);
  assert.equal(r.settings.cf, 12); assert.equal(r.settings.eq, undefined); assert.equal(r.settings.ac, undefined);
  assert.equal(r.settings.repeat, 2); assert.equal(r.settings.th, undefined); assert.equal(r.settings.eco, 1); assert.equal(r.settings.dens, undefined);
  assert.equal(Object.getPrototypeOf(r.playlists), Object.prototype);
});
test('backup: settingsForBackup include solo chiavi note', () => {
  const o = settingsForBackup({ eco: 1, mig: 3, lastBackup: 1, th: 'dark' });
  assert.deepEqual(o, { eco: 1, th: 'dark' });
});

test('backup v6: immagini scelte a mano — solo data URL di immagini, chiavi sicure, id di playlist ben formati', () => {
  const ok = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  const raw = JSON.parse(JSON.stringify({ v: 6, tracks: [{ id: 'a', name: 'a.mp3', size: 1 }] }));
  raw.images = JSON.parse('{"covers":{"Alazza|sinfonia":"' + ok + '","__proto__":"' + ok + '","x":"data:text/html;base64,PHNjcmlwdD4=","y":"javascript:alert(1)","z":5},"artists":{"lazza":"' + ok + '"}}');
  raw.plid = JSON.parse('{"Mix":"11111111-aaaa-4bbb-8ccc-222222222222","bad":"x y","__proto__":"abcdabcd"}');
  const r = checkBackup(raw);
  assert.deepEqual(Object.keys(r.images.covers), ['Alazza|sinfonia']); assert.deepEqual(Object.keys(r.images.artists), ['lazza']);
  assert.deepEqual(Object.keys(r.plid), ['Mix']);
  assert.equal(checkBackup({ v: 5, tracks: [{ id: 'a', name: 'a.mp3', size: 1 }] }).images, undefined, 'un backup v5 non ha immagini');
  assert.equal(checkBackup({ v: 6, tracks: [{ id: 'a', name: 'a.mp3', size: 1 }], images: { covers: { a: 'data:image/png;base64,' + 'A'.repeat(800000) } } }).images, undefined, 'immagini troppo grandi scartate');
});
