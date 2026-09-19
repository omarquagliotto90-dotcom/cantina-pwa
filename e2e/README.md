# Test end-to-end

13 test su Playwright. Coprono caricamento, Lista, "segna come bevuto" ed
eliminazione, inclusi i percorsi di rollback.

```bash
npm run test:e2e           # entrambi i progetti
npm run test:e2e:ios       # solo iPhone/WebKit — il target reale
npm run test:e2e:ui        # modalità interattiva, utile per scrivere selettori
```

Il dev server parte da solo (`webServer` in `playwright.config.js`): non serve
avere `npm start` già in esecuzione.

## La regola che regge tutto: nessun contatto con la produzione

`SB_URL` è hardcoded in `App.jsx` e punta al progetto Supabase di produzione.
Un test che clicca "Conferma" senza intercettazione **scalerebbe una bottiglia
vera**.

`e2e/support/harness.js` intercetta ogni richiesta verso `supabase.co` e verso
`/api/`. Quelle che nessuno stub riconosce vengono registrate come *leak* e
fanno fallire il test in teardown, con l'URL in chiaro nel messaggio. Non è
opt-in: la fixture `cantina` si installa da sola su ogni test.

Verificato: una `fetch` verso `/auth/v1/token` (endpoint non stubbato) fa
fallire il test invece di ricevere una risposta vuota.

Due conseguenze pratiche:

- **Le scritture REST dirette sono un errore.** Dopo A3 il client scrive solo
  via RPC. Se un test provoca una `POST`/`PATCH`/`DELETE` su `/rest/v1/`,
  l'harness la segnala come leak: è il guardrail che impedisce ad A3 di
  regredire in silenzio.
- **Quando arriverà il login (P1)**, gli endpoint `/auth/v1/*` vanno stubbati
  esplicitamente in `harness.js`. Finché non lo sono, falliscono rumorosamente.

## Come sono fatti i fixture

`e2e/fixtures/cantina.js` rispecchia lo schema reale dopo A2b/A3: `annata`
smallint nullable, `prezzo` nullable, `denominazione` NULL o acronimo, `rating`
nullable, `bevuti` con `consumed_on` e le colonne di snapshot.

Sono quindi **documentazione eseguibile del contratto dati**: se una migrazione
cambia un tipo, questi file vanno aggiornati e il test che rompe dice dove il
client non è allineato. Il dataset include di proposito i casi scomodi:

| | |
|---|---|
| `VINO_MINIMO` | tutti gli opzionali a NULL → verifica i placeholder di `normalizzaWine` |
| `VINO_ULTIMA_BOTTIGLIA` | distingue il ramo "decrementa" da "elimina riga" di `elimina_bottiglia` |
| `VINO_ESAURITO` | `bottiglie = 0`: fuori dalla Lista, ancora risolvibile dai Bevuti |
| bevute `uid …002` / `…003` | stesso vino, voti 3.0 e 4.0 → riproduce la divergenza D5 |
| bevuta `uid …004` | `wine_id` NULL → esercita il fallback allo snapshot di `resolveWine` |

## Cosa verificano i test, oltre alla UI

Il pezzo più utile non è "il bottone funziona", ma **il contratto con il
database**. `cantina.rpcCalls(fn)` e `cantina.lastRpcArgs(fn)` permettono di
asserire quale RPC è stata chiamata e con quali argomenti — per esempio che una
bevuta senza voto mandi `p_rating: null` e non `0`, come vuole il CHECK di A2b.

Quando P5 cambierà `valuta_vino` da `p_wine_id` a `p_uid`, o quando P6
riscriverà le RPC, questi test diranno subito cosa si è rotto.

## Limiti noti

- **WebKit non è installato ovunque.** Il progetto `iphone-chromium` esiste come
  fallback per gli ambienti che hanno solo Chromium. Approssima iOS su viewport
  e touch, non sul motore: i bug specifici di Safari (zoom sugli input < 16px,
  swipe-back della PWA) restano da verificare a mano sul telefono.
  Se i browser preinstallati sono a una revisione diversa da quella attesa dal
  pacchetto npm, si passa il percorso esplicito:
  `PW_CHROMIUM_PATH=/percorso/al/chrome npm run test:e2e:chromium`
- **`RatingDial` non è pilotabile dai test.** È un SVG guidato da drag, senza
  ruolo né valore accessibile. Per testare la valutazione servono un
  `role="slider"` con `aria-valuenow`, oppure dei `data-testid`. Finché manca,
  di D5 si testa solo il lato lettura.
- **Nessun `data-testid` nell'app.** I selettori si appoggiano a testo e ruoli,
  quindi cambiare una label rompe i test. Un pugno di testid sui punti caldi
  (riga della Lista, tile dei totali, banner d'errore) li renderebbe stabili —
  ma tocca `App.jsx`, quindi è una modifica da concordare a parte.
- **Non coperti:** tab Bevuti e Statistiche, `ModalAggiungi`/`ModalModifica`
  (che duplicano il form e andranno unificati in `WineForm`), la "scheda
  tecnica" AI, il service worker.

## Service worker

I test lo disattivano (`serviceWorkers: "block"`). Serve alla riproducibilità:
la cache-first servirebbe bundle vecchi e scavalcherebbe l'intercettazione.

Significa anche che **il comportamento offline non è coperto** — ed è meglio
così finché `public/sw.js` elenca in `urlsToCache` i percorsi del dev server di
CRA 4 (`/static/js/main.chunk.js`, `/static/js/bundle.js`), che in produzione
danno 404. `cache.addAll` è atomico, quindi l'`install` fallisce sempre. Da
sistemare prima di scriverci dei test sopra.
