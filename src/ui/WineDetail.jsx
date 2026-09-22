// Scheda del vino. Solo presentazione: non fa fetch, non conosce Supabase,
// non muta nulla.
//
// Ridisegno 2026 (C5), da `design/La Mia Cantina.dc.html`: **una pagina sola,
// scrollabile, senza tab**. Prima erano quattro (Scheda, Bottiglia, Web, Voto).
//
// Conseguenze, tutte volute e decise il 20/09/2026:
// - il sito del produttore e' un link esterno, non piu' un iframe incorporato
//   (`WebsiteView` sparisce: aveva due bug noti, timeout a 3s e `onLoad`
//   sempre "ok" anche a pagina bianca)
// - il voto si da' con `SliderVoto`, non piu' con `RatingDial`
//
// La foto della bottiglia arriva da App.jsx come render prop `renderBottiglia`,
// perche' cerca e mette in cache: qui non si fa rete.
//
// L'hero ha la foto della regione come sfondo, come nel design. Due note:
// - `produttori.regione` e' stata popolata il 20/09/2026 (77 righe su 84); un
//   produttore senza regione, o una regione senza foto, ricade sul fondo pieno
// - il velo sopra la foto e' l'unico gradiente dell'app. E' un'eccezione
//   decisa il 20/09/2026 e scritta in CLAUDE.md: serve a leggere il titolo,
//   non a decorare. Non e' un precedente per gradienti altrove.

import { useState, useRef, useEffect } from "react";
import { T, OCCHIELLO } from "./theme";
import { TIPO, SliderVoto, CaliceIcon } from "./components";
import { hasCantina, produttoreDi, getGoogleFallback } from "./domain";

// Le foto stanno in `public/regioni/<slug>.jpg`; `public/regioni/README.md`
// spiega nomi e formato. Elencare qui la regione e' cio' che accende la foto:
// una lista esplicita evita una richiesta a vuoto per le regioni che la foto
// non ce l'hanno, e tiene il controllo in un punto solo. E' esportato
// perche' un test verifica che a ogni voce corrisponda un file: un nome
// sbagliato non darebbe errore, la foto semplicemente non apparirebbe.
export const REGIONI_CON_FOTO = [
  "Trentino-Alto Adige",
  "Veneto",
  "Abruzzo",
  "Marche",
  "Umbria",
  "Lombardia",
  // Nessun produttore in Valle d'Aosta al 20/09/2026: la foto c'e' ma
  // resta dormiente finche' non entra in cantina un vino valdostano.
  "Valle d'Aosta",
];

// "Trentino-Alto Adige" -> "trentino-alto-adige"
const slugRegione = (r) => r.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const fotoRegione = (regione) =>
  regione && REGIONI_CON_FOTO.includes(regione) ? `/regioni/${slugRegione(regione)}.jpg` : null;

// Il velo segue il token del fondo invece di ricopiarne il valore: se
// `superficieAlt` cambia, la foto continua a sfumare nel colore giusto.
const rgbDi = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(",");
// Tutto il contenuto dell'hero sta sopra foto e velo. Senza, la foto lo copre.
const sopraFoto = { position: "relative", zIndex: 2 };

const VELO = (() => {
  const c = rgbDi(T.superficieAlt);
  return `linear-gradient(to bottom, rgba(${c},.15) 0%, rgba(${c},.30) 45%, rgba(${c},.93) 62%, rgba(${c},.97) 100%)`;
})();

const IconaIndietro = ({ size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
  </svg>
);
const IconaEsterno = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 7h10v10" /><path d="M7 17 17 7" />
  </svg>
);
const IconaModifica = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const IconaElimina = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
  </svg>
);
const IconaPremio = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={T.oroScuro} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 5V2l-5.89 5.89" /><circle cx="16.6" cy="15.89" r="3" /><circle cx="8.11" cy="7.4" r="3" />
    <circle cx="12.35" cy="11.65" r="3" /><circle cx="13.91" cy="5.85" r="3" /><circle cx="18.15" cy="10.09" r="3" />
    <circle cx="6.56" cy="13.2" r="3" /><circle cx="10.8" cy="17.44" r="3" /><circle cx="5" cy="19" r="3" />
  </svg>
);

