# Sonance — Audit completo, code review e piano di rifinitura

*Fase 1 · sola analisi e pianificazione · 20 novembre 2026 · progetto analizzato: `sonance-main.zip` · nessun file del progetto modificato, nessuno ZIP aggiornato*

## Sintesi

**Verdetto.** Sonance è già un prodotto ricco e ben costruito (zero dipendenze runtime, 34 moduli ES, circa 4.000 righe, 116 test che passano, identità visiva coerente), ma **non è ancora «completa e rifinita»** nel senso del tuo traguardo. Eseguendo l’app e le sue funzioni ho confermato più di venti difetti, alcuni silenziosi e con effetto sui dati. Nessuno richiede una riscrittura: sono correggibili con interventi circoscritti, a fasi.

**Le sette cose da sapere subito** (tutte verificate eseguendo il codice, non dedotte):

1. **P0 · Gli aggiornamenti possono non aggiornare.** Con le intestazioni di GitHub Pages (`max-age=600`), dopo un deploy il nuovo Service Worker precarica i file *dalla cache HTTP del browser* e conserva codice vecchio sotto un nome di versione nuovo; dopo «Aggiorna» il codice in esecuzione resta quello vecchio. La correzione (`cache: 'reload'`) l’ho provata su una copia isolata: funziona.
2. **P0 · Il ripristino del backup può perdere dati senza avvisare.** Con 2.500 brani con testi i metadati in attesa non vengono salvati (localStorage pieno, nessun errore); ripristinare due volte lo stesso backup porta gli ascolti da 5 a 10 a 15; le copertine scelte a mano non entrano nel backup; nessuna conferma.
3. **P0 · Gli album si spezzano.** Un album da 3 tracce diventa 3 album (featuring nel campo artista, `Sinfonia`/`sinfonia`); una compilation senza «album artist» diventa 3 album da 1 brano; i doppi album sono mostrati interlacciati (il numero disco non viene letto).
4. **P1 · Tag.** FLAC, WAV e OGG non hanno lettura dei tag (titolo = nome file); anno, genere, disco e compilation non vengono letti da nessun formato.
5. **P1 · Privacy.** L’interruttore «Cerca copertine e testi su internet» ferma solo la coda in background: premere Play su un brano senza testo invia titolo, artista, album e durata a iTunes, Deezer e LRCLIB.
6. **P1 · Accessibilità.** Il player espanso non è modale (28 Tab su 40 finiscono dietro), `Esc` e `Spazio` non fanno nulla, lo zoom è bloccato, il pulsante primario in tema scuro è bianco su arancio (2,26:1).
7. **P1 · Scala.** Con 5.000 brani in coda ogni cambio brano a pannello aperto blocca l’interfaccia (5,1 s con CPU 4× più lenta); le schermate di dettaglio tagliano a 400 righe, «Preferiti» compresi.

**Cosa è già fatto bene (e non va toccato):** pausa e ripresa del player, ripristino dopo ricarica, avvio offline con dati intatti, sicurezza di base (nessun punto di iniezione HTML con dati utente, CSP rigida, chiave YouTube solo nel Worker), abbinamenti online prudenti, rispetto dei limiti dei servizi esterni, struttura modulare e un README che coincide col codice (con una sola imprecisione).

**Cosa mi serve da te:** cinque decisioni in fondo al documento, che cambiano l’ordine dei lavori. Fino al tuo via libera non modifico nulla.

## Come ho lavorato e cosa ho potuto verificare

**Metodo.** Ho estratto lo ZIP in una cartella temporanea (l’originale è intatto) e ho: letto tutto il codice (34 moduli JS, CSS, HTML, Service Worker, Worker, workflow, README, test); eseguito `npm run check` (OK) e `npm test` (**116/116 passati**, 31,9 s); fatto analisi statica (TypeScript in modalità `checkJs` più uno script `acorn`); eseguito l’app in **Chromium headless** (Playwright) con un server locale che replica le intestazioni di GitHub Pages, usando file audio reali generati con ffmpeg (MP3 con ID3, copertina incorporata e numero disco; FLAC; WAV; M4A) e librerie sintetiche fino a 10.000 brani; scritto una quindicina di script di prova. Per quote, licenze e limiti dei servizi esterni ho consultato la documentazione ufficiale il 20/11/2026.

**Legenda** (la uso su ogni affermazione importante):

- **\[V\]** Verificato concretamente: eseguito nel browser o in Node durante questo audit.
- **\[T\]** Verificato da test automatici già presenti nel progetto.
- **\[C\]** Analizzato solo a livello di codice: dedotto dalla lettura, non eseguito.
- **\[N\]** Non verificabile nell’ambiente disponibile.

**Cosa NON ho potuto verificare \[N\].** iPhone/iOS Safari e PWA installata (Now Playing, audio in background e dopo interruzioni, ripresa dell’AudioContext, quote reali di IndexedDB e localStorage, safe area reali), Android, Firefox e Safari desktop; le chiamate reali ai servizi esterni (rete bloccata: li ho esercitati con risposte simulate e con la documentazione); il Worker YouTube con la chiave vera; la qualità udibile (gap tra brani, EQ, dissolvenza); screen reader reali; perdite di memoria su sessioni lunghe. Le prestazioni sono misurate su Chromium desktop con CPU rallentata 4× (CDP): ordine di grandezza, non misura su telefono.

**Due avvertenze di onestà.** (1) Un mio primo esperimento sulla cache era invalido, perché Playwright disattiva la cache HTTP quando intercetta le richieste: l’ho rifatto senza intercettazioni e riporto solo quello. (2) Le prove di correzione (per esempio `cache: 'reload'`) sono state fatte su copie in `/tmp`, mai sul progetto.

**Convenzioni.** Gli identificativi (L-1, A-1, R-1, Y-1, P-1, T-1, M-1, X-1…) servono per i rimandi. Priorità: **P0** critico, **P1** importante, **P2** rifinitura, **P3** facoltativo. Complessità stimata: **S** ≤ mezza giornata, **M** 1–2 giorni, **L** 3+ giorni di lavoro.

## PARTE 1 — Stato generale di Sonance

### Giudizio complessivo

Sonance è una PWA matura per un progetto sviluppato in autonomia: nessuna dipendenza runtime, moduli piccoli con responsabilità riconoscibili, logica pura separata dal DOM e testata, e decisioni difensive nei punti dove di solito si inciampa (scrittura su IndexedDB riletta per verifica, eliminazioni con Annulla, backup validato, abbinamenti online prudenti, limiti dei servizi rispettati). Il comportamento in esecuzione lo conferma: l’app parte senza errori di console, importa file reali con copertine incorporate, riproduce, mette in pausa e riprende, ripristina titolo e posizione dopo una ricarica e si avvia offline con i dati intatti **\[V\]**.

La distanza dal traguardo non sta nell’architettura ma in tre famiglie di problemi: **(a) integrità e continuità dei dati** (aggiornamenti che non aggiornano, backup e ripristino fragili, album che si spezzano, tag non letti); **(b) controllo da parte dell’utente** (privacy, accessibilità, coda grande); **(c) rifinitura** (icone, desktop, scheda YouTube non ancora «nativa», contrasti). Le prime due vanno corrette prima di qualunque nuova funzione; la terza è lavoro di cura.

I 116 test sono ben scritti ma coprono quasi solo logica pura e flussi di rete simulati: nessuno tocca `player.js`, `audio.js`, `store.js`, il Service Worker a runtime o l’interfaccia, e due gruppi di test (`uiShouldShowPlaying`, `resumePosition`) verificano funzioni che nessun modulo usa **\[V\]**. Per questo molti difetti qui sotto sono sfuggiti con la suite verde.

### Punti di forza (con evidenza)

1. **Player robusto nei flussi principali \[V\].** Pausa → ripresa in 13 ms con posizione corretta; 3 «Avanti» ravvicinati lasciano lo slot attivo coerente col brano corrente e quello inattivo in pausa; nessun tempo di ascolto accumulato mentre è in pausa; titolo e posizione ripristinati dopo la ricarica.
2. **Disciplina sui dati \[C/T\].** Scrittura IndexedDB riletta, eliminazione differita con Annulla (6 s) e flush alla chiusura, backup con whitelist, nomi vietati e limiti, migrazioni tracciate (`S.mig`).
3. **Abbinamento online prudente \[T\].** Punteggi e soglie («meglio nessun testo che uno sbagliato»), cache negativa con scadenza, ricerca testi in 7 passi.
4. **Buona cittadinanza verso i servizi \[C\].** Pause per fornitore (iTunes 3,2 s ≈ 19 chiamate/min contro un limite documentato di ≈ 20; Deezer 0,5 s contro 50 ogni 5 s), cooldown su 403/429/503, diagnostica integrata.
5. **Sicurezza di base \[C\].** Tutte le assegnazioni a `innerHTML` ricevono SVG o etichette costanti; il testo dell’utente passa sempre da nodi di testo; nessun `eval`; chiave YouTube solo nel Worker, CORS ristretto, input validati.
6. **Interfaccia coesa \[V visuale\].** Avorio caldo + terracotta + logo con onda, sheet nativi, stati vuoti curati, feedback con Annulla, safe area e movimento ridotto gestiti.
7. **Scala ragionevole \[V\].** 10.000 brani: primo elenco in 0,57 s (1,2 s con CPU 4× più lenta), ricerca 15 ms (60 ms), heap 38 MB.
8. **Documentazione affidabile \[C\].** Il README coincide col codice su numero di test (116), versioni (`LYR_V = 8`) e limiti noti; unica imprecisione: descrive `hold()` come «un secondo elemento audio», ma il codice riusa lo stesso elemento.

### Criticità principali

- **Dati e continuità:** X-1 (cache del Service Worker), T-1 (backup e ripristino), A-1 e A-2 (album), L-1 (tag), P-1 (localStorage), T-2 (cronologia limitata a 8.000 ascolti).
- **Controllo e privacy:** L-3 (interruttore internet ignorato in riproduzione), X-6 (script di terze parti via JSONP), Y-1 (quota YouTube non protetta).
- **Accessibilità:** M-2, T-4 (contrasti), zoom bloccato.
- **Scala:** M-1 (coda), P-3 e R-4 (limite di 400 righe).
- **Rifinitura:** icone (T-3), scheda YouTube (Y-6), layout desktop (M-8, X-9), plurali e piccoli dettagli.
- **Qualità ingegneristica:** nessun test su player, storage, Service Worker e UI; nessun linter; residui di un modulo rimosso; righe molto dense.

### Punteggi (1–10), derivati dalle evidenze

- **Architettura e modularità — 7,5.** 34 moduli ES nativi, zero dipendenze, logica pura separata e testata **\[T\]**. Penalizzano: stato globale mutabile condiviso (`S`, `PL`, `lib`, `P`), un solo evento `state` senza payload, tre definizioni diverse di «identità dell’album» **\[C\]**, residui del modulo «Scopri» (`'disc'` in `main.js`, `js/sources` nei test, `src.*` in backup/libreria/testi) e cinque export non usati dal runtime **\[V\]**.
- **Maturità del prodotto — 7.** Set funzionale ampio (EQ, dissolvenza, testi sincronizzati con offset, M3U, duplicati, backup, statistiche). Mancano elementi attesi da un’app «premium»: disco/anno/genere, discografia, «aggiungi brani» dentro la playlist, volume, scorciatoie **\[V/C\]**.
- **Interfaccia e identità — 7,5.** Identità riconoscibile e coesa su mobile **\[V visuale\]**; penalizzano icone incoerenti, scheda YouTube non nativa, desktop non progettato e contrasti.
- **Affidabilità — 6.** Player solido nei flussi provati **\[V\]**; penalizzano cache SW che può restare vecchia, ripristino con perdita silenziosa e duplicazioni, impostazione privacy ignorata, assenza di test E2E **\[V\]**.
- **Prestazioni — 7.** Ottime a 10.000 brani per avvio e ricerca **\[V\]**; penalizzano coda (5,1 s), ricostruzione completa delle liste, costi O(n·k) **\[V/C\]**.
- **Manutenibilità — 6,5.** Struttura leggibile ma codice molto denso (119 righe oltre 200 caratteri, 6 oltre 400, massimo 551) **\[V\]**, nessun linter né E2E in CI, alcuni test che controllano il testo del sorgente **\[C\]**.
- **Accessibilità — 4,5.** Buone basi (`<dialog>` nativi, `aria-label` diffusi, `prefers-reduced-motion`, pulsanti ≥ 44 px), ma player non modale, righe non operabili da tastiera, zoom bloccato, contrasti sotto soglia, pulsante «Annulla» del toast focalizzabile anche quando è invisibile **\[V\]**.
- **PWA e offline — 6,5.** Avvio offline **\[V\]**, precache atomico e versionato, aggiornamento che attende la fine del brano **\[C\]**; penalizzano il precache dalla cache HTTP **\[V\]**, il manifest con `any maskable` unico e l’icona della Home incoerente con il logo **\[V visuale\]**.
- **Sicurezza e privacy — 7.** Vedi punto di forza 5 **\[C\]**; penalizzano JSONP con script di terze parti, CORS basato solo su `Origin`, limitatore non configurato, interruttore privacy ignorato **\[V/C\]**.

