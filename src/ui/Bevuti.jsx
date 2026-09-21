// Schermata Bevuti: lo storico delle degustazioni. Solo presentazione — non
// fa fetch, non conosce Supabase, non muta nulla.
//
// Ridisegno 2026 (C3), da `design/La Mia Cantina.dc.html`: intestazione
// editoriale, riepilogo, e un diario diviso per anno.
//
// `renderBottiglia` arriva da App.jsx e viene solo
// inoltrata a WineDetail: qui non si sa cosa contenga.

import { useState, useRef } from "react";
import { T, OCCHIELLO } from "./theme";
import { CaliceIcon } from "./components";
import { resolveWine, valoreBottiglia, formatDataIt, produttoreDi } from "./domain";
import WineDetail from "./WineDetail";

const IconaRiporta = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v6h6" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
  </svg>
);

// Una riga del diario. Il bottone apre il dettaglio; voto e "riporta" stanno
// sotto, fuori dal bottone, perche' sono azioni e letture separate.
function RigaBevuta({ b, wine, immagine, voto, onOpen, onRiporta }) {
  const [hover, setHover] = useState(false);
  const regione = produttoreDi(wine.produttore)?.regione;
  const meta = [wine.annata, wine.denominazione !== "n.d." ? wine.denominazione : null].filter(Boolean).join(" · ");
  const valore = valoreBottiglia(wine);

  return (
    <article style={{ padding: "10px 0 12px", borderBottom: `1px solid ${T.divisoreMedio}` }}>
      <button type="button" onClick={onOpen}
        onPointerEnter={e => { if (e.pointerType === "mouse") setHover(true); }}
        onPointerLeave={() => setHover(false)}
        style={{ position: "relative", width: "100%", display: "grid", gridTemplateColumns: "62px minmax(0,1fr)", gap: 14, alignItems: "center", padding: 0, textAlign: "left", background: hover ? T.rigaHover : "transparent", border: 0, cursor: "pointer", transition: "background .16s", fontFamily: T.sans, color: T.testo }}>
        <span style={{ position: "absolute", top: 0, right: 0, zIndex: 2, ...OCCHIELLO, fontSize: 9, letterSpacing: ".12em" }}>{regione || ""}</span>
        <div style={{ width: 62, height: 84, display: "grid", placeItems: "center", overflow: "hidden", background: T.slotImmagine, borderRadius: T.raggioFoto }}>
          {immagine
            ? <img src={immagine} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain", mixBlendMode: "multiply" }} />
            : <CaliceIcon size={18} color={T.tenueAlt} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: "0 0 5px", paddingRight: regione ? 76 : 0, color: T.accento, fontSize: 10, fontWeight: 600, letterSpacing: ".09em", textTransform: "uppercase", overflowWrap: "anywhere" }}>{wine.produttore}</p>
          <h3 style={{ margin: 0, fontFamily: T.serif, fontSize: 13, fontWeight: 400, lineHeight: 1.08, letterSpacing: "-.01em", overflowWrap: "anywhere" }}>{wine.vino}</h3>
          <p style={{ margin: "6px 0 0", color: T.secondarioAlt, fontSize: 10, lineHeight: 1.35 }}>{meta}</p>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 13, paddingTop: 9, borderTop: `1px solid ${T.divisoreTenue}` }}>
            <span style={{ color: T.secondarioAlt, fontSize: 11, lineHeight: 1.25 }}>{formatDataIt(b.consumedOn) || b.data}</span>
            <span style={{ fontSize: 11, color: T.secondarioAlt }}>Valore · ~{valore} €</span>
          </div>
        </div>
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "12px 0 0 76px" }}>
        {voto > 0 ? (
          <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <b style={{ fontFamily: T.serif, fontSize: 19, fontWeight: 500, lineHeight: 1, color: T.accento }}>{voto.toFixed(1).replace(".", ",")}</b>
            <span style={{ fontSize: 11, color: T.testoUnita }}>/ 5</span>
          </span>
        ) : (
          <span style={{ fontSize: 11, color: T.tenue }}>non valutato</span>
        )}
        <button type="button" onClick={onRiporta}
          style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", border: `1px solid ${T.accento}`, borderRadius: T.raggio, background: "transparent", color: T.accento, fontFamily: T.sans, fontSize: 11, cursor: "pointer" }}>
          <IconaRiporta /> Riporta in cantina
        </button>
      </div>
    </article>
  );
}

