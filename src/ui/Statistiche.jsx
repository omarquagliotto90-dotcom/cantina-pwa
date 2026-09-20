// Schermata Statistiche. Solo presentazione: riceve i dati come props, non
// fa fetch, non conosce Supabase, non muta nulla.

import { M3 } from "./theme";
import { TIPO, TipoLabel, AnalyticsIcon, TrophyIcon } from "./components";
import { costoGiacenza, valoreMercatoGiacenza, valoreBottiglia, resolveWine, hasCantina } from "./domain";

// ─── Tab: Statistiche ─────────────────────────────────────────────────────────
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
  const maxProd = Math.max(...topProd.map(([, v]) => v), 1);

  const fasce = { "< 15€": 0, "15–30€": 0, "30–60€": 0, "> 60€": 0 };
  cantina.forEach(w => {
    if (w.prezzo < 15) fasce["< 15€"] += w.bottiglie;
    else if (w.prezzo < 30) fasce["15–30€"] += w.bottiglie;
    else if (w.prezzo < 60) fasce["30–60€"] += w.bottiglie;
    else fasce["> 60€"] += w.bottiglie;
  });

  const Card = ({ children, title }) => (
    <div style={{ background: M3.surfaceContainer, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
      {title && <div style={{ fontSize: 11, color: M3.onSurfaceVariant, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "'Roboto', sans-serif", marginBottom: 12, fontWeight: 500 }}>{title}</div>}
      {children}
    </div>
  );

  return (
    <div style={{ padding: "12px 16px 100px" }}>
      <Card>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-around", flexWrap: "wrap" }}>
          {[{ l: "Bottiglie", v: totB, s: "in cantina" }, { l: "Costo", v: `~${totV}€`, s: "acquisto" }, { l: "Mercato", v: `~${totMercato}€`, s: "stimato" }, { l: "Referenze", v: cantina.length }, { l: "Bevuti", v: bevuti.length, s: totBevuto ? `~${totBevuto}€` : "" }].map(s => (
            <div key={s.l} style={{ flex: "1 1 70px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: M3.primary, fontFamily: "'Roboto', sans-serif" }}>{s.v}</div>
              <div style={{ fontSize: 11, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", fontWeight: 500 }}>{s.l}</div>
              {s.s && <div style={{ fontSize: 10, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>{s.s}</div>}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ color: "#2E7D32" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 22c1-4 4-8 10-10C18 10 22 6 22 2c-4 0-8 4-10 10C10 6 6 2 2 2c0 4 4 8 10 10"/></svg></div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#2E7D32", fontFamily: "'Roboto', sans-serif" }}>{swCount} bottiglie</div>
            <div style={{ fontSize: 12, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>da cantine premiate Slow Wine 2025</div>
          </div>
        </div>
      </Card>
      <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><AnalyticsIcon size={13} /> Distribuzione per tipologia</span>}>
        {tipoEntries.map(([tipo, count]) => {
          const t = TIPO[tipo];
          const pct = Math.round((count / totB) * 100);
          return (
            <div key={tipo} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <TipoLabel tipo={tipo} size={14} color={M3.onSurface} /> {tipo}
                </span>
                <span style={{ fontSize: 13, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>{count} · {pct}%</span>
              </div>
              <div style={{ height: 8, background: M3.surfaceContainerHighest, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(count / maxTipo) * 100}%`, background: t?.indicator || M3.primary, borderRadius: 4 }} />
              </div>
            </div>
          );
        })}
      </Card>
      <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><TrophyIcon size={13} /> Top 5 produttori</span>}>
        {topProd.map(([prod, count], i) => (
          <div key={prod} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: i === 0 ? M3.primaryContainer : M3.surfaceContainerHighest, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: i === 0 ? M3.onPrimaryContainer : M3.onSurfaceVariant, flexShrink: 0 }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 13, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prod}</span>
                <span style={{ fontSize: 12, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", flexShrink: 0, marginLeft: 6 }}>{count}</span>
              </div>
              <div style={{ height: 6, background: M3.surfaceContainerHighest, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(count / maxProd) * 100}%`, background: M3.primary, borderRadius: 3 }} />
              </div>
            </div>
          </div>
        ))}
      </Card>
      <Card title="💰 Fasce di prezzo">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(fasce).map(([fascia, count]) => (
            <div key={fascia} style={{ flex: "1 1 70px", background: M3.surfaceContainerHigh, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: M3.primary, fontFamily: "'Roboto', sans-serif" }}>{count}</div>
              <div style={{ fontSize: 11, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", fontWeight: 500 }}>{fascia}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
