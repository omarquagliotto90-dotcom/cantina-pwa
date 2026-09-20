// Dominio puro: normalizzazioni, calcolo valore e anagrafica produttori.
//
// Funzioni spostate da App.jsx senza modifiche. Sono pure e senza I/O: qui non
// si fa fetch, non si conosce Supabase, non si tocca lo stato di React. Esiste
// perché le stesse formule servono sia al controller (App.jsx) sia alle
// schermate in ui/, che non possono importare da App.jsx (ciclo).

// Risolve una bevuta al vino corrente in cantina, o ricostruisce un vino
// "fantasma" dallo snapshot storico se è stato cancellato (F5, 1:N).
export function resolveWine(wineMap, b) {
  return wineMap[b.id] || (b.produttore ? {
    id: b.id, produttore: b.produttore, vino: b.vino, annata: b.annata || "",
    tipologia: b.tipologia || "Bianco fermo", prezzo: b.prezzo || 0, bottiglie: 0,
    vitigno: "—", macerazione: "—", fermentazione: "—", malolattica: "—", note: "",
  } : null);
}

// Valore di mercato stimato di UNA bottiglia: stima AI se presente,
// altrimenti fallback al prezzo d'acquisto (migliore stima disponibile).
export function valoreBottiglia(wine) {
  if (!wine) return 0;
  return (wine.valore || 0) || (wine.prezzo || 0);
}

// Costo d'acquisto totale della giacenza (prezzo pagato × bottiglie possedute).
export function costoGiacenza(wines) {
  return wines.reduce((a, w) => a + w.prezzo * w.bottiglie, 0);
}

// Valore di mercato totale della giacenza, con fallback al prezzo d'acquisto
// per le bottiglie non ancora valutate dall'AI (mai contate a zero).
export function valoreMercatoGiacenza(wines) {
  return wines.reduce((a, w) => a + valoreBottiglia(w) * w.bottiglie, 0);
}

// Formatta una data (Date o stringa ISO YYYY-MM-DD) nello stile italiano
// usato per le bevute ("07 giugno 2025").
export function formatDataIt(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(`${date}T00:00:00`);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

// ─── Anagrafica produttori (P3) ──────────────────────────────────────────────
// Caricata una volta da `useCantinaData` e tenuta qui a livello di modulo, come
// già si fa per le cache immagini: evita di far passare la lista come prop
// attraverso Lista → Card → Detail solo per leggere due campi.
//
// Sostituisce i Set hardcoded di Slow Wine: la chiocciola ora è
// `produttori.slow_chiocciola`, aggiornabile con un UPDATE invece di un deploy.
// (`SW_VINO_BOTTIGLIA` era dichiarato e mai letto: rimosso.)
const produttoriByNome = new Map();

const normNome = (s) => (s || "").trim().toLowerCase();

export function setProduttori(righe) {
  produttoriByNome.clear();
  for (const p of righe) produttoriByNome.set(p.nome_norm || normNome(p.nome), p);
}

export const produttoreDi = (nome) => produttoriByNome.get(normNome(nome)) || null;

export const hasCantina = (produttore) => !!produttoreDi(produttore)?.slow_chiocciola;

export function getGoogleFallback(produttore, vino) {
  const q = encodeURIComponent(`${produttore} ${vino || ""} cantina sito ufficiale`);
  return `https://www.google.com/search?q=${q}`;
}
