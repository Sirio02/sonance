import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createSeekDrag } from '../js/seekbar.js';
import { lockAxis, swipeAction, tabIndexAtX } from '../js/gesture.js';
import { parseArtistString, trackArtists, localSegment, reconcileArtists, featFromTitle } from '../js/artists.js';
import { titleVariants, artistNames, scoreLyric, pickLyric, titleSim } from '../js/match.js';
import { parseID3 } from '../js/tags.js';
import { aggregate } from '../js/stats.js';
import { IC } from '../js/util.js';

/* ---- A/B: barra di avanzamento ---- */
test('seek: un tocco altrove (pointerup senza trascinamento) non produce MAI un seek', () => {
  const commits = []; const s = createSeekDrag({ onCommit: f => commits.push(f) });
  for (let i = 0; i < 5; i++) { s.up(1, .4); s.up(undefined); }            // equivalente dei vecchi listener globali
  assert.equal(commits.length, 0); assert.equal(s.active, false);
});
test('seek: trascinamento = un solo seek, alla fine, con l\'ultima posizione', () => {
  const commits = [], prev = []; const s = createSeekDrag({ onCommit: f => commits.push(f), onPreview: f => prev.push(f) });
  s.down(7, .1); s.move(7, .3); s.move(7, .6); assert.equal(commits.length, 0); assert.equal(s.active, true);
  s.up(7, .62); s.up(7, .9);                                                // il secondo up è ignorato
  assert.deepEqual(commits, [.62]); assert.equal(s.active, false); assert.deepEqual(prev, [.1, .3, .6]);
});
test('seek: altro puntatore ignorato; gesto annullato (pointercancel, background) non sposta la riproduzione', () => {
  const commits = []; let ended = 0; const s = createSeekDrag({ onCommit: f => commits.push(f), onEnd: () => ended++ });
  s.down(1, .2); assert.equal(s.move(2, .8), false); assert.equal(s.up(2, .8), false); assert.equal(s.active, true);
  assert.equal(s.cancel(1), true); assert.equal(commits.length, 0); assert.equal(ended, 1);
  s.down(3, .5); s.up(3, .5); s.down(4, .7); assert.equal(s.active, true);    // un nuovo gesto riparte pulito
});
/* ---- D: swipe mini-player ---- */
test('swipe: direzione, soglia minima, scorrimento verticale e scatto veloce', () => {
  assert.equal(swipeAction(-90, 6, 300), 'next'); assert.equal(swipeAction(90, -4, 300), 'prev');
  assert.equal(swipeAction(-25, 2, 600), null);                              // troppo corto e lento
  assert.equal(swipeAction(-40, 2, 60), 'next');                             // scatto veloce
  assert.equal(swipeAction(-60, -90, 300), null);                            // gesto diagonale/verticale: nessun cambio
  assert.equal(swipeAction(3, 1, 80), null);                                 // tap
  assert.equal(swipeAction(10, -70, 200), 'open');
  assert.equal(lockAxis(4, 3), ''); assert.equal(lockAxis(20, 4), 'h'); assert.equal(lockAxis(3, -25), 'v'); assert.equal(lockAxis(15, 15), '');
});
/* ---- E: icone ---- */
test('icone: ogni nome usato nel codice esiste in IC (playlist automatiche incluse) e produce tracciati', () => {
  const used = new Set();
  const files = ['js', 'js/ui'].flatMap(d => readdirSync(d).filter(f => f.endsWith('.js')).map(f => d + '/' + f));
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(?:icon|iconBtn|pi|act)\(\s*'([a-z0-9-]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\['(?:fav|recent|top|last)',\s*'[^']+',\s*'([a-z0-9-]+)'/g)) used.add(m[1]);
  }
  for (const k of ['heart', 'calendar-plus', 'chart-no-axes-combined', 'history', 'download', 'upload']) used.add(k);
  const missing = [...used].filter(k => !IC[k] || !/<(path|circle|rect)/.test(IC[k]));
  assert.deepEqual(missing, []);
});
/* ---- H: artisti ---- */
test('artisti: featuring ed elenchi espliciti vengono divisi, con ruoli', () => {
  assert.deepEqual(parseArtistString('Lazza feat. Dolcenera'), { main: ['Lazza'], feat: ['Dolcenera'] });
  assert.deepEqual(parseArtistString('Dolcenera & Lazza').main, ['Dolcenera', 'Lazza']);
  assert.deepEqual(parseArtistString('A, B ft. C').feat, ['C']);
  assert.deepEqual(parseArtistString('Sfera Ebbasta x Tha Supreme').main, ['Sfera Ebbasta', 'Tha Supreme']);
  assert.deepEqual(parseArtistString('Lazza (feat. Dolcenera)'), { main: ['Lazza'], feat: ['Dolcenera'] });
  assert.deepEqual(featFromTitle('Porto Cervo (feat. Lazza)'), ['Lazza']);
});
test('artisti: i nomi composti restano un\'unica entità', () => {
  for (const n of ['Pinguini Tattici Nucleari', 'The Weeknd', 'Måneskin', 'Twenty One Pilots', 'X Ambassadors', 'AC/DC', 'Simon & Garfunkel', 'Earth, Wind & Fire', 'Florence & The Machine', 'Tyler, The Creator', 'Bob Marley & The Wailers'])
    assert.deepEqual(parseArtistString(n).main, [n], n);
  assert.deepEqual(parseArtistString('Qualcuno & Altro', { keep: new Set(['qualcuno altro']) }).main, ['Qualcuno & Altro']);
});
test('artisti: "Dolcenera Lazza" senza separatore non si divide senza prove; con prove sì, senza toccare i nomi composti', async () => {
  const t = { artist: 'Dolcenera Lazza', title: 'Porto Cervo' };
  assert.deepEqual(trackArtists(t), ['Dolcenera Lazza']);                                    // nessuna prova: nome unico
  assert.deepEqual(localSegment('Dolcenera Lazza', new Set(['dolcenera', 'lazza'])), ['Dolcenera', 'Lazza']);
  assert.equal(localSegment('Pinguini Tattici Nucleari', new Set(['dolcenera', 'lazza'])), null);
  assert.equal(localSegment('The Weeknd', new Set(['the', 'weeknd'])), null);                 // gli articoli non contano come artisti
  assert.equal(localSegment('Twenty One Pilots', new Set(['twenty', 'one', 'pilots'])), null);   // anche con parole "note" non si divide un nome composto da articoli/numeri
  const none = async () => false;
  assert.deepEqual((await reconcileArtists('Dolcenera Lazza', 'Dolcenera & Lazza', none)).names, ['Dolcenera', 'Lazza']);       // crediti iTunes
  assert.deepEqual((await reconcileArtists('Dolcenera Lazza', 'Lazza feat. Dolcenera', none)).names, ['Dolcenera', 'Lazza']);
  assert.deepEqual((await reconcileArtists('Dolcenera Lazza', 'Dolcenera', async n => n === 'Lazza')).names, ['Dolcenera', 'Lazza']);  // Deezer: solo il principale
  assert.equal(await reconcileArtists('Dolcenera Lazza', 'Dolcenera', none), null);
  assert.deepEqual((await reconcileArtists('Pinguini Tattici Nucleari', 'Pinguini Tattici Nucleari', none)).names, ['Pinguini Tattici Nucleari']);
  assert.equal(await reconcileArtists('The Weeknd', 'The Weeknd & Ariana Grande', none), null);
});
test('artisti: lista risolta (am/af) → il brano appartiene a entrambi, una sola traccia', () => {
  const t = { id: 'x', title: 'Porto Cervo', artist: 'Dolcenera Lazza', am: ['Dolcenera', 'Lazza'], av: 1 };
  assert.deepEqual(trackArtists(t), ['Dolcenera', 'Lazza']);
  const g = new Map(); for (const n of trackArtists(t)) g.set(n, [t]);
  assert.equal(g.get('Dolcenera')[0], g.get('Lazza')[0]);                                    // stesso oggetto, nessun duplicato
});
test('ID3v2.4: valori multipli (NUL) restano separati', () => {
  const ss = n => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
  const payload = [3, ...Buffer.from('Dolcenera'), 0, ...Buffer.from('Lazza')];
  const fr = [...Buffer.from('TPE1'), ...ss(payload.length), 0, 0, ...payload];
  const r = parseID3(Uint8Array.from([...Buffer.from('ID3'), 4, 0, 0, ...ss(fr.length), ...fr]));
  assert.deepEqual(r.artistList, ['Dolcenera', 'Lazza']); assert.equal(r.artist, 'Dolcenera, Lazza');
});
test('statistiche: un brano con featuring conta per ciascun artista', () => {
  const plays = [{ tid: 'a', title: 'P', artist: 'Dolcenera Lazza', at: 1, ms: 1000 }];
  const a = aggregate(plays, 0, () => ['Dolcenera', 'Lazza']); assert.deepEqual(a.topArtists.map(x => x.name).sort(), ['Dolcenera', 'Lazza']);
  assert.equal(aggregate(plays).topArtists[0].name, 'Dolcenera Lazza');
});
/* ---- G: testi ---- */
test('testi: varianti del titolo (versioni, featuring, accenti, apostrofi)', () => {
  const v = titleVariants('Più Forte (feat. X) - Radio Edit');
  assert.equal(v[0], 'Più Forte (feat. X) - Radio Edit'); assert.ok(v.includes('Più Forte')); assert.ok(v.includes('Piu Forte'));
  assert.ok(titleVariants('L’amore').includes("L'amore"));
  assert.ok(artistNames({ artist: 'Dolcenera Lazza', title: 't', am: ['Dolcenera', 'Lazza'] }).includes('Lazza'));
});
test('testi: il punteggio rifiuta titoli "quasi" uguali e artisti sbagliati, accetta varianti legittime', () => {
  const q = { titles: titleVariants('Love'), names: ['Beatles'], dur: 180 };
  assert.equal(scoreLyric({ trackName: 'Love Story', artistName: 'Beatles', duration: 180 }, q), null);       // titolo diverso
  assert.equal(scoreLyric({ trackName: 'Love', artistName: 'Qualcun Altro', duration: 120 }, q), null);        // artista e durata diversi
  assert.ok(scoreLyric({ trackName: 'Love', artistName: 'Beatles', duration: 181 }, q));
  const q2 = { titles: titleVariants('Porto Cervo'), names: ['Dolcenera Lazza', 'Dolcenera', 'Lazza'], dur: 200 };
  assert.ok(scoreLyric({ trackName: 'Porto Cervo (Radio Edit)', artistName: 'Lazza', duration: 199 }, q2));      // denominazione artista diversa
  assert.ok(scoreLyric({ trackName: 'Porto Cervo', artistName: 'Dolcenera, Lazza', duration: 200 }, q2));
  assert.equal(scoreLyric({ trackName: 'Porto Cervo', artistName: 'Lazza', duration: 260 }, q2), null);        // durata incompatibile
  const noArtist = { titles: titleVariants('Intro'), names: [], dur: 0 };
  assert.equal(scoreLyric({ trackName: 'Intro', artistName: 'Chiunque', duration: 60 }, noArtist), null);      // solo il titolo non basta
  const best = pickLyric([{ trackName: 'Porto Cervo', artistName: 'Lazza', duration: 201, plainLyrics: 'a' }, { trackName: 'Porto Cervo', artistName: 'Dolcenera, Lazza', duration: 200, syncedLyrics: 's' }], q2);
  assert.equal(best.syncedLyrics, 's');
  assert.ok(titleSim('Più Forte (Radio Edit)', 'Piu forte') >= .95);
});

