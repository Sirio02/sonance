/* Difetti di logica pura confermati nell'audit e non ancora corretti: test `todo` (falliscono oggi senza far fallire la suite). */
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { parseYouTube } = await import('../js/beta/youtube.js');
const { parseArtistString } = await import('../js/artists.js');
const { findDuplicates } = await import('../js/dup.js');
const { contrast, parseHex } = await import('../js/color.js');

test('Y-3 · «Dr.Dre», «AC.DC» e «Mr.Brightside» sono ricerche, non link', { todo: 'Fase 5' }, () => {
  for (const q of ['Dr.Dre', 'AC.DC', 'Mr.Brightside']) assert.equal(parseYouTube(q).kind, 'search', q);
});
test('R-2 · «Belle & Sebastian» ed «Emerson, Lake & Palmer» non vengono spezzati in più artisti', { todo: 'Fase 2' }, () => {
  assert.deepEqual(parseArtistString('Belle & Sebastian').main, ['Belle & Sebastian']);
  assert.deepEqual(parseArtistString('Emerson, Lake & Palmer').main, ['Emerson, Lake & Palmer']);
});
test('L-4 · due brani diversi con stessa dimensione e durata non sono «file identici»', { todo: 'Fase 2' }, () => {
  const g = findDuplicates([{ id: '1', title: 'Uno', artist: 'A', size: 16622, dur: 2 }, { id: '2', title: 'Tre', artist: 'C', size: 16622, dur: 2 }]);
  assert.ok(!g.some(x => x.exact), 'segnalati come identici');
});
test('T-4 · il testo bianco sull\'accento predefinito del tema scuro ha un contrasto di almeno 4,5:1', { todo: 'Fase 4' }, () => {
  const c = contrast(parseHex('#ffffff'), parseHex('#fb923c')); assert.ok(c >= 4.5, 'contrasto ' + c.toFixed(2) + ':1');
});
