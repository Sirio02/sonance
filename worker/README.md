# Sonance YouTube API Worker

Backend gestito per la sola ricerca ufficiale YouTube Data API v3. Non scarica, converte o memorizza audio/video.

## Setup

1. In Google Cloud crea un progetto, abilita **YouTube Data API v3** e crea una API key. Restringi la chiave all'API YouTube Data API v3.
2. Installa Wrangler e autentica Cloudflare:

   ```sh
   npm install -g wrangler
   wrangler login
   ```

3. Modifica `wrangler.toml`: `ALLOWED_ORIGINS` deve contenere l'origine precisa di GitHub Pages, ad esempio `https://mio-account.github.io` (senza `/repository/`). In sviluppo puoi lasciare `http://localhost:8000`.
4. Dalla cartella `worker/` imposta la chiave come secret e pubblica:

   ```sh
   wrangler secret put YOUTUBE_API_KEY
   wrangler deploy
   ```

5. Copia l'URL `workers.dev` assegnato da Cloudflare in `js/beta/youtube-config.js`:

   ```js
   export const YOUTUBE_API_BASE = 'https://sonance-youtube-api.ACCOUNT.workers.dev';
   ```

6. Pubblica di nuovo la PWA su GitHub Pages.

## Endpoint

`GET /api/youtube/search?q=<query>&pageToken=<opzionale>`

- 10 risultati per chiamata, solo video pubblici.
- Regione `IT`, lingua di rilevanza `it`.
- La risposta contiene ID, titolo, descrizione breve, canale, data e miniatura `i.ytimg.com`.
- Nessuna cache applicativa (`Cache-Control: no-store`).
- `YOUTUBE_API_KEY` resta nel secret Cloudflare e non viene inviato al browser.
- `ALLOWED_ORIGINS` controlla l'origine CORS. CORS non è autenticazione: se il servizio diventa pubblico, aggiungere una regola di rate limiting Cloudflare o configurare il binding `RATE_LIMITER` supportato dal codice.

La quota standard di `search.list` è limitata (attualmente 100 richieste al giorno per progetto). Le pagine successive consumano altre richieste. Consultare sempre la console Google Cloud per quota e utilizzo effettivi.
