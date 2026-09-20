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