**Media non ponderata ≈ 6,6/10.** Con i tre P0 risolti e l’accessibilità strutturale sistemata, la stessa griglia salirebbe, per mia stima, a circa 8.

## PARTE 2 — Analisi sezione per sezione

Per ogni sezione: **A** stato attuale · **B** problemi · **C** miglioramenti · **D** priorità · **E** valore e complessità. Tutte le correzioni proposte sono pensate come *non distruttive*: preservano libreria, metadati, copertine, playlist, preferiti, cronologia, impostazioni e compatibilità PWA.

### 1. Libreria

**A. Stato attuale**

- **Importazione \[V/C\].** Selezione multipla di file audio; elaborazione sequenziale: durata via `<audio>` (timeout 6 s), lettura tag, scrittura in IndexedDB **con rilettura di verifica**, deduplica per nome+dimensione, richiesta di storage persistente. Import reale di 14 file: 14/14 riusciti, copertine incorporate lette e mostrate **\[V\]**.
- **Vista \[C/V visuale\].** Home con scaffali («Aggiunti di recente», «Ascoltati di recente») ed elenco paginato a 60 righe (`IntersectionObserver`, `content-visibility`); ordinamenti, filtro preferiti, selezione con pressione lunga e barra azioni (playlist, preferiti, elimina con Annulla, imposta artista/album).
- **Ricerca \[V\].** Sottostringa su «titolo artista album» normalizzata (accenti e punteggiatura ignorati).
- **Duplicati \[T/C\].** Raggruppamento su titolo+artista con tolleranza di durata e su dimensione+durata; l’unione trasferisce preferiti, ascolti e riferimenti nelle playlist.
- **Scala \[V\].** 10.000 brani: primo elenco in 0,57 s (1,2 s con CPU 4×), ricerca 15 ms (60 ms), heap 38 MB.
- **Codice.** `library.js` concentra importazione, indici, backup e coda di arricchimento (circa 400 righe dense); la logica pura (`match.js`, `dup.js`, `tags.js`) è separata e testata.

**B. Problemi individuati**

- **L-1 · P1 · Formati e tag \[V\].** `tags.js` legge solo ID3v2 e MP4. Un FLAC con Vorbis comment diventa «flac1 · Artista sconosciuto» (titolo = nome file); un WAV prende i dati solo dal nome (`Artista - Titolo`); M4A funziona. In nessun formato vengono letti anno, genere, numero disco, flag compilation, testi incorporati; ID3v1 assente. Il `.gitignore` cita `*.flac` e `*.wav`: in libreria li hai davvero.
- **L-2 · P1 · Ricerca \[V\].** L’ordine delle parole conta: `canzone 99` → 111 risultati, `99 canzone` → 0; «artista titolo» → 0. Nessun ranking, nessuna tolleranza di refusi; la ricerca esiste solo in Libreria (non in Album, Artisti, Playlist).
- **L-3 · P1 · Privacy \[V\].** Con l’interruttore «Cerca copertine e testi su internet» spento, l’import non contatta nessuno (corretto), ma **premere Play** su un brano senza testo genera 6 richieste verso iTunes, Deezer e LRCLIB con titolo, artista, album e durata: `player.load()` chiama `enrichOne()` senza controllare `S.auto`. L’etichetta dell’interruttore («Quando importi nuovi brani…») e il comportamento non coincidono. Inoltre «Cerca di nuovo per tutti i brani» parte senza conferma, con fino a 12 chiamate LRCLIB per brano, e **sovrascrive** testi già presenti **\[C\]**.
- **L-4 · P2 · Duplicati \[V\].** «File identici» si basa solo su dimensione+durata: nel mio import due brani diversi («Uno», «Tre») sono stati segnalati come identici. Con CBR e tag di uguale lunghezza può capitare anche nella realtà (l’utente conferma, quindi non è P1).
- **L-5 · P2 · Abbinamenti troppo permissivi \[V funzione + C\].** `pickBest` accetta «Love» ≈ «Love Story» dello stesso artista e «Love Story» ≈ «Love Story (Taylor’s Version)»; `enrichOne` usa il risultato per **riempire l’album mancante**, quindi può assegnare album o edizione sbagliati senza traccia di provenienza né possibilità di annullare.
- **L-6 · P2 · Modifiche senza rete di sicurezza \[C\].** «Imposta artista/album» su più brani e «Modifica brano» non hanno Annulla; «Riprova la ricerca» dei testi azzera il blocco `ll` e può sostituire una scelta manuale senza conferma.
- **L-7 · P2 · Scalabilità \[C/V\].** `softRemove` è O(n·k) (`ids.includes`); a ogni aggiornamento «soft» la lista visibile ricostruisce tutte le righe già caricate; `prunePlays()` rilegge l’intera cronologia a ogni ascolto contato; all’avvio vengono caricati in memoria tutti i testi.
- **L-8 · P2 · Rifiniture UX \[V visuale\].** Toast su 4 righe che copre la lista (390 px); «1 brani» con plurale fisso; barra ordina/seleziona/casuale/play visibile a libreria vuota; nessun indice alfabetico; import senza anteprima né annullamento.

**C. Miglioramenti consigliati**

- **Tag:** estendere `tags.js` a FLAC (Vorbis comment + blocco PICTURE), OGG/Opus e WAV (INFO/ID3), ID3 `TPOS`, `TYER/TDRC`, `TCON`, `TCMP`, `USLT` e MP4 `disk`, `©day`, `©gen`, `cpil`; nuovi campi `disc`, `year`, `genre`, `comp` (inclusi in `META` del backup). Fixture di test: i file che ho generato.
- **Stato dei metadati e filtro «Da sistemare»:** per ogni brano la completezza (artista, album, anno, copertina, testo) e un filtro smart che raccoglie gli incompleti, con proposte affidabili da confermare (vedi Artisti e Parte 4).
- **Ricerca a token:** AND in qualunque ordine, indice normalizzato precalcolato per brano, ranking (titolo > artista > album; prefisso > sottostringa), tolleranza di un refuso sui token da 5+ caratteri, operatori opzionali (`artista:`, `album:`, `anno:`); stessa barra in Album, Artisti e Playlist.
- **Privacy:** far rispettare `S.auto` anche in riproduzione (oppure rinominare l’interruttore in modo onesto); sotto l’interruttore una riga con i fornitori che ricevono i dati; conferma e opzione «solo brani senza testo» per la ricerca massiva.
- **Duplicati:** hash parziale (primi e ultimi 64 KB con `crypto.subtle`) per distinguere «identici» da «simili», con etichette diverse.
- **Abbinamenti:** soglia più alta (≥ 0,85) per assegnare album o artista (più bassa solo per la copertina), campo di provenienza (`msrc`) e «Ripristina valore originale»; mai sovrascrivere campi modificati a mano.
- **Rete di sicurezza:** Annulla per le modifiche massive (si salvano i valori precedenti); conferma quando «Riprova» sostituirebbe un testo bloccato.
- **Micro-feedback:** plurali corretti, toast su una riga con azione, riga «Importazione in corso» con avanzamento e Annulla, ingresso/uscita righe in ≤ 180 ms (già compatibile con `data-eco`).

**D. Priorità.** **P1:** L-1, L-2, L-3. **P2:** L-4, L-5, L-6, L-7, L-8. **P3:** lettura tag in parallelo (2–3 flussi, da misurare **\[N\]**); indice alfabetico.

**E. Valore dell’intervento**

- **L-1:** la libreria FLAC/WAV passa da «anonima» a ordinata e gli album multi-disco diventano possibili — **alto / M**.
- **L-2:** trovare «lazza cenere» come ci si aspetta — **alto / S–M**.
- **L-3:** coerenza con ciò che l’interruttore promette, zero invii non voluti — **alto (fiducia) / S**.
- **L-4–L-6:** meno errori silenziosi — **medio / S ciascuno**.

### 2. Album

**A. Stato attuale**

- **Raggruppamento \[C\].** Chiave **grezza** `album + '\0' + (albumArtist || artista)`; le **copertine** usano un’altra chiave (`norm(artistaPrincipale)|norm(album)`); ordine nell’album: numero traccia, poi titolo.
- **Interfaccia \[V visuale\].** Griglia di card (copertina, nome, «artista · N brani»); dettaglio con copertina grande, Riproduci/Casuale e righe con miniatura, ♥ e menu. Menu album: riproduci dopo, aggiungi in coda, salva come playlist, scegli copertina.
- **Copertine \[C\].** Incorporate nel file, poi iTunes → Deezer; JPEG 640/256 px salvati in IndexedDB.

**B. Problemi individuati**

- **A-1 · P0 · Album spezzati \[V\].** Con tag reali: «Sinfonia» di Lazza (una traccia «Lazza feat. Sfera Ebbasta», una con l’album scritto `sinfonia`) → **3 album**; «Hits 2020» (3 artisti, nessun album-artist) → **3 album da 1 brano**; l’artista Lazza risulta «3 brani · 2 album». Le compilation mostrano la copertina solo per l’artista che la possiede, perché copertine e raggruppamento usano chiavi diverse. È esattamente il rischio che temevi (differenze minime nei metadati); lo classifico P0 perché deforma la struttura principale della libreria ed è correggibile senza toccare i file audio.
- **A-2 · P1 · Doppi album \[V\].** `disc` non viene letto: con due dischi da 2 tracce l’ordine mostrato è Alba › Sera › Giorno › Notte (D1T1, D2T1, D1T2, D2T2).
- **A-3 · P2 · Dettaglio povero \[V visuale\].** Nessun numero di traccia né intestazione disco; ogni riga ripete artista e album già in testata; niente anno/genere; durata totale «0 min» per album brevi; «1 brani»; nome artista non cliccabile e nessun «Vai all’artista» nel menu album.
- **A-4 · P2 · Ordinamento e ricerca \[C\].** Solo A–Z; nessun filtro né ricerca nella scheda.
- **A-5 · P2 · Statistiche \[C\].** «Top album» cerca l’album per solo nome: due «Greatest Hits» di artisti diversi si confondono.

**C. Miglioramenti consigliati**

- **Identità canonica e non distruttiva.** `albumId` derivato = `norm(album)` + artista-album canonico: `albumArtist` se presente; altrimenti l’artista principale normalizzato; se 3 o più artisti principali diversi condividono lo stesso `norm(album)` senza album-artist ⇒ «Artisti vari». I tag dei file non si riscrivono. **Un’unica funzione** usata da raggruppamento, copertine e statistiche (oggi sono tre).
- **«Unisci album…» e «Separa» manuali**, salvati come alias persistenti (inclusi nel backup) per i casi che nessuna regola indovina.
- **Disco e ordine:** `disc` + `trk`; intestazioni «Disco 1/2» solo se i dischi sono almeno due.
- **Dettaglio «premium» con identità propria:** testata con copertina, titolo, artista (link alla scheda), anno · N brani · durata; numeri di traccia al posto delle miniature; sfondo sfumato dal colore dominante della copertina (`color.js` lo calcola già); azioni Riproduci, Casuale, ♥ album, Altro. Niente imitazione di altri servizi: sfumatura calda e tipografia di Sonance.
- **Griglia:** ordinamento (A–Z, artista, anno, aggiunti di recente) e ricerca; badge «incompleto» se mancano tracce rispetto al totale `trk/N` del tag (oggi non salvato).
- **Test:** casi «golden» con le mie fixture (featuring, maiuscole, compilation, doppio album).

**D. Priorità.** **P0:** A-1. **P1:** A-2. **P2:** A-3, A-4, A-5. **P3:** badge «incompleto», ♥ album.

