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

// ─── Rifilo del margine delle foto di bottiglia ───────────────────────────────
// Quanto un pixel puo' discostarsi dal fondo e contare ancora come fondo.
// Alto abbastanza da assorbire la compressione JPEG attorno alla bottiglia,
// basso abbastanza da non mangiare un'etichetta chiara.
const TOLLERANZA = 18;

// Seconda passata dello scontorno: vedi `recuperaTasche`. La tolleranza e' piu'
// larga perche' deve arrivare a coprire l'ombra, che e' fondo anch'essa ma piu'
// scura; la quota di contorno e' cio' che impedisce di mangiare un'etichetta.
const TOLLERANZA_RESIDUO = TOLLERANZA * 3;
const QUOTA_CONTORNO_LIBERO = 0.7;

/**
 * Riquadro che contiene tutto cio' che non e' fondo.
 * `null` quando non c'e' niente da rifilare: fondo non uniforme (foto
 * ambientata), oppure margine gia' trascurabile. Funzione pura su ImageData,
 * verificata in `e2e/rifilo.spec.mjs`.
 */
export function riquadroContenuto(dati, larghezza, altezza) {
  const px = (x, y) => (y * larghezza + x) * 4;
  const angoli = [[0, 0], [larghezza - 1, 0], [0, altezza - 1], [larghezza - 1, altezza - 1]]
    .map(([x, y]) => { const i = px(x, y); return [dati[i], dati[i + 1], dati[i + 2], dati[i + 3]]; });

  // Se gli angoli non si somigliano non c'e' un fondo uniforme da togliere.
  const trasparente = angoli.every(a => a[3] < 16);
  if (!trasparente) {
    const [r0, g0, b0] = angoli[0];
    const concordi = angoli.every(([r, g, b]) =>
      Math.abs(r - r0) <= TOLLERANZA && Math.abs(g - g0) <= TOLLERANZA && Math.abs(b - b0) <= TOLLERANZA);
    if (!concordi) return null;
  }

  const [rf, gf, bf] = angoli[0];
  const eFondo = (i) => trasparente
    ? dati[i + 3] < 16
    : dati[i + 3] < 16 || (Math.abs(dati[i] - rf) <= TOLLERANZA &&
                           Math.abs(dati[i + 1] - gf) <= TOLLERANZA &&
                           Math.abs(dati[i + 2] - bf) <= TOLLERANZA);

  let sx = larghezza, dx = -1, su = altezza, giu = -1;
  for (let y = 0; y < altezza; y++) {
    for (let x = 0; x < larghezza; x++) {
      if (eFondo(px(x, y))) continue;
      if (x < sx) sx = x;
      if (x > dx) dx = x;
      if (y < su) su = y;
      if (y > giu) giu = y;
    }
  }
  if (dx < 0) return null;                       // tutto fondo: immagine vuota

  // Meno del 3% di margine su ogni lato: non vale la pena ridisegnare.
  const margine = Math.min(sx, su, larghezza - 1 - dx, altezza - 1 - giu);
  if (margine <= Math.min(larghezza, altezza) * 0.03) return null;

  return { sx, su, larghezza: dx - sx + 1, altezza: giu - su + 1 };
}

/**
 * Rende TRASPARENTI i pixel di fondo, non solo quelli fuori dalla bottiglia.
 *
 * Il rifilo da solo ritaglia il rettangolo minimo che contiene qualcosa, ma
 * dentro quel rettangolo il fondo resta: si vede ancora un riquadro attorno
 * alla bottiglia. Qui si parte dai BORDI e si propaga sui pixel contigui simili
 * al fondo, fermandosi alla sagoma della bottiglia.
 *
 * Partire dai bordi e non dal colore e' la differenza che conta: il bianco
 * DENTRO l'etichetta non e' contiguo al bordo, quindi non viene bucato.
 *
 * Muta `dati` sul posto. Restituisce quanti pixel ha reso trasparenti.
 */
