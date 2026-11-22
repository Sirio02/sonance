import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIDB, installFakeLocalStorage } from './helpers/fake-idb.mjs';

let fail = null;
const ls = installFakeLocalStorage(), idb = installFakeIDB({ failOn: (...a) => fail?.(...a) });
const St = await import('../js/store.js');
const L = await import('../js/library.js');
assert.equal(await St.initStores(), 'idb');
const { S, PL, PLC, PLID, PEND } = St;

const local = { id: 'a1', name: 'uno.mp3', size: 10, title: 'Uno', artist: 'Lazza', album: '', dur: 100 };
const PID = '11111111-aaaa-4bbb-8ccc-222222222222';
const bk = () => ({ v: 6, tracks: [{ id: 'x1', name: 'uno.mp3', size: 10, title: 'Uno (rev)', artist: 'Lazza', fav: 1, p: 3 }, { id: 'x2', name: 'due.mp3', size: 20, title: 'Due', artist: 'Altro', lrc: '[00:01.00]ciao' }],
  playlists: { Mix: ['x1', 'x2'] }, plid: { Mix: PID }, covers: {},
  plays: [{ tid: 'x1', at: 1000, ms: 60000, title: 'Uno', artist: 'Lazza', album: '' }, { tid: 'x2', at: 2000, ms: 61000, title: 'Due', artist: 'Altro', album: '' }], settings: { eqOn: 1 } });
async function reset() {
  fail = null; await St.delPendMany(Object.keys(PEND));
  for (const o of [PL, PLC, PLID, PEND]) for (const k of Object.keys(o)) delete o[k];
  St.savePL(); await St.storesIdle(); await St.clearPlays(); await St.kvDel('snapshot:prerestore'); await St.kvDel('snapshot:prerestore:info');
  S.eqOn = 0; delete S.ac;
  L.lib.list = [{ ...local }]; L.lib.map = new Map([[local.id, L.lib.list[0]]]); L.touchData();
}

test('ripristino ripetuto dello stesso backup: nessun raddoppio di cronologia, brani in attesa o playlist', async () => {
  await reset();
  const r1 = await L.restoreBackup(bk()), n1 = (await St.getPlays()).length;
  const r2 = await L.restoreBackup(bk()), n2 = (await St.getPlays()).length;
  assert.deepEqual([r1.playsAdded, r1.playsSkipped, r2.playsAdded, r2.playsSkipped], [2, 0, 0, 2]); assert.equal(n1, 2); assert.equal(n2, 2);
  assert.equal(Object.keys(PEND).length, 1); assert.deepEqual(PL.Mix, ['a1']); assert.deepEqual(PEND['due.mp3|20'].pls, ['Mix']);
  await St.storesIdle(); assert.equal(idb.rows('pend').length, 1); assert.equal(idb.rows('playlists').length, 1);
  assert.equal(L.lib.list[0].title, 'Uno (rev)'); assert.equal(L.lib.list[0].fav, 1); assert.equal(S.eqOn, 1);
});

test('2.500 brani con testi: i metadati in attesa vengono davvero salvati (prima andavano persi in silenzio)', async () => {
  await reset();
  const lyr = '[00:12.00]Verso di prova per simulare un testo sincronizzato lungo\n'.repeat(60);
  const tracks = Array.from({ length: 2500 }, (_, i) => ({ id: 'bk' + i, name: 'f' + i + '.mp3', size: 4e6 + i, title: 'Brano ' + i, artist: 'A' + (i % 300), fav: i % 7 ? 0 : 1, lrc: lyr }));
  const r = await L.restoreBackup({ v: 6, tracks, playlists: {}, covers: {}, plays: [], settings: {} });
  assert.equal(r.wait, 2500); assert.equal(idb.rows('pend').length, 2500); assert.equal(ls.mem.has('pend'), false); assert.ok(ls.size() < 50000, 'localStorage resta piccolo: ' + ls.size());
  for (const k of Object.keys(PEND)) delete PEND[k];                       // riavvio simulato
  await St.initStores(); assert.equal(Object.keys(PEND).length, 2500); assert.ok(PEND['f10.mp3|' + (4e6 + 10)].lrc.length > 3000);
});

