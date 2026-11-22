/* IndexedDB in memoria, abbastanza fedele per provare l'archivio dell'app: object store con keyPath e autoIncrement, transazioni asincrone
   che si chiudono quando non ci sono più richieste, upgrade di versione, copie per valore (structuredClone) e iniezione di guasti.
   Non tocca mai dati reali. */
const cmp = (a, b) => (typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : typeof a === 'number' ? -1 : 1);

export function installFakeIDB({ preset, failOn, corrupt } = {}) {
  const dbs = new Map();
  if (preset) dbs.set('mymusic', { version: preset.version, stores: new Map(Object.entries(preset.stores).map(([n, o]) => [n, { keyPath: o.keyPath, auto: !!o.auto, next: (o.rows || []).length + 1, data: new Map((o.rows || []).map((v, i) => [o.keyPath ? v[o.keyPath] : i, structuredClone(v)])) }])) });
  const sorted = st => [...st.data.entries()].sort((a, b) => cmp(a[0], b[0]));

  function makeTx(d, names, mode) {
    const t = { error: null }; let pending = 0, done = false;
    const finish = () => { if (done || pending) return; done = true; setTimeout(() => t.oncomplete?.(), 0); };
    const run = fn => {
      const req = {}; pending++;
      setTimeout(() => {
        if (done) return;
        try { req.result = fn(); req.onsuccess?.(); } catch (e) { t.error = e; done = true; setTimeout(() => (t.onerror || t.onabort)?.(), 0); return; }
        pending--; finish();
      }, 0);
      return req;
    };
    t.objectStore = n => {
      if (!names.includes(n)) throw Error('NotFoundError: ' + n);
      const st = d.stores.get(n); if (!st) throw Error('NotFoundError: ' + n);
      const write = (op, v, k) => run(() => {
        if (mode === 'readonly') throw Error('ReadOnlyError');
        if (failOn?.(n, op, v, k)) throw Error('QuotaExceededError');
        let key = st.keyPath ? v[st.keyPath] : k;
        if (st.keyPath && st.auto && key === undefined) { key = st.next++; v = { ...v, [st.keyPath]: key }; }
        if (op === 'add' && st.data.has(key)) throw Error('ConstraintError');
        let val = structuredClone(v); if (corrupt) val = corrupt(n, val) ?? val;
        st.data.set(key, val); return key;
      });
      return {
        put: (v, k) => write('put', v, k), add: (v, k) => write('add', v, k),
        get: k => run(() => structuredClone(st.data.get(k))),
        getAll: () => run(() => sorted(st).map(([, v]) => structuredClone(v))), getAllKeys: () => run(() => sorted(st).map(([k]) => k)),
        delete: k => run(() => { if (mode === 'readonly') throw Error('ReadOnlyError'); st.data.delete(k); }),
        clear: () => run(() => { if (mode === 'readonly') throw Error('ReadOnlyError'); st.data.clear(); }),
        count: k => run(() => (k === undefined ? st.data.size : st.data.has(k) ? 1 : 0)),
      };
    };
    setTimeout(finish, 0);
    return t;
  }
  globalThis.indexedDB = {
    open(name, version) {
      const req = {};
      setTimeout(() => {
        let d = dbs.get(name), upgrade = false;
        if (!d) { d = { version: 0, stores: new Map() }; dbs.set(name, d); }
        if (d.version < version) upgrade = true;
        const obj = { objectStoreNames: { contains: n => d.stores.has(n) }, createObjectStore(n, o = {}) { d.stores.set(n, { keyPath: o.keyPath, auto: !!o.autoIncrement, next: 1, data: new Map() }); return {}; }, transaction: (names, mode) => makeTx(d, [].concat(names), mode), close() {} };
        req.result = obj;
        if (upgrade) { req.onupgradeneeded?.(); d.version = version; }
        req.onsuccess?.();
      }, 0);
      return req;
    },
  };
  /* accesso diretto ai dati, per le verifiche */
  return { rows: (store) => { const d = dbs.get('mymusic'); return d?.stores.get(store) ? sorted(d.stores.get(store)).map(([k, v]) => [k, structuredClone(v)]) : []; }, version: () => dbs.get('mymusic')?.version };
}

/** localStorage in memoria con limite di spazio opzionale (come il limite di ~5 MB dei browser). */
export function installFakeLocalStorage({ limit = Infinity } = {}) {
  const mem = new Map(), size = () => [...mem].reduce((n, [k, v]) => n + k.length + v.length, 0);
  globalThis.localStorage = {
    getItem: k => mem.get(k) ?? null,
    setItem: (k, v) => { const val = String(v); const next = size() - (mem.has(k) ? k.length + mem.get(k).length : 0) + k.length + val.length; if (next > limit) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; } mem.set(k, val); },
    removeItem: k => mem.delete(k),
  };
  return { mem, size };
}
