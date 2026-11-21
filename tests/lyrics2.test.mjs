import test from 'node:test';
import assert from 'node:assert/strict';
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.window = globalThis;
globalThis.indexedDB = { open: () => ({}) };
const mem = new Map(); globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
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
const { findLyrics, clearOnlineCaches } = await import('../js/online.js');
const { rankOriginals, SYNC_MAX } = await import('../js/match.js');
const reset = () => { clearOnlineCaches(); net.lr.length = 0; net.dz.length = 0; net.lrclib = () => ({ status: 404 }); net.deezer = () => []; };
const SYN = '[00:01.00]ciao\n[00:05.00]mondo', PLAIN = 'ciao\nmondo';
const dz = (title, artist, duration, rank) => ({ title, artist: { name: artist }, duration, rank });
const lr = (artist, dur, extra = {}) => u => (u.searchParams.get('artist_name') === artist || u.searchParams.get('q')?.includes(artist)
  ? { status: 200, body: u.pathname.endsWith('/search') ? [{ trackName: 'La Fine', artistName: artist, duration: dur, syncedLyrics: SYN, plainLyrics: PLAIN, ...extra }] : { trackName: 'La Fine', artistName: artist, duration: dur, syncedLyrics: SYN, plainLyrics: PLAIN, ...extra } }
  : { status: 404 });
let n = 0; const T = (o = {}) => ({ id: 'x' + ++n, title: 'La Fine', artist: 'Lazza, Emma', dur: 215, ...o });

test('CASO TARGET: «Lazza, Emma – La fine», senza marcatore, durata diversa → testo NON sincronizzato di Nesli, entro il budget', async () => {
  reset();
  net.deezer = () => [dz('La Fine', 'Nesli', 255, 480000), dz('La Fine', 'Altro Artista', 190, 12000), dz('La Fine (Live)', 'Nesli', 260, 9000)];
  net.lrclib = lr('Nesli', 255);
  const meta = {}, r = await findLyrics(T(), { budget: 8, meta });
  assert.equal(r, PLAIN, 'deve essere il testo semplice: la durata differisce di 40 s, i tempi non sono affidabili');
  assert.equal(meta.kind, 'original'); assert.equal(meta.from, 'Nesli'); assert.equal(meta.synced, false);
  assert.ok(net.lr.length <= 8, 'richieste LRCLIB: ' + net.lr.length);
});
test('stesso caso con durata vicina (≤ soglia) → testo sincronizzato', async () => {
  reset();
  net.deezer = () => [dz('La Fine', 'Nesli', 218, 480000), dz('La Fine', 'Altro Artista', 190, 12000)];
  net.lrclib = lr('Nesli', 218);
  const meta = {}, r = await findLyrics(T(), { meta });
  assert.equal(r, SYN); assert.equal(meta.synced, true); assert.ok(Math.abs(215 - 218) <= SYNC_MAX);
});
test('titolo molto comune con due originali alla pari → nessun testo (meglio niente che sbagliato)', async () => {
  reset();
  net.deezer = () => [dz('La Fine', 'Nesli', 255, 300000), dz('La Fine', 'Altro Artista', 250, 290000)];
  net.lrclib = lr('Nesli', 255);
  assert.equal(await findLyrics(T()), null);
});
test('titoli generici, di una parola con durata lontana, senza durata del file → rifiutati', async () => {
  reset(); net.deezer = () => [dz('Intro', 'Nesli', 60, 999999)]; net.lrclib = lr('Nesli', 60);
  assert.equal(await findLyrics(T({ title: 'Intro', dur: 62 })), null);
  reset(); net.deezer = () => [dz('Cenere', 'Nesli', 240, 999999)]; net.lrclib = u => ({ status: 200, body: u.pathname.endsWith('/search') ? [{ trackName: 'Cenere', artistName: 'Nesli', duration: 240, plainLyrics: PLAIN }] : { trackName: 'Cenere', artistName: 'Nesli', duration: 240, plainLyrics: PLAIN } });
  assert.equal(await findLyrics(T({ title: 'Cenere', dur: 215 })), null);
  reset(); net.deezer = () => [dz('La Fine', 'Nesli', 255, 480000)]; net.lrclib = lr('Nesli', 255);
  assert.equal(await findLyrics(T({ dur: 0 })), null);
});
test('versioni live/remix/karaoke di altri artisti non sono «originali»; l\'artista del file non è mai il candidato', async () => {
  reset(); net.deezer = () => [dz('La Fine (Live)', 'Nesli', 255, 480000), dz('La Fine (Karaoke Version)', 'Altro', 255, 400000)]; net.lrclib = lr('Nesli', 255);
  assert.equal(await findLyrics(T()), null);
  assert.equal(rankOriginals([{ title: 'La Fine', artist: 'Lazza', dur: 215, rank: 9 }], { title: 'La Fine', dur: 215, names: ['Lazza', 'Emma'] }), null);
});
test('rifiuto se l\'LRCLIB restituisce un\'altra registrazione (durata lontana da quella dell\'originale Deezer)', async () => {
  reset(); net.deezer = () => [dz('La Fine', 'Nesli', 255, 480000)]; net.lrclib = lr('Nesli', 190);
  assert.equal(await findLyrics(T()), null);
});
test('un solo candidato con durata molto diversa (> 45 s) → rifiutato; ≤ 45 s e unico → testo semplice', async () => {
  const one = d => rankOriginals([{ title: 'La Fine', artist: 'Nesli', dur: d, rank: 1 }], { title: 'La Fine', dur: 215, names: ['Lazza', 'Emma'] });
  assert.equal(one(300), null); assert.equal(one(255).plain, true); assert.equal(one(217).plain, false);
});
test('budget: caso con artisti multipli → il passo originale viene prima dei tentativi costosi', async () => {
  reset(); net.deezer = () => [dz('La Fine', 'Nesli', 255, 480000)]; net.lrclib = lr('Nesli', 255);
  await findLyrics(T(), { budget: 4 });                                     // con un budget ridotto l'originale deve comunque arrivare
  assert.ok(net.lr.some(x => /Nesli/.test(x)), net.lr.join(' | '));
});
