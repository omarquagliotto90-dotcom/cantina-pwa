// Schermata Statistiche. Solo presentazione: riceve i dati come props, non
// fa fetch, non conosce Supabase, non muta nulla.
//
// Ridisegno 2026 (C4), da `design/La Mia Cantina.dc.html`: un ritratto della
// collezione a sezioni, divise da filetti, senza card.

import { T, OCCHIELLO } from "./theme";
import { TIPO } from "./components";
import { costoGiacenza, valoreMercatoGiacenza, valoreBottiglia, resolveWine, hasCantina } from "./domain";

// Soglie delle fasce di prezzo. Il design proponeva 25/50/100, ma su questa
// cantina darebbe 107/9/1/1: una barra piena e tre invisibili. Con queste
// (quelle gia' in uso) la distribuzione si legge: 63/30/6/1.
const FASCE = [
  { label: "< 15 €",   dentro: p => p < 15 },
  { label: "15–30 €",  dentro: p => p >= 15 && p < 30 },
  { label: "30–60 €",  dentro: p => p >= 30 && p < 60 },
  { label: "> 60 €",   dentro: p => p >= 60 },
];

function Sezione({ occhiello, titolo, children, ultima = false }) {
  return (
    <section style={{ padding: "30px 0", borderBottom: ultima ? "none" : `1px solid ${T.divisoreMedio}` }}>
      <p style={{ ...OCCHIELLO }}>{occhiello}</p>
      {titolo && <h3 style={{ margin: "5px 0 22px", fontFamily: T.serif, fontSize: 24, fontWeight: 400 }}>{titolo}</h3>}
      {children}
    </section>
  );
}

