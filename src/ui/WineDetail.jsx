// Schermata di dettaglio del vino, con le sue tab (Scheda, Bottiglia, Web,
// Voto). Solo presentazione: non fa fetch, non conosce Supabase, non muta nulla.
//
// La tab Bottiglia e la tab Web mostrano due componenti che invece fanno rete
// (ricerca immagine e sito produttore, con relative cache): restano in App.jsx
// e arrivano qui come render prop, `renderBottiglia` e `renderSito`.

import { useState, useRef, useEffect } from "react";
import { M3 } from "./theme";
import { TIPO, IC, RatingDial } from "./components";
import { hasCantina } from "./domain";

function SwBadge({ type }) {
  if (type === "chiocciola") return (
    <span title="Cantina premiata Slow Wine 2025" style={{ fontSize: 13, background: "#E8F5E9", color: "#2E7D32", padding: "1px 6px", borderRadius: 4, fontWeight: 600, fontFamily: "'Roboto', sans-serif", letterSpacing: 0.1, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: "#2E7D32", display: "flex" }}>{IC.eco}</span>Chiocciola
    </span>
  );
  if (type === "bottiglia") return (
    <span title="Vino premiato Slow Wine 2025" style={{ fontSize: 13, background: "#E3F2FD", color: "#0D47A1", padding: "1px 6px", borderRadius: 4, fontWeight: 600, fontFamily: "'Roboto', sans-serif", letterSpacing: 0.1, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: "#0D47A1", display: "flex" }}>{IC.verified}</span>Slow Wine
    </span>
  );
  return null;
}