**E. Valore dell’intervento**

- **A-1:** elenco album affidabile; correggere anche le schede artista — **molto alto / M** (funzione unica, alias, migrazione della chiave copertine senza perdere nulla).
- **A-2/A-3:** album che «sembrano» album — **alto / S–M**.

### 3. Artisti

**A. Stato attuale**

- **Raggruppamento \[C\].** Per `norm(nome)` (accenti e punteggiatura ignorati: «Beyoncé» e «Beyonce» insieme).
- **Artisti multipli \[C/T\].** `parseArtistString` divide su `feat./ft./&/+/,/;/x/con…`, protegge 25 nomi composti scritti nel codice e una lista dell’utente («Considera artista unico»); per i nomi *senza* separatori verifica online (fan Deezer).
- **Immagini \[C\].** Deezer → Wikipedia con prova di pertinenza; cache locale (7 giorni per gli esiti negativi).
- **Scheda \[V visuale\].** Avatar, «N brani · M album», Riproduci/Casuale, elenco piatto fino a 400 righe.

**B. Problemi individuati**

- **R-1 · P1 · Scheda povera \[V visuale\].** Nessuna discografia, nessun collegamento agli album, nessuna biografia (solo l’immagine), nessun «più ascoltati». Il «M album» risente della chiave grezza (A-1).
- **R-2 · P1 · Falsi split \[V funzione\].** `Belle & Sebastian` → Belle + Sebastian; `Emerson, Lake & Palmer` → 3 artisti; `Peaches & Herb` idem. Solo 25 eccezioni e nessuna verifica online per i nomi con separatore. Reggono: `Nick Cave & the Bad Seeds`, `Simon & Garfunkel`, `Lazza x Sfera Ebbasta`, `Malcolm X`.
- **R-3 · P2 · Artista = stringa \[C\].** Nessun identificatore stabile né distinzione tra omonimi; «Vai all’artista» solo sul primo.
- **R-4 · P2 · Limite di 400 righe.** Confermato su «Preferiti» con 500 brani **\[V\]**; la scheda artista usa lo stesso codice **\[C\]**: oltre 400 brani non sono raggiungibili.
- **R-5 · P2 · Navigazione \[C\].** Nessuna ricerca né indice alfabetico; ordinamento unico.
- **R-6 · P2 · Icona \[V visuale\].** La scheda Artisti usa l’icona «utente +»: comunica «aggiungi persona».

**C. Miglioramenti consigliati**

- **Scheda ricca ma sobria:** testata (immagine, nome, ascolti totali dalle tue statistiche); *Più ascoltati* (5 brani, dai tuoi dati); *Album* (riga orizzontale di copertine dalla libreria, con link); *Compare in* (brani dove è ospite); *Informazioni* (2–3 frasi da Wikipedia/Wikidata con attribuzione CC BY-SA e link); *Discografia completa* facoltativa da MusicBrainz, con le uscite non presenti in libreria segnate in modo discreto. Le prime tre parti usano solo dati locali: nessun servizio, nessun costo.
- **Pipeline «a evidenza» per non sbagliare né duplicare** (vale per artisti e brani): (1) i tag del file sono la verità di partenza; (2) identificazione via MusicBrainz con punteggio multi-criterio (titolo, artista, album, durata ±3 s, ISRC se presente); (3) **associare solo sopra una soglia alta di confidenza**, altrimenti proposta in «Da sistemare» che l’utente conferma o rifiuta; (4) l’ID (MBID) diventa la chiave di deduplica, la stringa normalizzata resta il ripiego; (5) ogni campo riempito porta provenienza e data, non sovrascrive mai valori modificati a mano ed è annullabile; (6) cache negativa con scadenza (già presente) e rispetto dei limiti.
- **Nomi composti:** lista estendibile dall’utente (c’è già) più verifica online anche per i nomi con separatore, con conferma una sola volta; regola «sul nome completo risulta un artista noto, non dividerlo».
- **Navigazione:** indice alfabetico laterale, ricerca, ordinamento (nome, ascolti, numero brani); paginazione al posto del limite di 400.

**Servizi esterni** (costo · limiti · chiave · affidabilità; fonti consultate il 20/11/2026)

- **MusicBrainz** — gratuito per uso non commerciale, nessuna chiave; **User-Agent identificativo obbligatorio** e al massimo 1 richiesta/s per IP (oltre: 503 o blocco); dati in gran parte CC0. Affidabilità alta per discografie e identificativi. *Un browser non può impostare `User-Agent`*: va chiamato dal Worker, con cache e coda a 1 richiesta/s.
- **Cover Art Archive** — gratuito, nessuna chiave; immagini caricate dagli utenti, licenze e attribuzione variabili. Ottima come fonte *primaria e verificabile* di copertine quando c’è l’MBID.
- **Wikipedia/Wikidata** — gratuiti, nessuna chiave; testi CC BY-SA con attribuzione obbligatoria; buona copertura per artisti noti.
- **Deezer** (già in uso) — 50 chiamate ogni 5 s (da fonte secondaria); oggi solo tramite JSONP **\[C\]**.
- **iTunes Search** (già in uso) — circa 20 chiamate/min «soggette a modifica»; Apple raccomanda di usare una cache.
- **TheAudioDB** — chiave di prova condivisa limitata a 30 richieste/min con risultati ridotti; piano Premium 8 $/mese (100 richieste/min, API v2); utile per fanart e biografie, non necessario (fonte secondaria).
- **Last.fm** — chiave gratuita, solo uso non commerciale; biografia breve e artisti simili; attribuzione richiesta.
- **Discogs e Spotify:** non li consiglio come fonti primarie. Discogs richiede token e termini propri; sulle condizioni correnti dell’API Spotify non ho verificato nulla oggi **\[N\]**.

**D. Priorità.** **P1:** R-1 (parte locale: album e più ascoltati, senza servizi), R-2. **P2:** R-3, R-4, R-5, R-6, biografia e discografia esterne. **P3:** fanart, artisti simili.

**E. Valore dell’intervento.** R-1 (parte locale): scheda utile subito — **alto / M**. Biografia e discografia esterne: **medio / M–L** (Worker, cache, attribuzioni). R-2: meno artisti fantasma — **medio-alto / S–M**.

### 4. YouTube (beta)

**A. Stato attuale**

- **Architettura \[C\].** Moduli caricati solo con `S.beta = 1` (`beta.js` registra la scheda); `youtube.js` è un parser puro (link video/playlist/short/live/embed oppure ricerca); `yt-tab.js` è la UI; il Worker Cloudflare `GET /api/youtube/search` chiama `search.list` (video, 10 risultati, `safeSearch=moderate`, `regionCode=IT`, `relevanceLanguage=it`), tiene la chiave come secret, limita le origini con `ALLOWED_ORIGINS`, valida gli input (q da 2 a 100 caratteri, pageToken ≤ 500), risponde con errori JSON in italiano e `no-store`.
- **Conformità d’uso.** Nessun download né conversione né player incorporato: i risultati aprono YouTube. È coerente con il divieto, nelle Developer Policies, di separare l’audio dal video e di consentire la riproduzione in background.
- **Provato \[V\].** Con un Worker simulato: scheda con badge beta, 10 risultati con «Carica altri», cronologia di 10 ricerche, link `noopener` e miniature accettate solo da `i.ytimg.com`.
- **Quota (documentazione attuale).** `search.list` ha un proprio limite predefinito di **100 chiamate al giorno** (costo 1); gli altri metodi condividono 10.000 unità/giorno; reset a mezzanotte Pacific, cioè **le 09:00 in Italia**; più quota richiede un audit di conformità. Pagine precedenti indicavano costo 100 su 10.000: stesso ordine di grandezza. Il README lo riporta correttamente.

**B. Problemi individuati**

- **Y-1 · P1 · Quota non protetta \[C\].** Ogni ricerca (anche ripetuta, anche annullata dal client) consuma 1 delle 100 giornaliere. Nessuna cache nel Worker (`cacheTtl: 0`, `no-store`) né nel client; `RATE_LIMITER` è previsto dal codice ma **assente** da `wrangler.toml`; il controllo CORS guarda solo `Origin`, falsificabile da un client non-browser, e l’URL del Worker è pubblico nel JavaScript: chiunque può esaurire la quota del giorno. Il messaggio di quota esaurita non indica quando riapre.
- **Y-2 · P2 · Risposte obsolete \[V\].** Cercando `aaa`, `bbb`, `ccc` in rapida successione (risposte lenta/media/veloce), a fine corsa il campo contiene `ccc` e i risultati mostrati sono quelli di `bbb`: il `finally` della richiesta annullata azzera `busy`, quindi la terza ricerca non annulla la seconda. Le richieste annullate consumano comunque quota (3 su 100).
- **Y-3 · P2 · Parser \[V\].** Un solo token con un punto — «Dr.Dre», «AC.DC», «Mr.Brightside» — è trattato come URL e rifiutato con «Questo non è un link YouTube».
- **Y-4 · P2 · Validazione disallineata \[V/C\].** Client `MAX_QUERY = 200` contro Worker 100; «Incolla» assegna `value` aggirando `maxlength` (150 caratteri accettati dal campo); nessun minimo di 2 caratteri lato client: l’errore arriva dopo un viaggio di rete.
- **Y-5 · P2 · «Incolla» \[C\].** Ha poco senso: il campo di ricerca consente già di incollare; il pulsante richiede il permesso agli appunti (prompt su iOS, non disponibile ovunque) e poi mostra «Apri su YouTube», mentre incollare a mano e premere «Cerca» apre direttamente: due comportamenti per lo stesso gesto. **Va rimosso**; il riconoscimento del link deve avvenire mentre si digita.
- **Y-6 · P2 · Non sembra nativa \[V visuale\].** Prima dei risultati ci sono titolo, badge, paragrafo, attribuzione, campo, due pulsanti a tutta larghezza e una riga di stato tecnica («Ricerca tramite YouTube Data API»): il primo risultato inizia a circa il 70% dell’altezza (390×844). La «×» del campo è quella blu nativa; ogni risultato ha titolo lungo e 3 righe di descrizione ma non durata né data; con la beta attiva la barra ha 6 voci.
- **Y-7 · P2 · Conformità \[C + fonte\].** Le Developer Policies chiedono che il client mostri il link ai Termini di servizio di YouTube e un’informativa privacy che citi YouTube API Services e la Google Privacy Policy: nell’interfaccia non ci sono. Rischio pratico basso per uso personale; diventa rilevante con un URL pubblico o con una richiesta di quota extra.
- **Y-8 · P3.** Nessun `Retry-After` sui 429; regione e lingua fisse a IT; nessun filtro per la categoria Musica.

**C. Miglioramenti consigliati** (revisione grafica e funzionale, senza complicare)

- **Cache e limiti nel Worker:** Cache API con chiave normalizzata (`q` minuscola, spazi compattati, `pageToken`), TTL 6–24 h (una cache di ore è compatibile con le policy; prima di allungarla leggere la parte sulla conservazione dei dati); contatore giornaliero (KV o Durable Object) con risposta «Limite raggiunto: riprova dopo le 09:00» *prima* di chiamare YouTube; regola Cloudflare di rate-limit per IP; documentare tutto nel README. Nel client: cache in memoria per 10 minuti e riuso dell’ultima risposta per ricerche identiche.
- **Qualità dei risultati:** `videos.list` (1 unità dal pool da 10.000, non tocca il secchio delle ricerche) per **durata e visualizzazioni**; interruttore «Solo musica» (`videoCategoryId=10`); etichettare i contenuti oltre 20 minuti come «Mix».
- **Integrazione nativa:** «Cerca su YouTube» nel menu di brano, album e artista con la query precompilata («artista titolo»); stato vuoto con 3–4 suggerimenti dalla libreria («Ascoltati di recente»).
- **Layout:** intestazione compatta («YouTube» + badge piccolo), un solo campo con pulsante di invio a icona integrato e «×» tematica; sotto, chips «Recenti» (massimo 5); risultati in righe come in Libreria: miniatura 16:9 arrotondata, titolo su 2 righe, «canale · durata · data», icona ↗ coerente, niente descrizione; attribuzione, Termini e informativa in una sheet (i). Circa il 70% di testo in meno.
- **Correzioni:** token di richiesta per scartare le risposte vecchie; nel parser, input senza spazi con host non YouTube → ricerca; `maxlength` e minimo coerenti col Worker; rimozione di «Incolla».

