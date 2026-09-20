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
