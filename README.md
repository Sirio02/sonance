# Sonance

Music player personale in formato PWA, senza build: si pubblica così com'è su GitHub Pages.

## Installazione su iPhone
Apri l'indirizzo pubblicato in Safari → Condividi → Aggiungi alla schermata Home. Importa i file audio dall'app installata: Safari e la PWA hanno archivi locali separati.

## Funzioni
- **Navigazione** tra Libreria / Album / Artisti / Playlist / Tu anche con swipe orizzontale sulla vista principale; le mensole orizzontali mantengono priorità e i dettagli restano esclusi.
- **Libreria** con ordinamenti (titolo, artista, recenti, più ascoltati…), ricerca, riproduzione casuale; elenchi a pagine che restano fluidi con migliaia di brani.
- **Tag** ID3 (2.2/2.3/2.4) e MP4/M4A, **copertina incorporata** inclusa; brani dello stesso album condividono la copertina.
- **Album, artisti, playlist** con schermata di dettaglio uniforme; playlist riordinabili col trascinamento e playlist automatiche (Preferiti, Recenti, Più ascoltati, Ascoltati di recente).
- **Audio**: dissolvenza 0–12 s (potenza costante), riproduzione senza pause (il brano successivo è già pronto), equalizzatore a 6 bande con 16 preset, preset personali, livello compensato automaticamente per evitare distorsioni.
- **Player**: colore dallo sfondo della copertina, animazione distinta per aggiunta/rimozione dei preferiti (solo sul controllo toccato), gesti (trascina per chiudere, scorri la copertina per cambiare brano), testi sincronizzati, timer di spegnimento con sfumatura, «Poi:» il brano successivo.
- **Coda** riordinabile con trascinamento, mescola/svuota i prossimi, salva come playlist.
- **Statistiche e cronologia**: ascolti, tempo, giorni di fila, grafico giornaliero, top brani/artisti/album. Un ascolto vale dopo 30 s (o metà brano).
- **Selezione multipla**: pressione lunga su un brano (o «Seleziona») → riproduci dopo, in coda, playlist, preferiti, imposta artista/album in blocco, rimuovi/elimina.
- **Duplicati**: stesso file o stesso titolo+artista con durata simile; si sceglie la copia da tenere e preferiti, ascolti e playlist passano a quella.
- **Playlist M3U**: esporta una playlist (o tutte) e importa file `.m3u`/`.m3u8`, abbinando per nome file o artista+titolo; i brani mancanti vengono elencati.
- **Ripresa dell'ultimo ascolto**: all'avvio il mini-player mostra l'ultimo brano in pausa alla posizione salvata; in cima alla Libreria restano le mensole «Ascoltati» e «Aggiunti di recente».
- **Backup** JSON (v6) di metadati, playlist, preferiti, cronologia, preferenze (non i file audio; con «Includi le copertine scelte a mano» anche le immagini scelte da te). Il ripristino mostra un riepilogo e chiede conferma, **unisce** i dati senza cancellare nulla, si può ripetere senza duplicare la cronologia e si può **annullare per 24 ore**.

## Ricerca online (copertine, immagini artista, testi)
Fornitori in sequenza: iTunes → Deezer per copertine e recupero automatico dell'album quando manca nei tag; Deezer → Wikipedia (solo se il nome coincide e la pagina parla di musica) per gli artisti; LRCLIB per i testi. La ricerca gestisce anche nomi artista multipli o separati in modo incompleto nel nome file, verificando titolo, artista e durata prima di associare un risultato.
Ogni fornitore ha un limite di richieste e va in pausa se risponde 403/429. Un «non trovato» viene ricordato 14 giorni (7 per gli artisti), un errore di rete **no**.
In *Tu → Impostazioni → Avanzate → Assistenza* c'è «Verifica connessione ai servizi»: dice quale servizio risponde e con quale metodo (fetch o JSONP).

## Artisti multipli e featuring
Un brano con più artisti resta **una sola traccia** ma compare sotto ciascun artista. Si divide solo con prove: separatori espliciti (`feat.`, `ft.`, `&`, `+`, virgola, `;`, `x`, `con`, `vs`), valori multipli nei tag ID3, `feat.` nel titolo, crediti dei servizi online oppure verifica che le singole parti siano artisti affermati mentre l'intero non lo è. Nomi composti (Pinguini Tattici Nucleari, The Weeknd, Simon & Garfunkel…) restano uniti. Dal menu ⋯ → «Artisti del brano…» si può forzare «artista unico» o modificare l'elenco.

