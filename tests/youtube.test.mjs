import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTube, parseTime, pushHistory } from '../js/beta/youtube.js';
import { nearestTab, tabDirection, indicatorAt, decideTabSwipe } from '../js/gesture.js';

const V = 'dQw4w9WgXcQ';
test('YouTube: link video in tutte le forme supportate', () => {
  for (const u of [`https://www.youtube.com/watch?v=${V}`, `https://youtube.com/watch?v=${V}&feature=share`, `https://m.youtube.com/watch?v=${V}`, `https://music.youtube.com/watch?v=${V}`,
    `https://youtu.be/${V}`, `https://youtu.be/${V}?si=abc`, `https://www.youtube.com/shorts/${V}`, `https://www.youtube.com/live/${V}`, `https://www.youtube.com/embed/${V}`,
    `https://www.youtube-nocookie.com/embed/${V}`, `http://youtu.be/${V}`, `youtu.be/${V}`, `www.youtube.com/watch?v=${V}`]) {
    const r = parseYouTube(u); assert.equal(r.kind, 'video', u); assert.equal(r.id, V, u); assert.equal(r.url, 'https://www.youtube.com/watch?v=' + V, u);
  }
});
test('YouTube: playlist, tempo e URL dentro altro testo', () => {
  assert.deepEqual(parseYouTube('https://www.youtube.com/playlist?list=PLabcdefghij1234'), { kind: 'playlist', list: 'PLabcdefghij1234', url: 'https://www.youtube.com/playlist?list=PLabcdefghij1234' });
  const r = parseYouTube(`https://www.youtube.com/watch?v=${V}&list=PLabcdefghij1234&t=1m30s`);
  assert.equal(r.kind, 'video'); assert.equal(r.list, 'PLabcdefghij1234'); assert.equal(r.t, 90); assert.match(r.url, /&t=90s$/);
  assert.equal(parseYouTube(`https://youtu.be/${V}?t=42`).t, 42); assert.equal(parseYouTube(`https://youtu.be/${V}?start=7`).t, 7);
  assert.equal(parseYouTube(`guarda questo, è bellissimo: https://youtu.be/${V}?si=x  ciao`).id, V);
  assert.deepEqual([parseTime('90'), parseTime('1h2m3s'), parseTime('45s'), parseTime('abc'), parseTime('')], [90, 3723, 45, null, null]);
});
test('YouTube: rifiuta altri domini, protocolli pericolosi, malformati e ID non validi', () => {
  for (const u of ['https://vimeo.com/123456', 'https://evil.com/watch?v=' + V, 'https://youtube.com.evil.com/watch?v=' + V, 'https://notyoutube.com/watch?v=' + V, 'ftp://youtube.com/watch?v=' + V,
    'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'https://', 'http://youtu.be/', `https://youtu.be/${V}x`, 'https://youtu.be/abc', 'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch', 'https://www.youtube.com/', 'esempio.it/qualcosa']) {
    const r = parseYouTube(u); assert.equal(r.kind, 'invalid', u + ' → ' + JSON.stringify(r)); assert.ok(r.error);
  }
});
test('YouTube: il testo che non è un URL è una ricerca, con codifica corretta (spazi, &, #, emoji, accenti)', () => {
  assert.equal(parseYouTube('   ').kind, 'empty');
  const r = parseYouTube('Nesli – La fine & più 🎵 #live?');
  assert.equal(r.kind, 'search'); assert.equal(r.query, 'Nesli – La fine & più 🎵 #live?');
  assert.equal(new URL(r.url).searchParams.get('search_query'), r.query); assert.ok(!r.url.includes(' ') && !r.url.includes('#'));
  assert.equal(parseYouTube('x'.repeat(201)).kind, 'invalid');
  assert.equal(parseYouTube('Re: la fine').kind, 'search');               // "Re:" non è uno schema pericoloso
});
test('YouTube: cronologia ricerche (max 10, senza doppioni, più recente in testa)', () => {
  let h = []; for (let i = 0; i < 12; i++) h = pushHistory(h, 'q' + i);
  assert.equal(h.length, 10); assert.equal(h[0], 'q11'); h = pushHistory(h, 'Q5'); assert.equal(h[0], 'Q5'); assert.equal(h.filter(x => x.toLowerCase() === 'q5').length, 1); assert.deepEqual(pushHistory(['a'], '  '), ['a']);
});

/* ---- barra schede: 5 e 6 schede ---- */
const bar = n => Array.from({ length: n }, (_, i) => ({ left: i * 60, right: (i + 1) * 60 }));
test('barra schede: scheda sotto il dito con clamp ai bordi e fra gli spazi (5 e 6 schede)', () => {
  for (const n of [5, 6]) {
    const b = bar(n);
    assert.equal(nearestTab(-50, b), 0); assert.equal(nearestTab(9999, b), n - 1); assert.equal(nearestTab(65, b), 1); assert.equal(nearestTab(n * 60 - 1, b), n - 1);
  }
  assert.equal(nearestTab(NaN, bar(5)), null); assert.equal(nearestTab(10, []), null);
  assert.equal(nearestTab(70, [{ left: 0, right: 50 }, { left: 80, right: 130 }]), 1);   // spazio fra due schede: la più vicina
});
test('barra schede: direzione e indicatore', () => {
  assert.equal(tabDirection(1, 3), 1); assert.equal(tabDirection(3, 1), -1); assert.equal(tabDirection(2, 2), 0);
  const b = bar(6), a = indicatorAt(2, b, { tabsLeft: 10 }); assert.equal(a.w, 30); assert.equal(a.x, 120 + 15 - 10);
  const f = indicatorAt(0, b, { fingerX: -999 }), g = indicatorAt(0, b, { fingerX: 9999 });
  assert.equal(f.x, 15); assert.equal(g.x, 300 + 15);                      // il dito fuori dai bordi: l'indicatore resta dentro la barra
});
test('swipe tra schede con 5 e 6 schede: l\'ultima non ha successiva, la scheda beta partecipa in ordine', () => {
  const base = { startX: 180, width: 360, dy: 5 };
  assert.equal(decideTabSwipe({ ...base, dx: -100, index: 4, count: 5 }), null);
  assert.equal(decideTabSwipe({ ...base, dx: -100, index: 4, count: 6 }), 5);
  assert.equal(decideTabSwipe({ ...base, dx: -100, index: 2, count: 6 }), 3);     // YouTube al centro (indice 3) raggiunta da Artisti (2)
  assert.equal(decideTabSwipe({ ...base, dx: 100, index: 3, count: 6 }), 2);
});