**D. Priorità.** **P1:** Y-1. **P2:** Y-2 … Y-7 e revisione grafica. **P3:** Y-8.

**E. Valore dell’intervento.** Y-1 protegge l’unica risorsa scarsa (100 ricerche al giorno) — **alto / S–M**. Revisione grafica: la scheda diventa parte di Sonance — **medio-alto / M**. Durata e visualizzazioni: risultati comprensibili a colpo d’occhio — **medio / S**. Correzioni Y-2/Y-3/Y-4: **basso-medio / S** ciascuna.

### 5. Playlist

**A. Stato attuale**

- **Dati \[C\].** Le playlist sono un oggetto `nome → [id brano]` in **localStorage**; le copertine personalizzate sono data URL JPEG (circa 300 px); le automatiche sono «Preferiti», «Aggiunti di recente», «Più ascoltati», «Ascoltati di recente».
- **Funzioni \[C/T\].** Dettaglio con riordino a trascinamento (maniglia), rimozione con Annulla, Riproduci/Casuale, menu (rinomina, copertina, esporta M3U, elimina); import M3U per nome file; «Salva la coda come playlist».

**B. Problemi individuati**

- **P-1 · P1 · Dati critici in localStorage \[V/C\].** Playlist, copertine playlist, coda, posizione, impostazioni e metadati in attesa condividono un budget di circa 5 MB, sincrono. Il caso `pend` supera la quota senza errore (T-1) **\[V\]**; una playlist persa per quota piena sarebbe altrettanto silenziosa.
- **P-2 · P1 · Chiave = nome \[C\].** Rinominare significa ri-chiavare; nessun id stabile; nomi come `constructor` o `toString` non sono creabili (oggetto con prototipo: `PL[n]` risulta già «esistente»); il ripristino del backup **unisce** per nome, quindi non può mai ricreare lo stato esatto.
- **P-3 · P1 · Dettaglio troncato a 400 righe \[V\].** Con 500 preferiti la scheda mostra 400 righe e «…e altri 100 brani»: i restanti non sono riordinabili né rimovibili. Vale per qualunque playlist lunga.
- **P-4 · P2 · Playlist vuota \[C\].** L’unico invito è «Aggiungi dal menu ⋯ di un brano»; manca un «Aggiungi brani» dentro la playlist.
- **P-5 · P2 · Eliminazione \[C\].** Solo conferma, nessun Annulla: incoerente con brani e coda.
- **P-6 · P2 · Copertina e informazioni \[C\].** Copertina automatica = primo brano; elenco in ordine di creazione, senza ricerca; nessuna durata totale né date.
- **P-7 · P2 · Riordino solo a trascinamento \[C\].** Nessuna alternativa da tastiera o da menu (WCAG 2.5.7); richiede righe di altezza uguale.

**C. Miglioramenti consigliati** (solo ciò che dà valore)

- **Modello dati:** store IndexedDB `playlists` (`id`, `name`, `ids`, `cover`, `created`, `updated`) con **migrazione trasparente** da `pl`/`plc` e copia di sicurezza; backup v6 compatibile con le versioni ≤ 5; ripristino per `id`.
- **Dettaglio paginato** con lo stesso `fillList` della Libreria al posto del limite di 400.
- **«Aggiungi brani»:** sheet con ricerca e selezione multipla, e stato vuoto con azione diretta.
- **Copertina a mosaico 2×2** dalle prime 4 copertine distinte, generata al volo (nessun dato in più).
- **«Sposta su/giù»** nel menu della riga; Annulla per «Elimina playlist»; sottotitolo «N brani · 1 h 12 min».
- **Animazioni:** ingresso/uscita della riga in 160–180 ms e piccolo «bump» sul ♥ all’aggiunta, disattivate con `data-eco`.

**D. Priorità.** **P1:** P-1, P-2, P-3. **P2:** P-4 … P-7. **P3:** ordinamento dell’elenco playlist.

**E. Valore dell’intervento.** P-1/P-2 proteggono i dati più personali — **alto / M** (migrazione con test). P-3 — **alto / S**. «Aggiungi brani» — **medio-alto / S–M**. Mosaico — **medio / S**.

### 6. Tu

**A. Stato attuale**

- **Struttura \[V visuale\].** Tre sotto-schede solo testo (Statistiche / Cronologia / Impostazioni).
- **Statistiche \[C\].** Ascolti, tempo, giorni di fila; top brani, artisti e album; minuti per giorno (30 giorni); periodo 7/30/Sempre. La regola «un ascolto vale dopo 30 s (o metà brano)» è spiegata nello stato vuoto: bene.
- **Cronologia \[C\].** Ultimi 300 ascolti raggruppati per giorno; «Cancella cronologia» (i conteggi per brano restano).
- **Impostazioni \[C\].** Riproduzione (dissolvenza, EQ a 6 bande, 16 preset e personali), Libreria, Aspetto (10 temi, accenti, densità, raggio, movimento, testi), Backup e dati, Avanzate (beta, assistenza, registro, diagnostica servizi).
- **Ottimo:** diagnostica integrata, trasparenza sullo spazio occupato, promemoria di backup.

**B. Problemi individuati**

- **T-1 · P0 · Backup e ripristino \[V\].** (a) Con 2.500 brani con testi (circa 3,8 KB ciascuno) `pend` ha 2.500 voci in memoria ma **0 in localStorage** (`{}`), senza alcun errore: dopo il riavvio preferiti, conteggi e testi dei brani «in attesa» sono persi. (b) Ripristinare due volte lo stesso backup porta gli ascolti da 5 a 10 a 15 (`putPlaysBulk` non deduplica). (c) Le copertine scelte a mano non entrano nel backup (nemmeno le immagini artista manuali). (d) Nessuna conferma prima di sovrascrivere metadati e impostazioni. (e) `lastBackup` si aggiorna alla creazione del file, non al salvataggio riuscito **\[C\]**: il promemoria dei 30 giorni può tacere dopo un backup mai salvato. *Perché P0:* è il percorso «nuovo dispositivo / reinstallazione», cioè quello per cui il backup esiste.
- **T-2 · P1 · Statistiche e cronologia \[V/C\].** La cronologia è limitata a 8.000 ascolti: «Sempre» significa «gli ultimi 8.000». `prunePlays` elimina per ordine di inserimento (dopo un ripristino l’ordine cronologico si spezza); l’unione dei duplicati lascia gli ascolti divisi per `tid` (lo stesso brano compare due volte nei top **\[V funzione\]**); due fonti di verità (`pc` permanente, `plays` limitata e cancellabile).
- **T-3 · P1 · Icone \[V visuale + C\].** Sotto-schede senza icone; l’icona della scheda «Tu» è un grafico a barre; «Artisti» è «utente +»; il set `IC` ha duplicati e usi impropri (mappa in 3.7); manca «impostazioni»; due icone inutilizzate (`speed`, `chev`); il tratto è fisso (2 su 24), quindi lo spessore apparente va da 1,3 px a 16 px fino a 5,3 px a 64 px.
- **T-4 · P1 · Contrasto \[V\].** Pulsante primario in tema scuro = **bianco su #fb923c = 2,26:1**; testo secondario su card 4,22:1 (chiaro) e 3,99:1 (Carta); l’accento predefinito dipende dal *sistema* e non dal tema: «Scuro» su un telefono in modo chiaro dà l’accento #c2410c su fondo scuro a 2,85–4,06:1; gli accenti personalizzati usati come testo su temi chiari scendono fino a 1,84:1 (giallo).
- **T-5 · P2 · Troppe variabili \[V/C\].** 10 temi × 6 accenti più colore libero × densità × raggio × 3 livelli di movimento: identità diluita e matrice di test ingestibile (i difetti di contrasto qui sopra ne sono la prova).
- **T-6 · P2 · Impostazioni \[C\].** Pagina lunga senza ancore né ricerca; «Cerca di nuovo per tutti» senza conferma; nessun riepilogo prima del ripristino.
- **T-7 · P2 · Tastiera e lettori di schermo \[C\].** Righe di statistiche e cronologia cliccabili ma `div` senza ruolo né tabindex; barre del grafico solo con `title`; «Top album» per nome (A-5).
- **T-8 · P2 · Dettagli visivi \[V visuale\].** Due controlli segmentati impilati con margini orizzontali diversi (30 contro 22 px).

**C. Miglioramenti consigliati**

- **Backup robusto (priorità assoluta):** conferma con riepilogo («+420 brani, 12 playlist, 3.100 ascolti»); ripristino **idempotente** (chiave `tid+at+ms`); `pend` in IndexedDB; snapshot automatico prima del ripristino con «Annulla ripristino»; `lastBackup` solo a salvataggio riuscito; opzione «Backup completo» con le copertine manuali (JPEG ≤ 100 KB in base64); versione v6 con compatibilità ≤ v5.
- **Cronologia e statistiche:** conservare tutto in forma compatta (aggregati per giorno + ultimi N ascolti dettagliati) oppure alzare il limite e dichiararlo; ordinare per `at`; ricondurre `tid` al brano canonico dopo l’unione.
- **Icone:** un solo set semantico, nello stesso stile Lucide-like già in uso: `user` (Tu), `mic` o `users` (Artisti), grafico (Statistiche), `history` (Cronologia), `sliders` (Impostazioni), `info`, `image`, `lock`, `quote` (Testo), `refresh`; tratto compensato (`stroke-width = 2·24/size`) oppure `vector-effect: non-scaling-stroke`. Sotto-schede: icona da 18 px + etichetta; stessa logica nella tab bar.
- **Contrasto:** token `--acc-text` calcolato per ogni tema/accento (garantisce ≥ 4,5:1 per i testi; l’accento pieno resta per le superfici); `onAccent()` (già esistente) applicato anche all’accento predefinito; accento legato al tema; `--mut` più scuro in tema chiaro e Carta.
- **Semplificare senza togliere:** mantenere tutti i temi ma raggrupparli («Essenziali»: Auto, Chiaro, Scuro, OLED · «Altri») e validare ogni combinazione tema × accento con un test di contrasto automatico (le funzioni sono già in `color.js`).
- **Statistiche utili, non dashboard:** al massimo tre aggiunte — «Riascolta» (molto ascoltati ma non da 60+ giorni), «Fascia oraria preferita», variazione sul periodo precedente per i KPI; righe con ruolo/tabindex e menu contestuale.

**D. Priorità.** **P0:** T-1. **P1:** T-2, T-3, T-4. **P2:** T-5 … T-8. **P3:** insight extra.

**E. Valore dell’intervento.** T-1: fiducia nel backup — **molto alto / M–L**. T-4: leggibilità reale — **alto / S**. T-3: coerenza visiva — **alto / M** (sostituzione icone + test). T-2 — **medio-alto / M**.

### 7. Music Player

**A. Stato attuale**

- **Motore \[C\].** Due `<audio>` alternati (slot) con eventi inoltrati solo dallo slot attivo; pre-caricamento del brano successivo; Web Audio creato **solo se serve** (EQ o dissolvenza) per lasciare l’audio nativo; `hold()` tiene viva la sessione 10 minuti con un silenzio in loop; Media Session completa (metadati, stato, posizione, azioni, `audioSession`); coda e posizione persistite; timer di spegnimento; mini-player e player espanso con gesti (trascina giù per chiudere, scorri sulla copertina per cambiare brano).
- **Provato \[V\].** Play → pausa (hold) → ripresa in 13 ms con posizione corretta; durata e tempo mostrati correttamente in pausa (nessun «0:01» del silenzio); nessun ascolto accumulato in pausa; 3 «Avanti» ravvicinati: slot attivo = brano corrente, slot inattivo in pausa; ripristino di titolo e posizione dopo la ricarica, in pausa; distacco `ended` → `playing` ≈ 1 ms a livello di eventi (Chromium: non è una misura udibile).
- **Testi \[V visuale\].** Vista a righe con riga corrente in evidenza, sfocatura delle altre, offset ±0,5 s per brano, tocco per saltare.

**Sincronizzazione — situazione per situazione**