## Ricerca testi
Strategia progressiva (originali → normalizzati → artista principale → ricerca libera → solo titolo) con punteggio su titolo, artista e durata: un testo non viene associato solo perché il titolo coincide. Gli esiti negativi valgono per la versione della strategia (`nlv`): un miglioramento li rende subito riprovabili. `LYR_V` (in `library.js`, oggi 8) va incrementata ogni volta che la strategia cambia, così i brani senza testo vengono riprovati. La velocità variabile è stata rimossa: i due elementi audio vengono inizializzati sempre a 1× e le vecchie preferenze `rate` vengono scartate.
- **Cover** (`(Cover)`, `[Tribute]`, `- Karaoke`, `cover by …`; più deboli `(Live)`, `(Acoustic)`, `(Remix)`): il marcatore viene tolto dal titolo e si cerca il testo della **canzone originale**. L'artista del file non è un vincolo; lo sono il titolo identico e la durata (±15 s; ±5 s per titoli di una sola parola). Con un marcatore forte, il nome nel marcatore (es. `(Lazza Cover)`, `(Cover di Lazza)`, `cover by Lazza`) è usato come indizio solo se coerente con gli artisti del file; Deezer può confermare l'artista originale con titolo identico e durata vicina. Se titolo e artista originale sono entrambi confermati, la tolleranza massima sale a 120 s; senza conferma resta ±15 s (±5 s per titoli di una sola parola). Oltre ±15 s viene preferito il testo semplice (`plainLyrics`): un LRC sincronizzato sull'originale potrebbe andare fuori tempo rispetto alla cover. Anche senza marcatore, dopo i tentativi normali, il passo riservato «originale» può cercare un candidato univoco per titolo+durata; i casi ambigui vengono rifiutati. Titoli generici («Intro», «Track 1») e candidati ambigui vengono rifiutati.
- **Refusi nel titolo** («Cerco» per «Cervo»): accettati solo se confermati da artista e/o durata; Deezer può proporre il titolo corretto solo con artista e durata coerenti. Mai su numeri o parole corte.
- **Originale con artisti diversi** (es. «Lazza, Emma – La fine» → «Nesli – La fine», senza marcatore): se nessun originale ha durata vicina, `rankOriginals` (`match.js`) classifica tutte le versioni Deezer con titolo identico (esclusi live/remix/karaoke e l'artista del file) per durata, popolarità (`rank`) e unicità. Serve un candidato dominante: più originali alla pari → nessun testo. Titoli generici o di una sola parola sono rifiutati; oltre 45 s di scarto nulla. Il testo **sincronizzato** si usa solo con differenza di durata ≤ 6 s (`SYNC_MAX`), altrimenti si usa il testo **semplice**. Per i file con più artisti questo passo viene subito dopo il primo tentativo, prima dei tentativi costosi.
- **Etichetta e scelta manuale**: il player indica «Testo sincronizzato», «Testo non sincronizzato» o «Testo della versione originale (Artista)». Da ⋯ → *Testo e copertina…* si può riprovare la ricerca, scegliere fra i candidati LRCLIB e **bloccare** il testo (`ll`): l'arricchimento automatico non lo sovrascrive più.
- Budget LRCLIB invariato (8, 12 se forzato): gli ultimi 2 invii sono riservati ai passi «originale» e «refuso». Il passo «originale» può comportare una ricerca Deezer aggiuntiva quando viene raggiunto.

## Interfaccia e animazioni
Il cuore si anima solo in risposta al tap sul cuore stesso: ri-render, ripristino, cambio brano e aggiornamenti esterni aggiornano lo stato senza animazione. Aggiunta e rimozione hanno transizioni diverse; risparmio energia e movimento ridotto le disattivano. All'avvio a freddo compare per circa 700 ms il marchio; non ritarda il caricamento e non viene riproposto al ritorno da bfcache.

## Dynamic Island / Now Playing su iOS
La PWA dichiara `id`, `start_url` e `scope` coerenti (`./`), `display: standalone` e icone `any`/`maskable`. Sonance imposta `navigator.audioSession.type = playback`, aggiorna `MediaMetadata`, `playbackState` e posizione, e usa l'artwork della cover (con icona locale di ripiego). In pausa può mantenere attivo un secondo elemento audio silenzioso (`hold()`): serve a conservare la sessione in background, ma potrebbe influire sull'associazione Now Playing di iOS. Il comportamento della Dynamic Island è deciso dal sistema e non è verificabile né correggibile con certezza dal codice web.

## Riproduzione e aggiornamenti
- Il ripristino dell'ultima sessione parte solo a freddo: se hai già avviato un brano, non sovrascrive nulla.
- «Aggiorna» con la musica in riproduzione **non interrompe l'audio**: l'aggiornamento si applica alla prima pausa; dopo il ricaricamento la sessione torna in pausa alla posizione esatta. Alla prima installazione del service worker la pagina non si ricarica.
- Il precache è atomico e «fresco»: ogni file è richiesto con `cache: 'reload'` (salta la cache HTTP del browser: GitHub Pages usa `max-age=600` e, senza, un deploy ravvicinato installava file vecchi sotto un nome di versione nuovo); se un file manca l'installazione fallisce, la cache parziale viene eliminata e resta la versione precedente. Il controllo aggiornamenti parte al caricamento, ogni 6 ore e al ritorno in primo piano (al massimo ogni 30 minuti).

## Dati e migrazione
Playlist, copertine delle playlist e metadati in attesa del file audio vivevano in localStorage (circa 5 MB, condivisi con coda e impostazioni): con una libreria grande il salvataggio poteva fallire in silenzio. Ora stanno in IndexedDB. Al primo avvio la migrazione è **atomica e verificata**: si copia tutto in una sola transazione, si rilegge e si confronta; solo se coincide si libera localStorage (resta per 30 giorni una copia delle sole playlist in `sonance.migbak.v1`). Se qualcosa non torna non si cancella nulla e l'app continua come prima, riprovando all'avvio successivo. Le playlist hanno un identificatore stabile (sopravvive alla rinomina) che i backup v6 riportano; i nomi come «constructor» sono nomi qualunque.

## Annulla
Eliminare brani (singoli o selezione) è **differito**: spariscono subito, ma file, preferiti, ascolti e playlist restano finché il toast «Annulla» scade (6 s) o l'app si chiude. Annullabili anche la rimozione da playlist e «Svuota i prossimi». La coda non viene toccata prima della conferma.

## Impostazioni
Organizzate in cinque gruppi, nell'ordine in cui servono: **Riproduzione** (dissolvenza, equalizzatore) · **Libreria** (copertine e testi da internet, «pronta a ripartire dopo una pausa», brani duplicati) · **Aspetto** (temi, anche Grafite, Viola notte e Carta; colore principale o a scelta con testo sempre leggibile; spazio tra le righe; forma delle copertine; sfondo del player dalla copertina; dimensione/posizione/sfumatura del testo; animazioni Complete/Ridotte/Minime, dove «Minime» è il Risparmio energia; scheda all'apertura; «Ripristina l'aspetto predefinito») · **Backup e dati** (spazio usato, protezione della memoria, data dell'ultimo backup con promemoria dopo 30 giorni, salva/ripristina backup, playlist .m3u; il backup **non** contiene i file audio) · **Avanzate** (funzioni in prova, Assistenza con test dei servizi e registro). Tutto è salvato nel backup.

