// Schermata Bevuti: lo storico delle degustazioni. Solo presentazione — non
// fa fetch, non conosce Supabase, non muta nulla.
//
// `renderBottiglia` e `renderSito` arrivano da App.jsx e vengono solo
// inoltrate a WineDetail: qui non si sa cosa contengano.

import { useState, useRef } from "react";
import { M3 } from "./theme";
import { WineCard } from "./components";
import { resolveWine, valoreBottiglia, formatDataIt } from "./domain";
import WineDetail from "./WineDetail";

// ─── Tab: Bevuti ──────────────────────────────────────────────────────────────
export default function TabBevuti({ bevuti, allWines, onRiporta, onElimina, onModifica, ratings, onRate, renderBottiglia, renderSito }) {
  const [selectedUid, setSelectedUid] = useState(null);
  const lastFocusedRef = useRef(null);
  const wineMap = Object.fromEntries(allWines.map(w => [w.id, w]));

  const handleOpen = (uid) => (e) => {
    if (selectedUid != null) return;
    lastFocusedRef.current = e?.currentTarget || null;
    setSelectedUid(uid);
  };
  const handleClose = () => {
    setSelectedUid(null);
    const el = lastFocusedRef.current;
    if (el) requestAnimationFrame(() => el.focus?.());
  };
  // F23: valore di mercato se valorizzato, altrimenti prezzo d'acquisto
  // (live, poi snapshot storico per i vini non più in wines).
  const totalSpeso = bevuti.reduce((a, b) => a + valoreBottiglia(resolveWine(wineMap, b)), 0);

  if (bevuti.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, color: M3.onSurfaceVariant }}>
        <div style={{ marginBottom: 16, color: M3.onSurfaceVariant, opacity:0.4 }}><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8l-1 9a4 4 0 0 1-6 0z"/><path d="M9 8h6" strokeWidth="3"/><line x1="12" y1="12" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg></div>
        <div style={{ fontSize: 18, fontWeight: 500, color: M3.onSurface, marginBottom: 8 }}>Nessun vino bevuto</div>
        <div style={{ fontSize: 14, textAlign: "center", lineHeight: 1.5 }}>Quando segni un vino come bevuto, apparirà qui con data e note.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 16px 100px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ background: M3.primaryContainer, borderRadius: 12, padding: "14px 16px", marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: M3.onPrimaryContainer, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "'Roboto', sans-serif", marginBottom: 6, opacity: 0.8 }}>Archivio degustazioni</div>
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: M3.onPrimaryContainer, fontFamily: "'Roboto', sans-serif" }}>{bevuti.length}</div>
            <div style={{ fontSize: 11, color: M3.onPrimaryContainer, opacity: 0.8, fontFamily: "'Roboto', sans-serif" }}>bottiglie aperte</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: M3.onPrimaryContainer, fontFamily: "'Roboto', sans-serif" }}>~{totalSpeso}€</div>
            <div style={{ fontSize: 11, color: M3.onPrimaryContainer, opacity: 0.8, fontFamily: "'Roboto', sans-serif" }}>valore consumato</div>
          </div>
        </div>
      </div>
      {[...bevuti].reverse().map(b => {
        const wine = resolveWine(wineMap, b);
        if (!wine) return null;
        return (
          <WineCard key={b.uid} wine={wine}
            onOpen={handleOpen(b.uid)}
            bevutoInfo={{ data: formatDataIt(b.consumedOn) || b.data, nota: b.nota }}
            ratings={ratings} />
        );
      })}
      {selectedUid != null && (() => {
        const b = bevuti.find(x => x.uid === selectedUid);
        if (!b) return null;
        const wine = resolveWine(wineMap, b);
        if (!wine) return null;
        return (
          <WineDetail key={selectedUid} wine={wine} bevutoInfo={{ data: formatDataIt(b.consumedOn) || b.data, nota: b.nota }}
            ratings={ratings} onRate={onRate}
            onBevi={() => {}} onElimina={() => onRiporta(b.uid)} onModifica={onModifica}
            onClose={handleClose}
            renderBottiglia={renderBottiglia}
            renderSito={renderSito} />
        );
      })()}
    </div>
  );
}
