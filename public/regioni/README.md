# Foto delle regioni

Sfondo dell'hero nella scheda del vino. La regione arriva da
`produttori.regione`, non dal vino: due vini dello stesso produttore mostrano
sempre la stessa foto.

## Come si aggiunge una foto

1. Metti il file qui, chiamato con lo **slug** della regione esattamente come
   sta scritta in `produttori.regione`: minuscolo, senza accenti, spazi e
   punteggiatura sostituiti da `-`.

   | `produttori.regione` | file |
   |---|---|
   | `Veneto` | `veneto.jpg` |
   | `Trentino-Alto Adige` | `trentino-alto-adige.jpg` |
   | `Emilia-Romagna` | `emilia-romagna.jpg` |
   | `Carso` | `carso.jpg` |

2. Aggiungi la regione a `REGIONI_CON_FOTO` in `src/ui/WineDetail.jsx`.

I due passi devono combaciare, e `e2e/regioni.spec.js` lo verifica: un file
senza voce nell'elenco non viene mai mostrato, una voce senza file lascia
l'hero vuoto. Nessuno dei due darebbe errore da solo.

## Già caricate

| Regione | File | Note |
|---|---|---|
| Trentino-Alto Adige | `trentino-alto-adige.jpg` | 580×580, 107 KB. **Sotto specifica:** su iPhone l'hero è 1125×1350 fisici a 3x, quindi viene ingrandita ~2,4 volte e al 100% i filari risultano morbidi. Sostituibile con un ritaglio verticale ≥1200px dello stesso scatto, senza toccare il codice |
| Veneto | `veneto.jpg` | 620×438, 122 KB. **La più sotto specifica delle tre, e la più vista** (27 bottiglie, 15 produttori): l'hero ne usa la fascia centrale, ~365px, ingranditi 3,1 volte a 3x. Al 100% i filari sono impastati. Funziona perché il soggetto è controluce e sfocato, ma è la prima da sostituire con un originale ≥1200px |
| Marche | `marche.jpg` | 2048×1366, 448 KB. **La prima sopra specifica davvero:** il ritaglio dell'hero usa 1182px contro i 1170 necessari a 3×, quindi **riduce invece di ingrandire** — nitida sul serio. L'originale era 2560×1707 e 643 KB; ridimensionato a 2048×1366, che tiene l'altezza a 1366 contro i 1400 necessari (99%: nitida) |
| Lombardia | `lombardia.jpg` | 2000×1335, 313 KB. Altezza 1335 contro 1400 necessari: **1,05×**, nitida. Nessun ritocco, è arrivata già giusta |
| Umbria | `umbria.jpg` | 900×500, 113 KB. Altezza 500 contro 1400 necessari: ingrandimento 2,8×, morbida come Veneto e Abruzzo. Fascia visibile x da 238 a 662; la composizione regge, i filari autunnali in primo piano finiscono però sotto il velo |
| Abruzzo | `abruzzo.jpg` | 678×452, 74 KB. Sotto specifica: il ritaglio dell'hero usa 377px di larghezza, ingranditi 3× su iPhone. **Porta il watermark di `vivillvino.it` in basso a destra.** Misurata nel browser la fascia davvero visibile — x da 148 a 530 su 678 — e il watermark, che sta oltre x=555, **resta fuori dal ritaglio**. Non si vede nell'app. Resta però nel file, e il repo è pubblico. Montata comunque su decisione di Omar, 21/09/2026 |
| Valle d'Aosta | `valle-d-aosta.jpg` | 1920×1080, 231 KB. Dimensioni buone. **Dormiente:** al 20/09/2026 nessun produttore è in Valle d'Aosta, quindi non viene mai mostrata. Si accende da sola il giorno che entra un vino valdostano |

Il tetto vero, verificato dai test, è **500 KB**. Era 300, alzato il 21/09/2026:
i 300 erano tarati su foto piccole e ingrandite 3 volte, e avrebbero costretto
a degradare la prima foto davvero nitida. Resta un tetto: serve a impedire che
finisca qui un file non ottimizzato.

**Se una foto sfora**, ridimensionala invece di comprimerla di più.

## La misura che conta è l'ALTEZZA

Misurato nel browser il 21/09/2026: il riquadro dell'hero è **390×461** e con
`background-size: cover` **l'altezza della sorgente è sempre usata al 100%**,
mentre della larghezza si vede solo la fascia centrale — il 56% per una foto 3:2,
il 47% per una 16:9.

Quindi il requisito è uno solo e non dipende dalle proporzioni:

> **altezza ≥ 1400px** (461 × 3, perché l'iPhone è a 3×)

Sotto, l'immagine viene ingrandita e risulta morbida. Lo stato attuale:

| File | Altezza | Ingrandimento |
|---|---|---|
| `marche.jpg` | 1366 | 1,01× — nitida |
| `lombardia.jpg` | 1335 | 1,05× — nitida |
| `valle-d-aosta.jpg` | 1080 | 1,28× |
| `trentino-alto-adige.jpg` | 580 | 2,38× |
| `umbria.jpg` | 500 | 2,77× |
| `abruzzo.jpg` | 452 | 3,06× |
| `veneto.jpg` | 438 | 3,16× |

*(La vecchia regola qui scritta parlava di 2048px di larghezza: era calcolata su
un solo rapporto d'aspetto e non vale per le foto più larghe.)*

Il secondo passo è quello che accende la foto: l'elenco è esplicito apposta,
così per le regioni senza foto il browser non parte con una richiesta destinata
al 404. Una regione non elencata — o un produttore senza regione — ricade sul
fondo pieno `#F0EAE0`, che è l'aspetto che l'hero aveva prima.

## Formato

- **JPEG**, `.jpg`. Le foto del bundle di design stanno sotto i 100 KB l'una:
  è il tetto ragionevole, sono sfondi sfumati sotto un velo, non gallerie
- **orizzontali**, almeno 1080px di larghezza. Vengono ritagliate con
  `background-size: cover` e centrate: quello che conta è la fascia centrale
- soggetto **calmo e scuro il giusto**. Sopra ci passano il titolo del vino e
  il nome del produttore: un cielo bianco o un contrasto forte a metà altezza
  li rende illeggibili nonostante il velo
- **di cui possiedi i diritti.** Restano nel repo pubblico

## Quante ne servono

Per copertura, in ordine di bottiglie in cantina (20/09/2026):

| Regione | Bottiglie |
|---|---|
| Veneto | 27 |
| Abruzzo | 24 |
| Marche | 12 |
| Umbria | 10 |
| Trentino-Alto Adige | 8 |
| Lombardia | 8 |
| Carso | 5 |
| Vipava | 3 |
| Emilia-Romagna | 2 |

Le prime sei coprono 89 bottiglie su 118. Le restanti 23 regioni hanno una
bottiglia ciascuna o nessuna: possono restare a fondo pieno senza che si noti.

I due file `vigneti-piemonte.jpg` e `vigneti-toscana.jpg` del bundle di design
**non** sono stati copiati qui: in questa cantina il Piemonte ha 0 bottiglie e
la Toscana 1, quindi non si vedrebbero quasi mai.