**Suono di avvio e Dynamic Island.** Un suono all'apertura è stato provato e rimosso: iOS non consente di riprodurre audio da una pagina web senza un tocco dell'utente, quindi non può funzionare in modo affidabile. Il tocco sulla Dynamic Island / schermata di blocco apre l'app che possiede la sessione audio: lo decide iOS, una web app non può influenzarlo, e non c'è nel codice alcuna funzione dedicata.

### Funzioni beta
Interruttore unico `S.beta` (spento di default): a flag spento non viene caricato né eseguito alcun codice beta. Attivandolo compare la scheda **YouTube**. La ricerca in-app usa YouTube Data API v3 tramite un backend Cloudflare Worker; la chiave Google resta sul backend, non nella PWA. I risultati contengono metadati essenziali e link che aprono il video su YouTube. I link a video e playlist incollati vengono riconosciuti localmente. La cronologia (max 10) resta solo sul dispositivo e non entra nel backup.

**Download e importazione:** Sonance non estrae né scarica audio o video da YouTube. L'API ufficiale non concede diritti di download o playback offline. L'utente può importare dalla Libreria file audio ottenuti da fonti autorizzate (acquisti, proprie registrazioni o download espressamente concessi dal titolare). La ricerca YouTube e l'importazione di file autorizzati sono flussi separati.

