/* Scheda YouTube: ricerca ufficiale tramite backend Sonance e apertura su YouTube.
   Nessun download/estrazione di contenuti YouTube. */
import { h } from '../util.js';
import { parseYouTube, pushHistory } from './youtube.js';
import { YOUTUBE_API_BASE } from './youtube-config.js';

const KEY = 'sonance.ythist';
const ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3.5"/><path d="M10 9l5 3-5 3z"/></svg>';
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 10) : []; } catch { return []; } };
const save = l => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* cronologia facoltativa */ } };
const ytUrl = id => 'https://www.youtube.com/watch?v=' + encodeURIComponent(id);
const openExternal = url => window.open(url, '_blank', 'noopener,noreferrer');
const text = (v, max = 500) => String(v || '').slice(0, max);

export function init(ctx) {
  ctx.addTab({ id: 'yt', label: 'YouTube', iconHtml: ICON, after: 'art', build(sec) {
    let hist = load(), busy = false, controller = null, nextPage = '';
    const input = h('input', { class: 'field', type: 'search', enterkeyhint: 'search', placeholder: 'Cerca brani, artisti o video', 'aria-label': 'Cerca su YouTube', autocomplete: 'off', maxlength: '100' });
    const searchBtn = h('button', { class: 'btn pri', type: 'button', onclick: () => search() }, 'Cerca');
    const pasteBtn = h('button', { class: 'btn', type: 'button', onclick: async () => { try { const t = await navigator.clipboard.readText(); if (t) { input.value = t; routeInput(); } else ctx.toast('Gli appunti sono vuoti'); } catch { input.focus(); ctx.toast('Tieni premuto nel campo e scegli «Incolla»'); } } }, 'Incolla');
    const status = h('div', { class: 'ytstatus', role: 'status', 'aria-live': 'polite' });
    const results = h('div', { class: 'ytresults' });
    const histBox = h('div', { class: 'ythist' });
    const moreBtn = h('button', { class: 'btn wide', type: 'button', hidden: true, onclick: () => search(true) }, 'Carica altri risultati');

    const paintHist = () => {
      histBox.textContent = '';
      if (!hist.length || input.value.trim()) return;
      histBox.append(h('div', { class: 'row-between' }, h('b', {}, 'Ricerche recenti'), h('button', { class: 'btn danger-text', onclick: () => { hist = []; save(hist); paintHist(); } }, 'Cancella')),
        ...hist.map(q => h('button', { class: 'opt', onclick: () => { input.value = q; search(); } }, h('span', { class: 'ol' }, q))));
    };
    const showVideo = r => {
      const id = text(r.videoId, 20);
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
      const a = h('a', { class: 'ytresult', href: ytUrl(id), target: '_blank', rel: 'noopener noreferrer', title: 'Apri su YouTube' });
      const thumb = text(r.thumbnail, 500);
      if (thumb.startsWith('https://i.ytimg.com/')) a.append(h('img', { class: 'ytthumb', src: thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }));
      a.append(h('div', { class: 'yttxt' }, h('b', {}, text(r.title, 300) || 'Titolo non disponibile'), h('small', {}, text(r.channelTitle, 150) || 'Canale sconosciuto'), h('small', {}, text(r.description, 240))));
      a.append(h('span', { class: 'ytexternal', 'aria-hidden': 'true' }, '↗'));
      return a;
    };
    const render = (data, append = false) => {
      if (!append) results.textContent = '';
      for (const item of data.items || []) { const el = showVideo(item); if (el) results.append(el); }
      if (!results.childElementCount) results.append(h('p', { class: 'mut' }, 'Nessun risultato. Prova con altre parole.'));
      nextPage = text(data.nextPageToken, 500);
      moreBtn.hidden = !nextPage;
    };
    async function search(append = false) {
      const raw = input.value.trim();
      if (!raw) { status.textContent = 'Scrivi il nome di un brano, artista o video.'; return; }
      const parsed = parseYouTube(raw);
      if (parsed.kind === 'invalid') { status.textContent = parsed.error; return; }
      if (parsed.kind === 'video' || parsed.kind === 'playlist') { openExternal(parsed.url); return; }
      if (!YOUTUBE_API_BASE || !/^https:\/\//i.test(YOUTUBE_API_BASE)) {
        status.textContent = 'Ricerca in-app non ancora configurata: manca l’indirizzo del backend Sonance. Puoi comunque aprire la ricerca direttamente su YouTube.';
        results.replaceChildren(h('a', { class: 'btn pri wide', href: parsed.url, target: '_blank', rel: 'noopener noreferrer' }, 'Cerca su YouTube')); return;
      }
      if (busy) controller?.abort();
      busy = true; controller = new AbortController();
      const q = parsed.query || raw;
      if (!append) { nextPage = ''; hist = pushHistory(hist, q); save(hist); paintHist(); results.textContent = ''; }
      status.textContent = 'Ricerca ufficiale YouTube in corso…'; searchBtn.disabled = true;
      try {
        const u = new URL('/api/youtube/search', YOUTUBE_API_BASE);
        u.searchParams.set('q', q);
        if (append && nextPage) u.searchParams.set('pageToken', nextPage);
        const res = await fetch(u, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || (res.status === 429 ? 'Limite di richieste raggiunto. Riprova più tardi.' : 'Servizio di ricerca non disponibile (' + res.status + ').'));
        render(body, append);
        status.textContent = (body.items?.length || 0) + ' risultati · Ricerca tramite YouTube Data API';
      } catch (e) {
        if (e.name === 'AbortError') return;
        status.textContent = e.message || 'Ricerca non riuscita. Controlla la connessione e riprova.';
      } finally { busy = false; searchBtn.disabled = false; }
    }
    const routeInput = () => { const r = parseYouTube(input.value); if (r.kind === 'video' || r.kind === 'playlist') { status.textContent = 'Link YouTube riconosciuto.'; results.replaceChildren(h('a', { class: 'btn pri wide', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, 'Apri su YouTube')); } else if (r.kind === 'invalid') status.textContent = r.error; else { status.textContent = ''; paintHist(); } };
    input.addEventListener('input', () => { status.textContent = ''; paintHist(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
    sec.append(h('div', { class: 'sc yt' },
      h('div', { class: 'head' }, h('h1', {}, 'YouTube'), h('small', { class: 'beta-badge' }, 'beta')),
      h('p', { class: 'mut' }, 'Cerca nel catalogo YouTube direttamente da Sonance. I risultati si aprono su YouTube per la riproduzione.'), h('small', { class: 'ytpowered' }, 'Risultati forniti da YouTube'),
      h('div', { class: 'ytbox' }, input, searchBtn, pasteBtn), status, results, moreBtn, histBox,
      h('div', { class: 'ytimport-note' }, h('b', {}, 'Aggiungere musica alla libreria'), h('p', {}, 'Puoi importare file audio che hai acquistato, creato o per i quali il titolare ti ha autorizzato al download. Scaricali dalla fonte autorizzata e usa «+» nella Libreria. Sonance non estrae né scarica audio da YouTube.'))));
    paintHist();
  } });
}
export function destroy(ctx) { ctx.removeTab('yt'); }
