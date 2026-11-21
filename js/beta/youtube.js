/* Riconoscimento locale di link YouTube e ricerche (puro, testato in Node). Nessuna richiesta di rete: l'URL aperto è sempre ricostruito da ID validati. */
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const ID = /^[A-Za-z0-9_-]{11}$/, LIST = /^[A-Za-z0-9_-]{10,64}$/;
const BAD_SCHEME = /^\s*(?:javascript|data|vbscript|file|blob|ftp|intent|about):/i;
export const MAX_QUERY = 200;

/** Secondi da "90", "90s", "1m30s", "1h2m3s". null se non valido. */
export function parseTime(v) {
  if (v == null || v === '') return null;
  if (/^\d{1,6}$/.test(v)) return +v;
  const m = /^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/i.exec(v);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}
const bad = error => ({ kind: 'invalid', error });
const watch = (id, list, t) => 'https://www.youtube.com/watch?v=' + id + (list ? '&list=' + list : '') + (t ? '&t=' + t + 's' : '');

/** Classifica il testo: {kind:'video'|'playlist'|'search'|'invalid'|'empty', ...}. */
export function parseYouTube(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { kind: 'empty' };
  if (BAD_SCHEME.test(raw)) return bad('Link non valido: sono ammessi solo indirizzi web (http o https).');
  /* URL: con protocollo (anche dentro altro testo) oppure dominio nudo come "youtu.be/abc" */
  const m = /https?:\/\/[^\s<>"']+/i.exec(raw) || /(?:^|\s)((?:www\.|m\.|music\.)?(?:youtube(?:-nocookie)?\.com|youtu\.be)\/[^\s<>"']*)/i.exec(raw);
  const looksUrl = m || /^[^\s/]+\.[a-z]{2,}(?:\/\S*)?$/i.test(raw);
  if (!looksUrl && /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return bad('Link non valido: indirizzo malformato.');
  if (!looksUrl) {
    if (raw.length > MAX_QUERY) return bad('Ricerca troppo lunga (massimo ' + MAX_QUERY + ' caratteri).');
    return { kind: 'search', query: raw, url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(raw) };
  }
  let u; try { u = new URL(m ? (/^https?:/i.test(m[1] || m[0]) ? (m[1] || m[0]) : 'https://' + (m[1] || m[0])) : 'https://' + raw); } catch { return bad('Link non valido: indirizzo malformato.'); }
  if (!/^https?:$/.test(u.protocol)) return bad('Link non valido: sono ammessi solo indirizzi web (http o https).');
  const host = u.hostname.toLowerCase();
  if (!HOSTS.has(host)) return bad('Questo non è un link YouTube.');
  const seg = u.pathname.split('/').filter(Boolean), p = u.searchParams;
  const list = LIST.test(p.get('list') || '') ? p.get('list') : null;
  const tRaw = p.get('t') ?? p.get('start'), t = parseTime(tRaw);
  let id = null;
  if (host.endsWith('youtu.be')) id = seg[0];
  else if (seg[0] === 'watch') id = p.get('v');
  else if (['shorts', 'live', 'embed', 'v'].includes(seg[0])) id = seg[1];
  if (id != null) {
    if (!ID.test(id)) return bad('Link non valido: l\u2019identificativo del video non è corretto.');
    return { kind: 'video', id, ...(list && { list }), ...(t != null && t > 0 && { t }), url: watch(id, list, t > 0 ? t : 0) };
  }
  if (seg[0] === 'playlist' || (seg[0] === 'watch' && list) || (seg.length === 0 && list)) {
    if (!list) return bad('Link non valido: manca l\u2019identificativo della playlist.');
    return { kind: 'playlist', list, url: 'https://www.youtube.com/playlist?list=' + list };
  }
  return bad('Link YouTube non riconosciuto: incolla il link di un video o di una playlist.');
}

/** Cronologia delle ricerche: più recente in testa, senza doppioni (anche per maiuscole), al massimo `max`. */
export function pushHistory(list, q, max = 10) {
  const t = String(q || '').trim(); if (!t) return list.slice(0, max);
  return [t, ...list.filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, max);
}