test('«Annulla ripristino»: tornano brani, playlist, brani in attesa, impostazioni e cronologia di prima', async () => {
  await reset(); await St.addPlay({ tid: 'a1', at: 1000, ms: 60000, title: 'Uno', artist: 'Lazza', album: '' });   // un ascolto già presente (e già nel backup)
  PL.Locale = ['a1']; St.savePL(); await St.storesIdle();
  const before = JSON.stringify({ t: L.lib.list[0], pl: PL, pend: PEND, eq: S.eqOn, plays: (await St.getPlays()).length });
  const info0 = await L.restoreUndoInfo(); assert.equal(info0, null);
  const r = await L.restoreBackup(bk()); assert.equal(r.playsAdded, 1); assert.equal(r.playsSkipped, 1);
  assert.ok(await L.restoreUndoInfo());
  assert.ok(PL.Mix && PEND['due.mp3|20'] && S.eqOn === 1 && L.lib.list[0].fav === 1);
  assert.equal(await L.undoRestore(), true);
  assert.equal(JSON.stringify({ t: L.lib.list[0], pl: PL, pend: PEND, eq: S.eqOn, plays: (await St.getPlays()).length }), before);
  await St.storesIdle(); assert.equal(idb.rows('pend').length, 0); assert.ok(!idb.rows('playlists').some(([, r]) => r.name === 'Mix'));
  assert.equal(await L.restoreUndoInfo(), null); assert.equal(await L.undoRestore(), false);
});

test('ripristino interrotto a metà (es. disco pieno): torna da solo allo stato precedente e lo dice', async () => {
  await reset(); PL.Locale = ['a1']; St.savePL(); await St.storesIdle();
  const before = JSON.stringify({ t: L.lib.list[0], pl: PL, pend: PEND, eq: S.eqOn });
  fail = (n, op) => n === 'plays' && op === 'add';
  await assert.rejects(() => L.restoreBackup(bk()), /ripristino interrotto e annullato/);
  fail = null;
  assert.equal(JSON.stringify({ t: L.lib.list[0], pl: PL, pend: PEND, eq: S.eqOn }), before);
  await St.storesIdle(); assert.equal(idb.rows('pend').length, 0); assert.equal((await St.getPlays()).length, 0);
});

test('playlist abbinate per id: una playlist rinominata in locale riceve i brani del backup invece di creare un doppione', async () => {
  await reset(); PL.Rinominata = []; PLID.Rinominata = { id: PID, created: 1 }; St.savePL(); await St.storesIdle();
  await L.restoreBackup(bk());
  assert.deepEqual(Object.keys(PL), ['Rinominata']); assert.deepEqual(PL.Rinominata, ['a1']); assert.deepEqual(PEND['due.mp3|20'].pls, ['Rinominata']);
});

test('un backup v5 (senza id di playlist) si ripristina e le playlist ricevono un id', async () => {
  await reset(); const v5 = bk(); v5.v = 5; delete v5.plid;
  await L.restoreBackup(v5); await St.storesIdle();
  assert.deepEqual(PL.Mix, ['a1']); const rec = idb.rows('playlists')[0][1]; assert.equal(rec.name, 'Mix'); assert.ok(rec.id.length > 8);
});

test('anteprima del ripristino: conta ciò che cambierebbe senza modificare nulla', async () => {
  await reset(); await St.addPlay({ tid: 'a1', at: 1000, ms: 60000, title: 'Uno', artist: 'Lazza', album: '' });
  const p = await L.planRestore(bk());
  assert.deepEqual([p.tracks, p.hit, p.wait, p.playlists, p.newPlaylists, p.plays, p.newPlays], [2, 1, 1, 1, 1, 2, 1]);
  assert.equal(Object.keys(PL).length, 0); assert.equal(Object.keys(PEND).length, 0); assert.equal(L.lib.list[0].title, 'Uno');
});

test('esportazione: id stabili delle playlist e versione 6; la data dell\'ultimo backup cambia solo dopo il salvataggio', async () => {
  await reset(); PL.Mix = ['a1']; St.savePL(); await St.storesIdle(); delete S.lastBackup;
  const j = JSON.parse(await (await L.exportBackup()).text());
  assert.equal(j.v, 6); assert.equal(j.plid.Mix, St.plId('Mix')); assert.equal(S.lastBackup, undefined, 'creare il file non basta');
  assert.equal(j.images, undefined, 'senza «Backup completo» niente immagini');
  L.markBackupSaved(); assert.ok(S.lastBackup > 0);
});
