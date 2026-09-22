// Schermata Cantina (ex Lista). Ricerca, filtri per tipologia, riepilogo,
// righe e stato vuoto. Solo presentazione — non fa fetch, non conosce
// Supabase, non muta nulla.
//
// Ridisegno 2026 (C2), da `design/La Mia Cantina.dc.html`: intestazione
// editoriale con il "+" incorporato, il numerone delle bottiglie custodite,
// barra di ricerca e chip appiccicati in alto, righe con miniatura.
//
// Ricerca, filtro e vino selezionato restano stato locale di questa
// schermata, com'erano prima: sollevarli in `Cantina()` li farebbe
// sopravvivere al cambio tab, cioe' cambierebbe il comportamento. E' lo step
// B della roadmap, non questo.
//
// `renderBottiglia` arriva da App.jsx e viene solo
// inoltrata a WineDetail: qui non si sa cosa contenga.

import { useState, useRef, useEffect } from "react";
import { T, OCCHIELLO } from "./theme";
import { TIPO, WineCard, CaliceIcon, IconaLente } from "./components";
import { costoGiacenza, valoreMercatoGiacenza } from "./domain";
import WineDetail from "./WineDetail";

// Derivati da TIPO, che e' l'unica fonte di etichette per tipologia: due
// elenchi divergerebbero al primo ritocco. L'ordine e' quello di TIPO.
const FILTRI = [
  { label: "Tutti", tipo: null },
  ...Object.entries(TIPO).map(([tipo, t]) => ({ label: t.etichetta, tipo })),
];

function Chip({ label, attivo, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ flex: "0 0 auto", height: 31, padding: "0 14px", borderRadius: T.pillola,
        border: `1px solid ${attivo ? T.accento : T.divisore}`,
        background: attivo ? T.accento : "transparent",
        color: attivo ? T.superficie : T.testoDato,
        fontFamily: T.sans, fontSize: 12, fontWeight: 500, letterSpacing: ".02em",
        cursor: "pointer", whiteSpace: "nowrap", transition: "all .16s" }}>
      {label}
    </button>
  );
}

