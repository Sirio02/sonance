/* Difetti confermati nell'audit e NON ancora corretti. Ogni test descrive il comportamento ATTESO ed è marcato `todo`: oggi fallisce (e non fa fallire
   la suite). Quando la fase indicata lo corregge, il test passa: si toglie `todo` e diventa una regressione a tutti gli effetti. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipReason, playwright, serve, launch, openApp, fixtures, importFiles, APP } from './helpers.mjs';
const skip = await skipReason();
let srv, browser, media;
before(async () => { if (skip) return; media = fixtures(); srv = await serve({ root: APP }); browser = await launch(await playwright()); });
after(async () => { await browser?.close(); await srv?.close(); });
const T = (name, phase, fn) => test(name, { skip, todo: phase, timeout: 90000 }, fn);
const withApp = async (files, fn, settings = { auto: 0 }) => { const { ctx, page } = await openApp(browser, srv.url, { settings }); try { if (files.length) await importFiles(page, files.map(media)); return await fn(page); } finally { await ctx.close(); } };

T('A-1 · un album con «feat.» nel campo artista, maiuscole diverse e una compilation senza album-artist non si spezzano', 'Fase 2', () => withApp(['01-sinfonia.mp3', '02-sinfonia.mp3', '03-sinfonia.mp3', 'c1.mp3', 'c2.mp3', 'c3.mp3'], async page => {
  const albums = await page.evaluate(async () => (await import('/js/library.js')).albums().map(a => a.tracks.length).sort());
  assert.deepEqual(albums, [3, 3], 'attesi 2 album da 3 brani, trovati: ' + albums.join(','));
}));
T('A-2 · in un doppio album i brani seguono disco e traccia', 'Fase 2', () => withApp(['d1t1.mp3', 'd1t2.mp3', 'd2t1.mp3', 'd2t2.mp3'], async page => {
  const order = await page.evaluate(async () => (await import('/js/library.js')).albums()[0].tracks.map(t => t.title).join(' > '));
  assert.equal(order, 'Alba > Giorno > Sera > Notte');
}));
T('L-1 · i tag di un file FLAC (Vorbis comment) vengono letti', 'Fase 2', () => withApp(['flac1.flac'], async page => {
  const t = await page.evaluate(async () => { const x = (await import('/js/library.js')).lib.list[0]; return { title: x.title, artist: x.artist, album: x.album }; });
  assert.deepEqual(t, { title: 'Brano Flac', artist: 'Marco', album: 'Album Flac' });
}));
T('L-2 · la ricerca trova «artista titolo» come «titolo artista»', 'Fase 7 (ricerca intelligente)', () => withApp(['01-sinfonia.mp3'], async page => {
  const n = await page.evaluate(async () => { const L = await import('/js/library.js'); return [L.search('cenere lazza').length, L.search('lazza cenere').length]; });
  assert.deepEqual(n, [1, 1]);
}));
T('L-3 · con «Cerca su internet» spento, avviare un brano non contatta nessun servizio esterno', 'Fase 2', async () => {
  const { ctx, page } = await openApp(browser, srv.url, { settings: { auto: 0 } }); const hosts = new Set();
  page.on('requestfailed', r => { const u = new URL(r.url()); if (u.hostname !== '127.0.0.1') hosts.add(u.hostname); });
  try {
    await importFiles(page, [media('c1.mp3')]); await page.waitForTimeout(500); hosts.clear();
    await page.evaluate(async () => { const pl = await import('/js/player.js'), L = await import('/js/library.js'); pl.setQueue(L.lib.list.slice(), 0); });
    await page.waitForTimeout(3500);
    assert.deepEqual([...hosts], [], 'richieste esterne con l\'interruttore spento: ' + [...hosts].join(', '));
  } finally { await ctx.close(); }
});
T('M-1 · il pannello della coda non costruisce un nodo DOM per ogni brano (2.000 brani)', 'Fase 3', () => withApp([], async page => {
  const nodes = await page.evaluate(async () => {
    const L = await import('/js/library.js'), pl = await import('/js/player.js'), { bus } = await import('/js/util.js');
    L.lib.list = Array.from({ length: 2000 }, (_, i) => ({ id: 'q' + i, title: 'Brano ' + i, artist: 'A', album: 'B', dur: 100, name: i + '.mp3', size: i })); L.lib.map = new Map(L.lib.list.map(t => [t.id, t]));
    await pl.setQueue(L.lib.list, 0); pl.pause(); bus.emit('open-full'); await new Promise(r => setTimeout(r, 400));
    [...document.querySelectorAll('#full button')].find(b => /oda/i.test(b.getAttribute('aria-label') || '')).click(); await new Promise(r => setTimeout(r, 300));
    return document.querySelectorAll('dialog[open] *').length;
  });
  assert.ok(nodes < 5000, 'nodi DOM nel pannello coda: ' + nodes);
}));
T('M-2 · con il player espanso aperto il focus da tastiera non esce dal player', 'Fase 3 / 4', () => withApp(['c1.mp3'], async page => {
  await page.evaluate(async () => { const pl = await import('/js/player.js'), L = await import('/js/library.js'), { bus } = await import('/js/util.js'); await pl.setQueue(L.lib.list.slice(), 0); pl.pause(); bus.emit('open-full'); });
  await page.waitForTimeout(500); let outside = 0;
  for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => !!document.activeElement.closest('#full')))) outside++; }
  assert.equal(outside, 0, 'Tab fuori dal player: ' + outside + ' su 30');
}));
T('M-4 · il timer di spegnimento sfuma il volume (non taglia di colpo) anche con le impostazioni predefinite', 'Fase 3', () => withApp(['long.mp3'], async page => {
  const ms = await page.evaluate(async () => {
    const pl = await import('/js/player.js'), L = await import('/js/library.js'); await pl.setQueue(L.lib.list.slice(), 0); await new Promise(r => setTimeout(r, 600));
    const t0 = performance.now(); pl.setSleep(0.02);
    for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 100)); if (!pl.isPlaying()) return Math.round(performance.now() - t0); } return -1;
  });
  assert.ok(ms > 3000, 'si è fermato dopo ' + ms + ' ms: nessuna sfumatura');
}));
T('M-6 · eliminando un brano presente 3 volte in coda ne spariscono tutte le occorrenze', 'Fase 3', () => withApp(['c1.mp3', 'c2.mp3', 'c3.mp3'], async page => {
  const left = await page.evaluate(async () => {
    const pl = await import('/js/player.js'), L = await import('/js/library.js'), t = L.lib.list.find(x => x.title === 'Uno');
    await pl.setQueue(L.lib.list.filter(x => x !== t), 0); pl.enqueueEnd(t); pl.enqueueEnd(t); pl.enqueueEnd(t); await L.removeTrack(t, true); await new Promise(r => setTimeout(r, 150));
    return pl.P.queue.filter(x => x === t).length;
  });
  assert.equal(left, 0);
}));
T('P-3 · una playlist (o «Preferiti») con 500 brani si può vedere e gestire per intero', 'Fase 6', () => withApp([], async page => {
  const rows = await page.evaluate(async () => {
    const L = await import('/js/library.js');
    L.lib.list = Array.from({ length: 500 }, (_, i) => ({ id: 'f' + i, title: 'Brano ' + i, artist: 'A', album: 'B', dur: 100, name: i + '.mp3', size: i, fav: 1, added: i })); L.lib.map = new Map(L.lib.list.map(t => [t.id, t])); L.touchData();
    document.querySelector('#tabs button[data-v=pl]').click(); await new Promise(r => setTimeout(r, 500));
    [...document.querySelectorAll('#v-pl .card, #v-pl .hcard, #v-pl .row')].find(e => /Preferiti/.test(e.textContent))?.click(); await new Promise(r => setTimeout(r, 800));
    const sc = document.querySelector('#dt'); for (let i = 0; i < 12; i++) { sc?.scrollTo?.(0, 1e6); await new Promise(r => setTimeout(r, 120)); }
    return document.querySelectorAll('#dt .row').length;
  });
  assert.equal(rows, 500, 'righe mostrate: ' + rows);
}));
T('Y-2 · cercando in rapida successione su YouTube si vedono i risultati dell\'ULTIMA ricerca', 'Fase 5', async () => {
  const { ctx, page } = await openApp(browser, srv.url, { settings: { auto: 0, beta: 1 } });
  try {
    const delay = { aaa: 500, bbb: 1500, ccc: 200 };
    await ctx.route('https://sonance-youtube-api.brahhh-art.workers.dev/**', async r => {
      const q = new URL(r.request().url()).searchParams.get('q') || ''; await new Promise(res => setTimeout(res, delay[q] ?? 50));
      r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ videoId: 'abcdefghij1', title: 'RISULTATO ' + q, description: '', channelTitle: 'C', publishedAt: '2024-01-01T00:00:00Z', thumbnail: '' }], nextPageToken: '' }) });
    });
    await page.waitForSelector('#tabs button[data-v=yt]'); await page.click('#tabs button[data-v=yt]');
    const input = page.locator('#v-yt input[type=search]');
    for (const q of ['aaa', 'bbb', 'ccc']) { await input.fill(q); await input.press('Enter'); await page.waitForTimeout(80); }
    await page.waitForTimeout(2600);
    assert.equal(await page.$eval('#v-yt .ytresult b', e => e.textContent), 'RISULTATO ccc');
  } finally { await ctx.close(); }
});
