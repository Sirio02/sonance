import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const env = { YOUTUBE_API_KEY: 'test-key', ALLOWED_ORIGINS: 'https://demo.github.io' };
const req = (path, origin = 'https://demo.github.io') => new Request('https://api.example.workers.dev' + path, { headers: origin ? { Origin: origin } : {} });

test('backend YouTube: rifiuta origin non autorizzate e route sconosciute', async () => {
  assert.equal((await worker.fetch(req('/api/youtube/search', 'https://evil.example'), env)).status, 403);
  assert.equal((await worker.fetch(req('/nope'), env)).status, 404);
});
test('backend YouTube: valida query e richiede la chiave server-side', async () => {
  assert.equal((await worker.fetch(req('/api/youtube/search?q=x'), env)).status, 400);
  assert.equal((await worker.fetch(req('/api/youtube/search?q=music'), { ALLOWED_ORIGINS: env.ALLOWED_ORIGINS })).status, 503);
});
test('backend YouTube: normalizza la risposta API e limita le miniature a i.ytimg.com', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async url => {
    const u = new URL(url);
    assert.equal(u.hostname, 'www.googleapis.com');
    assert.equal(u.searchParams.get('key'), 'test-key');
    return new Response(JSON.stringify({ items: [
      { id: { videoId: 'abcdefghijk' }, snippet: { title: 'Brano', description: 'Descrizione', channelTitle: 'Artista', publishedAt: '2026-01-01T00:00:00Z', thumbnails: { high: { url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg' } } } },
      { id: { videoId: 'bad' }, snippet: { title: 'Ignora' } },
      { id: { videoId: 'lmnopqrstuv' }, snippet: { title: 'No thumb', thumbnails: { high: { url: 'https://evil.example/x.jpg' } } } },
    ], nextPageToken: 'CAUQAA' }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const r = await worker.fetch(req('/api/youtube/search?q=musica'), env);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://demo.github.io');
    const body = await r.json();
    assert.equal(body.items.length, 2);
    assert.equal(body.items[0].title, 'Brano');
    assert.equal(body.items[0].thumbnail, 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
    assert.equal(body.items[1].thumbnail, '');
    assert.equal(body.nextPageToken, 'CAUQAA');
  } finally { globalThis.fetch = old; }
});
test('backend YouTube: preflight CORS', async () => {
  const r = await worker.fetch(new Request('https://api.example.workers.dev/api/youtube/search', { method: 'OPTIONS', headers: { Origin: 'https://demo.github.io' } }), env);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
});
