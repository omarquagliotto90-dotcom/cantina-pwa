// Token di design condivisi. Solo costanti che esistevano già in App.jsx,
// spostate senza modifiche: nessun valore è stato aggiunto, tolto o ritoccato.

// ─── M3 Token System ────────────────────────────────────────────────────────
export const M3 = {
  primary:                 "#9B3535",
  onPrimary:               "#FFFFFF",
  primaryContainer:        "#FFDAD6",
  onPrimaryContainer:      "#410002",
  secondary:               "#775652",
  onSecondary:             "#FFFFFF",
  secondaryContainer:      "#FFDAD6",
  onSecondaryContainer:    "#2C1512",
  surface:                 "#FFF8F7",
  onSurface:               "#201A19",
  surfaceVariant:          "#F5DEDD",
  onSurfaceVariant:        "#534341",
  surfaceContainerLowest:  "#FFFFFF",
  surfaceContainerLow:     "#F0E9E8",
  surfaceContainer:        "#F5EDEC",
  surfaceContainerHigh:    "#EFE7E6",
  surfaceContainerHighest: "#E9E1E0",
  outline:                 "#857370",
  outlineVariant:          "#D8C2BF",
  error:                   "#BA1A1A",
};

// ─── Stili condivisi ─────────────────────────────────────────────────────────
export const S = {
  meta: { fontSize: 11, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" },
};

// ─── Token del ridisegno 2026 ────────────────────────────────────────────────
// Estratti da `design/La Mia Cantina.dc.html` (Claude Design). Convivono con
// M3 finché la migrazione schermata per schermata non è finita: a quel punto
// M3 e S spariscono e resta solo questo.
//
// Nomi in italiano come il resto del dominio. Nessun valore inventato: se un
// colore serve e non è qui, va prima nel design.
export const T = {
  // Fondi
  fondo:          "#F1ECE4",  // fuori dalla cornice dell'app
  superficie:     "#FFFCF7",  // la superficie dell'app
  superficieAlt:  "#F0EAE0",  // hero del dettaglio, box riconoscimenti
  slotImmagine:   "#F5F0E7",  // riquadro della miniatura bottiglia
  rigaHover:      "#FAF6EF",
  barraFondo:     "#EDE6DA",  // binario delle barre in Statistiche

  // Testo, dal più forte al più tenue
  testo:          "#1F1B19",
  testoProsa:     "#2B2522",  // paragrafi serif del dettaglio
  testoDato:      "#4A423C",  // valori nelle tabelle del dettaglio
  testoOrigine:   "#5F564F",
  testoUnita:     "#6A625B",  // "bottiglie", "/ 5", voci nav inattive
  secondario:     "#7C7269",
  secondarioAlt:  "#8A8078",
  tenue:          "#A79D93",
  tenueAlt:       "#B3A89C",  // icone dei vuoti

  // Accento vinaccia
  accento:        "#6B1E2E",
  accentoHover:   "#8E2A3C",
  accentoPremuto: "#57182A",
  accentoBordo:   "#E3C9CD",  // bordo del bottone Elimina
  selezione:      "#EAD9DC",

  // Oro: occhielli, numeri di rango, cerchi decorativi
  oro:            "#C6A97A",
  oroTesto:       "#A08E7B",  // il colore delle etichette in maiuscoletto
  oroScuro:       "#A98B5B",
  oroCaldo:       "#7C6A57",

  // Divisori, dal più marcato al più tenue
  divisore:       "#DDD4C7",
  divisoreMedio:  "#E6DFD5",
  divisoreTenue:  "#EFE9E0",

  // Tipografia
  serif:          "'Newsreader', serif",
  sans:           "'DM Sans', sans-serif",

  // Forme
  raggioFoto:     12,
  raggio:         14,
  pillola:        999,
};

// L'etichetta in maiuscoletto che apre ogni sezione del ridisegno.
// Ricorre identica una ventina di volte nel design: qui una volta sola.
export const OCCHIELLO = {
  margin: 0,
  color: T.oroTesto,
  fontFamily: T.sans,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: ".18em",
  textTransform: "uppercase",
};
