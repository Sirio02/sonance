import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipReason, playwright, serve, launch, openApp, fixtures, importFiles, APP } from './helpers.mjs';
const skip = await skipReason();
let srv, browser, media;
before(async () => { if (skip) return; media = fixtures(); srv = await serve({ root: APP }); browser = await launch(await playwright()); });
after(async () => { await browser?.close(); await srv?.close(); });

test('P-1/P-2 · le playlist (create, rinominate, eliminate, nome «constructor», copertina) sopravvivono al riavvio e non usano più localStorage', { skip, timeout: 90000 }, async () => {
  const { ctx, page } = await openApp(browser, srv.url, { settings: { auto: 0 } });
  try {
    await importFiles(page, ['c1.mp3', 'c2.mp3', 'c3.mp3'].map(media));
    const before = await page.evaluate(async () => {
      const L = await import('/js/library.js'), St = await import('/js/store.js'), ids = L.lib.list.map(t => t.id);
      L.plCreate('Mix', ids); L.plCreate('constructor', [ids[0]]); L.plCreate('Da cancellare', [ids[1]]);
      L.plRename('Mix', 'Mix 2'); St.PLC['Mix 2'] = 'data:image/jpeg;base64,/9j/AAAA'; St.savePLC(); L.plDelete('Da cancellare'); await St.storesIdle();
      return { names: Object.keys(St.PL), id: St.plId('Mix 2'), n: St.PL['Mix 2'].length };
    });
    assert.deepEqual(before.names, ['constructor', 'Mix 2'].sort((a, b) => before.names.indexOf(a) - before.names.indexOf(b)));
    await page.reload(); await page.waitForSelector('#tabs button[data-v]'); await page.waitForTimeout(1200);
    const after = await page.evaluate(async () => { const St = await import('/js/store.js'); return { names: Object.keys(St.PL), id: St.plId('Mix 2'), n: St.PL['Mix 2']?.length, cover: St.PLC['Mix 2'], ctor: St.PL.constructor, ls: ['pl', 'plc', 'pend'].map(k => localStorage.getItem(k)), mode: St.storageMode() }; });
    assert.equal(after.mode, 'idb'); assert.deepEqual(after.names, before.names); assert.equal(after.id, before.id, 'l\'id sopravvive a rinomina e riavvio'); assert.equal(after.n, 3);
    assert.equal(after.cover, 'data:image/jpeg;base64,/9j/AAAA'); assert.equal(after.ctor.length, 1); assert.deepEqual(after.ls, [null, null, null]);
    await page.click('#tabs button[data-v=pl]'); await page.waitForTimeout(600);
    const text = await page.locator('#v-pl').innerText(); assert.match(text, /Mix 2/); assert.match(text, /constructor/); assert.doesNotMatch(text, /Da cancellare/);
    assert.deepEqual(page.errors, []);
  } finally { await ctx.close(); }
});
