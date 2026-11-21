import test from 'node:test';
import assert from 'node:assert/strict';
import { coverMark, titleVariants, typoMatch, scoreLyric, scoreOriginal, pickOriginalLyric, pickOriginal, pickCorrected, isGenericTitle, coverArtistHint } from '../js/match.js';

/* ======== parte pura (senza rete) ======== */
test('cover: marcatori riconosciuti, titoli normali no', () => {
  for (const s of ['Porto Cervo (Cover)', 'Porto Cervo [Cover]', 'Porto Cervo - Cover', 'Porto Cervo cover by Marco', 'Porto Cervo (Tribute)', 'Porto Cervo (Karaoke Version)']) assert.equal(coverMark(s), 'cover', s);
  for (const s of ['Porto Cervo (Live)', 'Porto Cervo - Acoustic', 'Porto Cervo (Remix)']) assert.equal(coverMark(s), 'version', s);
  for (const s of ['Cover Me', 'Recover', 'Discovery', 'Porto Cervo']) assert.equal(coverMark(s), '', s);
});
test('cover: il titolo ripulito non contiene il marcatore', () => {
  for (const s of ['Porto Cervo (Cover)', 'Porto Cervo - Cover', 'Porto Cervo cover by Marco', 'Porto Cervo [Tribute]']) assert.ok(titleVariants(s).includes('Porto Cervo'), s + ' → ' + titleVariants(s).join(' | '));
});
test('cover: artista diverso + durata coerente → testo dell\'originale accettato', () => {
  const q = { titles: titleVariants('Porto Cervo (Cover)'), dur: 205 };
  const orig = { trackName: 'Porto Cervo', artistName: 'Artista Originale', duration: 201, syncedLyrics: '[00:01.00]x' };
  assert.equal(pickOriginalLyric([orig], q), orig);
  assert.equal(scoreLyric(orig, { ...q, names: ['Dolcenera Lazza', 'Dolcenera', 'Lazza'] }), null);          // il punteggio normale resta severo
});
test('cover: artista diverso + durata incoerente → rifiutato', () => {
  const q = { titles: titleVariants('Porto Cervo (Cover)'), dur: 205 };
  assert.equal(pickOriginalLyric([{ trackName: 'Porto Cervo', artistName: 'Altro', duration: 262, plainLyrics: 'x' }], q), null);
  assert.equal(pickOriginalLyric([{ trackName: 'Porto Cervo', artistName: 'Altro', duration: 0, plainLyrics: 'x' }], q), null);   // durata ignota: nessuna conferma
  assert.equal(pickOriginalLyric([{ trackName: 'Porto Cervo', artistName: 'Altro', duration: 201, instrumental: true }], q), null);
});
test('cover: titolo generico → rifiutato; titolo diverso → rifiutato', () => {
  for (const t of ['Intro', 'Intro (Cover)', 'Track 1', 'Traccia 03', 'Outro']) assert.ok(isGenericTitle(t), t);
  const q = { titles: titleVariants('Intro (Cover)'), dur: 60 };
  assert.equal(pickOriginalLyric([{ trackName: 'Intro', artistName: 'Chiunque', duration: 60, plainLyrics: 'x' }], q), null);
  const q2 = { titles: titleVariants('Porto Cervo (Cover)'), dur: 205 };
  assert.equal(pickOriginalLyric([{ trackName: 'Porto Cervo Estate', artistName: 'A', duration: 205, plainLyrics: 'x' }], q2), null);
});
test('cover: titolo di una parola solo con durata quasi identica; due artisti diversi alla pari = ambiguo', () => {
  const q = { titles: titleVariants('Cenere (Cover)'), dur: 200 };
  assert.equal(pickOriginalLyric([{ trackName: 'Cenere', artistName: 'A', duration: 212, plainLyrics: 'x' }], q), null);
  assert.ok(pickOriginalLyric([{ trackName: 'Cenere', artistName: 'A', duration: 202, plainLyrics: 'x' }], q));
  const q2 = { titles: titleVariants('Porto Cervo (Cover)'), dur: 205 };
  assert.equal(pickOriginalLyric([{ trackName: 'Porto Cervo', artistName: 'A', duration: 204, plainLyrics: 'x' }, { trackName: 'Porto Cervo', artistName: 'B', duration: 205, plainLyrics: 'y' }], q2), null);
});
test('cover: con l\'artista originale noto (Deezer) si richiede anche quello', () => {
  const q = { titles: titleVariants('Porto Cervo (Cover)'), dur: 205, origArtist: 'Lazza' };
  assert.ok(scoreOriginal({ trackName: 'Porto Cervo', artistName: 'Lazza', duration: 200 }, q));
  assert.equal(scoreOriginal({ trackName: 'Porto Cervo', artistName: 'Qualcun Altro', duration: 205 }, q), null);
  const items = [{ title: 'Porto Cervo', artist: 'Lazza', dur: 203 }, { title: 'Porto Cervo (Karaoke)', artist: 'Karaoke Band', dur: 204 }, { title: 'Porto Cervo', artist: 'Altro', dur: 300 }];
  assert.equal(pickOriginal(items, { titles: ['Porto Cervo'], dur: 205 }).artist, 'Lazza');
  assert.equal(pickOriginal([{ title: 'Intro', artist: 'X', dur: 60 }], { titles: ['Intro'], dur: 60 }), null);
  assert.equal(pickOriginal([{ title: 'Porto Cervo', artist: 'A', dur: 203 }, { title: 'Porto Cervo', artist: 'B', dur: 204 }], { titles: ['Porto Cervo'], dur: 205 }), null);   // ambiguo
});
test('refusi: \"Cerco\" per \"Cervo\" accettato solo se confermato da artista/durata', () => {
  const q = { titles: titleVariants('Porto Cerco'), names: ['Dolcenera Lazza', 'Dolcenera', 'Lazza'], dur: 200 };
  assert.ok(scoreLyric({ trackName: 'Porto Cervo', artistName: 'Lazza', duration: 200 }, q));
  assert.equal(scoreLyric({ trackName: 'Porto Cervo', artistName: 'Qualcuno', duration: 120 }, q), null);   // né artista né durata
  assert.equal(scoreLyric({ trackName: 'Porto Cervo', artistName: 'Qualcuno', duration: 201 }, q), null);   // durata sì, artista palesemente diverso
  assert.equal(scoreLyric({ trackName: 'Porto Cervo', artistName: 'Lazza', duration: 250 }, q), null);     // artista sì, durata incompatibile
  assert.ok(typoMatch('Porto Cervo', 'Porto Cerco'));
  assert.ok(!typoMatch('Song 2', 'Song 3') && !typoMatch('Love', 'Live') && !typoMatch('Porto Cervo', 'Porto Cervi Estate'));
});
test('refusi: il titolo corretto viene da Deezer solo con artista e durata coerenti', () => {
  const items = [{ title: 'Porto Cervo', artist: 'Lazza', dur: 200 }, { title: 'Porto Cervo', artist: 'Altro', dur: 200 }];
  assert.equal(pickCorrected(items, { titles: ['Porto Cerco'], names: ['Lazza'], dur: 202 }).title, 'Porto Cervo');
  assert.equal(pickCorrected(items, { titles: ['Porto Cerco'], names: ['Nessuno'], dur: 202 }), null);
  assert.equal(pickCorrected(items, { titles: ['Porto Cerco'], names: ['Lazza'], dur: 300 }), null);
});