/**
 * Recupera le tasche di fondo che il flood fill non ha potuto raggiungere.
 *
 * Il fill avanza sui contigui, quindi un'ombra attorno alla bottiglia gli fa da
 * muro: il fondo chiuso dietro l'ombra resta opaco e si vede come un blocco
 * bianco appiccicato al soggetto. Allargare e basta la tolleranza del fill non
 * va bene: su una bottiglia con l'etichetta bianca gliela mangerebbe.
 *
 * La distinzione non e' nel colore — tasca ed etichetta sono lo stesso bianco —
 * ma in CHI le circonda. Una tasca di fondo confina quasi tutta con fondo gia'
 * tolto; un'etichetta confina col vetro. Quindi qui si raccolgono le componenti
 * connesse di pixel quasi-fondo ancora opachi e si toglie solo quelle cinte per
 * almeno il 70% da pixel gia' marcati.
 *
 * Lavora su `daPulire`, non sui pixel: la decisione di mutare resta a chi chiama.
 */
function recuperaTasche(dati, larghezza, altezza, daPulire, rf, gf, bf) {
  const n = larghezza * altezza;

  const quasiFondo = (p) => {
    if (daPulire[p]) return false;          // gia' riconosciuto come fondo
    const i = p * 4;
    if (dati[i + 3] < 16) return false;
    return Math.abs(dati[i] - rf) <= TOLLERANZA_RESIDUO &&
           Math.abs(dati[i + 1] - gf) <= TOLLERANZA_RESIDUO &&
           Math.abs(dati[i + 2] - bf) <= TOLLERANZA_RESIDUO;
  };

  const visto = new Uint8Array(n);
  let recuperati = 0;

  for (let seme = 0; seme < n; seme++) {
    if (visto[seme] || !quasiFondo(seme)) continue;

    const componente = [];
    const pila = [seme];
    visto[seme] = 1;
    let libero = 0, soggetto = 0;

    while (pila.length) {
      const p = pila.pop();
      componente.push(p);
      const x = p % larghezza, y = (p - x) / larghezza;
      const vicini = [];
      if (x > 0)             vicini.push(p - 1);
      if (x < larghezza - 1) vicini.push(p + 1);
      if (y > 0)             vicini.push(p - larghezza);
      if (y < altezza - 1)   vicini.push(p + larghezza);

      for (const q of vicini) {
        if (quasiFondo(q)) { if (!visto[q]) { visto[q] = 1; pila.push(q); } }
        else if (daPulire[q]) libero++;
        else soggetto++;
      }
    }

    const contorno = libero + soggetto;
    if (!contorno || libero / contorno < QUOTA_CONTORNO_LIBERO) continue;
    for (const p of componente) { daPulire[p] = 1; recuperati++; }
  }

  return recuperati;
}

