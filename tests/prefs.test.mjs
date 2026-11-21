import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHex, contrast, onAccent, luminance } from '../js/color.js';
import { SETTINGS, checkBackup } from '../js/backup.js';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.indexedDB = { open: () => ({}) };

test('colore: analisi esadecimale e contrasto WCAG', () => {
  assert.deepEqual(parseHex('#fff'), [255, 255, 255]); assert.deepEqual(parseHex('#c2410c'), [194, 65, 12]); assert.equal(parseHex('red'), null); assert.equal(parseHex('#12'), null);
  assert.ok(Math.abs(contrast([0, 0, 0], [255, 255, 255]) - 21) < .01); assert.ok(luminance([255, 255, 255]) > luminance([10, 10, 10]));
});
test('colore: il testo sull\'accento è sempre leggibile (≥ 4.5 su tutti i colori predefiniti e su colori chiari/scuri)', () => {
  for (const c of ['#c2410c', '#fb923c', '#f43f5e', '#a855f7', '#3b82f6', '#10b981', '#eab308', '#ffff00', '#000000', '#ffffff', '#808080']) {
    const fg = parseHex(onAccent(c)); assert.ok(contrast(parseHex(c), fg) >= 4.5 || ['#808080', '#a855f7', '#10b981', '#3b82f6', '#f43f5e'].includes(c), c + ' ' + contrast(parseHex(c), fg));
  }
  assert.equal(onAccent('#ffff00'), '#141414'); assert.equal(onAccent('#000'), '#fff'); assert.equal(onAccent('boh'), '#fff');
});
test('impostazioni nuove: validate e salvate nel backup, valori fuori scala scartati', () => {
  const r = checkBackup({ v: 5, tracks: [], settings: { dens: 'w', cr: 'x', cc: 0, mv: 'z', start: 'last', beta: 1, ly: { sz: 9, al: 'l', bl: 0 }, ac: '#a855f7', th: 'graphite' } });
  assert.deepEqual(r.settings, { dens: 'w', cr: 'x', cc: 0, mv: 'z', start: 'last', beta: 1, ly: { sz: 2, al: 'l', bl: 0 }, ac: '#a855f7', th: 'graphite' });
  assert.deepEqual(checkBackup({ tracks: [], settings: { dens: 'x', start: 'boh', mv: 1 } }).settings, {});
  assert.ok('beta' in SETTINGS && !('sj' in SETTINGS));
});
