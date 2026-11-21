const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });

function allowedOrigin(origin, env) {
  if (!origin) return false;
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  return allowed.includes(origin);
}
function cors(origin) {
  return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'vary': 'Origin' };
}
function safeThumbnail(snippet) {
  const candidates = ['high', 'medium', 'default'].map(k => snippet?.thumbnails?.[k]?.url).filter(Boolean);
  return candidates.find(raw => { try { const u = new URL(raw); return u.protocol === 'https:' && u.hostname === 'i.ytimg.com'; } catch { return false; } }) || '';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!allowedOrigin(origin, env)) return json({ error: 'Origin non autorizzata.' }, 403);
    const ch = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...ch, 'access-control-max-age': '86400' } });
    if (request.method !== 'GET') return json({ error: 'Metodo non supportato.' }, 405, ch);
    const url = new URL(request.url);
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const limit = await env.RATE_LIMITER.limit({ key: ip });
      if (!limit.success) return json({ error: 'Troppe ricerche in poco tempo. Attendi un minuto e riprova.' }, 429, ch);
    }
    if (url.pathname !== '/api/youtube/search') return json({ error: 'Endpoint non trovato.' }, 404, ch);
    if (!env.YOUTUBE_API_KEY) return json({ error: 'Il backend non è configurato: manca YOUTUBE_API_KEY.' }, 503, ch);
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2 || q.length > 100) return json({ error: 'La ricerca deve contenere da 2 a 100 caratteri.' }, 400, ch);
    const pageToken = url.searchParams.get('pageToken') || '';
    if (pageToken.length > 500 || /[\x00-\x20\x7F]/.test(pageToken)) return json({ error: 'Token di pagina non valido.' }, 400, ch);

    const api = new URL('https://www.googleapis.com/youtube/v3/search');
    api.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '10', q, regionCode: 'IT', relevanceLanguage: 'it', safeSearch: 'moderate', key: env.YOUTUBE_API_KEY }).toString();
    if (pageToken) api.searchParams.set('pageToken', pageToken);
    try {
      const upstream = await fetch(api, { headers: { accept: 'application/json' }, cf: { cacheTtl: 0, cacheEverything: false } });
      const payload = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        const reason = payload?.error?.errors?.[0]?.reason || '';
        const status = reason === 'quotaExceeded' || upstream.status === 429 ? 429 : 502;
        return json({ error: status === 429 ? 'Quota di ricerca YouTube esaurita per oggi.' : 'YouTube non ha completato la ricerca.' }, status, ch);
      }
      const items = (payload.items || []).flatMap(item => {
        const id = item?.id?.videoId, s = item?.snippet;
        if (!/^[A-Za-z0-9_-]{11}$/.test(id || '') || !s) return [];
        return [{ videoId: id, title: String(s.title || '').slice(0, 300), description: String(s.description || '').slice(0, 240), channelTitle: String(s.channelTitle || '').slice(0, 150), publishedAt: String(s.publishedAt || '').slice(0, 32), thumbnail: safeThumbnail(s) }];
      });
      return json({ items, nextPageToken: String(payload.nextPageToken || '').slice(0, 500) }, 200, ch);
    } catch {
      return json({ error: 'Impossibile contattare YouTube. Riprova più tardi.' }, 502, ch);
    }
  }
};