const bottoneTondo = {
  width: 40, height: 40, display: "grid", placeItems: "center",
  border: `1px solid ${T.accento}`, borderRadius: "50%",
  background: "rgba(255,252,247,.85)", backdropFilter: "blur(8px)",
  color: T.accento, cursor: "pointer",
};

/** Una riga della tabella "chiave a sinistra, valore a destra". */
function Riga({ etichetta, valore, ultima = false }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "40% 60%", alignItems: "baseline", padding: "11px 0", borderBottom: ultima ? "none" : `1px solid ${T.divisoreTenue}` }}>
      <span style={{ color: T.secondarioAlt, fontSize: 12 }}>{etichetta}</span>
      <span style={{ fontSize: 12, textAlign: "right", color: T.testoDato }}>{valore || "—"}</span>
    </div>
  );
}

function Prosa({ occhiello, testo }) {
  if (!testo) return null;
  return (
    <section style={{ padding: "26px 20px 6px" }}>
      <p style={{ ...OCCHIELLO, marginBottom: 14 }}>{occhiello}</p>
      <p style={{ margin: 0, fontFamily: T.serif, fontSize: 16, lineHeight: 1.5, color: T.testoProsa }}>{testo}</p>
    </section>
  );
}

export default function WineDetail({ wine, bevutoInfo = null, ratings = {}, onRate, onBevi, onElimina, onModifica, onClose, onInitClose, renderBottiglia }) {
  const t = TIPO[wine.tipologia];
  const cantinaSW = hasCantina(wine.produttore);
  const vinoSW = !!wine.slowVinoBott;
  // P5: il voto e' quello della degustazione aperta. `ratings` resta come
  // prop perche' la Cantina la passa ancora, ma qui non serve piu': lo slider
  // esiste solo quando `bevutoInfo` c'e', cioe' solo aprendo da Bevuti.
  const currentRating = bevutoInfo?.rating || 0;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const produttore = produttoreDi(wine.produttore);
  const sito = produttore?.sito || getGoogleFallback(wine.produttore, wine.vino);
  const foto = fotoRegione(produttore?.regione);
  const origine = [wine.annata, wine.denominazione !== "n.d." ? wine.denominazione : null].filter(Boolean).join(" · ");
  const giacenza = wine.prezzo != null ? wine.prezzo * wine.bottiglie : null;

  const overlayRef = useRef(null);
  const backBtnRef = useRef(null);
  const pushedRef = useRef(false);
  const closingRef = useRef(false);

  // Identico a prima: lo swipe-back di iOS smonta subito, senza animazione di
  // chiusura. Toccarlo rimetterebbe il fantasma che il fix ha tolto.
  useEffect(() => {
    if (!pushedRef.current) { window.history.pushState({ wineDetail: true }, ""); pushedRef.current = true; }
    const onPop = () => { onInitClose?.(); closingRef.current = true; onClose?.(); };
    window.addEventListener("popstate", onPop);
    const raf = requestAnimationFrame(() => backBtnRef.current?.focus());
    return () => { window.removeEventListener("popstate", onPop); cancelAnimationFrame(raf); };
  }, []);

  const requestClose = () => { if (closingRef.current) return; window.history.back(); };
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
      onKeyDown={onOverlayKeyDown}
      style={{ position: "fixed", inset: 0, zIndex: 45, background: T.superficie, display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top)", fontFamily: T.sans, color: T.testo, animation: "slideInX 300ms cubic-bezier(0.05,0.7,0.1,1) both" }}>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", position: "relative" }}>

        {/* ── Barra flottante ── */}
        <div style={{ position: "absolute", zIndex: 6, top: 0, left: 0, right: 0, height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px" }}>
          <button ref={backBtnRef} type="button" onClick={requestClose} aria-label="Indietro" style={bottoneTondo}>
            <IconaIndietro />
          </button>
          <a href={sito} target="_blank" rel="noreferrer" aria-label="Sito del produttore" style={{ ...bottoneTondo, textDecoration: "none" }}>
            <IconaEsterno size={16} />
          </a>
        </div>

        {/* ── Hero. Con la foto della regione dietro, quando c'e'. ── */}
        <section style={{ position: "relative", padding: "70px 22px 26px", background: T.superficieAlt, textAlign: "center", overflow: "hidden" }}>
          {foto && (
            <>
              {/* Decorative: il nome della regione e' gia' scritto qui sotto, quindi
                  per un lettore di schermo la foto non aggiunge nulla. */}
              <div aria-hidden="true" data-testid="hero-foto" style={{ position: "absolute", inset: 0, zIndex: 0, backgroundImage: `url(${foto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
              <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 1, background: VELO, pointerEvents: "none" }} />
            </>
          )}
          <div style={{ ...sopraFoto, height: 264, display: "grid", placeItems: "center", marginBottom: 6 }}>
            {renderBottiglia ? renderBottiglia(wine, true) : null}
          </div>
          <p style={{ ...sopraFoto, margin: 0, color: T.accento, fontSize: 15, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase" }}>{wine.produttore}</p>
          <h2 style={{ ...sopraFoto, margin: "8px auto 0", maxWidth: 320, fontFamily: T.serif, fontSize: 25, fontWeight: 300, lineHeight: 1.02, letterSpacing: "-.02em" }}>{wine.vino}</h2>
          {origine && <p style={{ ...sopraFoto, margin: "10px 0 0", color: T.testoOrigine, fontSize: 13 }}>{origine}</p>}
          {produttore?.regione && <p style={{ ...sopraFoto, margin: "8px 0 0", color: T.oroCaldo, fontSize: 10, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase" }}>{produttore.regione}</p>}
          {bevutoInfo && (
            <p style={{ ...sopraFoto, margin: "12px 0 0", color: T.secondarioAlt, fontSize: 12 }}>Bottiglia aperta il <b style={{ color: T.testo }}>{bevutoInfo.data}</b></p>
          )}
        </section>

        {/* ── Profilo ── */}
        <Prosa occhiello="Il vino" testo={wine.note} />
        <section style={{ padding: "20px 20px 6px" }}>
          <p style={{ ...OCCHIELLO, marginBottom: 6 }}>Profilo</p>
          <Riga etichetta="Tipo" valore={t?.etichetta || wine.tipologia} />
          <Riga etichetta="Denominazione" valore={wine.denominazione !== "n.d." ? wine.denominazione : null} />
          <Riga etichetta="Vitigno" valore={wine.vitigno} ultima />
        </section>

        <section style={{ padding: "20px 20px 6px" }}>
          <p style={{ ...OCCHIELLO, marginBottom: 6 }}>Vinificazione</p>
          <Riga etichetta="Macerazione" valore={wine.macerazione !== "—" ? wine.macerazione : null} />
          <Riga etichetta="Fermentazione" valore={wine.fermentazione !== "—" ? wine.fermentazione : null} />
          {/* "Legno" e non "Malolattica" come nel design: e' l'etichetta con cui
              questi valori sono stati inseriti finora, e rietichettarli
              cambierebbe il significato di dati gia' scritti. */}
          <Riga etichetta="Legno" valore={wine.malolattica !== "—" ? wine.malolattica : null} ultima />
        </section>

        <Prosa occhiello="La cantina" testo={wine.note_cantina} />
        {bevutoInfo?.nota && <Prosa occhiello="Nota di degustazione" testo={bevutoInfo.nota} />}

        {/* ── Riconoscimenti ── */}
        {(cantinaSW || vinoSW) && (
          <div style={{ margin: "20px 20px 0", padding: "16px 18px", background: T.superficieAlt, borderRadius: T.raggio }}>
            <p style={{ ...OCCHIELLO, marginBottom: 12 }}>Riconoscimenti</p>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <IconaPremio />
              <div>
                <span style={{ color: T.secondarioAlt, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase" }}>Slow Wine</span>
                <p style={{ margin: "2px 0 0", fontFamily: T.serif, fontSize: 17 }}>
                  {[cantinaSW && "Cantina premiata", vinoSW && "Vino premiato"].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Sito ── */}
        <div style={{ padding: "22px 20px 0" }}>
          <a href={sito} target="_blank" rel="noreferrer"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, padding: "0 16px", border: `1px solid ${T.accento}`, borderRadius: T.raggio, color: T.accento, fontSize: 13, textDecoration: "none" }}>
            {produttore?.sito ? "Sito del produttore" : "Cerca il produttore"}
            <IconaEsterno />
          </a>
        </div>

        {/* ── I quattro numeri ── */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", marginTop: 22, borderTop: `1px solid ${T.divisoreMedio}`, borderBottom: `1px solid ${T.divisoreMedio}` }}>
          {[
            [{ l: "Acquisto", v: wine.prezzo != null ? `${wine.prezzo} €` : "—", forte: false },
             { l: "Valore",   v: wine.valore != null ? `${wine.valore} €` : "—", forte: true }],
            [{ l: "Bottiglie", v: bevutoInfo ? "—" : wine.bottiglie, forte: false },
             { l: "Giacenza",  v: bevutoInfo || giacenza == null ? "—" : `${giacenza} €`, forte: true }],
          ].map((colonna, c) => (
            <div key={c} style={{ display: "grid", gridTemplateRows: "1fr 1fr", padding: "6px 0", borderLeft: c === 1 ? `1px solid ${T.divisoreMedio}` : "none" }}>
              {colonna.map((n, r) => (
                <div key={n.l} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 18px", borderTop: r === 1 ? `1px solid ${T.divisoreTenue}` : "none" }}>
                  <p style={{ margin: 0, ...OCCHIELLO, fontSize: 9, letterSpacing: ".16em" }}>{n.l}</p>
                  <span style={{ fontFamily: T.serif, fontSize: 20, lineHeight: 1, color: n.forte ? T.accento : T.testo }}>{n.v}</span>
                </div>
              ))}
            </div>
          ))}
        </section>

        {/* ── Voto. Il design non lo prevede nella scheda, ma senza si potrebbe
            solo dare il voto bevendo, mai correggerlo dopo. ── */}
        {bevutoInfo && (
          <section style={{ padding: "26px 20px 6px" }}>
            <p style={{ ...OCCHIELLO }}>La tua valutazione</p>
            <SliderVoto value={currentRating} onChange={(v) => onRate(bevutoInfo.uid, v)} />
          </section>
        )}

        {/* ── Azioni ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "18px 20px 0" }}>
          <button type="button" onClick={() => onModifica(wine)}
            style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1px solid ${T.divisore}`, borderRadius: T.raggio, background: "transparent", color: T.testo, fontFamily: T.sans, fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer" }}>
            <IconaModifica /> Modifica
          </button>
          <button type="button" onClick={() => setConfirmDelete(true)}
            style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1px solid ${T.accentoBordo}`, borderRadius: T.raggio, background: "transparent", color: T.accento, fontFamily: T.sans, fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer" }}>
            <IconaElimina /> {bevutoInfo ? "Riporta" : "Elimina"}
          </button>
        </div>

        {confirmDelete && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "14px 20px 0" }}>
            <span style={{ flex: 1, fontSize: 12, color: T.secondarioAlt, lineHeight: 1.4 }}>
              {bevutoInfo ? "Riporta questa bottiglia in cantina?" : wine.bottiglie > 1 ? `Rimuovi 1 bottiglia (rimangono ${wine.bottiglie - 1})?` : "Rimuovi l'ultima bottiglia?"}
            </span>
            <button type="button" onClick={() => setConfirmDelete(false)}
              style={{ padding: "8px 14px", borderRadius: T.raggio, border: `1px solid ${T.divisore}`, background: "transparent", color: T.secondarioAlt, fontFamily: T.sans, fontSize: 12, cursor: "pointer" }}>No</button>
            <button type="button" onClick={() => { onElimina(wine); setConfirmDelete(false); }}
              style={{ padding: "8px 14px", borderRadius: T.raggio, border: "none", background: T.accento, color: T.superficie, fontFamily: T.sans, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              {bevutoInfo ? "Sì, riporta" : "Sì, elimina"}
            </button>
          </div>
        )}

        <div style={{ height: bevutoInfo ? 40 : 104 }} />
      </div>

      {/* ── Azione primaria, ancorata in basso ── */}
      {!bevutoInfo && (
        <div style={{ flexShrink: 0, padding: "12px 16px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))", background: T.superficie, borderTop: `1px solid ${T.divisoreMedio}` }}>
          <button type="button" onClick={() => onBevi(wine.id)}
            style={{ width: "100%", height: 52, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, border: 0, borderRadius: T.raggio, background: T.accento, color: T.superficie, fontFamily: T.sans, fontSize: 12, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", cursor: "pointer" }}>
            <CaliceIcon size={16} color="currentColor" width={1.5} /> Segna come bevuto
          </button>
        </div>
      )}
    </div>
  );
}
