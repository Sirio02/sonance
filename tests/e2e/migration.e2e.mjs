import test from 'node:test';
import assert from 'node:assert/strict';
import { skipReason, playwright, serve, launch, APP } from './helpers.mjs';
const skip = await skipReason();

test('T-1c/P-1 · aggiornamento reale dell\'archivio (schema v2 → v3): playlist, copertine e brani in attesa passano in IndexedDB e i brani restano', { skip, timeout: 90000 }, async () => {
  const srv = await serve({ root: APP }), browser = await launch(await playwright());
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(srv.url + 'manifest.webmanifest');                  // stessa origine, senza avviare l'app
    await page.evaluate(async () => {                                   // lo stato lasciato dalla versione precedente
      await new Promise((ok, ko) => {
        const r = indexedDB.open('mymusic', 2);
        r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('tracks', { keyPath: 'id' }); d.createObjectStore('blobs'); d.createObjectStore('plays', { keyPath: 'n', autoIncrement: true }); };
        r.onsuccess = () => { const db = r.result, t = db.transaction(['tracks', 'blobs'], 'readwrite'); t.objectStore('tracks').put({ id: 't1', name: 'uno.mp3', size: 4, title: 'Uno', artist: 'Lazza', album: 'A', dur: 1, fav: 1, added: 1, p: 1 }); t.objectStore('blobs').put(new Blob(['abcd']), 't1'); t.oncomplete = () => { db.close(); ok(); }; t.onerror = ko; };
        r.onerror = ko;
      });
      localStorage.setItem('pl', JSON.stringify({ Mix: ['t1'], constructor: ['t1'] })); localStorage.setItem('plc', JSON.stringify({ Mix: 'data:image/jpeg;base64,/9j/AAAA' }));
      localStorage.setItem('pend', JSON.stringify({ 'x.mp3|10': { title: 'X', pls: ['Mix'], lrc: '[00:01.00]ciao' } })); localStorage.setItem('mm', JSON.stringify({ auto: 0 }));
    });
    const probe = () => page.evaluate(async () => {
      const St = await import('/js/store.js'), L = await import('/js/library.js');
      const idb = await new Promise(ok => {
        const q = indexedDB.open('mymusic');
        q.onsuccess = () => {
          const db = q.result;
          try {
            const names = [...db.objectStoreNames].filter(n => ['playlists', 'pend', 'kv'].includes(n)), out = {};
            if (!names.length) { db.close(); return ok({ version: db.version }); }       // archivio ancora nel vecchio formato
            const t = db.transaction(names, 'readonly'); for (const n of names) out[n] = t.objectStore(n).getAllKeys();
            t.oncomplete = () => { db.close(); ok({ version: db.version, ...Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.result])) }); };
          } catch (e) { db.close(); ok({ version: db.version, error: e.message }); }
        };
        q.onerror = () => ok({ error: 'apertura non riuscita' });
      });
      const blob = await St.getBlob('t1');
      return { mode: St.storageMode?.(), tracks: L.lib.list.length, fav: L.lib.list[0]?.fav, PL: Object.keys(St.PL).sort(), PLt1: St.PL.Mix, PEND: Object.keys(St.PEND), lrc: St.PEND['x.mp3|10']?.lrc, ls: ['pl', 'plc', 'pend'].map(k => localStorage.getItem(k) !== null), backupCopy: !!localStorage.getItem('sonance.migbak.v1'), idb, blobSize: blob?.size };
    });
    await page.goto(srv.url); await page.waitForSelector('#tabs button[data-v]'); await page.waitForTimeout(1500);
    for (const round of ['primo avvio (migrazione)', 'avvio successivo']) {
      const r = await probe();
      assert.equal(r.mode, 'idb', round); assert.equal(r.idb.version, 3, round); assert.equal(r.tracks, 1, round + ': il brano c\'è'); assert.equal(r.blobSize, 4, round + ': il file audio c\'è'); assert.equal(r.fav, 1);
      assert.deepEqual(r.PL, ['Mix', 'constructor'], round); assert.deepEqual(r.PLt1, ['t1']); assert.deepEqual(r.PEND, ['x.mp3|10']); assert.equal(r.lrc, '[00:01.00]ciao');
      assert.deepEqual(r.ls, [false, false, false], round + ': localStorage liberato'); assert.equal(r.backupCopy, true);
      assert.equal(r.idb.playlists.length, 2); assert.deepEqual(r.idb.pend, ['x.mp3|10']); assert.ok(r.idb.kv.includes('migrated:v1'));
      await page.reload(); await page.waitForSelector('#tabs button[data-v]'); await page.waitForTimeout(1200);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
