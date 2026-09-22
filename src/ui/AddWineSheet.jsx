// Foglio "aggiungi vino" del ridisegno (22/09/2026).
//
// Sostituisce due schermate di `ModalAggiungi`: la scelta manuale/foto e il
// form lungo. Qui si inserisce solo l'identità del vino — cinque campi — e il
// resto (prezzo, denominazione, vitigno, note, macerazione, fermentazione,
// malolattica) si aggiunge dopo con "Modifica". Scelta di Omar, opzione B.
//
// `tipologia` c'è perché nel database è obbligatoria con un CHECK sui sei
// valori: senza, il primo inserimento resterebbe muto su un dato che non
// ammette NULL.
//
// Solo presentazione: niente fetch, niente Supabase, niente stato. La foto
// dell'etichetta e il salvataggio arrivano come callback da App.jsx.
//
// Scostamenti dal codice che Omar ha passato, tutti imposti dai vincoli duri:
//   · il `linear-gradient` del pulsante foto → fondo pieno. L'unica eccezione
//     concessa è il velo dell'hero, e vale solo lì
//   · `transition` e `translateY(-1px)` in hover → tolti: nessuna animazione
//     nuova oltre allo slide dello sheet e del dettaglio
//   · input da 14px → 16: sotto i 16 iOS fa zoomare Safari, ed è esattamente
//     il caso per cui il vincolo è stato scritto
//   · hex letterali → token di `theme.js`, che contengono già questa palette

import { T, OCCHIELLO } from "./theme";
import { TIPO } from "./components";

const ETICHETTA = {
  display: "grid", gap: 7, color: T.secondarioAlt, fontSize: 10,
  fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase",
};

// 16px non è negoziabile: vedi l'intestazione.
const CAMPO = {
  width: "100%", boxSizing: "border-box", padding: "11px 0",
  border: 0, borderBottom: `1px solid ${T.divisore}`, background: "transparent",
  outline: 0, fontSize: 16, color: T.testo, fontFamily: T.sans,
  textTransform: "none", letterSpacing: 0,
};

function Chevron({ size = 15, colore = T.oroTesto }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colore}
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export default function AddWineSheet({
  produttore, vino, tipologia, annata, bottiglie,
  onChange,      // (campo, valore) => void
  onFotografa,   // () => void
  onSalva,       // () => void
  onAnnulla,     // () => void
  avviso = null, // nodo opzionale: l'esito del riconoscimento dell'etichetta
}) {
  const pronto = produttore.trim() && vino.trim();

  return (
    <div style={{ padding: "26px 22px 28px", fontFamily: T.sans, color: T.testo, background: T.superficie }}>
      <p style={{ ...OCCHIELLO }}>Nuova bottiglia</p>
      <h3 style={{ margin: "5px 0 6px", fontFamily: T.serif, fontSize: 28, fontWeight: 400 }}>
        Aggiungi alla cantina
      </h3>
      <p style={{ margin: "0 0 18px", color: T.secondarioAlt, fontSize: 13, lineHeight: 1.5 }}>
        Parti dall’identità del vino. Potrai completare i dettagli in seguito.
      </p>

      {/* Lo spazio dove App.jsx mette l'esito del riconoscimento dell'etichetta.
          Arriva già composto: qui non si sa cosa sia un'analisi AI. */}
      {avviso}

      {/* Il pulsante che apre la fotocamera. Fondo pieno, non sfumato. */}
      <button type="button" onClick={onFotografa} className="foglio-foto"
        style={{
          width: "100%", display: "flex", gap: 14, alignItems: "center",
          padding: "15px 16px", textAlign: "left",
          border: `1px solid ${T.divisore}`, borderRadius: 14,
          background: T.superficieAlt, cursor: "pointer",
        }}>
        <span style={{ flex: "none", width: 40, height: 40, display: "grid", placeItems: "center", borderRadius: "50%", background: T.accento }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={T.superficie}
            strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.4 8.2h2.7l1.3-2.1h6.8l1.3 2.1h2.7a1.4 1.4 0 0 1 1.4 1.4v8a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 17.6v-8a1.4 1.4 0 0 1 1.4-1.4Z" />
            <circle cx="12" cy="13.5" r="3.3" />
          </svg>
        </span>
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: "block", fontFamily: T.serif, fontSize: 16, fontWeight: 400 }}>
            Fotografa l’etichetta
          </strong>
          <span style={{ display: "block", marginTop: 2, color: T.testoUnita, fontSize: 11 }}>
            oppure compila qui sotto
          </span>
        </span>
        <span style={{ flex: "none", marginLeft: "auto", display: "flex" }}><Chevron /></span>
      </button>

      <label style={{ ...ETICHETTA, marginTop: 20 }}>
        Produttore
        <input value={produttore} onChange={e => onChange("produttore", e.target.value)}
          placeholder="Es. Giuseppe Rinaldi" style={CAMPO} />
      </label>

      <label style={{ ...ETICHETTA, marginTop: 16 }}>
        Nome del vino
        <input value={vino} onChange={e => onChange("vino", e.target.value)}
          placeholder="Es. Barolo Brunate" style={CAMPO} />
      </label>

      {/* Le etichette mostrate sono quelle del ridisegno — "Bollicine" e "Rosé" —
          ma il valore salvato resta uno dei sei del CHECK. Nessun DDL. */}
      <label style={{ ...ETICHETTA, marginTop: 16 }}>
        Tipologia
        <span style={{ position: "relative", display: "block" }}>
          <select value={tipologia} onChange={e => onChange("tipologia", e.target.value)}
            style={{ ...CAMPO, appearance: "none", WebkitAppearance: "none", paddingRight: 22, borderRadius: 0 }}>
            {Object.keys(TIPO).map(t => <option key={t} value={t}>{TIPO[t].etichetta}</option>)}
          </select>
          <span aria-hidden="true" style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%) rotate(90deg)", display: "flex", pointerEvents: "none" }}>
            <Chevron size={14} />
          </span>
        </span>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 16 }}>
        <label style={ETICHETTA}>
          Annata
          <input value={annata} onChange={e => onChange("annata", e.target.value)}
            inputMode="numeric" placeholder="2019" style={CAMPO} />
        </label>
        <label style={ETICHETTA}>
          Bottiglie
          <input value={bottiglie} onChange={e => onChange("bottiglie", e.target.value)}
            type="number" min="1" style={CAMPO} />
        </label>
      </div>

      {/* Stessa coppia di `ModalBevi`: 1fr 2fr, l'uscita a sinistra col solo
          bordo, l'azione a destra piena. Chiudere il foglio era gia' possibile
          toccando fuori, ma non si vedeva. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 26 }}>
        <button type="button" onClick={onAnnulla}
          style={{
            height: 52, border: `1px solid ${T.divisore}`, borderRadius: 14,
            background: "transparent", color: T.testo,
            fontFamily: T.sans, fontSize: 12, fontWeight: 600,
            letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer",
          }}>
          Annulla
        </button>
        <button type="button" onClick={onSalva} disabled={!pronto}
          style={{
            height: 52, border: 0, borderRadius: 14,
            background: pronto ? T.accento : T.divisore,
            color: pronto ? T.superficie : T.tenue,
            fontFamily: T.sans, fontSize: 12, fontWeight: 600,
            letterSpacing: ".14em", textTransform: "uppercase",
            cursor: pronto ? "pointer" : "default",
          }}>
          Continua
        </button>
      </div>
    </div>
  );
}