- **Cambio sezione:** il player è un modulo unico, indipendente dalla scheda; mini-player persistente **\[C\]**.
- **Uscita e rientro, background, interruzioni di sistema:** gestori `visibilitychange`, `wake()` dell’AudioContext (anche in stato `interrupted`), salvataggio posizione a `pagehide` **\[C\]**; comportamento reale su iOS e Android **\[N\]**.
- **Play, stop, pausa, cambio brano:** coerenti; token anti-race in `load()` **\[V\]**.
- **Aggiornamento della pagina:** ripristino corretto **\[V\]**.
- **Apertura e chiusura del player espanso:** funziona, ma non è un dialogo (M-2) **\[V\]**.
- **Eventi duplicati:** l’unico evento verso la UI è `state` (senza payload) e il rendering è idempotente; nessuna duplicazione osservata **\[V/C\]**.
- **Race residue:** `warmNext()` può precaricare nello slot inattivo un brano ormai non più «prossimo» (perdita di fluidità, non di correttezza) **\[C\]**.
- **Giudizio:** modello **solido nei flussi principali ma implicito**: lo stato «in riproduzione / in pausa tenuta / in pausa» deriva da `el.paused` + `isHeld()` sparsi in più moduli.

**B. Problemi individuati**

- **M-1 · P1 · Coda grande \[V\].** Il pannello costruisce 15 nodi DOM per brano (75.000 per 5.000) e si ricostruisce a ogni evento `queue`, quindi a ogni cambio brano: con 5.000 brani l’apertura richiede 1,0 s e il cambio brano a pannello aperto **5,1 s** con CPU 4× (a CPU normale: apertura 0,15 s e cambio brano 1,35 s; con 2.000 brani il cambio brano costa 0,6 s a CPU normale e 2,5 s a CPU 4×). Il pulsante Play del mini-player a coda vuota avvia **l’intera libreria** come coda **\[C\]**.
- **M-2 · P1 · Accessibilità e tastiera \[V\].** Player espanso non modale (nessun `role=dialog`, `aria-modal` o `inert`): 28 Tab su 40 portano il focus su elementi nascosti dietro; `Esc` non chiude; `Spazio` non avvia/ferma; le righe del testo hanno `role=button tabindex=0` ma **nessun gestore da tastiera**; le righe della coda hanno `role=button` senza tastiera **\[C\]**; etichetta «Vai a 0:00» su righe senza tempo **\[C\]**; slider senza `aria-valuetext` **\[C\]**; ♥ con `aria-pressed` *e* etichetta mutevole **\[C\]**; zoom bloccato (`user-scalable=no` e `touch-action`) **\[V\]**.
- **M-3 · P1 · Tasto Indietro \[C\].** Nessuna integrazione con `history`: player espanso e schermate di dettaglio non rispondono a Indietro o al gesto; su Android il tasto chiude l’app. (I `<dialog>` modali sono gestiti dal browser **\[N\]**.)
- **M-4 · P2 · Timer di spegnimento \[V\].** La sfumatura promessa dal README avviene solo con il grafo Web Audio attivo; con le impostazioni predefinite il suono si ferma di colpo (1,21 s dopo un timer di 1,2 s).
- **M-5 · P2 · Test su codice morto \[V\].** `uiShouldShowPlaying` e `resumePosition` hanno test dedicati ma **non sono usati** da nessun modulo: la logica reale è duplicata in `player.js`. Il README parla di «secondo elemento audio» per `hold()`, ma il codice riusa lo stesso.
- **M-6 · P2 · Coda con duplicati \[V\].** Stesso brano 3 volte in coda e poi eliminato dalla libreria: ne viene tolto **uno**; gli altri restano e producono «file non più nell’app». `enqueueEnd` non deduplica, `enqueueNext` sì.
- **M-7 · P2 · Volume e scorciatoie \[V/C\].** Nessun controllo del volume in-app (nemmeno dove `el.volume` funzionerebbe) e nessuna scorciatoia da tastiera su desktop.
- **M-8 · P2 · Layout desktop \[V visuale\].** Il player espanso è il layout mobile allargato: titolo e ♥ ai lati opposti, comandi a circa 1.200 px di distanza.
- **M-9 · P3.** Ordine casuale non persistito (`played` perso al riavvio); `hold()` = silenzio in loop fino a 10 minuti: scelta documentata, con effetti su batteria, Now Playing iOS e auto **\[N\]**.

**C. Miglioramenti consigliati**

- **Coda:** elenco virtualizzato (solo le \~30 righe visibili) o paginato; aggiornamento *mirato* della riga corrente invece di ricostruire tutto; il Play a coda vuota riproduce la **vista corrente** (con conferma oltre N brani) invece dell’intera libreria; l’eliminazione rimuove tutte le occorrenze; opzione «evita duplicati».
- **Stato esplicito:** un `status()` derivato (`idle | loading | playing | paused | held | error`) letto da UI, Media Session e salvataggi; rimozione o uso reale delle due funzioni morte; test con un finto elemento audio (macchina a stati in Node). Intervento proporzionato: non serve riscrivere il motore.
- **Player espanso:** `<dialog>` modale (focus trap, `Esc`, Indietro, ripristino del focus) oppure `inert` sullo sfondo; su desktop `Spazio` play/pausa, `←/→` ±5 s, `↑/↓` volume, `M` muto; righe con `Enter`/`Spazio`; `aria-valuetext` per la barra («1:23 di 3:45»).
- **Volume:** slider solo dove `el.volume` è scrivibile (feature detection); su iOS resta il volume di sistema.
- **Timer di spegnimento:** sfumare `el.volume` quando possibile, oppure accettare il taglio su iOS e dichiararlo; mostrare il tempo residuo.
- **Indietro/History:** `pushState` per player e dettagli, con ripristino dello scroll.
- **Desktop:** da 900 px in su, player espanso a due colonne (copertina e comandi | testo o coda).

**Karaoke — fattibilità tecnica** (i tre casi che hai chiesto di distinguere)

1. **Testi semplici, senza tempi.** Schermo intero con scorrimento manuale, tipografia grande, nota «non sincronizzato». *Sconsiglio* un auto-scroll «a stima»: darà l’impressione di una sincronia che non c’è. Costo **S** (stesso componente).
2. **Testi sincronizzati a riga (LRC).** C’è già tutto il necessario: `parseLrc`, ricerca binaria della riga (`lineAt`), offset per brano, tocco per saltare. Manca la **modalità**: un `<dialog>` a tutto schermo con riga corrente grande e righe vicine attenuate, barra sottile, sfondo dai colori dominanti della copertina (`dominant`), comandi che si nascondono dopo 3 s, uscita con `Esc`, Indietro o trascinando giù. Sincronizzazione con `requestAnimationFrame` che legge `currentTime` (oggi `timeupdate` è a circa 4 Hz, con fino a 250 ms di ritardo visibile), transizione di 200–300 ms su `transform` e `opacity`, salto senza animazione con `prefers-reduced-motion`, `Wake Lock` per non spegnere lo schermo (feature detection; su PWA iOS **\[N\]**). Costo **M** (2–3 giorni) più test E2E.
3. **Evidenziazione parola per parola.** Richiede LRC «enhanced» o TTML. Il progetto LRCLIB documenta un nuovo formato con sincronizzazione a livello di parola, ma **non so** se l’istanza pubblica lo espone né con quale copertura **\[N\]**: va verificato con una chiamata reale prima di promettere la funzione. Musixmatch offre questi dati solo a pagamento. → P3, solo se disponibile.

**Servizi esterni per testi e timestamp, e licenze**

- **LRCLIB** (usato oggi): gratuito, nessuna chiave, `User-Agent` solo raccomandato (un browser non può impostarlo), progetto comunitario. **Non concede diritti** sui testi: per un uso personale e locale è il compromesso più ragionevole, ma conviene non ridistribuirli (per esempio in backup condivisi pubblicamente). Disponibilità variabile, più scarsa per musica italiana indipendente; l’esito negativo è già gestito con scadenza.
- **Musixmatch:** il piano gratuito restituisce circa il 30% del testo ed è non commerciale; testi completi e sincronizzati richiedono un piano commerciale (fonti secondarie: da confermare sul sito ufficiale prima di qualsiasi decisione).
- **Genius:** l’API ufficiale non fornisce i testi; ottenerli con lo scraping va evitato. Evitare anche chiavi «community» non ufficiali di altri servizi.
- **Se Sonance diventasse pubblica o commerciale** servirebbe una licenza (per esempio Musixmatch o LyricFind). *Non sono un avvocato: questa è una valutazione di rischio, non un parere legale.*

**D. Priorità.** **P1:** M-1, M-2, M-3. **P2:** M-4 … M-8, modalità karaoke con testi sincronizzati. **P3:** M-9, parola per parola.

**E. Valore dell’intervento.** M-1: l’app resta fluida con la libreria intera — **alto / M**. M-2: controllo da tastiera e da lettore di schermo — **alto / M**. M-3: gesto Indietro naturale su Android — **medio-alto / S–M**. Karaoke: effetto «wow» sobrio con riuso totale del parser — **medio-alto / M**. `status()` esplicito: meno regressioni future — **medio / S–M**.

## PARTE 3 — Miglioramenti trasversali

### 3.1 PWA, Service Worker e aggiornamenti

- **X-1 · P0 · Precache dalla cache HTTP \[V\].** `install` usa `cache.addAll(SHELL)`, che passa dalla cache HTTP del browser; GitHub Pages serve gli asset con `max-age=600`. Simulando un deploy v1 → v2 entro 10 minuti dall’ultimo caricamento, il nuovo SW ha scaricato dal server **solo `sw.js`**: la cache `sonance-bbbb2222` conteneva `main.js` v1 e, dopo «Aggiorna» e ricarica, girava ancora il codice v1 (controllo con `no-cache`: corretto). Scenario realistico: apri la nuova versione e rilasci un hotfix entro 10 minuti. L’effetto è persistente: la cache «avvelenata» resta finché non cambia di nuovo la versione del SW. *Correzione provata su copia:* precache con `fetch(new Request(url, { cache: 'reload' }))` e `cache.put` dentro `Promise.all` (resta atomico): dopo l’aggiornamento gira v2, con 42 richieste al server (41 file più `sw.js`). Va adeguato `pwa.test.mjs`, che oggi cerca `c.addAll(SHELL)`. Complessità **S**. *Limite:* ho verificato il comportamento del browser; la cache della CDN di GitHub non è verificabile qui **\[N\]**.
- **X-2 · P1 · Controllo aggiornamenti \[C\].** `reg.update()` parte solo al caricamento e ogni 6 ore: una PWA iOS resta viva per giorni. Aggiungere un controllo su `visibilitychange` (al massimo uno ogni 30 minuti).
- **X-3 · P2 · `sed` senza `g` come condizione di correttezza \[V\].** Nel workflow `sed -i "s/__BUILD__/…/"` sostituisce solo la prima occorrenza per riga: `const V = 'sonance-<hash>', DEV = V.endsWith('__BUILD__')` resta con `DEV` falso **solo perché** la seconda occorrenza non viene toccata. Con `g`, `DEV` diventerebbe vero in produzione e il SW non farebbe cache (conseguenza dedotta dal codice, non eseguita: \[C\]). Funziona, ma è fragile: un commento nel codice e un test sul `_site`.
- **X-4 · P2 · Manifest e icone \[C/V visuale\].** `any maskable` su un’unica icona 512 da 208 KB: separare `any` e `maskable` (con zona sicura) e ottimizzare; aggiungere `categories`, `screenshots`, `shortcuts`. **L’icona della Home** (nota 3D dorata su fondo nero) **non coincide con il logo in-app** (nota piatta terracotta con onda): scegliere un’unica identità.
- **X-5 · P2 · Immagini esterne opache \[N\].** Le copertine remote non salvate come blob finiscono nella cache `IMG` (massimo 300) come risposte *opache*; in Chrome una risposta opaca pesa nella quota molto più della sua dimensione reale (la documentazione Workbox parla di circa 7 MB ciascuna: non verificato qui), e la quota è condivisa con IndexedDB, dove vivono i file audio. Preferire sempre il blob (già fatto quando il CORS riesce) e non cacheare le restanti.
- **Offline \[V\].** Con il SW installato l’app si avvia senza rete e mostra la libreria; zero richieste al server. **Compatibilità con altri browser \[N\].**

### 3.2 Sicurezza e privacy