/* ======== flusso completo con rete simulata (nessuna richiesta reale) ======== */
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.window = globalThis;
globalThis.indexedDB = { open: () => ({}) };      // store.js apre il database all'importazione: qui non serve
const net = { lr: [], dz: [], lrclib: () => ({ status: 404 }), deezer: () => [] };
globalThis.fetch = async url => {
  net.lr.push(decodeURIComponent(url.replace('https://lrclib.net/api/', '')));
  const r = net.lrclib(new URL(url));
  return { ok: r.status === 200, status: r.status, json: async () => r.body };
};
globalThis.document = {
  createElement: () => ({ remove() {}, set src(u) { this._u = u; } }),
  head: { append(sc) { const u = new URL(sc._u), cb = u.searchParams.get('callback'); net.dz.push(u.searchParams.get('q')); setTimeout(() => globalThis[cb]({ data: net.deezer(u) }), 0); } },
};
const { findLyrics } = await import('../js/online.js');
const reset = () => { net.lr.length = 0; net.dz.length = 0; net.lrclib = () => ({ status: 404 }); net.deezer = () => []; };
const SYN = '[00:01.00]ciao';

test('flusso: «Dolcenera Lazza - Porto Cervo (Cover)» → testo dell\'originale, entro il budget', async () => {
  reset();
  net.deezer = () => [{ title: 'Porto Cervo', artist: { name: 'Artista Originale' }, duration: 201 }];
  net.lrclib = u => u.pathname.endsWith('/search') && u.searchParams.get('track_name') === 'Porto Cervo'
    ? { status: 200, body: [{ trackName: 'Porto Cervo', artistName: 'Artista Originale', duration: 201, syncedLyrics: SYN }] } : { status: 404 };
  const r = await findLyrics({ id: 'c1', title: 'Porto Cervo (Cover)', artist: 'Dolcenera Lazza', dur: 205 });
  assert.equal(r, SYN); assert.ok(net.lr.length <= 8, 'richieste LRCLIB: ' + net.lr.length); assert.ok(net.dz.length <= 2); // passo originale + passo refuso, entrambi riservati
});
test('flusso: cover con durata incoerente o titolo generico → nessun testo', async () => {
  reset();
  net.deezer = () => [{ title: 'Porto Cervo', artist: { name: 'Artista Originale' }, duration: 260 }];
  net.lrclib = u => u.pathname.endsWith('/search') ? { status: 200, body: [{ trackName: 'Porto Cervo', artistName: 'Artista Originale', duration: 262, syncedLyrics: SYN }] } : { status: 404 };
  assert.equal(await findLyrics({ id: 'c2', title: 'Porto Cervo (Cover)', artist: 'Dolcenera Lazza', dur: 205 }), null);
  reset();
  net.lrclib = u => u.pathname.endsWith('/search') ? { status: 200, body: [{ trackName: 'Intro', artistName: 'Chiunque', duration: 60, syncedLyrics: SYN }] } : { status: 404 };
  assert.equal(await findLyrics({ id: 'c3', title: 'Intro (Cover)', artist: 'Dolcenera Lazza', dur: 60 }), null);
});
test('flusso: refuso nel titolo («Cerco») corretto con Deezer e confermato da artista e durata', async () => {
  reset();
  net.deezer = () => [{ title: 'Porto Cervo', artist: { name: 'Lazza' }, duration: 200 }];
  net.lrclib = u => (u.searchParams.get('track_name') === 'Porto Cervo' ? { status: 200, body: u.pathname.endsWith('/search') ? [{ trackName: 'Porto Cervo', artistName: 'Lazza', duration: 200, syncedLyrics: SYN }] : { trackName: 'Porto Cervo', artistName: 'Lazza', duration: 200, syncedLyrics: SYN } } : { status: 404 });
  const r = await findLyrics({ id: 'c4', title: 'Porto Cerco', artist: 'Lazza', dur: 200 });
  assert.equal(r, SYN); assert.ok(net.lr.length <= 8);
});
test('flusso: brano normale senza testo → nessuna richiesta oltre il budget', async () => {
  reset();
  const r = await findLyrics({ id: 'c5', title: 'Una Canzone Qualsiasi', artist: 'Tizio Caio', dur: 180 }, { budget: 8 });
  assert.equal(r, null); assert.ok(net.lr.length <= 8, 'richieste: ' + net.lr.length); assert.ok(net.dz.length <= 2); // passo originale + passo refuso, entrambi riservati
});

