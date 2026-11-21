import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/* Controllo statico del grafo dei moduli: ogni nome importato deve essere esportato dal modulo di destinazione, e ogni file importato deve esistere.
   (Senza browser è la rete di sicurezza contro refusi e simboli rimossi/rinominati nei moduli della UI.) */
const files = ['js', 'js/ui', 'js/beta', 'js/sources'].filter(existsSync).flatMap(d => readdirSync(d).filter(f => f.endsWith('.js')).map(f => d + '/' + f));
const exportsOf = src => {
  const set = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) set.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) { const x = n.trim().split(/\s+as\s+/).pop(); if (x) set.add(x); }
  return set;
};
test('moduli: ogni import statico risolve a un export esistente', () => {
  const problems = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g)) {
      const target = resolve(dirname(f), m[2]);
      if (!existsSync(target)) { problems.push(f + ' → file mancante ' + m[2]); continue; }
      const ex = exportsOf(readFileSync(target, 'utf8'));
      for (const n of m[1].split(',')) { const name = n.trim().split(/\s+as\s+/)[0]; if (name && !ex.has(name)) problems.push(f + ' importa «' + name + '» non esportato da ' + m[2]); }
    }
    for (const m of src.matchAll(/import\s+\*\s+as\s+\w+\s+from\s*'(\.[^']+)'/g)) if (!existsSync(resolve(dirname(f), m[1]))) problems.push(f + ' → file mancante ' + m[1]);
    for (const m of src.matchAll(/import\(\s*'(\.[^']+)'\s*\)/g)) if (!existsSync(resolve(dirname(f), m[1]))) problems.push(f + ' → import dinamico mancante ' + m[1]);
  }
  assert.deepEqual(problems, []);
});
test('moduli: nessuna dipendenza circolare fra i moduli statici', () => {
  const g = new Map(files.map(f => [f, [...readFileSync(f, 'utf8').matchAll(/(?:from\s*|import\s*)'(\.[^']+)'/g)].map(m => resolve(dirname(f), m[1]).replace(process.cwd() + '/', ''))]));
  const state = new Map(), cyc = [];
  const dfs = (n, path) => { if (state.get(n) === 2) return; if (state.get(n) === 1) { cyc.push([...path.slice(path.indexOf(n)), n].join(' → ')); return; } state.set(n, 1); for (const d of g.get(n) || []) dfs(d, [...path, n]); state.set(n, 2); };
  for (const f of files) dfs(f, []);
  assert.deepEqual(cyc, []);
});
