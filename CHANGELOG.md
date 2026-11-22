# Changelog

## Fasi 0–1 — aggiornamenti affidabili e dati al sicuro (21 novembre 2026)

Rilascio guidato dall'audit del 20 novembre 2026 (Fase 0: rete di sicurezza di test; Fase 1: priorità P0).

### Corretto
- **Gli aggiornamenti possono non aggiornare (X-1).** Il service worker precaricava i file con `cache.addAll`, che passa dalla cache HTTP del browser: con GitHub Pages (`max-age=600`) un deploy ravvicinato installava codice vecchio sotto un nome di versione nuovo e «Aggiorna» non cambiava nulla. Ora ogni file è richiesto con `cache: 'reload'`; l'installazione resta atomica e, se fallisce, la cache parziale viene eliminata.
- **`DEV` non dipende più dal flag `g` di `sed` (X-3).** Il segnaposto di versione compare una sola volta in `sw.js`.
- **Controllo aggiornamenti al ritorno in primo piano (X-2),** al massimo ogni 30 minuti (una PWA su iPhone resta viva per giorni).
- **Ripristino backup (T-1).** I metadati dei brani «in attesa» non vengono più persi quando superano lo spazio di localStorage (con 2.500 brani con testi non venivano salvati, senza errore); ripristinare due volte lo stesso backup non raddoppia più la cronologia; la data dell'ultimo backup cambia solo se il file è stato davvero salvato o condiviso.
- **Potatura della cronologia per data.** Si scartano gli ascolti più vecchi, non i primi inseriti: dopo un ripristino i due ordini non coincidono e si perdevano gli ascolti più recenti.
- **Nomi come «constructor» o «__proto__»** sono ora nomi di playlist validi (oggetti senza prototipo).

### Aggiunto
- **Ripristino con conferma e riepilogo,** non distruttivo e ripetibile; **«Annulla ripristino»** (dal messaggio e da Impostazioni per 24 ore); se qualcosa va storto a metà, torna da solo allo stato precedente.
- **Backup v6:** identificatori stabili delle playlist e «Includi le copertine scelte a mano» (copertine album e immagini artista manuali). Importa anche i backup fino alla v5.
- **Playlist con identificatore stabile** (sopravvive alla rinomina); il ripristino le abbina per id prima che per nome.
- **Archivio v3:** playlist, copertine playlist e brani in attesa passano da localStorage a IndexedDB con migrazione atomica, verificata e con ritorno automatico (vedi README).
- **Test:** 22 test di unità nuovi (migrazione, rollback, scrittura corrotta, ripristino, annulla, v5/v6, service worker) e 4 `todo` sui difetti noti; una suite end-to-end in browser reale (`npm run test:e2e`: 12 test, più 11 `todo` sui difetti dell'audit non ancora corretti). Gli stessi E2E, eseguiti sulla versione originale con `SONANCE_APP`, falliscono 10 volte su 12: 5 riproducono difetti dell'originale (aggiornamento con cache HTTP, cache parziale, cronologia raddoppiata, brani in attesa persi, data backup anticipata) e 5 verificano funzioni nuove (ripristino con conferma, Backup completo, archivio v3, playlist in IndexedDB); restano verdi solo i due controlli (aggiornamento senza cache HTTP, avvio offline).

### Compatibilità
- Backup v1–v5 si importano come prima. Un backup v6 non si importa con una versione precedente dell'app.
- Tornare a una versione precedente dopo la migrazione non è supportato: le playlist restano in IndexedDB (copia in `sonance.migbak.v1` per 30 giorni).

### Non incluso (fasi successive)
- Album, tag, ricerca, privacy dei servizi esterni (Fase 2); player e coda (Fase 3); accessibilità (Fase 4); Worker e YouTube (Fase 5); interfaccia (Fase 6).