export default function TabLista({ wines, bevuti, onBevi, onElimina, onModifica, compact, onRate, onWineOpen, onWineClose, renderBottiglia, renderMiniatura, immagini = {}, formati = {}, rev = "" }) {
  const [filtro, setFiltro] = useState("Tutti");
  const [search, setSearch] = useState("");
  const [ricercaAperta, setRicercaAperta] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const lastFocusedRef = useRef(null);

  const handleOpen = (wineId) => (e) => {
    if (selectedId != null) return;
    lastFocusedRef.current = e?.currentTarget || null;
    setSelectedId(wineId);
    const w = wines.find(x => x.id === wineId);
    if (w && onWineOpen) onWineOpen(w);
  };
  // Il vino aperto puo' sparire da sotto: eliminare l'ultima bottiglia lo
  // toglie da `wines`. Senza questo, il dettaglio smetteva di disegnarsi
  // (`if (!w) return null` piu' sotto) ma `selectedId` restava valorizzato, e
  // la guardia in cima a `handleOpen` rifiutava ogni tap successivo: la lista
  // sembrava morta. Non e' un overlay invisibile, e' uno stato non ripulito.
  const vinoAperto = selectedId != null && wines.some(w => w.id === selectedId);
  useEffect(() => {
    if (selectedId != null && !vinoAperto) {
      setSelectedId(null);
      if (onWineClose) onWineClose();   // senza, il FAB resta su "Scheda tecnica"
    }
  }, [selectedId, vinoAperto, onWineClose]);

  const handleClose = () => {
    setSelectedId(null);
    if (onWineClose) onWineClose();
    const el = lastFocusedRef.current;
    if (el) requestAnimationFrame(() => el.focus?.());
  };

  // Chiudere la ricerca azzera anche il testo: una query attiva ma invisibile
  // farebbe sembrare la cantina piu' piccola di com'e'.
  const chiudiRicerca = () => { setRicercaAperta(false); setSearch(""); };

  const tipoAttivo = FILTRI.find(f => f.label === filtro)?.tipo ?? null;

  // 1:N — vino resta in Cantina finche' bottiglie > 0 (garantito a monte)
  const filtered = wines
    .filter(w => tipoAttivo === null || w.tipologia === tipoAttivo)
    .filter(w => {
      const q = search.toLowerCase();
      return !q || w.produttore.toLowerCase().includes(q) || w.vino.toLowerCase().includes(q) || String(w.annata).includes(q) || (w.vitigno || "").toLowerCase().includes(q);
    });

  const totalB = filtered.reduce((a, w) => a + w.bottiglie, 0);
  const totalV = costoGiacenza(filtered);
  const totalMercato = valoreMercatoGiacenza(filtered);

  return (
    <>
      <div style={{ padding: "0 20px 24px", fontFamily: T.sans, color: T.testo }}>

        {/* ── Intestazione editoriale ── */}
        {/* Il "+" del design stava qui, in alto a destra. Spostato nel bottone
            flottante di App.jsx il 21/09/2026: l'intestazione non e'
            appiccicata, quindi scorreva via e restava irraggiungibile per il
            98% della lista. Misurato: dopo 1200px di scroll stava a y=-1191,
            e la cantina vera e' alta circa 11.500px. */}
        {/* Stessa gabbia dell'intestazione di Bevuti (21/09/2026): 16px sopra
            e sotto, e la riga forte in fondo. I 30px sopra erano tutto lo
            spazio bianco fra la barra e l'occhiello — sopra l'header non c'e'
            altro padding da cui attingere — e Omar li ha voluti ridotti. Li' sotto il titolo c'e' un
            paragrafo, qui no e non va aggiunto: lo stacco dalla riga lo fa il
            padding, quindi il margine sotto l'h2 resta 0. */}
        <header style={{ padding: "16px 0 16px", borderBottom: `1px solid ${T.testo}` }}>
          <p style={{ ...OCCHIELLO }}>Collezione privata{rev && <span style={{ opacity: .65 }}> · {rev}</span>}</p>
          <h2 style={{ margin: "9px 0 0", fontFamily: T.serif, fontSize: 27, fontWeight: 400, lineHeight: 1, letterSpacing: "-.01em" }}>La mia cantina</h2>
        </header>

        {/* ── Riepilogo ── */}
        {/* Il design aveva due voci a destra (referenze, valore). Qui sono tre:
            costo d'acquisto e stima di mercato sono grandezze diverse (A1) e
            nessuna delle due va persa. La media per bottiglia stava sotto il
            numerone: tolta il 21/09/2026, era la terza cifra in euro a pochi
            centimetri dalle altre due e non aggiungeva niente. */}
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(132px,.85fr)", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.divisoreMedio}` }}>
          {/* Il centraggio ora lo fa l'`alignItems: center` della sezione, come
              in Bevuti. Serve: la colonna di destra e' alta 90px e detta la
              riga, questa cella solo 55, e con l'`end` di prima restava con
              36px di vuoto sopra e 1 sotto. C'e' un test che lo blocca. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span data-testid="tot-bottiglie" style={{ fontFamily: T.serif, fontSize: 55, lineHeight: 1, fontWeight: 300, color: T.accento, letterSpacing: "-.03em" }}>{totalB}</span>
            <span style={{ color: T.secondario, fontSize: 12, lineHeight: 1 }}>bottiglie</span>
          </div>
          <div style={{ display: "grid", borderLeft: `1px solid ${T.divisoreMedio}` }}>
            {[
              { id: "tot-referenze", l: "referenze", v: filtered.length },
              { id: "tot-costo",     l: "costo",     v: `${totalV} €` },
              { id: "tot-valore",    l: "valore",    v: `${totalMercato} €` },
            ].map((r, i) => (
              <div key={r.l} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 30, padding: "0 0 0 14px", borderTop: i === 0 ? "none" : `1px solid ${T.divisoreMedio}` }}>
                <span style={{ color: T.secondario, fontSize: 11 }}>{r.l}</span>
                <b data-testid={r.id} style={{ fontFamily: T.serif, color: T.accento, fontSize: 11, fontWeight: 500 }}>{r.v}</b>
              </div>
            ))}
          </div>
        </section>

        {/* ── Ricerca e filtri, appiccicati in alto ── */}
        <section style={{ position: "sticky", top: 0, zIndex: 20, margin: "0 -20px", padding: "14px 20px 8px", background: "rgba(255,252,247,.94)", backdropFilter: "blur(12px)" }}>
          {ricercaAperta ? (
            <div style={{ height: 46, display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${T.testo}` }}>
              <IconaLente color={T.accento} />
              {/* 16px: sotto, Safari su iOS zooma al tap. Il design diceva 15. */}
              <input value={search} onChange={e => setSearch(e.target.value)} autoFocus
                placeholder="Produttore, vino, annata, uva" aria-label="Cerca nella cantina"
                style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontFamily: T.sans, fontSize: 16, color: T.testo }} />
              <button type="button" onClick={chiudiRicerca} aria-label="Chiudi ricerca"
                style={{ width: 34, height: 34, display: "grid", placeItems: "center", border: 0, background: "transparent", color: T.secondarioAlt, cursor: "pointer" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
          ) : (
            <div style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h3 style={{ margin: 0, fontFamily: T.serif, fontSize: 21, fontWeight: 400 }}>Le tue bottiglie</h3>
              <button type="button" onClick={() => setRicercaAperta(true)} aria-label="Cerca"
                style={{ width: 66, height: 31, display: "grid", placeItems: "center", border: `1px solid ${T.divisore}`, borderRadius: T.pillola, background: "transparent", color: T.accento, cursor: "pointer" }}>
                <IconaLente size={16} />
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: 7, overflowX: "auto", margin: "6px -20px 0", padding: "2px 20px 8px", scrollbarWidth: "none" }}>
            {FILTRI.map(f => (
              <Chip key={f.label} label={f.label} attivo={filtro === f.label}
                onClick={() => { setFiltro(f.label); setSelectedId(null); }} />
            ))}
          </div>
        </section>

        {/* ── Righe ── */}
        <section aria-live="polite">
          {filtered.length === 0 ? (
            <div style={{ padding: "64px 24px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><CaliceIcon size={26} color={T.tenueAlt} /></div>
              <h4 style={{ margin: 0, fontFamily: T.serif, fontSize: 23, fontWeight: 400 }}>Nessuna bottiglia</h4>
              <p style={{ margin: "8px auto 20px", maxWidth: 230, color: T.secondarioAlt, fontSize: 13, lineHeight: 1.55 }}>
                Nessun vino corrisponde a questa ricerca. Prova con un altro produttore o rimuovi il filtro.
              </p>
              <button type="button" onClick={() => { setFiltro("Tutti"); setSearch(""); setRicercaAperta(false); }}
                style={{ height: 42, padding: "0 20px", border: `1px solid ${T.accento}`, background: "transparent", color: T.accento, fontFamily: T.sans, fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer" }}>
                Azzera filtri
              </button>
            </div>
          ) : filtered.map(wine => (
            <WineCard key={wine.id} wine={wine} onOpen={handleOpen(wine.id)} immagine={immagini[wine.id] || null} renderMiniatura={renderMiniatura} formato={formati[wine.id] || null} />
          ))}
        </section>
      </div>

      {selectedId != null && (() => {
        const w = wines.find(x => x.id === selectedId);
        if (!w) return null;
        return (
          <WineDetail key={selectedId} wine={w} onRate={onRate}
            onBevi={onBevi} onElimina={onElimina} onModifica={onModifica} onClose={handleClose}
            renderBottiglia={renderBottiglia}
            />
        );
      })()}
    </>
  );
}