export default function WineDetail({ wine, bevutoInfo = null, ratings = {}, onRate, onBevi, onElimina, onModifica, onClose, onInitClose, renderBottiglia, renderSito }) {
  const t = TIPO[wine.tipologia] || TIPO["Bianco fermo"];
  const totalVal = wine.prezzo * wine.bottiglie;
  const cantinaSW = hasCantina(wine.produttore);
  const vinoSW = !!wine.slowVinoBott;
  const currentRating = ratings[wine.id] || 0;
  const [cardTab, setCardTab] = useState("scheda");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tabs = [
    { id: "scheda", label: "Scheda", icon: (active) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? M3.primary : M3.onSurfaceVariant} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>) },
    { id: "bottiglia", label: "Bottiglia", icon: (active) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? M3.primary : M3.onSurfaceVariant} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8M9 3v3.5L6 10v11a1 1 0 001 1h10a1 1 0 001-1V10l-3-3.5V3"/><line x1="6" y1="14" x2="18" y2="14"/></svg>) },
    { id: "website", label: "Web", icon: (active) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? M3.primary : M3.onSurfaceVariant} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>) },
    ...(bevutoInfo ? [{ id: "valutazione", label: "Voto", icon: (active) => (<svg width="18" height="18" viewBox="0 0 24 24" fill={active ? M3.primary : "none"} stroke={active ? M3.primary : M3.onSurfaceVariant} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>) }] : []),
  ];

  const [closing, setClosing] = useState(false);
  const overlayRef = useRef(null);
  const backBtnRef = useRef(null);
  const pushedRef = useRef(false);
  const closingRef = useRef(false);
  const active = !closing;

  useEffect(() => {
    if (!pushedRef.current) { window.history.pushState({ wineDetail: true }, ""); pushedRef.current = true; }
    const onPop = () => { onInitClose?.(); closingRef.current = true; onClose?.(); };
    window.addEventListener("popstate", onPop);
    const raf = requestAnimationFrame(() => backBtnRef.current?.focus());
    return () => { window.removeEventListener("popstate", onPop); cancelAnimationFrame(raf); };
  }, []);

  // freccia e back hardware seguono lo stesso percorso: history.back() -> popstate -> onPop (closingRef + onClose)
  const requestClose = () => { if (closingRef.current) return; window.history.back(); };
  const onOverlayAnimEnd = (e) => { if (e.target === e.currentTarget && closing) onClose(); };
  const onOverlayKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); requestClose(); return; }
    if (e.key !== "Tab") return;
    const f = overlayRef.current?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!f || f.length === 0) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div ref={overlayRef} role="dialog" aria-modal="true" aria-label={wine.vino}
      onKeyDown={onOverlayKeyDown} onAnimationEnd={onOverlayAnimEnd}
      style={{ position: "fixed", inset: 0, zIndex: 45, background: M3.surface, display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top)", animation: closing ? "slideOutX 250ms cubic-bezier(0.3,0,0.8,0.15) both" : "slideInX 300ms cubic-bezier(0.05,0.7,0.1,1) both" }}>
      {/* Top bar */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", borderBottom: `1px solid ${M3.outlineVariant}`, background: M3.surface }}>
        <button ref={backBtnRef} onClick={requestClose} aria-label="Indietro" style={{ width: 40, height: 40, borderRadius: 20, border: "none", background: "transparent", color: M3.onSurface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10, fontFamily: "'Roboto', sans-serif", fontWeight: 500, letterSpacing: 0.5, color: M3.onSurfaceVariant, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wine.produttore}</div>
          <div style={{ fontSize: 16, fontFamily: "'Roboto', sans-serif", fontWeight: 500, color: M3.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wine.vino}</div>
        </div>
      </div>
      {/* Scroll container interno */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", background: "#F4F3EE" }}>
        <div style={{ padding: "14px 14px 28px" }}>
          {/* Tab switcher */}
          <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 6, marginBottom: 14, justifyContent: "center", overflowX: "auto", scrollbarWidth: "none", background: M3.surfaceContainerHighest, borderRadius: 50, padding: "4px 6px" }}>
            {tabs.map(tab => {
              const active = cardTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setCardTab(tab.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: active ? "7px 16px" : "7px 12px", borderRadius: 50, border: "none", flexShrink: 0, background: active ? M3.primaryContainer : "transparent", color: active ? M3.primary : M3.onSurfaceVariant, fontSize: 13, fontWeight: active ? 600 : 400, fontFamily: "'Roboto', sans-serif", cursor: "pointer", letterSpacing: 0.1, transition: "background 0.18s, color 0.18s, padding 0.18s", whiteSpace: "nowrap" }}>
                  {tab.icon(active)}<span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Tab SCHEDA ── */}
          {cardTab === "scheda" && (
            <>
              {(cantinaSW || vinoSW) && (
                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                  {cantinaSW && <SwBadge type="chiocciola" />}
                  {vinoSW && <SwBadge type="bottiglia" />}
                </div>
              )}
              <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
                {[
                  { l: "Acquisto", v: `~${wine.prezzo}€` },
                  { l: "Valore", v: wine.valore != null ? `~${wine.valore}€` : "—" },
                  { l: "Bottiglie", v: bevutoInfo ? "—" : wine.bottiglie },
                  { l: "Giacenza €", v: `~${totalVal}€` },
                ].map(s => (
                  <div key={s.l} style={{ flex: "1 1 70px", background: "#7A7A72", borderRadius: 10, padding: "9px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "#E8D8A0", fontFamily: "'Roboto', sans-serif" }}>{s.v}</div>
                    <div style={{ fontSize: 10, color: "rgba(232,216,160,0.7)", textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "'Roboto', sans-serif", marginTop: 1 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                {[
                  { icon: IC.grape, label: "Vitigno",       val: wine.vitigno },
                  { icon: IC.timer, label: "Macerazione",   val: wine.macerazione },
                  { icon: IC.flask, label: "Fermentazione", val: wine.fermentazione },
                  { icon: IC.sync,  label: "Legno",         val: wine.malolattica },
                ].map(s => (
                  <div key={s.label} style={{ background: "#6B8FA8", borderRadius: 12, padding: "11px 12px", boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.06)" }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", fontFamily: "'Roboto', sans-serif", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>{s.icon}<span>{s.label}</span></div>
                    <div style={{ fontSize: 11, color: "#FFFFFF", fontFamily: "'Roboto', sans-serif", lineHeight: 1.5 }}>{s.val}</div>
                  </div>
                ))}
              </div>
              {wine.note && (
                <div style={{ background: "#6B8FA8", borderRadius: 12, padding: "12px 14px", marginBottom: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.06)", borderLeft: `3px solid ${t.indicator}` }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", fontFamily: "'Roboto', sans-serif", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>{IC.notes}<span>Note</span></div>
                  <div style={{ fontSize: 12, color: "#FFFFFF", fontFamily: "'Roboto', sans-serif", lineHeight: 1.6 }}>{wine.note}</div>
                </div>
              )}
              {wine.note_cantina && (
                <div style={{ background: "#6B8FA8", borderRadius: 12, padding: "12px 14px", marginBottom: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.06)", borderLeft: `3px solid ${t.indicator}` }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", fontFamily: "'Roboto', sans-serif", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>{IC.notes}<span>Note cantina</span></div>
                  <div style={{ fontSize: 12, color: "#FFFFFF", fontFamily: "'Roboto', sans-serif", lineHeight: 1.6 }}>{wine.note_cantina}</div>
                </div>
              )}
              {bevutoInfo?.nota && (
                <div style={{ background: "#6B8FA8", borderRadius: 12, padding: "12px 14px", marginBottom: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.06)", borderLeft: `3px solid ${M3.primary}` }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", fontFamily: "'Roboto', sans-serif", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>{IC.wineglass}<span>Nota di degustazione</span></div>
                  <div style={{ fontSize: 12, color: "#FFFFFF", fontFamily: "'Roboto', sans-serif", lineHeight: 1.6 }}>{bevutoInfo.nota}</div>
                </div>
              )}
            </>
          )}

          {/* ── Tab BOTTIGLIA ── */}
          {cardTab === "bottiglia" && (
            <div onClick={e => e.stopPropagation()} style={{ marginBottom: 12 }}>
              {renderBottiglia(wine, active && cardTab === "bottiglia")}
            </div>
          )}

          {/* ── Tab WEBSITE ── */}
          {active && cardTab === "website" && (
            <div onClick={e => e.stopPropagation()} style={{ marginBottom: 12 }}>
              {renderSito(wine)}
            </div>
          )}

          {/* ── Tab VALUTAZIONE ── */}
          {cardTab === "valutazione" && bevutoInfo && (
            <div onClick={e => e.stopPropagation()} style={{ marginBottom: 12 }}>
              <div style={{ background: "#6B8FA8", borderRadius: 12, padding: "20px 16px", textAlign: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontFamily: "'Roboto', sans-serif", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontWeight: 500 }}>La tua valutazione</div>
                <RatingDial value={currentRating} onChange={(v) => onRate(wine.id, v)} labelColor="#FFFFFF" mutedColor="rgba(255,255,255,0.75)" maxColor="#FFFFFF" />
              </div>
            </div>
          )}

          {/* ── Azioni ── */}
          <div>
            {!bevutoInfo ? (
              <button onClick={(e) => { e.stopPropagation(); onBevi(wine.id); }} style={{ width: "100%", padding: "10px 24px", borderRadius: 20, border: "none", background: "#D4E0D0", color: "#2E4A2E", fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer", letterSpacing: 0.1, marginBottom: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{display:"flex",alignItems:"center",gap:6}}>{IC.wineglass} Segna come bevuto</span>
              </button>
            ) : (
              <div style={{ width: "100%", padding: "10px 16px", borderRadius: 20, background: M3.surfaceContainerHighest, fontSize: 13, fontFamily: "'Roboto', sans-serif", color: M3.onSurfaceVariant, textAlign: "center", marginBottom: 8, letterSpacing: 0.1, boxSizing: "border-box" }}>
                🫗 Bottiglia aperta il <strong style={{ color: M3.onSurface }}>{bevutoInfo.data}</strong>
              </div>
            )}
            <button onClick={(e) => { e.stopPropagation(); onModifica(wine); }} style={{ width: "100%", padding: "10px 24px", borderRadius: 20, border: `1px solid #B5A898`, background: "transparent", color: M3.onSurface, fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer", letterSpacing: 0.1, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{display:"flex",alignItems:"center",gap:6}}>{IC.edit} Modifica dati</span>
            </button>
            {!confirmDelete ? (
              <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }} style={{ width: "100%", padding: "10px 24px", borderRadius: 20, border: `1px solid #B0A8C0`, background: "transparent", color: "#B0A8C0", fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer", letterSpacing: 0.1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{display:"flex",alignItems:"center",gap:6}}>{IC.trash} {bevutoInfo ? "Riporta in cantina" : "Elimina dalla cantina"}</span>
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ flex: 1, fontSize: 12, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>
                  {bevutoInfo ? "Riporta questa bottiglia in cantina?" : wine.bottiglie > 1 ? `Rimuovi 1 bottiglia (rimangono ${wine.bottiglie - 1})?` : "Rimuovi l'ultima bottiglia?"}
                </span>
                <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }} style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${M3.outline}`, background: "transparent", color: M3.onSurfaceVariant, fontSize: 12, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>No</button>
                <button onClick={(e) => { e.stopPropagation(); onElimina(wine); setConfirmDelete(false); }} style={{ padding: "7px 14px", borderRadius: 20, border: "none", background: bevutoInfo ? M3.primary : M3.error, color: "#FFFFFF", fontSize: 12, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>{bevutoInfo ? "Sì, riporta" : "Sì, elimina"}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