- **X-6 · P1 · Script di terze parti (JSONP) \[C\].** Deezer è raggiunto solo via JSONP e iTunes come ripiego: la CSP consente `script-src https://itunes.apple.com https://api.deezer.com`, cioè codice di terzi eseguito nell’origine dell’app, con accesso a IndexedDB e localStorage. Se uno dei due fosse compromesso, o riflettesse male il parametro `callback`, avrebbe accesso all’intera libreria. Mitigazione: far passare iTunes e Deezer dal Worker (JSON + cache) e togliere i due host dalla CSP; il Worker diventa anche il punto naturale per MusicBrainz con `User-Agent` corretto. Costo **M**; va dichiarato che il Worker vede le query; i limiti del piano Cloudflare vanno verificati **\[N\]**.
- **Privacy:** vedi L-3. **Worker:** vedi Y-1.
- **X-7 · P2 · Igiene del repository \[C\].** `.gitignore` non copre `worker/.dev.vars`, `.env*` e `.wrangler/` (file locali di wrangler con segreti e stato): aggiungerli. Nello ZIP non ci sono segreti né file temporanei **\[V\]**.
- **Nota:** nessun punto di iniezione HTML con dati utente **\[C\]**; backup validato **\[T\]**. Non è un penetration test.

### 3.3 Accessibilità

**X-8 · P1.** *Punti di forza:* `<dialog>` nativi per sheet e menu (focus ed `Esc` gestiti), `aria-live` per toast e stato, `prefers-reduced-motion` e `data-eco`, pulsanti principali ≥ 44 px, `lang="it"`. *Lacune:* zoom bloccato (`maximum-scale=1, user-scalable=no`, `touch-action: pan-x pan-y`) **\[V\]**; player non modale **\[V\]**; righe interattive senza tastiera **\[V/C\]**; contrasti (T-4) **\[V\]**; il pulsante «Annulla» del toast resta nel DOM e focalizzabile dopo la scomparsa (opacità 0, `visibility: visible`) **\[V\]**; `role=tablist` senza `tabpanel` nei controlli segmentati **\[C\]**; chip da 36 px e strumenti del testo da 34 px, sotto i 44 **\[C\]**; screen reader reali **\[N\]**. Intervento **S–M**, senza impatto visivo salvo i contrasti.

### 3.4 Prestazioni

- **Buone:** avvio e ricerca a 10.000 brani **\[V\]**; elenchi paginati e `content-visibility`; copertine ridimensionate (JPEG 640/256/400 px).
- **Da correggere:** coda (M-1) **\[V\]**; ricostruzione completa della lista a ogni aggiornamento soft, `softRemove` e `prunePlays` **\[C\]**; tutti i testi in memoria (38 MB di heap a 10.000 brani con la metà dei testi) **\[V\]**; icona 512 da 208 KB.
- **Memoria e listener:** i `bus.on` sono registrati una volta a livello di modulo e le viste con ciclo di vita usano `whileShown`/`disconnect` **\[C\]**; non ho misurato perdite su sessioni lunghe **\[N\]**.

### 3.5 Responsive design

- **X-9 · P2.** Smartphone: ottimo **\[V visuale\]**; safe area gestita (`env(safe-area-inset-*)` in 7 occorrenze) **\[C\]**. Tablet (820×1180) e desktop (1440×900): è il layout mobile allargato — campo di ricerca largo 1.400 px, azioni (♥, ⋯) a 1.200 px dal titolo, tab bar a tutta larghezza, scaffale «Aggiunti di recente» disallineato a sinistra **\[V visuale\]**; solo 3 media query di dimensione su 7 totali (max-width 390 e 360, max-height 640) e `vh` al posto di `dvh` per gli sheet **\[C\]**.
- **Proposta proporzionata:** contenitore centrato con `max-width` ≈ 960 px; da 900 px il player espanso a due colonne (M-8); da 1.100 px tab bar → barra laterale con le stesse 5 voci; azioni raggruppate vicino al testo. Nessuna riscrittura.
- **Orientamento orizzontale** su smartphone: esiste una media query `max-height: 640px` **\[C\]**, non verificata a schermo **\[N\]**.

### 3.6 Qualità del codice, test e CI

- **Architettura \[C\].** Moduli ES nativi senza bundler: scelta corretta per questa scala. Stato condiviso mutabile e `bus` con eventi poco granulari sono accettabili ma limitano i test; non servono riscritture.
- **Codice morto e residui \[V\].** `'disc'` in `main.js`, `js/sources` in `imports.test.mjs`, `src.p` (`ia/wc/ov/jm`) e `dlWarn/dlWake` in backup, libreria e testi, ramo `meta` di `importFiles` non raggiungibile dalla UI; export non usati dal runtime (`tabIndexAtX`, `pendingDeletes`, `clearOnlineCaches`, `uiShouldShowPlaying`, `resumePosition`); icone `speed` e `chev`. Alcuni residui servono alla compatibilità con backup ≤ v4: da documentare, non da rimuovere alla cieca.
- **Densità \[V\].** 3.984 righe, 119 oltre 200 caratteri, 24 oltre 300, 6 oltre 400 (massimo 551; `you.js` ne ha 11 oltre 300). Funzioni più lunghe: `settings()` (≈ 117 righe), `findLyrics` (≈ 80), UI YouTube (≈ 74). Proposta: formattare solo i file toccati dalle fasi, non un reformat globale.
- **Controlli statici \[V\].** `tsc --checkJs` e uno script `acorn`: nessun identificatore non definito e nessun errore reale (le segnalazioni residue sono rumore di inferenza). Non c’è linter né formattatore in CI: valutare un `eslint` minimale (solo `no-undef` e `no-unused-vars`) come devDependency, a basso costo di manutenzione.
- **Test \[V/T/C\].** 116 su 116; 31,9 s per `sleep()` reali (rendere iniettabili le pause); diversi test controllano il *testo* del sorgente con regex **\[C\]** e due gruppi testano codice non usato **\[V\]**; assenti test su `player.js`, `audio.js`, `store.js`, SW a runtime e UI; `library.js` è testato con un IndexedDB finto. **I miei script Playwright sono una base riutilizzabile** per una piccola suite E2E (richiede `playwright` come devDependency e un browser in CI: da valutare).
- **CI/CD \[C\].** Il workflow esegue `check` e `test` prima del deploy ed è corretto; non pubblica `worker/` (deploy separato, documentato); non verifica il `_site` generato.

### 3.7 Iconografia (revisione di tutte le icone)

- **Stile \[C\].** Set unico in `util.js` (24 px, tratto 2, estremità arrotondate), coerente come linguaggio; i problemi sono di *semantica*, *duplicati* e *spessore*.
- **Tab bar \[V visuale\].** Libreria (nota) e Album (disco) ok; **Artisti = utente +** (aggiungi persona); Playlist (lista con play) ok ma identica all’icona della Coda (`pl` = `queue`); **Tu = grafico a barre**.
- **Azioni nei menu \[C\].** `clock` per «Informazioni brano» (serve `info`); `lyr` per tre azioni diverse («Testo e copertina…», «Scegli il testo tra i candidati…», «Riprova la ricerca online»); `edit` per sei azioni, tra cui «Scegli copertina…» e «Scegli immagine…» (serve `image`); `upload` per «Importa testo da file…» (contraddice la convenzione dichiarata nel codice: freccia in su = esporta); `x` per azioni non distruttive («Usa la copertina dei brani», «Considera artista unico»); `check` per «Blocca il testo» (serve `lock`); `grip` è fatta di due linee e somiglia a un menu.
- **Dimensioni e spessore \[C\].** Usate da 16 a 64 px con tratto fisso: spessore apparente da 1,3 a 5,3 px.
- **Accessibilità \[C\].** SVG `aria-hidden` con `aria-label`/`title` sui pulsanti: corretto; target ≥ 44 px per i pulsanti principali.
- **Proposta.** Una mappa unica azione → icona (circa 25 voci), tratto compensato e le sostituzioni sopra; stesse regole per sotto-schede e tab bar.

### 3.8 UI/UX e identità visiva

- **Cosa funziona:** palette avorio + terracotta, tipografia Inter, logo con onda, card e sheet coerenti, stati vuoti con spiegazioni utili, feedback con Annulla, tono italiano chiaro.
- **Da curare, senza stravolgere:** icone (3.7); scheda YouTube (Y-6); plurali e toast (L-8); sotto-schede di «Tu» (T-3, T-8); icona della Home coerente col logo (X-4); raggruppamento dei temi (T-5).
- **Caricamento ed errori:** ben presenti per import e servizi esterni; l’errore globale è generico («Qualcosa non ha funzionato…») **\[C\]**: aggiungere un pulsante «Copia dettagli».
- **Transizioni:** brevi e coerenti (`--ease`), con rispetto di `prefers-reduced-motion` **\[C\]**.
- **Cosa non fare:** niente decorazioni, particelle o visualizzatori obbligatori; ogni modifica deve avere un motivo misurabile (leggibilità, tempo, errori evitati).

## PARTE 4 — Nuove idee

Selezionate per valore reale, non per numero. Per ciascuna: descrizione, beneficio, complessità, servizi esterni, costi e limiti, compatibilità con l’identità. Nessuna richiede un cambio di linguaggio visivo.

### 4.1 Ricerca intelligente

- **Cos’è:** ricerca a token in qualunque ordine, ranking (titolo > artista > album), tolleranza di un refuso, operatori `artista:`, `album:`, `anno:`, risultati raggruppati (Brani / Album / Artisti) nella stessa barra.
- **Beneficio:** alto — oggi «lazza cenere» non trova nulla **\[V\]**. **Complessità:** S–M.
- **Servizi esterni:** nessuno. **Costi e limiti:** nessuno; un indice normalizzato per brano occupa poca memoria (da misurare).
- **Identità:** piena: stessa barra, nessun elemento nuovo.

### 4.2 «Da sistemare»: centro dei metadati con proposte affidabili

- **Cos’è:** un filtro smart e una schermata che elencano i brani incompleti (artista, album, anno, copertina, testo) e le **proposte** trovate: per ognuna cosa cambierebbe, da dove viene, con quale confidenza. Azioni: Accetta, Rifiuta, Più tardi; accettazione in blocco solo per le proposte ad alta confidenza; sempre annullabile.
- **Beneficio:** alto — è il modo per ottenere dati affidabili senza duplicati né abbinamenti errati. **Complessità:** M–L.
- **Servizi esterni:** MusicBrainz e Cover Art Archive tramite il Worker (gratuiti; `User-Agent` obbligatorio, 1 richiesta/s, cache); Wikipedia facoltativa per le biografie.
- **Costi e limiti:** nessun costo diretto (i limiti del piano gratuito Cloudflare vanno confermati **\[N\]**); a 1 richiesta/s mille brani richiedono circa 17 minuti di coda in background; copertura variabile per musica indipendente e italiana.
- **Identità:** alta, se presentato come aiuto che chiede conferma e non come automatismo.

### 4.3 Modalità Testo/Karaoke immersiva

- **Cos’è:** vedi § 7: schermo intero, riga corrente grande, sincronizzazione fluida, sfondo dalla copertina, comandi che si nascondono. **Beneficio:** medio-alto. **Complessità:** M.
- **Servizi:** LRCLIB (già in uso), nessuna chiave, nessun costo; diritti sui testi **non** garantiti dal servizio (vedi § 7). **Identità:** alta: riusa la vista testi esistente.

### 4.4 Scheda artista ricca con discografia

- **Cos’è:** vedi § 3: Più ascoltati e Album dai dati locali (nessun servizio), biografia breve (Wikipedia, CC BY-SA con attribuzione) e discografia completa facoltativa (MusicBrainz). **Beneficio:** medio-alto. **Complessità:** M (parte locale), L (parte esterna).
- **Costi e limiti:** gratuiti; attribuzioni obbligatorie; cache lato Worker per rispettare 1 richiesta/s. **Identità:** alta.

### 4.5 Modalità desktop

- **Cos’è:** contenitore centrato, barra laterale da 1.100 px, player a due colonne, scorciatoie (`Spazio`, frecce, `M`), volume e righe con azioni vicine al testo. **Beneficio:** alto per chi usa il computer. **Complessità:** M. **Servizi:** nessuno. **Identità:** stessa palette e tipografia, solo disposizione diversa.

### 4.6 Salute della libreria

- **Cos’è:** pannello in Tu → Avanzate con file non riproducibili o mancanti, tag mancanti, copertine sotto i 300 px, duplicati, spazio per formato, esito dell’ultimo backup. **Beneficio:** fiducia e prevenzione. **Complessità:** S–M. **Servizi:** nessuno. **Identità:** alta (stesso stile delle impostazioni).