test('marcatori file: pulizia di Visual/Testo/con e indizio artista per cover', () => {
  assert.ok(titleVariants('BESTIA (Visual)').includes('BESTIA'));
  assert.ok(titleVariants('La Fine  (Testo) (con Laura M.)').includes('La Fine'));
  assert.ok(titleVariants('Porto Cervo (Lazza Cover)').includes('Porto Cervo'));
  assert.ok(titleVariants('Porto Cervo cover of Lazza').includes('Porto Cervo'));
  assert.equal(coverArtistHint('Porto Cervo (Lazza Cover)'), 'Lazza');
});
test('originale: indizio nel marcatore orienta, ma non sostituisce titolo e durata', () => {
  const candidates = [
    { title: 'La Fine', artist: 'Altro', dur: 201 },
    { title: 'La Fine', artist: 'Lazza', dur: 204 },
    { title: 'La Fine', artist: 'Nesli', dur: 205 },
  ];
  assert.equal(pickOriginal(candidates, { titles: ['La Fine'], dur: 205, hint: 'Nesli' }).artist, 'Nesli');
  assert.equal(pickOriginal([{ title: 'Altro', artist: 'Nesli', dur: 205 }], { titles: ['La Fine'], dur: 205, hint: 'Nesli' }), null);
});

test('flusso: senza marcatore, fallback originale trova Nesli solo con titolo e durata coerenti', async () => {
  reset();
  net.deezer = () => [{ title: 'La Fine', artist: { name: 'Nesli' }, duration: 238 }];
  net.lrclib = u => {
    if (u.searchParams.get('artist_name') === 'Nesli' || (u.pathname.endsWith('/search') && u.searchParams.get('artist_name') === 'Nesli')) {
      return { status: 200, body: u.pathname.endsWith('/search')
        ? [{ trackName: 'La Fine', artistName: 'Nesli', duration: 238, syncedLyrics: SYN }]
        : { trackName: 'La Fine', artistName: 'Nesli', duration: 238, syncedLyrics: SYN } };
    }
    return { status: 404 };
  };
  const r = await findLyrics({ id: 'lf1', title: 'La Fine  (Testo) (con Laura M.)', artist: 'Lazza Emma', dur: 238 }, { budget: 8 });
  assert.equal(r, SYN);
  assert.ok(net.lr.length <= 8);
});
test('flusso: fallback originale senza marcatore rifiuta candidati Deezer ambigui', async () => {
  reset();
  net.deezer = () => [
    { title: 'La Fine', artist: { name: 'Nesli' }, duration: 255 },
    { title: 'La Fine', artist: { name: 'Altro' }, duration: 256 },
  ];
  net.lrclib = u => u.pathname.endsWith('/search')
    ? { status: 200, body: [{ trackName: 'La Fine', artistName: 'Nesli', duration: 238, syncedLyrics: SYN }] }
    : { status: 404 };
  const r = await findLyrics({ id: 'lf2', title: 'La Fine (Testo)', artist: 'Lazza Emma', dur: 255 }, { budget: 8 });
  assert.equal(r, null);
});

