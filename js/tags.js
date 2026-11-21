/* Lettura metadati: ID3v2 (2.2/2.3/2.4) e atomi MP4/M4A, copertina incorporata inclusa. */
const MAX_TAG = 12 * 1024 * 1024, MAX_MOOV = 32 * 1024 * 1024;
const ss = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];
const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const latin = b => String.fromCharCode(...b);

function decode(enc, b) {
  if (enc === 1 || enc === 2) {
    let le = true, s = 0;
    if (b[0] === 0xFE && b[1] === 0xFF) { le = false; s = 2; } else if (b[0] === 0xFF && b[1] === 0xFE) s = 2; else if (enc === 2) le = false;
    return new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(b.subarray(s));
  }
  return new TextDecoder(enc === 3 ? 'utf-8' : 'iso-8859-1').decode(b);
}
const text = (enc, b) => decode(enc, b).replace(/\0/g, '').trim();
/** ID3v2.4: più valori nello stesso campo sono separati da NUL (prima venivano incollati senza spazio). */
const texts = (enc, b) => decode(enc, b).split('\0').map(x => x.replace(/\uFEFF/g, '').trim()).filter(Boolean);
function unsync(b) { const o = []; for (let i = 0; i < b.length; i++) { o.push(b[i]); if (b[i] === 0xFF && b[i + 1] === 0) i++; } return Uint8Array.from(o); }

const FR = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TPE2: 'albumArtist', TP2: 'albumArtist', TALB: 'album', TAL: 'album', TRCK: 'trk', TRK: 'trk' };

/** Interpreta un tag ID3v2 (il buffer deve iniziare con "ID3"). */
export function parseID3(b) {
  const out = {};
  if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return out;
  const v = b[3], flags = b[5];
  let body = b.subarray(10, Math.min(10 + ss(b, 6), b.length));
  if (flags & 0x80) body = unsync(body);
  let p = 0;
  if (flags & 0x40 && v > 2) p = v === 4 ? ss(body, 0) : be32(body, 0) + 4;
  const idLen = v === 2 ? 3 : 4, hs = v === 2 ? 6 : 10;
  while (p + hs <= body.length) {
    const id = latin(body.subarray(p, p + idLen));
    const n = v === 2 ? (body[p + 3] << 16) | (body[p + 4] << 8) | body[p + 5] : v === 4 ? ss(body, p + 4) : be32(body, p + 4);
    if (!n || !/^[A-Z0-9]{3,4}$/.test(id) || p + hs + n > body.length + 1) break;
    const d = body.subarray(p + hs, p + hs + n), k = FR[id];
    if (k) {
      if (k === 'artist' || k === 'albumArtist') {
        const l = texts(d[0], d.subarray(1));
        if (l.length) { out[k] = l.join(', '); if (l.length > 1) out[k === 'artist' ? 'artistList' : 'albumArtistList'] = l; }
       
      } else {
        const s = text(d[0], d.subarray(1));
        if (k === 'trk') out.trk = parseInt(s, 10) || 0; else if (s) out[k] = s;
      }
    } else if (id === 'APIC' || id === 'PIC') {
      const enc = d[0]; let i = 1, mime;
      if (id === 'PIC') { const f = latin(d.subarray(1, 4)).toUpperCase(); mime = f === 'PNG' ? 'image/png' : 'image/jpeg'; i = 4; }
      else { const z = d.indexOf(0, 1); mime = latin(d.subarray(1, z)) || 'image/jpeg'; i = z + 1; }
      const type = d[i++];
      if (enc === 1 || enc === 2) { while (i + 1 < d.length && !(d[i] === 0 && d[i + 1] === 0)) i += 2; i += 2; }
      else { while (i < d.length && d[i] !== 0) i++; i++; }
      if (mime === 'image/jpg') mime = 'image/jpeg';
      if (d.length - i > 100 && (!out.art || type === 3)) out.art = { mime, data: d.slice(i) };
    }
    p += hs + n;
  }
  return out;
}