export default function TabStatistiche({ wines, bevuti }) {
  // 1:N — cantina = tutti i vini passati (già filtrati bottiglie > 0 a monte)
  const cantina = wines;
  const wineMap = Object.fromEntries(wines.map(w => [w.id, w]));
  const totB = cantina.reduce((a, w) => a + w.bottiglie, 0);
  const totV = costoGiacenza(cantina);
  const totMercato = valoreMercatoGiacenza(cantina);
  // F23: stessa formula di "valore consumato" in Bevuti (fallback + snapshot storico per orfani)
  const totBevuto = bevuti.reduce((a, b) => a + valoreBottiglia(resolveWine(wineMap, b)), 0);
  const swCount = cantina.filter(w => hasCantina(w.produttore)).reduce((a, w) => a + w.bottiglie, 0);

  const byTipo = {};
  cantina.forEach(w => { byTipo[w.tipologia] = (byTipo[w.tipologia] || 0) + w.bottiglie; });
  const tipoEntries = Object.entries(byTipo).sort((a, b) => b[1] - a[1]);
  const maxTipo = Math.max(...tipoEntries.map(([, v]) => v), 1);

  const byProd = {};
  cantina.forEach(w => { byProd[w.produttore] = (byProd[w.produttore] || 0) + w.bottiglie; });
  const topProd = Object.entries(byProd).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Le bottiglie senza prezzo restano fuori dalle fasce e si contano a parte.
  // Prima finivano tutte nella piu' bassa, perche' `null < 15` in JavaScript e'
  // vero: 18 bottiglie sconosciute dichiarate "sotto i 15 €".
  const conPrezzo = cantina.filter(w => w.prezzo != null);
  const senzaPrezzo = cantina.filter(w => w.prezzo == null).reduce((a, w) => a + w.bottiglie, 0);
  const fasce = FASCE.map(f => ({
    label: f.label,
    n: conPrezzo.filter(w => f.dentro(w.prezzo)).reduce((a, w) => a + w.bottiglie, 0),
  }));
  const maxFascia = Math.max(...fasce.map(f => f.n), 1);

  // La barra mostra quanto del valore stimato e' gia' stato pagato.
  const quotaCosto = Math.min(100, Math.round((totV / Math.max(1, totMercato)) * 100));

  return (
    <div style={{ padding: "0 20px 24px", fontFamily: T.sans, color: T.testo }}>

      <header style={{ padding: "30px 0 28px", borderBottom: `1px solid ${T.testo}` }}>
        <p style={{ ...OCCHIELLO }}>Ritratto della collezione</p>
        <h2 style={{ margin: "6px 0 10px", fontFamily: T.serif, fontSize: 46, fontWeight: 300, lineHeight: 1, letterSpacing: "-.02em" }}>Statistiche</h2>
        <p style={{ margin: 0, maxWidth: 280, color: T.secondario, fontFamily: T.serif, fontSize: 16, lineHeight: 1.45 }}>
          Una lettura della cantina, costruita bottiglia dopo bottiglia.
        </p>
      </header>

      {/* ── Valore ── */}
      <section style={{ padding: "30px 0 28px", borderBottom: `1px solid ${T.divisoreMedio}` }}>
        <p style={{ ...OCCHIELLO }}>Valore della cantina</p>
        <strong data-testid="stat-mercato" style={{ display: "block", margin: "10px 0 20px", fontFamily: T.serif, fontSize: 44, fontWeight: 300, lineHeight: 1, letterSpacing: "-.02em" }}>~{totMercato} €</strong>
        <div style={{ height: 6, background: T.barraFondo }}>
          <span style={{ display: "block", height: "100%", width: `${quotaCosto}%`, background: T.accento }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, color: T.secondarioAlt, fontSize: 11, lineHeight: 1.45 }}>
          <span>Acquisti<br /><b data-testid="stat-costo" style={{ color: T.testo, fontSize: 13, fontWeight: 600 }}>~{totV} €</b></span>
          <span style={{ textAlign: "right" }}>Stima attuale<br /><b style={{ color: T.testo, fontSize: 13, fontWeight: 600 }}>~{totMercato} €</b></span>
        </div>
      </section>

      {/* ── I tre numeri ── */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", padding: "20px 0", borderBottom: `1px solid ${T.divisoreMedio}` }}>
        {[
          { id: "stat-bottiglie", v: totB, l: "bottiglie" },
          { id: "stat-referenze", v: cantina.length, l: "referenze" },
          { id: "stat-bevute",    v: bevuti.length, l: "bevute", sotto: totBevuto ? `~${totBevuto} €` : null },
        ].map((n, i) => (
          <div key={n.l} style={{ paddingLeft: i === 0 ? 0 : 14, borderLeft: i === 0 ? "none" : `1px solid ${T.divisoreMedio}` }}>
            <strong data-testid={n.id} style={{ display: "block", fontFamily: T.serif, fontSize: 31, fontWeight: 300 }}>{n.v}</strong>
            <span style={{ display: "block", marginTop: 2, color: T.secondarioAlt, fontSize: 11 }}>{n.l}</span>
            {n.sotto && <span style={{ display: "block", color: T.tenue, fontSize: 11 }}>{n.sotto}</span>}
          </div>
        ))}
      </section>

      {/* ── Slow Wine. Il design non la prevede, ma toglierla perderebbe un dato. ── */}
      <section style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "20px 0", borderBottom: `1px solid ${T.divisoreMedio}` }}>
        <div>
          <p style={{ ...OCCHIELLO }}>Riconoscimenti</p>
          <p style={{ margin: "5px 0 0", fontFamily: T.serif, fontSize: 16 }}>Da cantine premiate Slow Wine</p>
        </div>
        <strong data-testid="stat-slowwine" style={{ fontFamily: T.serif, fontSize: 31, fontWeight: 300, color: T.accento, whiteSpace: "nowrap" }}>{swCount}</strong>
      </section>

      {/* ── Composizione ── */}
      <Sezione occhiello="Composizione" titolo="Tipi di vino">
        {tipoEntries.map(([tipo, count]) => {
          const t = TIPO[tipo];
          const pct = Math.round((count / totB) * 100);
          return (
            <div key={tipo} style={{ marginBottom: 15 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                <span>{t?.etichetta || tipo}</span>
                <b style={{ fontWeight: 500 }}>{count} · {pct}%</b>
              </div>
              <div style={{ height: 5, background: T.barraFondo }}>
                <span style={{ display: "block", height: "100%", width: `${(count / maxTipo) * 100}%`, background: t?.colore || T.accento }} />
              </div>
            </div>
          );
        })}
      </Sezione>

      {/* ── Produttori ── */}
      <Sezione occhiello="Più presenti" titolo="Produttori">
        {topProd.map(([prod, count], i) => (
          <div key={prod} style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "13px 0", borderBottom: i === topProd.length - 1 ? "none" : `1px solid ${T.divisoreTenue}` }}>
            <span style={{ color: T.oro, fontFamily: T.serif, fontSize: 13 }}>{i + 1}</span>
            <p style={{ margin: 0, fontFamily: T.serif, fontSize: 16, overflowWrap: "anywhere" }}>{prod}</p>
            <strong style={{ fontFamily: T.serif, fontSize: 18, fontWeight: 400 }}>{count}</strong>
          </div>
        ))}
      </Sezione>

      {/* ── Fasce di prezzo ── */}
      <Sezione occhiello="Prezzo d'acquisto" titolo="Una cantina da bere" ultima>
        <div style={{ height: 140, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, alignItems: "end", marginTop: 22, borderBottom: `1px solid ${T.testo}` }}>
          {fasce.map(f => (
            <span key={f.label} title={`${f.n} bottiglie`} style={{ display: "block", background: T.accento, opacity: .88, height: `${Math.max(4, Math.round((f.n / maxFascia) * 100))}%` }} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, paddingTop: 8, color: T.secondarioAlt, fontSize: 10, textAlign: "center" }}>
          {fasce.map(f => <span key={f.label}>{f.label}<br /><b style={{ color: T.testo, fontSize: 11, fontWeight: 600 }}>{f.n}</b></span>)}
        </div>
        {senzaPrezzo > 0 && (
          <p data-testid="stat-senza-prezzo" style={{ margin: "14px 0 0", color: T.tenue, fontSize: 11, lineHeight: 1.45 }}>
            {senzaPrezzo} {senzaPrezzo === 1 ? "bottiglia è" : "bottiglie sono"} senza prezzo e {senzaPrezzo === 1 ? "resta fuori" : "restano fuori"} da queste fasce.
          </p>
        )}
      </Sezione>
    </div>
  );
}
