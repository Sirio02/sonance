import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skipReason, playwright, serve, launch, openApp, fixtures, importFiles, APP } from './helpers.mjs';
const skip = await skipReason();
let srv, browser, media;
before(async () => { if (skip) return; media = fixtures(); srv = await serve({ root: APP }); browser = await launch(await playwright()); });
after(async () => { await browser?.close(); await srv?.close(); });

test('T-1b · ripristinare due volte lo stesso backup non raddoppia la cronologia', { skip, timeout: 90000 }, async () => {
  const { ctx, page } = await openApp(browser, srv.url, { settings: { auto: 0 } });
  await importFiles(page, ['d1t1.mp3', 'd1t2.mp3', 'd2t1.mp3'].map(media));
  const r = await page.evaluate(async () => {
    const L = await import('/js/library.js'), St = await import('/js/store.js');
    for (let i = 0; i < 5; i++) await St.addPlay({ tid: L.lib.list[i % 3].id, at: Date.now() - i * 86400e3, ms: 60000, title: L.lib.list[i % 3].title, artist: 'Elena', album: 'Doppio' });
    const json = JSON.parse(await (await L.exportBackup()).text());
    const n0 = (await St.getPlays()).length; await L.restoreBackup(json); const n1 = (await St.getPlays()).length; await L.restoreBackup(json); const n2 = (await St.getPlays()).length;
    return { n0, n1, n2 };
  });
  assert.deepEqual(r, { n0: 5, n1: 5, n2: 5 }); await ctx.close();
});

test('T-1a · 2.500 brani con testi: dopo il ripristino e un riavvio i metadati in attesa ci sono ancora', { skip, timeout: 90000 }, async () => {
  const { ctx, page } = await openApp(browser, srv.url, { settings: { auto: 0 } });
  const res = await page.evaluate(async () => {
    const L = await import('/js/library.js'); const lyr = '[00:12.00]Verso di prova per simulare un testo sincronizzato lungo\n'.repeat(60);
    const tracks = Array.from({ length: 2500 }, (_, i) => ({ id: 'bk' + i, name: 'file' + i + '.mp3', size: 4e6 + i, title: 'Brano ' + i, artist: 'Artista ' + (i % 300), fav: i % 7 ? 0 : 1, lrc: lyr }));
    try { return await L.restoreBackup({ v: 5, tracks, playlists: {}, covers: {}, plays: [], settings: { auto: 0 } }); } catch (e) { return { error: e.message }; }
  });
  assert.equal(res.error, undefined, 'il ripristino non deve fallire');
  await page.reload(); await page.waitForSelector('#tabs button[data-v]'); await page.waitForTimeout(1200);
  const n = await page.evaluate(async () => Object.keys((await import('/js/store.js')).PEND).length);
  assert.equal(n, 2500, 'i brani in attesa devono sopravvivere al riavvio'); await ctx.close();
});

test('T-1c · «Backup completo»: le copertine scelte a mano tornano dopo il ripristino', { skip, timeout: 90000 }, async () => {
  const { ctx, page } = await openApp(browser, srv.url, { settings: { auto: 0 } });
  await importFiles(page, ['c1.mp3', 'c3.mp3'].map(media));
  const b64 = readFileSync(media('cover.jpg')).toString('base64');
  const r = await page.evaluate(async b => {
    const L = await import('/js/library.js'), C = await import('/js/covers.js'), blob = new Blob([Uint8Array.from(atob(b), c => c.charCodeAt(0))], { type: 'image/jpeg' });
    const t = L.lib.list.find(x => x.title === 'Uno'); await C.setCover(t, blob, 'album', { manual: true });
    const full = JSON.parse(await (await L.exportBackup({ full: true })).text()), light = JSON.parse(await (await L.exportBackup()).text());
    await C.clearCover(t); const gone = !(await C.coverURL(t, 'l'));
    await L.restoreBackup(full); return { images: !!full.images && Object.keys(full.images.covers).length, light: !!light.images, gone, back: !!(await C.coverURL(t, 'l')) };
  }, b64);
  assert.deepEqual(r, { images: 1, light: false, gone: true, back: true }); await ctx.close();
});

test('T-1e · la data dell\'ultimo backup non cambia se l\'utente annulla la condivisione', { skip, timeout: 90000 }, async () => {
  const { ctx, page } = await openApp(browser, srv.url, { settings: { auto: 0 } });
  await importFiles(page, ['c1.mp3'].map(media));
  const r = await page.evaluate(async () => {
    const L = await import('/js/library.js'), St = await import('/js/store.js'); delete St.S.lastBackup;
    await L.exportBackup();                                      // creare il file non basta
    return { afterExport: St.S.lastBackup ?? null };
  });
  assert.equal(r.afterExport, null, 'lastBackup impostato alla sola creazione del file'); await ctx.close();
});