const NAMES = { '©nam': 'title', '©ART': 'artist', aART: 'albumArtist', '©alb': 'album' };
const CONT = new Set(['moov', 'udta', 'ilst', 'trak', 'mdia', 'minf']);
function walkMP4(b, v, a, z, t, depth = 0) {
  if (depth > 8) return;
  let p = a;
  while (p + 8 <= z) {
    let n = v.getUint32(p), hd = 8;
    const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    if (n === 1 && p + 16 <= z) { n = Number(v.getBigUint64(p + 8)); hd = 16; } else if (n === 0) n = z - p;
    if (n < hd || p + n > z) break;
    if (type === 'meta') walkMP4(b, v, p + hd + 4, p + n, t, depth + 1);
    else if (CONT.has(type)) walkMP4(b, v, p + hd, p + n, t, depth + 1);
    else if (NAMES[type] || type === 'covr' || type === 'trkn') {
      let q = p + hd;
      while (q + 16 <= p + n) {
        const sz = v.getUint32(q), tp = String.fromCharCode(b[q + 4], b[q + 5], b[q + 6], b[q + 7]);
        if (!sz || q + sz > p + n) break;
        if (tp === 'data' && sz > 16) {
          const flags = v.getUint32(q + 8) & 0xffffff, d = b.subarray(q + 16, q + sz);
          if (type === 'covr') { if (!t.art) t.art = { mime: flags === 14 ? 'image/png' : 'image/jpeg', data: d.slice() }; }
          else if (type === 'trkn') t.trk = ((d[2] << 8) | d[3]) || 0;
          else { const s = new TextDecoder().decode(d).replace(/\0/g, '').trim(); if (s) t[NAMES[type]] = s; }
        }
        q += sz;
      }
    }
    p += n;
  }
}

async function readMP4(f, t) {
  let off = 0;
  while (off + 8 <= f.size) {
    const head = new DataView(await f.slice(off, off + 16).arrayBuffer());
    let size = head.getUint32(0), header = 8;
    const type = String.fromCharCode(...new Uint8Array(await f.slice(off + 4, off + 8).arrayBuffer()));
    if (size === 1 && off + 16 <= f.size) { size = Number(head.getBigUint64(8)); header = 16; } else if (size === 0) size = f.size - off;
    if (size < header || off + size > f.size) break;
    if (type === 'moov' && size <= MAX_MOOV) {
      const b = new Uint8Array(await f.slice(off, off + size).arrayBuffer());
      walkMP4(b, new DataView(b.buffer), 0, b.length, t);
      break;
    }
    off += size;
  }
}

/** "Artista - Titolo" nel nome del file quando mancano i tag. */
export function splitName(t) {
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(t.title);
  if (m && !t.artist) { t.artist = m[1].trim(); t.title = m[2].trim(); }
}

/** Legge i tag di un File/Blob. Restituisce sempre un oggetto utilizzabile (mai eccezioni). */
export async function readTags(file) {
  const t = { title: (file.name || '').replace(/\.[^.]+$/, '') || 'Senza titolo', artist: '', album: '', trk: 0, art: null };
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      const total = Math.min(10 + ss(head, 6) + (head[5] & 0x10 ? 10 : 0), MAX_TAG);
      const r = parseID3(new Uint8Array(await file.slice(0, total).arrayBuffer()));
      for (const k of ['title', 'artist', 'album', 'trk', 'art', 'albumArtist', 'artistList']) if (r[k]) t[k] = r[k];
    }
  } catch { /* tag illeggibili: si usa il nome del file */ }
  if (/\.(m4a|mp4|m4b|aac)$/i.test(file.name || '')) { try { await readMP4(file, t); } catch { /* idem */ } }
  if (!t.artist && t.albumArtist) t.artist = t.albumArtist;
  splitName(t);
  return t;
}
