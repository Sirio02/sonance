import test from 'node:test';
import assert from 'node:assert/strict';
import { parseID3, readTags } from '../js/tags.js';
import { parseLrc, lineAt } from '../js/lrc.js';
import { sim, pickBest, pickAlbum, matchArtist, mainArtist, artistVariants, isMusicDesc } from '../js/match.js';
import { aggregate, perDay, streak } from '../js/stats.js';

const ss = n => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
const frame = (id, payload) => [...Buffer.from(id), ...ss(payload.length), 0, 0, ...payload];
const txt = s => [3, ...Buffer.from(s)];
function id3(frames) { const body = frames.flat(); return Uint8Array.from([...Buffer.from('ID3'), 4, 0, 0, ...ss(body.length), ...body]); }

test('ID3: titolo, artista, album, traccia e copertina incorporata', () => {
  const img = Array.from({ length: 200 }, (_, i) => i % 255);
  const apic = frame('APIC', [3, ...Buffer.from('image/jpeg'), 0, 3, 0, ...img]);
  const r = parseID3(id3([frame('TIT2', txt('Creep')), frame('TPE1', txt('Radiohead')), frame('TALB', txt('Pablo Honey')), frame('TRCK', txt('2/12')), apic]));
  assert.equal(r.title, 'Creep'); assert.equal(r.artist, 'Radiohead'); assert.equal(r.album, 'Pablo Honey'); assert.equal(r.trk, 2);
  assert.equal(r.art.mime, 'image/jpeg'); assert.equal(r.art.data.length, 200);
});
test('readTags: nome file "Artista - Titolo" senza tag', async () => {
  const f = Object.assign(new Blob([new Uint8Array(50)]), { name: 'Queen - Bohemian Rhapsody.mp3' });
  const t = await readTags(f);
  assert.equal(t.artist, 'Queen'); assert.equal(t.title, 'Bohemian Rhapsody');
  const multi = await readTags(Object.assign(new Blob([new Uint8Array(50)]), { name: 'Dolcenera Lazza - Porto Cervo.mp3' }));
  assert.equal(multi.artist, 'Dolcenera Lazza'); assert.equal(multi.title, 'Porto Cervo');
});
test('LRC: parsing, offset e riga corrente', () => {
  const l = parseLrc('[offset:500]\n[00:10.00]Uno\n[00:20.50]Due\n[00:05.00][00:30.00]Coro');
  assert.deepEqual(l.map(x => x.x), ['Coro', 'Uno', 'Due', 'Coro']);
  assert.equal(l[1].t, 9.5);
  assert.equal(lineAt(l, 0), -1); assert.equal(lineAt(l, 9.6), 1); assert.equal(lineAt(l, 99), 3);
});
test('match: sceglie il brano giusto e rifiuta quelli sbagliati', () => {
  const items = [{ title: 'Creep (Acoustic)', artist: 'Someone Else', album: 'X', art: 'bad' }, { title: 'Creep', artist: 'Radiohead', album: 'Pablo Honey', art: 'good' }];
  assert.equal(pickBest(items, { title: 'Creep', artist: 'Radiohead', album: '' }).art, 'good');
  assert.equal(pickBest([items[0]], { title: 'Creep', artist: 'Radiohead' }), null);
  assert.equal(pickAlbum([{ album: 'Pablo Honey', artist: 'Radiohead', art: 'a' }], { album: 'Pablo Honey', artist: 'Radiohead' }).art, 'a');
  assert.ok(sim('Beyoncé', 'beyonce') === 1);
});
test('artisti: solo nome identico (mai "il più simile")', () => {
  const c = [{ name: 'Muse Tribute Band' }, { name: 'Muse' }];
  assert.equal(matchArtist(c, 'Muse').name, 'Muse');
  assert.equal(matchArtist([{ name: 'Muse Tribute Band' }], 'Muse'), null);
  assert.equal(matchArtist([{ name: 'Daft Punk' }], 'Daft Punk feat. Pharrell').name, 'Daft Punk');
  assert.equal(mainArtist('A & B'), 'A');
  assert.deepEqual(artistVariants('Dolcenera Lazza'), ['Dolcenera Lazza', 'Dolcenera', 'Lazza']);
  assert.equal(pickBest([{ title: 'Porto Cervo', artist: 'Lazza', album: 'Singolo', art: 'ok' }], { title: 'Porto Cervo', artist: 'Dolcenera Lazza' }).art, 'ok');
  assert.equal(mainArtist('Pinguini Tattici Nucleari'), 'Pinguini Tattici Nucleari');
  assert.equal(mainArtist('X Ambassadors'), 'X Ambassadors');
  assert.ok(isMusicDesc('Italian singer-songwriter') || isMusicDesc('English rock band'));
  assert.ok(!isMusicDesc('Town in Lombardy'));
});
test('statistiche', () => {
  const now = new Date(2026, 10, 16, 12).getTime(), d = 864e5;
  const plays = [{ tid: 'a', title: 'A', artist: 'X', album: 'Al', at: now, ms: 60000 }, { tid: 'a', title: 'A', artist: 'X', album: 'Al', at: now - d, ms: 60000 }, { tid: 'b', title: 'B', artist: 'Y', at: now - 10 * d, ms: 30000 }];
  const a = aggregate(plays); assert.equal(a.count, 3); assert.equal(a.topTracks[0].tid, 'a'); assert.equal(a.distinct, 2);
  assert.equal(aggregate(plays, now - 3 * d).count, 2);
  assert.equal(perDay(plays, 7, now).at(-1).n, 1);
  assert.equal(streak(plays, now), 2);
});