### 4.7 Il tuo anno in musica

- **Cos’è:** riepilogo stagionale (artisti, brani, minuti, giorno record) come schermata e immagine condivisibile con l’identità di Sonance. **Beneficio:** piacere d’uso, non necessità (P3). **Complessità:** M. **Servizi:** nessuno; **limite:** dipende dalla cronologia completa (T-2). **Identità:** alta se sobrio.

### 4.8 Idea valutata e sconsigliata: visualizzatore audio reattivo

- Richiede un `AnalyserNode`, quindi il grafo Web Audio sempre attivo: contraddice la scelta di lasciare l’audio nativo (batteria, rischi di silenzio dopo interruzioni su iOS **\[N\]**) e non risolve un problema reale. Se mai, solo come opzione disattivata di default.

## PARTE 5 — Piano implementativo per fasi

Ogni fase è **rilasciabile e approvabile da sola**. Ordine: prima gli interventi strutturali e funzionali (fasi 0–3), poi accessibilità e UX/UI (4–6), infine nuove funzioni e rifiniture (7–8). Lavoro sempre su una copia, con **test che falliscono prima della correzione e passano dopo**. Stima complessiva: circa 35–50 giorni di lavoro, con incertezza ±40% (per uno sviluppatore che conosce il codice).

### Fase 0 — Rete di sicurezza (1–2 giorni)

- **File:** `tests/e2e/` (nuovo), `package.json`, workflow; fixture audio generate con ffmpeg.
- **Modifiche:** promuovere i miei script di prova a test E2E; scrivere test «rossi» per ogni difetto confermato (cache SW, ripristino ×2, quota `pend`, album spezzati, disco, ordine delle parole, interruttore privacy, race YouTube, parser con il punto, coda grande, timer senza sfumatura); backup di riferimento; tag di rilascio.
- **Dipende da:** nulla. **Rischi:** una devDependency (Playwright) e tempi di CI: suite E2E separata e non bloccante all’inizio.
- **Completamento:** i test E2E riproducono i difetti elencati; `npm test` resta verde.

### Fase 1 — Aggiornamenti e integrità dei dati (P0) (4–6 giorni)

- **1a Service Worker:** precache con `cache: 'reload'` (atomico), controllo aggiornamenti su `visibilitychange`, commento e test sul `sed`. **File:** `sw.js`, `main.js`, workflow, `tests/pwa.test.mjs`.
- **1b Backup e ripristino:** conferma con riepilogo, ripristino idempotente, `pend` in IndexedDB, `lastBackup` dopo il salvataggio, «Backup completo» con copertine manuali, versione v6 compatibile ≤ v5, snapshot prima del ripristino. **File:** `store.js` (nuovo store, versione DB 3 con migrazione), `library.js`, `backup.js`, `ui/you.js`, test backup.
- **1c Playlist:** da `pl`/`plc` a IndexedDB con id stabili. **File:** `store.js`, `library.js`, `ui/lists.js`, `backup.js`.
- **Rischi:** migrazione dei dati → copia di sicurezza fino a conferma e rollback automatico in caso di errore; upgrade del DB con altre schede aperte (già gestito da `onversionchange`).
- **Completamento:** ripristino ×2 = stessi conteggi; 3.000 brani con testi persistiti dopo il riavvio; deploy simulato v1 → v2 con `max-age=600` mostra v2.

### Fase 2 — Identità dei dati: tag, album, artisti (6–9 giorni)

- **2a Tag:** FLAC, OGG, WAV, ID3v1; `TPOS`, `TYER/TDRC`, `TCON`, `TCMP`, `USLT`; MP4 `disk`, `©day`, `©gen`, `cpil`. **File:** `tags.js`, `library.js`, `backup.js`.
- **2b Album:** `albumId` canonico unico, disco, compilation, alias «Unisci/Separa», unificazione della chiave copertine. **File:** `library.js`, `covers.js`, `ui/lists.js`, `stats.js`, `backup.js`.
- **2c Artisti:** eccezioni estendibili e verifica online anche per i nomi con separatore (con conferma). **File:** `artists.js`, `library.js`, `ui/lists.js`.
- **2d Abbinamenti e privacy:** soglie più prudenti, provenienza `msrc`, interruttore rispettato in riproduzione, conferma per «Cerca di nuovo», Annulla per le modifiche massive. **File:** `match.js`, `online.js`, `player.js`, `ui/select.js`, `ui/you.js`.
- **Dipende da:** fase 0. **Rischi:** il cambio delle chiavi album/copertine può lasciare copertine orfane → mappa vecchia→nuova chiave e test di migrazione su una libreria di prova; si rielaborano solo i metadati, mai i file audio.
- **Completamento:** le fixture danno 1 album «Sinfonia» da 3 tracce, 1 album «Artisti vari» da 3, «Doppio» in ordine D1T1 → D2T2; FLAC con tag letti; 0 richieste esterne con l’interruttore spento.

### Fase 3 — Player, coda, tastiera (4–6 giorni)

- **3a Coda:** virtualizzata o paginata, aggiornamento mirato, Play = vista corrente, rimozione di tutte le occorrenze. **File:** `ui/nowplaying.js`, `player.js`, `library.js`.
- **3b Stato:** `status()` esplicito, rimozione del codice morto, test con un finto elemento audio. **File:** `player.js`, `playstate.js`, test.
- **3c Player espanso:** modale (`dialog`/`inert`), `Esc`, `Spazio`, frecce, Indietro/History, volume con feature detection, timer con sfumatura dove possibile. **File:** `ui/nowplaying.js`, `main.js`, `audio.js`.
- **Rischi:** gesti touch del player e Media Session → verifica manuale su iPhone **\[N\]**.
- **Completamento:** coda da 5.000 brani con apertura < 200 ms e cambio brano < 100 ms (stessa misura, CPU 4×); il Tab resta nel player; `Esc` chiude.

### Fase 4 — Accessibilità e contrasti (2–3 giorni)

- **Modifiche:** zoom abilitato, token `--acc-text`, `onAccent` sull’accento predefinito, accento legato al tema, `--mut` più scuro, tastiera su righe e statistiche, `aria-valuetext`, toast non focalizzabile da nascosto, riordino alternativo, test automatico di contrasto su tutte le combinazioni. **File:** `index.html`, `css/app.css`, `color.js`, `ui/*`, test.
- **Rischi:** lievi variazioni cromatiche → confronto di screenshot prima/dopo.
- **Completamento:** tutte le coppie di testo ≥ 4,5:1 (UI ≥ 3:1) in ogni tema; navigazione completa da tastiera; zoom al 200% senza perdita di funzioni.

### Fase 5 — YouTube (3–4 giorni)

- **Worker:** cache, contatore giornaliero e rate limit, `videos.list` per la durata, filtro musica, messaggio con l’orario di riapertura. **Client:** token di richiesta, parser, validazione, UI compatta, «Cerca su YouTube» contestuale, sheet (i) con Termini e informativa. **File:** `worker/src/index.js`, `worker/wrangler.toml`, `js/beta/*`, README.
- **Rischi:** deploy separato del Worker → mantenere l’API retro-compatibile e coordinare le versioni.
- **Completamento:** la stessa ricerca due volte = 1 chiamata a YouTube; 3 ricerche rapide mostrano sempre l’ultima; link ai Termini e informativa presenti.

### Fase 6 — UX/UI e coerenza visiva (5–7 giorni)

- **Modifiche:** mappa icone unica e tratto compensato, sotto-schede di «Tu» con icona, dettagli album/artista/playlist (numeri traccia, sezioni, mosaico, «Aggiungi brani»), toast, plurali, layout desktop, icona Home e manifest, raggruppamento dei temi. **File:** `util.js`, `css/app.css`, `ui/lists.js`, `ui/you.js`, `manifest.webmanifest`, `icons/`.
- **Rischi:** regressioni visive → screenshot di riferimento mobile, tablet e desktop.
- **Completamento:** nessuna icona duplicata o ambigua; checklist visiva della Parte 6.

### Fase 7 — Nuove funzioni (8–12 giorni, ciascuna approvabile separatamente)

- «Da sistemare» con MusicBrainz/Cover Art Archive; ricerca intelligente; karaoke; scheda artista ricca; salute della libreria; anno in musica. **Dipende da:** fasi 1–3 (e da una tua decisione sul Worker). **Completamento:** i criteri indicati nella Parte 4 per ciascuna.

### Fase 8 — Consolidamento e rilascio (2 giorni)

- Pulizia dei residui (con compatibilità backup), `eslint` minimale, README e CHANGELOG aggiornati (limiti noti, `hold()`, privacy), suite completa, **verifica su dispositivi reali** (iPhone, Android, desktop) con la checklist. **Completamento:** checklist della Parte 6 interamente spuntata.

## PARTE 6 — Traguardo finale: checklist di accettazione

Sonance si può considerare **completa, stabile e rifinita** quando tutte le voci seguenti sono vere e verificate (le voci su dispositivi reali le deve confermare chi ha l’hardware: nel mio ambiente restano **\[N\]**).

### Funzionalità

- ☐ Album: i tre casi di prova (featuring, maiuscole/minuscole, compilation) producono **un** album; il doppio album è ordinato per disco e traccia.
- ☐ Tag letti da MP3, M4A, FLAC, OGG e WAV (titolo, artista, album, traccia, disco, anno, genere, copertina).
- ☐ Ricerca: «artista titolo» e «titolo artista» danno gli stessi risultati.
- ☐ Playlist: gestione completa oltre 400 brani, «Aggiungi brani», Annulla su elimina, id stabili.
- ☐ Scheda artista con Album e Più ascoltati dai dati locali; nomi composti non spezzati.
- ☐ Backup: ripristino idempotente; 3.000 brani con testi persistiti dopo il riavvio; copertine manuali incluse nel «Backup completo».
- ☐ YouTube: cache e limite giornaliero attivi; durata nei risultati; link a Termini e informativa.
- ☐ Karaoke (se approvato): modalità a schermo intero per testi sincronizzati e semplici.

### Stabilità

- ☐ Aggiornamento v1 → v2 con `max-age=600`: dopo «Aggiorna» gira v2; l’audio in riproduzione non si interrompe.
- ☐ Nessun errore in console nei flussi E2E; nessuna perdita di dati dopo ricarica, offline o ripristino.
- ☐ Nessuna richiesta esterna con «Cerca copertine e testi su internet» spento.
- ☐ Race YouTube e coda con duplicati risolte; lo stato del player deriva da una sola fonte.

### UI/UX

- ☐ Icone: nessuna duplicata o ambigua; icone nelle sotto-schede di «Tu»; spessore del tratto uniforme.
- ☐ Dettagli di album, artista e playlist con la struttura prevista; plurali corretti; toast su una riga.
- ☐ Scheda YouTube compatta: primo risultato entro il 45% dell’altezza a 390×844.
- ☐ Identità coerente: icona della Home = logo; temi raggruppati.

### Responsive

- ☐ 360×640, 390×844, 820×1180 e 1440×900 senza overflow orizzontale né azioni lontane dal testo; player a due colonne da 900 px.
- ☐ Orizzontale su smartphone e safe area verificati su dispositivo reale.

### Performance

- ☐ 10.000 brani: avvio ≤ 1 s (≤ 2 s con CPU 4×); ricerca ≤ 30 ms (≤ 100 ms con CPU 4×).
- ☐ Coda da 5.000 brani: apertura ≤ 200 ms; cambio brano con pannello aperto ≤ 100 ms (CPU 4×).
- ☐ Nessuna ricostruzione completa della lista per aggiornamenti soft con la lista aperta (misurato).

### Accessibilità

- ☐ Contrasto ≥ 4,5:1 (testo) e ≥ 3:1 (componenti) in tutti i temi e accenti, verificato da un test automatico.
- ☐ Tutto operabile da tastiera; player modale; `Esc` e Indietro funzionanti; zoom abilitato fino al 200%.
- ☐ Riordino alternativo al trascinamento; toast non focalizzabile quando è nascosto.
- ☐ Prova con VoiceOver e TalkBack su dispositivo.

### PWA

- ☐ Installazione e avvio offline su iPhone e Android reali; manifest con icone separate `any` e `maskable` e screenshot.
- ☐ Now Playing e riproduzione in background su iOS verificati, anche dopo una chiamata o Siri.

### Test automatici

