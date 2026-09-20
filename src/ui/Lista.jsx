// Schermata Lista: la cantina. Ricerca, filtri per tipologia, riepilogo,
// righe e stato vuoto. Solo presentazione — non fa fetch, non conosce
// Supabase, non muta nulla.
//
// Ricerca, filtro e vino selezionato restano stato locale di questa
// schermata, com'erano dentro App.jsx: sollevarli in Cantina() li farebbe
// sopravvivere al cambio tab, cioe' cambierebbe il comportamento. E' lo step
// B della roadmap, non questo refactor.
//
// `renderBottiglia` e `renderSito` arrivano da App.jsx e vengono solo
// inoltrate a WineDetail: qui non si sa cosa contengano.

import { useState, useRef } from "react";
import { M3, S } from "./theme";
import { TIPO, TipoLabel, IC, WineCard } from "./components";
import { costoGiacenza } from "./domain";
import WineDetail from "./WineDetail";

const FILTERS = ["Tutti", "Rosso fermo", "Bianco fermo", "Orange", "Spumante", "Spumante rosso", "Sidro"];

// ─── Filter Chip M3 ───────────────────────────────────────────────────────────
function FilterChip({ label, active, onClick }) {
  const t = TIPO[label];
  const [pressed, setPressed] = useState(false);
  const bgColor  = active ? (t?.container || M3.secondaryContainer) : "transparent";
  const textColor = active ? (t?.onContainer || M3.onSecondaryContainer) : M3.onSurfaceVariant;
  const shadow   = active ? "0px 1px 2px rgba(0,0,0,0.30), 0px 1px 3px 1px rgba(0,0,0,0.15)" : "none";
  return (
    <button onClick={onClick} onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, height: 32,
        padding: active ? "0 16px 0 8px" : "0 16px", borderRadius: 8,
        border: active ? "none" : `1px solid ${M3.outline}`, background: bgColor,
        boxShadow: pressed ? "none" : shadow, color: textColor,
        fontSize: 14, fontFamily: "'Roboto', sans-serif", fontWeight: 500, letterSpacing: 0.1,
        cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, overflow: "hidden",
        transform: pressed ? "scale(0.94)" : "scale(1)",
        transition: ["background 200ms cubic-bezier(0.2,0,0,1)","color 200ms cubic-bezier(0.2,0,0,1)","border 200ms cubic-bezier(0.2,0,0,1)","box-shadow 200ms cubic-bezier(0.2,0,0,1)","transform 120ms cubic-bezier(0.2,0,0,1)","padding 200ms cubic-bezier(0.2,0,0,1)"].join(", "), outline: "none",
      }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: 8, background: textColor, opacity: pressed ? 0.08 : 0, transition: "opacity 120ms cubic-bezier(0.2,0,0,1)", pointerEvents: "none" }} />
      {active && (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={textColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, position: "relative", zIndex: 1 }}><polyline points="20 6 9 17 4 12" /></svg>)}
      {t && (<span style={{ display: "inline-flex", alignItems: "center", position: "relative", zIndex: 1 }}><TipoLabel tipo={label} size={13} color={textColor} /></span>)}
      <span style={{ position: "relative", zIndex: 1 }}>{label}</span>
    </button>
  );
}

// ─── Tab: Lista ───────────────────────────────────────────────────────────────
export default function TabLista({ wines, bevuti, onBevi, onElimina, onModifica, onAggiungi, compact, ratings, onRate, onWineOpen, onWineClose, renderBottiglia, renderSito }) {
  const [filter, setFilter] = useState("Tutti");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const lastFocusedRef = useRef(null);

  const handleOpen = (wineId) => (e) => {
    if (selectedId != null) return;
    lastFocusedRef.current = e?.currentTarget || null;
    setSelectedId(wineId);
    const w = wines.find(x => x.id === wineId);
    if (w && onWineOpen) onWineOpen(w);
  };
  const handleClose = () => {
    setSelectedId(null);
    if (onWineClose) onWineClose();
    const el = lastFocusedRef.current;
    if (el) requestAnimationFrame(() => el.focus?.());
  };

  // 1:N — vino resta in Lista finché bottiglie > 0 (garantito da allWines a monte)
  const filtered = wines
    .filter(w => filter === "Tutti" || w.tipologia === filter)
    .filter(w => {
      const q = search.toLowerCase();
      return !q || w.produttore.toLowerCase().includes(q) || w.vino.toLowerCase().includes(q) || String(w.annata).includes(q) || (w.vitigno || "").toLowerCase().includes(q);
    });

  const totalB = filtered.reduce((a, w) => a + w.bottiglie, 0);
  const totalV = costoGiacenza(filtered);

  return (
    <>
      <div style={{ padding: "6px 16px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: M3.surfaceContainerHighest, borderRadius: 28, padding: "7px 14px", height: compact ? 34 : 38, transition: "height 0.3s" }}>
          <span style={{ color: M3.onSurfaceVariant, display:"flex" }}>{IC.search}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca produttore, vino, vitigno…"
            style={{ flex: 1, background: "none", border: "none", fontSize: 14, color: M3.onSurface, fontFamily: "'Roboto', sans-serif" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: M3.onSurfaceVariant, fontSize: 15 }}><span style={{display:"flex"}}>{IC.close}</span></button>}
        </div>
      </div>
      {!compact && (
        <div style={{ display: "flex", gap: 7, padding: "4px 16px 6px", overflowX: "auto", scrollbarWidth: "none" }}>
          {FILTERS.map(f => <FilterChip key={f} label={f} active={filter === f} onClick={() => { setFilter(f); setSelectedId(null); }} />)}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, padding: compact ? "4px 16px 6px" : "0 16px 8px" }}>
        {[{ l: "Referenze", v: filtered.length }, { l: "Bottiglie", v: totalB }, { l: "Costo", v: `~${totalV}€` }, { l: "Media/bott", v: `~${totalB ? Math.round(totalV / totalB) : 0}€` }].map(s => (
          <div key={s.l} style={{ flex: 1, background: M3.surfaceContainerHighest, boxShadow: "none", border: "none", borderRadius: 12, padding: compact ? "6px 4px" : "10px 4px", textAlign: "center", minWidth: 0, transition: "padding 0.3s cubic-bezier(0.2,0,0,1)" }}>
            <div style={{ fontSize: compact ? 13 : 16, fontWeight: 700, color: M3.primary, fontFamily: "'Roboto', sans-serif", letterSpacing: -0.2 }}>{s.v}</div>
            <div style={{ fontSize: 9, color: M3.onSurfaceVariant, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "'Roboto', sans-serif", marginTop: 2, fontWeight: 500 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: "0 0 100px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: M3.onSurfaceVariant }}>
            <div style={{ marginBottom: 10, color: M3.onSurfaceVariant, opacity:0.5 }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
            <div style={{ fontSize: 15, fontWeight: 500, color: M3.onSurface }}>Nessun vino trovato</div>
          </div>
        ) : filtered.map(wine => (
          <WineCard key={wine.id} wine={wine}
            onOpen={handleOpen(wine.id)}
            ratings={ratings} />
        ))}
      </div>
      {selectedId != null && (() => {
        const w = wines.find(x => x.id === selectedId);
        if (!w) return null;
        return (
          <WineDetail key={selectedId} wine={w} ratings={ratings} onRate={onRate}
            onBevi={onBevi} onElimina={onElimina} onModifica={onModifica} onClose={handleClose}
            renderBottiglia={renderBottiglia}
            renderSito={renderSito} />
        );
      })()}
    </>
  );
}
