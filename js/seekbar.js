/* Trascinamento della barra di avanzamento (logica pura, testata in Node).
   Regole che prima mancavano:
   - un seek avviene SOLO alla fine di un trascinamento iniziato sulla barra, con lo stesso puntatore;
   - eventi di altri puntatori, o tocchi altrove nell'app, non possono mai produrre un seek;
   - un gesto annullato dal sistema (pointercancel, app in background) non sposta la riproduzione. */
export function createSeekDrag({ onPreview, onCommit, onEnd }) {
  let pid = null, frac = 0;
  const end = () => { pid = null; onEnd?.(); };
  return {
    get active() { return pid != null; },
    down(id, f) { pid = id; frac = f; onPreview?.(f); },
    move(id, f) { if (pid == null || id !== pid) return false; frac = f; onPreview?.(f); return true; },
    up(id, f) { if (pid == null || id !== pid) return false; const v = f ?? frac; end(); onCommit(v); return true; },
    cancel(id) { if (pid == null || (id != null && id !== pid)) return false; end(); return true; },
  };
}