test('cover: artista nel marcatore è un indizio esplicito nei formati supportati', () => {
  assert.equal(coverArtistHint('Porto Cervo (Lazza Cover)'), 'Lazza');
  assert.equal(coverArtistHint('Porto Cervo (Cover di Lazza)'), 'Lazza');
  assert.equal(coverArtistHint('Porto Cervo (Cover of Lazza)'), 'Lazza');
  assert.equal(coverArtistHint('Porto Cervo cover by Lazza'), 'Lazza');
  assert.equal(coverArtistHint('Porto Cervo cover of Lazza'), 'Lazza');
  assert.equal(coverArtistHint('Porto Cervo - originale di Lazza'), 'Lazza');
  assert.equal(coverArtistHint('Porto Cervo (Originale di Lazza)'), 'Lazza');
});

test('cover: durata ampia ammessa solo con artista originale confermato e titolo identico', () => {
  const q = { titles: ['Porto Cervo'], dur: 320, origArtist: 'Lazza', maxDur: 120, preferPlainBeyond: 15 };
  const plain = { trackName: 'Porto Cervo', artistName: 'Lazza', duration: 250, syncedLyrics: SYN, plainLyrics: 'testo semplice' };
  assert.ok(scoreOriginal(plain, q));
  assert.equal(pickOriginalLyric([plain], q), plain);
  assert.equal(pickOriginalLyric([{ ...plain, plainLyrics: '' }], q), null); // LRC fuori tempo: niente sincronizzato
  assert.equal(scoreOriginal({ ...plain, trackName: 'Porto Cervo Estate' }, q), null);
  assert.equal(scoreOriginal({ ...plain, artistName: 'Altro' }, q), null);
  assert.equal(scoreOriginal({ ...plain, duration: 199 }, q), null); // oltre il tetto assoluto di 120 s
  assert.equal(scoreOriginal({ ...plain, artistName: 'Lazza' }, { titles: ['Porto Cervo'], dur: 320 }), null);
});

