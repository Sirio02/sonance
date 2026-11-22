import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIDB, installFakeLocalStorage } from './helpers/fake-idb.mjs';

/* Si parte dallo stato lasciato dalla versione PRECEDENTE dell'app: playlist, copertine e brani in attesa in localStorage. */
const ls = installFakeLocalStorage(), idb = installFakeIDB();
ls.mem.set('pl', JSON.stringify({ Mix: ['a', 'b'], constructor: ['c'], '2024': ['a'] }));
ls.mem.set('plc', JSON.stringify({ Mix: 'data:image/jpeg;base64,AAAA' }));
ls.mem.set('pend', JSON.stringify({ 'x.mp3|10': { title: 'X', pls: ['Mix'], lrc: 'testo' }, 'y.mp3|20': { title: 'Y', pls: [] } }));
const St = await import('../js/store.js');
const { PL, PLC, PLID, PEND } = St;

test('migrazione: playlist, copertine e brani in attesa passano in IndexedDB e localStorage si libera', async () => {
  assert.equal(St.storageMode(), 'ls');
  assert.equal(await St.initStores(), 'idb');
  assert.equal(St.storageMode(), 'idb');
  const pls = idb.rows('playlists').map(([, r]) => r);
  assert.deepEqual(pls.map(r => r.name).sort(), ['2024', 'Mix', 'constructor']);
  assert.deepEqual(pls.find(r => r.name === 'Mix').ids, ['a', 'b']); assert.equal(pls.find(r => r.name === 'Mix').cover, 'data:image/jpeg;base64,AAAA');
  assert.ok(pls.every(r => typeof r.id === 'string' && r.id.length > 8), 'ogni playlist ha un id stabile');
  assert.equal(idb.rows('pend').length, 2); assert.equal(idb.rows('pend').find(([k]) => k === 'x.mp3|10')[1].lrc, 'testo');
  assert.ok(idb.rows('kv').some(([k]) => k === 'migrated:v1'));
  for (const k of ['pl', 'plc', 'pend']) assert.equal(ls.mem.has(k), false, k + ' deve sparire da localStorage');
  const bak = JSON.parse(ls.mem.get('sonance.migbak.v1')); assert.deepEqual(bak.pl.Mix, ['a', 'b']);   // copia di sicurezza (solo playlist)
  assert.deepEqual(PL.Mix, ['a', 'b']); assert.equal(Object.getPrototypeOf(PL), null, 'oggetto senza prototipo');
  assert.deepEqual(PL.constructor, ['c']);                                                                 // un nome come «constructor» è una playlist qualunque
});

test('riavvio: i dati si ricaricano da IndexedDB (ordine incluso) e non si migra di nuovo', async () => {
  const before = JSON.stringify(Object.keys(PL)), ids = { ...PLID };
  for (const o of [PL, PLC, PLID, PEND]) for (const k of Object.keys(o)) delete o[k];
  assert.equal(await St.initStores(), 'idb');
  assert.equal(JSON.stringify(Object.keys(PL)), before);
  assert.deepEqual(PL.Mix, ['a', 'b']); assert.equal(PLC.Mix, 'data:image/jpeg;base64,AAAA');
  assert.equal(PLID.Mix.id, ids.Mix.id, 'stesso id dopo il riavvio'); assert.equal(PEND['x.mp3|10'].title, 'X');
});

test('scrittura: aggiungere, rinominare ed eliminare una playlist aggiorna IndexedDB; l\'id sopravvive alla rinomina', async () => {
  PL.Nuova = ['z']; St.savePL(); await St.storesIdle();
  assert.ok(idb.rows('playlists').some(([, r]) => r.name === 'Nuova' && r.ids[0] === 'z'));
  const id = St.plId('Mix');
  PL.Mix2 = PL.Mix; delete PL.Mix; PLID.Mix2 = PLID.Mix; delete PLID.Mix; St.savePL(); await St.storesIdle();
  const rows = idb.rows('playlists').map(([, r]) => r);
  assert.equal(rows.filter(r => r.id === id).length, 1); assert.equal(rows.find(r => r.id === id).name, 'Mix2'); assert.ok(!rows.some(r => r.name === 'Mix'));
  delete PL.Nuova; delete PLID.Nuova; St.savePL(); await St.storesIdle();
  assert.ok(!idb.rows('playlists').some(([, r]) => r.name === 'Nuova'));
  assert.equal(ls.mem.has('pl'), false, 'in modalità IndexedDB localStorage non viene più usato per le playlist');
});

test('brani in attesa: si scrive una voce per volta e 2.500 brani con testo non toccano localStorage', async () => {
  await St.putPend({ 'z.mp3|1': { title: 'Z', pls: [] } }); assert.equal(idb.rows('pend').length, 3);
  await St.delPend('z.mp3|1'); assert.equal(idb.rows('pend').length, 2); assert.equal(PEND['z.mp3|1'], undefined);
  const big = {}, lyr = 'verso di prova lungo\n'.repeat(190);
  for (let i = 0; i < 2500; i++) big['f' + i + '.mp3|' + i] = { title: 'T' + i, lrc: lyr, pls: [] };
  await St.putPend(big);
  assert.equal(idb.rows('pend').length, 2502); assert.equal(ls.mem.has('pend'), false);
  assert.ok(ls.size() < 20000, 'localStorage resta piccolo (' + ls.size() + ' caratteri)');
  await St.delPendMany(Object.keys(big)); assert.equal(idb.rows('pend').length, 2);
});

test('cronologia: si scartano gli ascolti più VECCHI per data (non i primi inseriti) e l\'aggiunta senza duplicati è ripetibile', async () => {
  const N = 8010, list = Array.from({ length: N }, (_, i) => ({ tid: 't', at: (N - i) * 1000, ms: 60000, title: 'T' + (N - i), artist: 'A' }));   // inseriti dal più recente al più vecchio
  const r1 = await St.putPlaysUnique(list), r2 = await St.putPlaysUnique(list);
  assert.deepEqual([r1.added, r1.skipped, r2.added, r2.skipped], [N, 0, 0, N]);
  await St.prunePlays();
  const left = await St.getPlays(); assert.equal(left.length, 8000);
  assert.equal(Math.min(...left.map(p => p.at)), 11 * 1000, 'sono stati eliminati i 10 ascolti più vecchi per data');
  assert.equal(await St.delPlaysByKeys(r1.keys.slice(0, 5)), 5);                                       // gli ascolti più recenti sono ancora lì
});

test('app chiusa dopo la verifica ma prima della pulizia: al riavvio le copie obsolete di localStorage si eliminano e vince IndexedDB', async () => {
  ls.mem.set('pl', JSON.stringify({ Vecchia: ['q'] })); ls.mem.set('pend', JSON.stringify({ 'obsoleto|1': { title: 'O' } }));
  for (const o of [PL, PLC, PLID, PEND]) for (const k of Object.keys(o)) delete o[k];
  assert.equal(await St.initStores(), 'idb');
  assert.equal(ls.mem.has('pl'), false); assert.equal(ls.mem.has('pend'), false);
  assert.equal(PL.Vecchia, undefined, 'IndexedDB è la fonte'); assert.ok(PL.constructor, 'le playlist vere ci sono');
});