export function scontornaFondo(dati, larghezza, altezza, tolleranza = TOLLERANZA) {
  const n = larghezza * altezza;
  const angoli = [[0, 0], [larghezza - 1, 0], [0, altezza - 1], [larghezza - 1, altezza - 1]]
    .map(([x, y]) => { const i = (y * larghezza + x) * 4; return [dati[i], dati[i + 1], dati[i + 2], dati[i + 3]]; });

  // Gia' trasparente agli angoli: il lavoro l'ha fatto qualcun altro.
  if (angoli.every(a => a[3] < 16)) return 0;

  const [rf, gf, bf] = angoli[0];
  const concordi = angoli.every(([r, g, b, a]) => a < 16 ||
    (Math.abs(r - rf) <= tolleranza && Math.abs(g - gf) <= tolleranza && Math.abs(b - bf) <= tolleranza));
  if (!concordi) return 0;   // fondo non uniforme: non si tocca niente

  const simile = (p) => {
    const i = p * 4;
    if (dati[i + 3] < 16) return true;
    return Math.abs(dati[i] - rf) <= tolleranza &&
           Math.abs(dati[i + 1] - gf) <= tolleranza &&
           Math.abs(dati[i + 2] - bf) <= tolleranza;
  };

  const visto = new Uint8Array(n);
  const daPulire = new Uint8Array(n);
  const pila = [];
  // Semina su tutto il perimetro: una bottiglia a filo di un lato non deve
  // impedire allo sfondo degli altri lati di essere raggiunto.
  for (let x = 0; x < larghezza; x++) { pila.push(x); pila.push((altezza - 1) * larghezza + x); }
  for (let y = 0; y < altezza; y++) { pila.push(y * larghezza); pila.push(y * larghezza + larghezza - 1); }

  // Prima si marca, poi si decide: mutare subito renderebbe impossibile
  // annullare, e c'e' un caso in cui annullare e' obbligatorio (sotto).
  let marcati = 0;
  while (pila.length) {
    const p = pila.pop();
    if (visto[p]) continue;
    visto[p] = 1;
    if (!simile(p)) continue;
    daPulire[p] = 1; marcati++;

    const x = p % larghezza, y = (p - x) / larghezza;
    if (x > 0)             pila.push(p - 1);
    if (x < larghezza - 1) pila.push(p + 1);
    if (y > 0)             pila.push(p - larghezza);
    if (y < altezza - 1)   pila.push(p + larghezza);
  }

  // Se resta quasi niente, quello che sembrava fondo ERA il soggetto: una foto
  // senza margini ha gli angoli tutti uguali e verrebbe cancellata per intero.
  // Meglio non scontornare che restituire un'immagine vuota.
  if (marcati > n * 0.92) return 0;

  // Le tasche che l'ombra ha murato: il fill da solo non le raggiunge.
  marcati += recuperaTasche(dati, larghezza, altezza, daPulire, rf, gf, bf);
  if (marcati > n * 0.92) return 0;   // la stessa guardia, sul totale

  let tolti = 0;
  for (let p = 0; p < n; p++) {
    if (daPulire[p] && dati[p * 4 + 3] !== 0) { dati[p * 4 + 3] = 0; tolti++; }
  }
  return tolti;
}

// ─── Formati delle bottiglie (P6 fase 3) ─────────────────────────────────────
// Riduce le righe di `bottiglie` in giacenza a una stringa per vino, da
// mostrare accanto al conteggio in lista. Restituisce SOLO i formati diversi
// da Standard: una cantina di bottiglie normali non ha bisogno di dirlo, e
// stampare "Standard" su 117 righe su 118 sarebbe rumore.
//
// Un vino puo' averne piu' d'uno — tre Standard e un Magnum e' un caso vero,
// reso possibile dal fatto che `aggiungi_o_incrementa` somma alla stessa
// etichetta. In quel caso si elencano, i piu' numerosi per primi.
export const FORMATO_STANDARD = "Standard";

export function formatiPerVino(righe) {
  const conta = new Map();   // wine_id -> Map(formato -> quante)
  for (const r of righe || []) {
    if (r?.wine_id == null) continue;
    if (!r.formato || r.formato === FORMATO_STANDARD) continue;
    if (!conta.has(r.wine_id)) conta.set(r.wine_id, new Map());
    const perVino = conta.get(r.wine_id);
    perVino.set(r.formato, (perVino.get(r.formato) || 0) + 1);
  }
  const out = {};
  for (const [wineId, perVino] of conta) {
    out[wineId] = [...perVino.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([formato]) => formato)
      .join(" · ");
  }
  return out;
}

// Il formato da mostrare nel form di modifica: il piu' diffuso fra le giacenze
// del vino, Standard se non ce ne sono. Serve perche' la modifica agisce su
// tutte le bottiglie insieme, quindi il campo deve partire da qualcosa di vero.
export function formatoPrevalente(righe, wineId) {
  const conta = new Map();
  for (const r of righe || []) {
    if (r?.wine_id !== wineId || !r.formato) continue;
    conta.set(r.formato, (conta.get(r.formato) || 0) + 1);
  }
  if (!conta.size) return FORMATO_STANDARD;
  return [...conta.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}
