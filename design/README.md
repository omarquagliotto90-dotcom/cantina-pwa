# Riferimento di design — "La mia cantina" (Claude Design)

Bundle di handoff esportato da claude.ai/design il 20/09/2026, progetto
*The Wine Journal Redesign*. **È un riferimento, non codice da importare.**

| File | Cosa contiene |
|---|---|
| `La Mia Cantina.dc.html` | Il design completo: Cantina, Bevuti, Statistiche, dettaglio vino, sheet "bevi" e "aggiungi" |
| `assets/vigneti-*.jpg` | Foto di sfondo per regione, usate nell'hero del dettaglio |
| `assets/bottle-*.jpg` | Bottiglie di esempio del prototipo — **non servono**, l'app ha le sue immagini reali |
| `_ds/` | Il design system "Modernist" di serie. **Non è quello usato**: il `.dc.html` lo scavalca interamente con stili propri |
| `HANDOFF.md` | Le istruzioni originali del bundle |

Non è stata copiata la cartella `uploads/`: erano screenshot delle iterazioni,
senza valore per l'implementazione.

## Come si legge

Il prototipo è HTML con stili inline — la stessa forma che usa la PWA, quindi
i valori si trasferiscono quasi uno a uno. Usa però un layer di template suo:

- `{{ espressione }}` è un binding → diventa una prop o una variabile JSX
- `<sc-if value="{{ x }}">` → rendering condizionale
- `<sc-for list="{{ l }}" as="w">` → `.map()`
- `style-hover="..."` → nella PWA si fa con lo stato locale, come già in `PressableRow`

Gli attributi `hint-placeholder-*` servono solo all'editor: si ignorano.

## Token estratti

Sono i valori che compaiono nel file, raccolti qui per comodità. La fonte
autoritativa resta il `.dc.html`.

### Colori

| Ruolo | Valore |
|---|---|
| Fondo pagina | `#F1ECE4` |
| Superficie app | `#FFFCF7` |
| Superficie alternativa (hero, box) | `#F0EAE0` |
| Fondo slot immagine | `#F5F0E7` |
| Riga in hover | `#FAF6EF` |
| Testo | `#1F1B19` |
| Testo secondario | `#7C7269` · `#8A8078` · `#6A625B` · `#4A423C` |
| Testo tenue | `#A79D93` · `#B3A89C` |
| Vinaccia (accento) | `#6B1E2E` — hover `#8E2A3C`, premuto `#57182A` |
| Oro / eyebrow | `#C6A97A` · `#A08E7B` · `#A98B5B` |
| Divisori | `#DDD4C7` (forte) · `#E6DFD5` (medio) · `#EFE9E0` (tenue) |
| Barre statistiche (fondo) | `#EDE6DA` |
| Selezione testo | `#EAD9DC` |

### Colore per tipologia

`Rosso #6B1E2E` · `Bianco #CBAE6A` · `Orange #C2703B` · `Bollicine #A9AC72`
· `Rosé #C98795` · `Sidro #9A7B4F`

### Tipografia

Due famiglie da Google Fonts:

- **Newsreader** (serif) — titoli, numeri, nomi dei vini. Pesi 300/400/500
- **DM Sans** — testo corrente, etichette, UI. Pesi 400/500/600

Le etichette in maiuscoletto ricorrono con `font-size:10px`,
`letter-spacing:.18em`, `font-weight:600`, colore `#A08E7B`.

### Forme

Raggi: `12px` (slot immagine), `14px` (box, bottoni, sheet), `999px` (chip),
`50%` (bottoni tondi). Nessuna ombra tranne quella della cornice del telefono
e dello sheet.

## Cosa NON è ancora deciso

Vedi la scheda decisione del 20/09/2026: `RatingDial` sostituito da uno slider,
il dettaglio che perde le tab, i gradienti, gli input a 14px e la mappatura
delle tipologie (`Rosé` non esiste in `wines.tipologia`, `Spumante rosso` non
esiste nel design). Finché non sono sciolte, il design non si implementa.
