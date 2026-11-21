/* Playlist M3U/M3U8: esportazione e importazione con abbinamento ai brani della libreria (puro). */
import { norm } from './util.js';
import { mainArtist, stripFeat, cleanTitle } from './match.js';

const decodeSafe = s => { try { return decodeURIComponent(s); } catch { return s; } };
const baseName = p => decodeSafe(p.replace(/^file:\/\//i, '')).split(/[\\/]/).pop();
const noExt = s => s.replace(/\.[^.]+$/, '');
export const safeFileName = n => (n || 'playlist').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'playlist';

export function toM3U(name, tracks) {
  const out = ['#EXTM3U', '#PLAYLIST:' + name];
  for (const t of tracks) {
    out.push(`#EXTINF:${t.dur > 0 ? Math.round(t.dur) : -1},${t.artist ? t.artist + ' - ' : ''}${t.title}`);
    out.push(t.name || t.title);
  }
  return out.join('\n') + '\n';
}

export function parseM3U(text, fileName = '') {
  let name = '', meta = null; const entries = [];
  for (const raw of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const l = raw.trim(); if (!l) continue;
    if (/^#PLAYLIST:/i.test(l)) { name = l.slice(10).trim(); continue; }
    if (/^#EXTINF:/i.test(l)) {
      const m = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)[^,]*,(.*)$/i.exec(l);
      if (m) { const label = m[2].trim(), k = /^(.+?)\s+[-–—]\s+(.+)$/.exec(label); meta = { dur: +m[1], artist: k ? k[1].trim() : '', title: k ? k[2].trim() : label }; }
      continue;
    }
    if (l.startsWith('#')) continue;
    entries.push({ file: baseName(l), ...(meta || {}) }); meta = null;
  }
  return { name: name || noExt(fileName) || 'Playlist importata', entries };
}

/** Abbina per nome file, poi per "artista + titolo", poi per solo titolo se è univoco. */
export function matchEntries(entries, tracks) {
  const byFile = new Map(), byKey = new Map(), byTitle = new Map();
  const tk = t => norm(stripFeat(cleanTitle(t)));
  for (const t of tracks) {
    byFile.set(norm(t.name), t); byFile.set(norm(noExt(t.name || '')), t);
    byKey.set(tk(t.title) + '|' + norm(mainArtist(t.artist)), t);
    const k = tk(t.title); byTitle.set(k, byTitle.has(k) ? null : t);
  }
  const matched = [], missing = [], seen = new Set();
  for (const e of entries) {
    const t = byFile.get(norm(e.file)) || byFile.get(norm(noExt(e.file)))
      || (e.title && byKey.get(tk(e.title) + '|' + norm(mainArtist(e.artist)))) || (e.title && byTitle.get(tk(e.title)))
      || byTitle.get(tk(noExt(e.file)));
    if (!t) missing.push(e); else if (!seen.has(t.id)) { seen.add(t.id); matched.push(t); }
  }
  return { matched, missing };
}