test('flusso: Porto Cervo (Lazza Cover), durata maggiore → plainLyrics Lazza entro il tetto', async () => {
  reset();
  net.deezer = () => [{ title: 'Porto Cervo', artist: { name: 'Lazza' }, duration: 250 }];
  net.lrclib = u => {
    if (u.searchParams.get('artist_name') === 'Lazza' && u.searchParams.get('track_name') === 'Porto Cervo')
      return { status: 200, body: { trackName: 'Porto Cervo', artistName: 'Lazza', duration: 250, syncedLyrics: SYN, plainLyrics: 'testo semplice Lazza' } };
    return { status: 404 };
  };
  assert.equal(await findLyrics({ id: 'pc-lazza', title: 'Porto Cervo (Lazza Cover)', artist: 'Dolcenera Lazza', dur: 320 }), 'testo semplice Lazza');
  assert.ok(net.lr.length <= 8);
});

test('flusso: Porto Cervo oltre il tetto o senza conferma artista → nessuna associazione', async () => {
  reset();
  net.deezer = () => [{ title: 'Porto Cervo', artist: { name: 'Lazza' }, duration: 250 }];
  net.lrclib = u => u.pathname.endsWith('/search')
    ? { status: 200, body: [{ trackName: 'Porto Cervo', artistName: 'Lazza', duration: 250, plainLyrics: 'testo sbagliato' }] }
    : { status: 404 };
  assert.equal(await findLyrics({ id: 'pc-over', title: 'Porto Cervo (Lazza Cover)', artist: 'Dolcenera Lazza', dur: 380 }), null);
  reset();
  net.deezer = () => [{ title: 'Porto Cervo', artist: { name: 'Lazza' }, duration: 250 }];
  net.lrclib = u => u.pathname.endsWith('/search')
    ? { status: 200, body: [{ trackName: 'Porto Cervo', artistName: 'Lazza', duration: 250, plainLyrics: 'testo sbagliato' }] }
    : { status: 404 };
  assert.equal(await findLyrics({ id: 'pc-unconfirmed', title: 'Porto Cervo (Lazza Cover)', artist: 'Dolcenera', dur: 320 }), null);
});

test('flusso: due Porto Cervo di artisti diversi ugualmente plausibili → nessuna associazione', async () => {
  reset();
  net.deezer = () => [
    { title: 'Porto Cervo', artist: { name: 'Lazza' }, duration: 200 },
    { title: 'Porto Cervo', artist: { name: 'Altro' }, duration: 201 },
  ];
  net.lrclib = u => u.pathname.endsWith('/search') && u.searchParams.get('track_name') === 'Porto Cervo'
    ? { status: 200, body: [
      { trackName: 'Porto Cervo', artistName: 'Lazza', duration: 200, plainLyrics: 'testo Lazza' },
      { trackName: 'Porto Cervo', artistName: 'Altro', duration: 201, plainLyrics: 'testo Altro' },
    ] } : { status: 404 };
  assert.equal(await findLyrics({ id: 'pc-amb', title: 'Porto Cervo (Cover)', artist: 'Dolcenera', dur: 205 }), null);
});