/* ---- §2: correzioni di questo ciclo ---- */
test('icone: importare = freccia in giù (download), esportare = freccia in su (upload)', () => {
  const lists = readFileSync('js/ui/lists.js', 'utf8');
  assert.match(lists, /iconBtn\('download',\s*'Importa playlist M3U'/);
  assert.match(lists, /label: 'Esporta come M3U', icon: 'upload'/);
  assert.doesNotMatch(lists, /iconBtn\('upload'/);                                    // nessuna azione di importazione con la freccia in su
  assert.match(IC.download, /M12 4v12/); assert.match(IC.download, /l5 5 5-5/);          // punta verso il basso
  assert.match(IC.upload, /M12 16V4/); assert.match(IC.upload, /l5-5 5 5/);              // punta verso l'alto
});
test('libreria: «Riprendi da dove eri» è sparita, il ripristino della sessione resta', () => {
  const src = ['js/ui/lists.js', 'css/app.css', 'js/main.js'].map(f => readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(src, /resumeEl|refreshResume|Riprendi da dove|\.rbar|\.resume\b/);
  assert.match(readFileSync('js/player.js', 'utf8'), /export (?:async )?function restoreSession/);
  assert.match(readFileSync('js/ui/lists.js', 'utf8'), /shelf\('Ascoltati di recente'/);
});
test('testi: il pannello scorre solo in verticale (CSS)', () => {
  const css = readFileSync('css/app.css', 'utf8');
  const rule = sel => css.split('\n').find(l => l.startsWith(sel + '{')) || '';
  const ly = rule('#ly');
  for (const need of ['overflow-x:hidden', 'overflow-y:auto', 'touch-action:pan-y', 'overscroll-behavior:contain', 'overflow-wrap:anywhere']) assert.ok(ly.includes(need), '#ly: ' + need);
  assert.ok(rule('#ly-tools').includes('touch-action:pan-y'));
  assert.match(css, /\.hscroll\{[^}]*overflow-x:auto/);                                 // le mensole orizzontali devono continuare a scorrere
});
test('PWA: ogni file .js del progetto è nello SHELL del service worker', () => {
  const sw = readFileSync('sw.js', 'utf8');
  const files = ['js', 'js/ui'].flatMap(d => readdirSync(d).filter(f => f.endsWith('.js')).map(f => d + '/' + f));
  assert.deepEqual(files.filter(f => !sw.includes("'" + f + "'")), []);
});

test('EQ: UI blocca slider e preset quando spento; il preset non deve accendere EQ', () => {
  const you = readFileSync('js/ui/you.js', 'utf8'), kit = readFileSync('js/ui/kit.js', 'utf8');
  assert.match(you, /if \(!S\.eqOn\) return/);
  assert.match(you, /syncEQEnabled\(!!S\.eqOn\)/);
  assert.match(you, /setDisabled\(!on\)/);
  assert.match(kit, /setDisabled: v =>/);
});
test('velocità rimossa: niente UI o API rate; gli audio partono sempre a 1×', () => {
  const files = ['js/audio.js','js/player.js','js/ui/nowplaying.js','js/store.js','README.md','css/app.css'];
  const src = files.map(f => readFileSync(f,'utf8')).join('\\n');
  assert.doesNotMatch(src, /speedMenu|ratechange|setRate|S\\.rate|\.spd|velocità 0,75/);
  assert.match(readFileSync('js/audio.js','utf8'), /el\.playbackRate = 1/);
  assert.match(readFileSync('js/store.js','utf8'), /delete S\.rate/);
});
test('preset personale: eliminazione con conferma e persistenza, senza pressione lunga', () => {
  const you = readFileSync('js/ui/you.js','utf8');
  assert.match(you, /confirmSheet\('Eliminare il preset/);
  assert.match(you, /S\.cp = S\.cp\.filter/);
  assert.match(you, /saveS\(\); render\(\)/);
  assert.doesNotMatch(you, /addEventListener\('pointerdown'.*setTimeout/);
});

test('swipe tab: soglia, asse, bordi, estremi, mensola, selezione e dettaglio', async () => {
  const { decideTabSwipe } = await import('../js/gesture.js');
  const base = { startX: 180, width: 360, index: 2, count: 5 };
  assert.equal(decideTabSwipe({ ...base, dx: -90, dy: 8 }), 3);
  assert.equal(decideTabSwipe({ ...base, dx: 90, dy: 8 }), 1);
  assert.equal(decideTabSwipe({ ...base, dx: -30, dy: 0 }), null);
  assert.equal(decideTabSwipe({ ...base, dx: -90, dy: 90 }), null);
  assert.equal(decideTabSwipe({ ...base, startX: 12, dx: -100, dy: 0 }), null);
  assert.equal(decideTabSwipe({ ...base, startX: 348, dx: 100, dy: 0 }), null);
  assert.equal(decideTabSwipe({ ...base, index: 4, dx: -100, dy: 0 }), null);
  assert.equal(decideTabSwipe({ ...base, index: 0, dx: 100, dy: 0 }), null);
  assert.equal(decideTabSwipe({ ...base, dx: -100, dy: 0, hscrollCanMove: true }), null);
  assert.equal(decideTabSwipe({ ...base, dx: -100, dy: 0, excluded: true }), null);
});

test('preset personale e UI: nomi come testo, nessuna icon() passata come figlio testuale di h()', () => {
  const src = readFileSync(new URL('../js/ui/you.js', import.meta.url), 'utf8');
  assert.match(src, /h\('button',\s*\{\s*class:\s*'chip'[^}]*\},\s*name\)/s);
  const root = new URL('../js/', import.meta.url);
  const scan = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? scan(new URL(e.name + '/', dir))
    : e.name.endsWith('.js') ? [readFileSync(new URL(e.name, dir), 'utf8')] : []);
  const dangerous = /h\(\s*['\"][^'\"]+['\"]\s*,\s*\{(?![^}]*\bhtml\s*:)[^}]*\}\s*,\s*icon\s*\(/s;
  for (const file of scan(root)) assert.doesNotMatch(file, dangerous);
});

test('cuore: il rendering non assegna classi transitorie; gli eventi distinguono aggiunta e rimozione', () => {
  const src = readFileSync(new URL('../js/ui/lists.js', import.meta.url), 'utf8');
  assert.match(src, /class: 'btn icon sm heart rowact'/);
  assert.match(src, /action\.origin === 'row'[\s\S]*action\.current \? 'add' : 'remove'/);
  assert.doesNotMatch(src, /t\.fav\)\s*\{\s*b\.classList\.remove\('pop'\)/);
});

test('swipe tab: il gesto touch è agganciato alla barra #tabs, non al contenuto #app', () => {
  const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(src, /function wireTabSwipe\(tabs\)/);
  assert.match(src, /tabs\.addEventListener\('touchstart'/);
  assert.match(src, /tabs\.addEventListener\('touchmove'/);
  assert.match(src, /tabs\.addEventListener\('touchend'/);
  assert.match(src, /wireTabSwipe\(tabs\)/);
  assert.equal(src.includes("const root = $('#app')"), false);
  assert.doesNotMatch(src, /root\.addEventListener\('pointer(?:move|up)'/);
});


test('avvio: splash solo visivo, non blocca i tocchi e rispetta eco/movimento ridotto', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(html, /id="splash"/);
  assert.match(css, /#splash\{[^}]*pointer-events:none/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{#splash\{display:none\}\}/);
  assert.match(css, /html\[data-eco\] #splash\{display:none\}/);
  assert.match(main, /splash\.addEventListener\('animationend'/);
  assert.doesNotMatch(main, /pageshow[^;]*splash/); // pageshow/bfcache non ricrea lo splash
});


test('ricerca testi: LYR_V incrementata per invalidare gli esiti negativi precedenti', () => {
  const src = readFileSync(new URL('../js/library.js', import.meta.url), 'utf8');
  assert.match(src, /LYR_V = 8/);   // incrementata alla v8: strategia «originale fra tutte le versioni»
});

test('tema iniziale: theme-color separato per schema chiaro/scuro e sincronizzato dal tema app', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const you = readFileSync(new URL('../js/ui/you.js', import.meta.url), 'utf8');
  assert.match(html, /theme-color[^>]*prefers-color-scheme: light/);
  assert.match(html, /theme-color[^>]*prefers-color-scheme: dark/);
  assert.match(you, /querySelectorAll\('meta\[name=theme-color\]'\)/);
});


test('tab drag: seleziona la scheda direttamente sotto il dito, anche attraversandone più di una', () => {
  const bounds = [{ left: 0, right: 72 }, { left: 72, right: 144 }, { left: 144, right: 216 }, { left: 216, right: 288 }, { left: 288, right: 360 }];
  assert.equal(tabIndexAtX(36, bounds), 0);
  assert.equal(tabIndexAtX(170, bounds), 2);
  assert.equal(tabIndexAtX(320, bounds), 4);
  assert.equal(tabIndexAtX(360, bounds), null);
  assert.equal(tabIndexAtX(Number.NaN, bounds), null);
});