import { toM3U, parseM3U, matchEntries } from '../js/m3u.js';
import { findDuplicates } from '../js/dup.js';

test('M3U: esporta, rilegge e abbina per nome file / artista+titolo', () => {
  const lib = [{ id: '1', title: 'Creep', artist: 'Radiohead', name: 'Radiohead - Creep.mp3', dur: 238 }, { id: '2', title: 'Uprising', artist: 'Muse', name: 'uprising.m4a', dur: 305 }];
  const txt = toM3U('Rock', lib);
  assert.ok(txt.startsWith('#EXTM3U') && txt.includes('#EXTINF:238,Radiohead - Creep'));
  const p = parseM3U('\uFEFF' + txt.replace(/\n/g, '\r\n'), 'x.m3u8');
  assert.equal(p.name, 'Rock'); assert.equal(p.entries.length, 2);
  const m = matchEntries(p.entries, lib); assert.equal(m.matched.length, 2); assert.equal(m.missing.length, 0);
  const ext = parseM3U('#EXTM3U\n#EXTINF:100,Muse - Uprising\nC:\\Musica\\Altro%20Nome.mp3\n/music/ignoto.mp3\n', 'Mia lista.m3u');
  assert.equal(ext.name, 'Mia lista');
  const m2 = matchEntries(ext.entries, lib); assert.deepEqual(m2.matched.map(t => t.id), ['2']); assert.equal(m2.missing.length, 1);
});
test('duplicati: stesso file, stesso titolo+artista; non confonde brani diversi', () => {
  const T = (id, title, artist, dur, size, extra = {}) => ({ id, title, artist, dur, size, ...extra });
  const g = findDuplicates([T('a', 'Creep', 'Radiohead', 238, 5e6, { pc: 4 }), T('b', 'Creep (Remastered)', 'Radiohead', 239, 7e6), T('c', 'Karma Police', 'Radiohead', 261, 5e6 + 1),
    T('d', 'Traccia 01', '', 200, 1e6), T('e', 'Traccia 01', '', 200, 2e6), T('f', 'X', 'Y', 200, 3e6), T('g', 'Z', 'W', 200, 3e6)]);
  assert.equal(g.length, 2);
  const creep = g.find(x => x.items.some(t => t.id === 'a'));
  assert.deepEqual(creep.items.map(t => t.id), ['a', 'b']); assert.equal(creep.exact, false);      // 'a' ha più ascolti: viene proposta da tenere
  assert.ok(g.some(x => x.exact && x.items.length === 2));                                         // f/g: stesso file con nomi diversi
});