export default function TabBevuti({ bevuti, allWines, onRiporta, onElimina, onModifica, ratings, onRate, renderBottiglia, immagini = {} }) {
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
      <div style={{ padding: "60px 24px", textAlign: "center", fontFamily: T.sans, color: T.testo }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><CaliceIcon size={30} color={T.tenueAlt} /></div>
        <h2 style={{ margin: 0, fontFamily: T.serif, fontSize: 23, fontWeight: 400 }}>Nessun vino bevuto</h2>
        <p style={{ margin: "8px auto 0", maxWidth: 250, color: T.secondarioAlt, fontSize: 13, lineHeight: 1.55 }}>
          Quando segni un vino come bevuto, apparirà qui con data e note.
        </p>
      </div>
    );
  }

  // Diario: dal più recente al più vecchio, raggruppato per anno. Prima
  // l'ordine era quello di inserimento invertito; qui è la data di consumo,
  // che è ciò che il lettore si aspetta da un diario e ciò che rende i
  // divisori d'anno sensati.
  const ordinate = [...bevuti].sort((x, y) => {
    const dx = x.consumedOn || "", dy = y.consumedOn || "";
    if (dx !== dy) return dy.localeCompare(dx);
    return (y.uid || 0) - (x.uid || 0);
  });
  const anni = [];
  for (const b of ordinate) {
    const anno = (b.consumedOn || "").slice(0, 4) || "—";
    const ultimo = anni[anni.length - 1];
    if (!ultimo || ultimo.anno !== anno) anni.push({ anno, righe: [b] });
    else ultimo.righe.push(b);
  }

  return (
    <div style={{ padding: "0 20px 24px", fontFamily: T.sans, color: T.testo }}>

      {/* ── Intestazione editoriale ── */}
      <header style={{ padding: "30px 0 16px", borderBottom: `1px solid ${T.testo}` }}>
        <p style={{ ...OCCHIELLO }}>Memoria personale</p>
        <h2 style={{ margin: "3px 0 10px", fontFamily: T.serif, fontSize: 27, fontWeight: 400, lineHeight: 1, letterSpacing: "-.01em" }}>Bevuti</h2>
        <p style={{ margin: 0, maxWidth: 280, color: T.secondario, fontFamily: T.serif, fontSize: 16, lineHeight: 1.45 }}>
          I vini, le persone e i momenti che vale la pena ricordare.
        </p>
      </header>

      {/* ── Riepilogo ── */}
      <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(132px,.85fr)", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.divisoreMedio}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span data-testid="tot-bevute" style={{ fontFamily: T.serif, fontSize: 34, lineHeight: 1, fontWeight: 300, color: T.accento, letterSpacing: "-.03em" }}>{bevuti.length}</span>
          <span style={{ maxWidth: 72, color: T.secondario, fontSize: 11, lineHeight: 1.25 }}>bottiglie<br />bevute</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 30, padding: "0 0 0 14px", borderLeft: `1px solid ${T.divisoreMedio}` }}>
          <span style={{ color: T.secondario, fontSize: 11 }}>valore</span>
          <b data-testid="tot-consumato" style={{ fontFamily: T.serif, color: T.accento, fontSize: 11, fontWeight: 500 }}>~{totalSpeso} €</b>
        </div>
      </section>

      {/* ── Il diario, per anno ── */}
      {anni.map(({ anno, righe }) => (
        <section key={anno}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "14px 0 0" }}>
            <span style={{ fontFamily: T.serif, fontSize: 17, color: T.accento }}>{anno}</span>
            <span style={{ flex: 1, height: 1, background: T.divisoreMedio }} />
            <span style={{ color: T.secondarioAlt, fontSize: 11 }}>{righe.length} {righe.length === 1 ? "bevuta" : "bevute"}</span>
          </div>
          {righe.map(b => {
            const wine = resolveWine(wineMap, b);
            if (!wine) return null;
            return (
              <RigaBevuta key={b.uid} b={b} wine={wine}
                immagine={immagini[b.id] || null}
                voto={ratings[b.id] || 0}
                onOpen={handleOpen(b.uid)}
                onRiporta={() => onRiporta(b.uid)} />
            );
          })}
        </section>
      ))}

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
            />
        );
      })()}
    </div>
  );
}
