import test from 'node:test';
import assert from 'node:assert/strict';
import { skipReason, playwright, serve, launch, openApp, stampedCopy, tmp } from './helpers.mjs';
const skip = await skipReason();

/** Simula un deploy: la versione 1 è in uso, il sito passa alla versione 2, il service worker si aggiorna e l'utente tocca «Aggiorna». */
async function deploy(headers, { missing = [] } = {}) {
  const pw = await playwright(), v1 = stampedCopy(tmp('v1'), { build: 'aaaa1111', marker: 'v1' }), v2 = stampedCopy(tmp('v2'), { build: 'bbbb2222', marker: 'v2', drop: missing });
  const root = { root: v1 }, srv = await serve(root, { headers }), browser = await launch(pw);
  try {
    const { page } = await openApp(browser, srv.url);
    await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1000);
    const before = await page.evaluate(() => window.__VER);
    root.root = v2;                                                       // ← deploy
    const r = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update().catch(() => {});
      await new Promise(res => { const w = reg.installing || reg.waiting; if (!w || w.state === 'installed' || w.state === 'redundant') return res(); w.addEventListener('statechange', () => { if (['installed', 'redundant'].includes(w.state)) res(); }); });
      return { waiting: !!reg.waiting, caches: await caches.keys() };
    });
    if (r.waiting) { await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting.postMessage('skip')); await page.waitForTimeout(600); await page.reload(); await page.waitForSelector('#tabs button[data-v]'); await page.waitForTimeout(600); }
    return { before, after: await page.evaluate(() => window.__VER), ...r };
  } finally { await browser.close(); await srv.close(); }
}

test('X-1 · aggiornamento con cache HTTP di 10 minuti (come GitHub Pages): dopo «Aggiorna» gira il codice nuovo', { skip, timeout: 90000 }, async () => {
  const r = await deploy({ 'cache-control': 'max-age=600' });
  assert.equal(r.before, 'v1'); assert.equal(r.waiting, true);
  assert.equal(r.after, 'v2', 'la nuova cache conteneva file vecchi: «Aggiorna» non aggiorna');
});
test('controllo: senza cache HTTP l\'aggiornamento funziona', { skip, timeout: 90000 }, async () => {
  const r = await deploy({ 'cache-control': 'no-cache' }); assert.equal(r.after, 'v2');
});
test('installazione atomica: se un file del nuovo deploy manca resta la vecchia versione e nessuna cache parziale', { skip, timeout: 90000 }, async () => {
  const r = await deploy({ 'cache-control': 'no-cache' }, { missing: ['js/player.js'] });
  assert.equal(r.waiting, false); assert.equal(r.after, 'v1'); assert.ok(!r.caches.some(k => k.includes('bbbb2222')), 'cache parziale rimasta: ' + r.caches.join());
});
test('offline: con il service worker installato l\'app si avvia senza rete e mostra la libreria', { skip, timeout: 90000 }, async () => {
  const pw = await playwright(), dir = stampedCopy(tmp('off'), { build: 'cccc3333' }), srv = await serve({ root: dir }, { headers: { 'cache-control': 'max-age=600' } }), browser = await launch(pw);
  try {
    const { ctx, page } = await openApp(browser, srv.url, { settings: { auto: 0 } });
    await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1500);
    await page.evaluate(async () => { const St = await import('/js/store.js'); await St.putTrack({ id: 'o1', title: 'Brano offline', artist: 'A', album: 'B', trk: 1, dur: 10, size: 1, name: 'o.mp3', fav: 0, added: Date.now(), p: 1, pc: 0 }); });
    await ctx.setOffline(true); await page.reload(); await page.waitForSelector('#tabs button[data-v]', { timeout: 15000 }); await page.waitForTimeout(800);
    assert.equal(await page.$eval('#v-lib .row b', e => e.textContent), 'Brano offline'); assert.deepEqual(page.errors, []);
  } finally { await browser.close(); await srv.close(); }
});