**Configurazione backend (necessaria per la ricerca in-app):**
1. In Google Cloud crea un progetto, abilita *YouTube Data API v3* e genera una API key. Limita la chiave alla sola YouTube Data API v3.
2. Crea un account Cloudflare e installa Wrangler (`npm install -g wrangler`), quindi esegui `wrangler login`.
3. In `worker/wrangler.toml` sostituisci `https://utente.github.io` con l'origine esatta del sito GitHub Pages. Da `worker/` esegui `wrangler secret put YOUTUBE_API_KEY` e incolla la chiave; poi `wrangler deploy`.
4. Copia l'URL `https://sonance-youtube-api.<account>.workers.dev` restituito dal deploy in `YOUTUBE_API_BASE` in `js/beta/youtube-config.js` (senza percorso finale), quindi pubblica nuovamente Sonance su GitHub Pages.
5. Nel pannello Cloudflare configura una regola di rate limiting sull'endpoint `/api/youtube/search` per limitare l'uso abusivo. CORS limita i siti che possono leggere le risposte, ma non sostituisce il rate limiting.

La quota predefinita documentata per `search.list` è 100 richieste al giorno per progetto; anche le pagine successive consumano quota. Sonance non interroga l'API mentre si digita: la ricerca parte solo con «Cerca»/Invio e restituisce 10 risultati per richiesta. Il backend non conserva la risposta (cache `no-store`). Un errore nel modulo beta non rompe l'app. Per aggiungere una funzione: una riga in `FEATURES` (`js/beta.js`), un modulo in `js/beta/` e il file in `SHELL` di `sw.js`.

### Logo
`js/logo.js` (SVG inline, colori da `--fg`/`--acc`): nota con scia d'onda e scritta a larghezza fissa. Usato nell'intestazione della Libreria (con `<h1>` nascosto ma presente) e nello splash (`index.html`, copia statica). Le icone PNG non sono state rigenerate.

## Struttura
```
index.html            guscio + Content-Security-Policy
css/app.css           stile (temi, schede, animazioni)
js/main.js            avvio, schede, aggiornamenti
js/store.js           impostazioni e coda (localStorage) + IndexedDB (brani, audio, ascolti, playlist, metadati in attesa)
js/library.js         brani, import, playlist, backup, coda di arricchimento
js/online.js          iTunes / Deezer / Wikipedia / LRCLIB
js/covers.js          copertine (miniature + grandi), immagini artista
js/audio.js           motore: due <audio>, Web Audio, dissolvenza, sessione in pausa
js/player.js          coda, passaggi tra brani, ascolti, timer, Media Session
js/backup.js          validazione/normalizzazione dei backup (v6; importa anche v ≤ 5)
js/playstate.js       decisioni pure sul ciclo di vita della riproduzione (ripristino, aggiornamento app)
js/color.js  logo.js   contrasto colori · logo SVG
js/beta.js            registro delle funzioni beta; js/beta/yt-tab.js, youtube.js (parser) e youtube-config.js
js/tags.js  lrc.js  match.js  stats.js  m3u.js  dup.js  artists.js  seekbar.js  gesture.js     logica pura (testata)
js/ui/                kit (sheet, drag), lists, select, dups, m3uui, nowplaying, you, prefs (aspetto/avvio), lyricsui (testo, informazioni)
sw.js                 cache dell'app (versione = commit, la imposta il workflow)
tests/                node --test tests/*.test.mjs
```

## Sviluppo
`npm run check` (sintassi) · `npm test` (138 test + 4 `todo` sui difetti noti: logica pura, flussi con rete simulata, archivio e ripristino con IndexedDB finto, struttura PWA/SHELL, grafo dei moduli) · `npm run test:e2e` (12 test in un browser reale — aggiornamento PWA, backup e ripristino, migrazione dell'archivio, playlist — più 11 `todo` sui difetti dell'audit; richiede `npm i -D playwright`, `npx playwright install chromium` e ffmpeg; con `SONANCE_APP=/percorso` si prova un'altra copia dell'app) · per provare in locale: `python3 -m http.server` (in locale il service worker usa la rete, non la cache).
Il workflow esegue controlli e test, poi pubblica e scrive l'hash del commit nel nome della cache: ogni deploy mostra «Nuova versione disponibile · Aggiorna».

## Note
- I file audio restano nel database locale del browser.
- Il ripiego JSONP per iTunes/Deezer carica uno script da quei domini (consentiti nella CSP): è l'unico modo se il browser blocca la risposta via fetch.

- I widget della schermata Home di iOS richiedono un'app nativa (WidgetKit): una PWA non può crearli.


