import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipReason, playwright, serve, launch, openApp, fixtures, importFiles, APP } from './helpers.mjs';
const skip = await skipReason();
let srv, browser, media;
before(async () => { if (skip) return; media = fixtures(); srv = await serve({ root: APP }); browser = await launch(await playwright()); });
after(async () => { await browser?.close(); await srv?.close(); });

test('T-1 · interfaccia: il ripristino chiede conferma con un riepilogo, applica il backup e si può annullare dal messaggio', { skip, timeout: 90000 }, async () => {
  const { ctx, page } = await openApp(browser, srv.url, { settings: { auto: 0 } });
  try {
    await importFiles(page, ['d1t1.mp3', 'd1t2.mp3'].map(media));
    const json = await page.evaluate(async () => {                       // stato A: il backup che poi ripristineremo
      const L = await import('/js/library.js'), St = await import('/js/store.js');
      L.lib.list[0].fav = 0; L.plCreate('Mix', [L.lib.list[0].id]); await St.addPlay({ tid: L.lib.list[0].id, at: 5000, ms: 60000, title: 'x', artist: 'y', album: '' });
      return await (await L.exportBackup()).text();
    });
    await page.evaluate(async () => { const L = await import('/js/library.js'); L.lib.list[0].fav = 1; await L.saveTrack(L.lib.list[0]); });   // stato B: si cambia qualcosa dopo il backup
    await page.click('#tabs button[data-v=you]'); await page.locator('#v-you .seg button').nth(2).click(); await page.waitForTimeout(400);
    await page.setInputFiles('#bi', { name: 'sonance-backup.json', mimeType: 'application/json', buffer: Buffer.from(json) });
    await page.getByText('Ripristinare il backup?').waitFor({ timeout: 8000 });
    const sheet = await page.locator('dialog[open]').innerText();
    assert.match(sheet, /2 brani \(2 già in libreria, 0 in attesa dei file audio\)/); assert.match(sheet, /1 playlist/); assert.match(sheet, /annullare il ripristino per 24 ore/);
    assert.equal(await page.evaluate(async () => (await import('/js/library.js')).lib.list[0].fav), 1, 'prima della conferma non cambia nulla');
    await page.getByRole('button', { name: 'Ripristina', exact: true }).click();
    await page.waitForFunction(() => /Backup ripristinato/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 8000 });
    assert.equal(await page.evaluate(async () => (await import('/js/library.js')).lib.list[0].fav), 0, 'il backup è stato applicato');
    await page.waitForTimeout(300); assert.ok(await page.locator('button', { hasText: 'Annulla l’ultimo ripristino' }).isVisible(), 'compare «Annulla l\'ultimo ripristino»');
    await page.locator('#toast button').click();                          // «Annulla» dal messaggio
    await page.waitForFunction(() => /Ripristino annullato/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 8000 });
    assert.equal(await page.evaluate(async () => (await import('/js/library.js')).lib.list[0].fav), 1, 'annullato: torna lo stato B');
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});

test('T-1e · interfaccia: «Includi le copertine scelte a mano» si ricorda e il backup è salvato solo se l\'utente non annulla', { skip, timeout: 90000 }, async () => {
  const { ctx, page } = await openApp(browser, srv.url, { settings: { auto: 0 } });
  try {
    await importFiles(page, ['c1.mp3'].map(media));
    await page.click('#tabs button[data-v=you]'); await page.locator('#v-you .seg button').nth(2).click(); await page.waitForTimeout(400);
    await page.getByText('Includi le copertine scelte a mano').click(); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(async () => (await import('/js/store.js')).S.bkFull), 1);
    /* l'utente annulla il foglio di condivisione: nessuna data di backup */
    await page.evaluate(() => { navigator.canShare = () => true; navigator.share = () => Promise.reject(Object.assign(new Error('annullato'), { name: 'AbortError' })); });
    await page.evaluate(async () => { delete (await import('/js/store.js')).S.lastBackup; });
    await page.getByRole('button', { name: 'Salva un backup' }).click(); await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(async () => (await import('/js/store.js')).S.lastBackup ?? null), null, 'condivisione annullata: lastBackup invariato');
    /* l'utente completa la condivisione */
    await page.evaluate(() => { navigator.share = () => Promise.resolve(); });
    await page.getByRole('button', { name: 'Salva un backup' }).click(); await page.waitForTimeout(1200);
    assert.ok(await page.evaluate(async () => (await import('/js/store.js')).S.lastBackup) > 0, 'condivisione riuscita: lastBackup aggiornato');
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});