- ☐ `npm test` verde in meno di 10 s (pause iniettabili); suite E2E con i difetti di questo audit come regressioni.
- ☐ Test su `player` (macchina a stati), `store` (IndexedDB reale) e Service Worker a runtime.

### Manutenibilità

- ☐ Nessun export non usato; residui del modulo «Scopri» rimossi o documentati; `eslint` minimale in CI.
- ☐ README aggiornato (limiti noti, `hold()`, privacy, quota YouTube) e CHANGELOG.

## Fonti consultate (20 novembre 2026)

- YouTube Data API — costi di quota: https://developers.google.com/youtube/data/determine\_quota\_cost
- YouTube — quota e audit di conformità: https://developers.google.com/youtube/v3/guides/quota\_and\_compliance\_audits
- YouTube API Services — Developer Policies: https://developers.google.com/youtube/terms/developer-policies (guida: https://developers.google.com/youtube/terms/developer-policies-guide)
- LRCLIB (progetto e formato dei testi): https://github.com/tranxuanthang/lrclib
- MusicBrainz — limiti di richieste: https://musicbrainz.org/doc/MusicBrainz\_API/Rate\_Limiting · API: https://musicbrainz.org/doc/MusicBrainz\_API
- Apple — iTunes Search API: https://performance-partners.apple.com/search-api
- Last.fm — Termini dell’API: https://www.last.fm/api/tos
- **Fonti secondarie (da confermare prima di decidere):** Deezer (libreria pleezer su docs.rs), Musixmatch (freeapihub.com/apis/musixmatch), Genius (documentazione di lyricsgenius), TheAudioDB (publicapis.dev).
- **Non verificati oggi \[N\]:** condizioni correnti di Spotify e Discogs; peso in quota delle risposte opache nella Cache Storage (Workbox); limiti del piano gratuito Cloudflare Workers; formato di testi a livello di parola nell’istanza pubblica di LRCLIB.

## Dove mi fermo e cosa mi serve da te

Ho completato la **Fase 1 (sola analisi)**. Non ho modificato il progetto né prodotto uno ZIP. Per procedere mi servono queste decisioni:

1. **Piattaforma principale.** iPhone con PWA installata, oppure anche Android e desktop? (Decide l’importanza di M-3 e X-9 e quali verifiche **\[N\]** dovrai fare tu su dispositivo.)
2. **Worker e scheda YouTube.** L’URL del Worker resta pubblico e la beta serve anche ad altri, oppure è solo per te? (Decide quanto rigore su Y-1 e Y-7: rate limit, contatore, informativa.)
3. **Migrazioni dei dati.** Via libera a spostare playlist e metadati in attesa in IndexedDB, con copia di sicurezza e rollback (Fase 1c)? È il cambiamento più delicato.
4. **Metadati intelligenti.** Vuoi estendere il Worker per MusicBrainz e Cover Art Archive («Da sistemare»), accettando che il Worker veda titoli e artisti, oppure restare sulle sole fonti attuali?
5. **Identità e funzioni.** Allineare l’icona della Home al logo piatto e raggruppare i temi? Karaoke a schermo intero: sì, no o dopo le fasi 1–3?

**Ordine consigliato:** 0 → 1 → 2 → 3; poi 4 in parallelo con 5; poi 6; le nuove funzioni della Fase 7 solo dopo i P0 e i P1. Dimmi quali fasi approvi (anche una alla volta) e parto dalla prima: lavorerò su una copia, con test rossi prima e verdi dopo, e ti consegnerò ogni fase separatamente con riepilogo e verifiche.

## Aggiornamento del 20 novembre 2026 — decisioni ricevute e piano rivisto

Le tue cinque risposte cambiano il perimetro: **solo iPhone**. Dove indicato, questo aggiornamento sostituisce le priorità precedenti; tutto il resto resta valido. Nessun file del progetto è stato toccato: aspetto il tuo via libera esplicito per iniziare.

### Decisioni ricevute

1. **Piattaforma:** solo iPhone con PWA installata.
2. **Worker:** URL pubblico; la beta serve anche a un gruppo ristretto di persone.
3. **Migrazioni dei dati:** sì (playlist e metadati in attesa in IndexedDB, con copia di sicurezza e rollback).
4. **Metadati intelligenti:** sì, MusicBrainz e Cover Art Archive tramite il Worker; il Worker vedrà titolo, artista, album e durata dei brani da sistemare.
5. **Identità e funzioni:** sì all’icona della Home allineata al logo piatto, ai temi raggruppati e al karaoke a schermo intero (lo colloco in Fase 7, dopo le fasi 1–3, salvo tua diversa indicazione).

### Fatti verificati oggi sulla documentazione (non sul tuo iPhone **\[N\]**)

- **Storage su iOS.** Per una PWA installata il limite per origine è circa il 60% del disco (iOS 17 e successivi); il tetto dei 7 giorni di Safari non vale per le PWA installate; lo storage è un contenitore separato da Safari (per questo i brani vanno importati nella PWA installata). Conseguenza: IndexedDB non è un problema, **`localStorage` sì** (circa 5–10 MiB a seconda del browser; su iOS non l’ho misurato): conferma le priorità di T-1, P-1 e P-2.
- **Wake Lock (karaoke).** Nelle PWA installate funziona solo da **iOS 18.4** (fino ad allora falliva in modalità Home Screen; bug WebKit poi risolto). Sotto iOS 18.4 il karaoke non può tenere lo schermo acceso: avviso discreto, nessun trucco.
- **Cloudflare, piano gratuito.** 100.000 richieste al giorno, 10 ms di CPU per invocazione, 50 subrequest per invocazione; Workers KV con 1.000 scritture al giorno e coerenza eventuale; **Durable Objects disponibili anche nel piano gratuito** (SQLite, 100.000 richieste al giorno). Conseguenza: contatori di quota e coda a 1 richiesta/s in un Durable Object, risposte in Cache API, KV solo per dati che cambiano di rado.
- **Immagini opache (X-5):** con quote al 60% del disco il rischio è trascurabile su iPhone → scende a P3.

### Cosa cambia nelle priorità

- **Fuori perimetro (P3, non pianificato):** layout tablet e desktop (X-9, M-8, § 4.5), scorciatoie da tastiera e slider del volume (iOS ignora il volume dell’elemento audio: M-7), accorgimenti Android. Le voci della checklist su 820×1180, 1440×900, due colonne e scorciatoie sono **sospese**.
- **Più importanti:** T-1, P-1, P-2 (storage); M-1 (coda sui modelli meno recenti); M-2 nella parte VoiceOver (player modale con `inert`, ordine del focus, `aria-valuetext`; la tastiera hardware scende a P3); T-4 (chi usa iOS in modo scuro vede bianco su arancio); X-2 (controllo aggiornamenti al ritorno in primo piano: su iOS la PWA resta viva per giorni); identità visiva (X-4, T-3, T-5).
- **Da verificare sul telefono prima di decidere:** M-3 (Indietro). Su iPhone non c’è il tasto; se il gesto dal bordo sinistro nelle PWA installate naviga la cronologia, la gestione di History per player e dettagli resta P2, altrimenti scende a P3 **\[N\]**.
- **Y-7 sale a P1.** Con altre persone in beta servono il link ai Termini di YouTube e un’informativa che citi YouTube API Services e la Google Privacy Policy.
- **Y-1 diventa più rigoroso.** Con un Worker pubblico per un gruppo ristretto il solo controllo di `Origin` non basta: **codice invito** firmato (HMAC) con quota per persona (per esempio 20 ricerche al giorno) e tetto globale (80 al giorno) tenuti in un Durable Object, più cache delle risposte. Alternativa più pesante: Cloudflare Access.
- **X-6 e MusicBrainz insieme («Worker v2»).** Un solo lavoro: proxy per iTunes, Deezer, MusicBrainz e Cover Art Archive con risposte JSON in cache, `User-Agent` corretto, coda a 1 richiesta/s e CSP senza script di terzi. Il Worker dovrà non registrare il contenuto delle richieste (solo la cache) e questo va dichiarato in una riga sotto l’interruttore. L-3 diventa un interruttore **per servizio**.

### Piano rivisto per fase (stima ≈ 33–46 giorni, ±40%)

- **Fase 0 (1–2 g):** come prima, più il protocollo di prova su iPhone qui sotto.
- **Fase 1 (4–6 g):** invariata; la migrazione 1c è approvata (copia di sicurezza e rollback).
- **Fase 2 (6–9 g):** invariata.
- **Fase 3 (3–5 g):** senza scorciatoie, volume e desktop; con player modale per VoiceOver; History solo dopo la prova su iPhone.
- **Fase 4 (2–3 g):** invariata, con prova VoiceOver.
- **Fase 5 «Worker v2 e YouTube» (6–8 g):** cache, Durable Object (quota e coda), codice invito, proxy dei servizi, endpoint MusicBrainz e Cover Art Archive, CSP, scheda YouTube compatta, conformità (Y-7).
- **Fase 6 (4–5 g):** UX/UI solo mobile: icone, «Tu», dettagli album/artista/playlist, toast, plurali, icona della Home, temi raggruppati.
- **Fase 7 (8–12 g):** «Da sistemare» (poggia sulla Fase 5), ricerca intelligente, karaoke (Wake Lock da iOS 18.4), scheda artista ricca, salute della libreria, anno in musica.
- **Fase 8 (2 g):** consolidamento e verifica finale su iPhone.

### Protocollo di prova su iPhone (da eseguire alla fine di ogni fase)

Serve perché nel mio ambiente restano **\[N\]** tutti i comportamenti di iOS. Ogni passo ha esito sì/no; ti lascerò una scheda da compilare.

1. **Installazione pulita:** elimina la PWA, reinstallala da Safari, importa 20 brani (MP3, M4A, FLAC, WAV).
2. **Schermo bloccato:** avvia un brano e blocca per 2 minuti: la musica continua; titolo, copertina e tempo compaiono sulla schermata di blocco; play, pausa e avanti funzionano.
3. **Pausa «tenuta»:** pausa, attendi 30 s, riprendi dalla schermata di blocco: stessa posizione; osserva come appare Now Playing in pausa.
4. **Interruzioni:** chiamata o Siri durante l’ascolto; al termine Play riprende senza silenzio, anche con dissolvenza o EQ attivi (caso Web Audio).
5. **Cuffie e auto:** scollega e ricollega il Bluetooth; comandi di AirPods o dell’auto.
6. **Aggiornamento in riproduzione:** dopo un deploy, «Aggiorna» non interrompe l’audio e gira il codice nuovo (versione visibile in Impostazioni).
7. **Offline:** modalità aereo, chiudi e riapri: libreria visibile e riproducibile.
8. **Backup:** salva il backup in File, reinstalla, reimporta i brani e ripristina: preferiti, ascolti e playlist tornano, senza raddoppi.
9. **Schermo:** Dynamic Island, barra Home, rotazione orizzontale in player e testi.
10. **VoiceOver e Zoom:** il focus resta nel player aperto; righe dei testi e della coda utilizzabili.
11. **Gesto dal bordo sinistro** con player o dettaglio aperti: che cosa succede (decide M-3).
12. **Karaoke:** con i testi aperti lo schermo resta acceso per 2 minuti (iOS 18.4 o successivo).
13. **Spazio:** dopo 500 brani, spazio occupato e stato dello storage persistente in Impostazioni.

### Fonti aggiunte

- Quote di storage del browser (WebKit): https://developer.mozilla.org/docs/Web/API/Storage\_API/Storage\_quotas\_and\_eviction\_criteria · https://web.dev/articles/storage-for-the-web
- Screen Wake Lock su iOS: https://caniuse.com/wake-lock · bug WebKit 254545 e 303885 su bugs.webkit.org (il fix per le PWA installate è in iOS 18.4)
- Cloudflare Workers, limiti del piano gratuito: https://developers.cloudflare.com/workers/platform/limits/ · Workers KV: https://developers.cloudflare.com/kv/platform/limits · piani e prezzi della Developer Platform sul sito Cloudflare

### Prossimo passo

**Per iniziare mi serve il tuo via libera esplicito** (anche solo «via» alle Fasi 0–1): lavorerò su una copia, con test rossi prima e verdi dopo, e ti consegnerò il pacchetto (ZIP, relazione e test) separato dalle altre fasi. Quando arriveremo al karaoke mi servirà sapere la versione di iOS del tuo iPhone.
