// api/search-image.js — Vercel Serverless Function
// Usa Serper.dev Google Images API (2500 req/mese gratis, zero rate limit)
// Richiede SERPER_API_KEY come variabile d'ambiente su Vercel.

// ─── Scelta dell'immagine ─────────────────────────────────────────────────────
// Obiettivo dichiarato (21/09/2026): bottiglie INTERE e gia' SCONTORNATE.
//
// I criteri non sono inventati: vengono dalle 86 immagini gia' in cache per i
// vini in cantina. 44 su 86 arrivavano da CDN di e-commerce — scatti prodotto
// su fondo bianco, esattamente cio' che serve — ma ci finivano per caso,
// perche' l'ordinamento guardava solo rilevanza ed estensione.

// Percorsi tipici delle piattaforme e-commerce: PrestaShop, Shopify, OpenCart,
// WooCommerce, Magento. Chi vende bottiglie le fotografa su fondo bianco.
// `<nome>_default/` e' generico di proposito. Avevo elencato i tre formati che
// comparivano nelle 86 URL campionate — large, home, cart — scambiando "i
// formati presenti nel mio campione" per "i formati esistenti". PrestaShop ne
// emette almeno sei, e il 21/09/2026 `medium_default` ha fatto scartare la foto
// GIUSTA di due vini Peroni mentre ne passavano due sbagliate dallo stesso sito.
const RE_ECOMMERCE = /[-\/][a-z]+_default\/|\/cdn\/shop\/|\/image\/cache\/|\/wp-content\/uploads\/|\/media\/catalog\/|\/product[s]?\//i;

// Chi ha gia' fatto il lavoro lo scrive nel nome del file.
const RE_SCONTORNATA = /removebg|remove-bg|no-?bg|transparent|trasparente/i;

// `vivino.com/labels/` NON e' una bottiglia: e' il ritaglio dell'etichetta.
// Tre delle 86 in cache lo erano. Escluse, non penalizzate.
const RE_NON_BOTTIGLIA = /vivino\.com\/labels\/|\/label[s]?\/|etichetta|\bcrop\b/i;

const RE_PNG = /\.png(\?|$)/i;

/**
 * Quanto promette di essere una bottiglia intera su fondo pulito.
 * `null` = da scartare comunque. Funzione pura: e' verificata in
 * `e2e/ranking.spec.mjs` contro le URL reali del database.
 */
export function punteggioImmagine(url) {
  if (!url) return null;
  if (RE_NON_BOTTIGLIA.test(url)) return null;

  let p = 0;
  if (RE_SCONTORNATA.test(url)) p += 5;   // dichiarata scontornata
  if (RE_ECOMMERCE.test(url))   p += 3;   // scatto prodotto, quasi sempre su bianco
  if (RE_PNG.test(url))         p += 2;   // puo' avere trasparenza
  if (/^https:/i.test(url))     p += 1;   // niente mixed content
  return p;
}

// Soglia: sotto questa si preferisce nessuna immagine a una sbagliata
// (decisione di Omar, 21/09/2026). Un JPEG da un dominio qualsiasi, senza
// nessun segnale, si ferma a 1 e viene scartato; basta uno dei segnali veri
// — e-commerce, PNG, scontornata — per superarla.
export const SOGLIA_MINIMA = 3;

/**
 * La stringa mandata a Serper.
 *
 * **Prima il vino, poi la cantina** (decisione di Omar, 21/09/2026). Con il
 * produttore in testa, "Peroni Marzemino Montelungo" tornava con la bottiglia
 * sbagliata: le prime parole pesano di piu', e quando il produttore e' anche
 * una marca famosa di altro — Peroni e' soprattutto una birra — vince quella.
 *
 * **L'annata entra solo se e' un'annata.** Dal client arriva la stringa "n.d."
 * quando non si conosce (`normalizzaWine` in App.jsx la mette per il display),
 * e infilarla nella ricerca e' spazzatura. Qui passa solo cio' che somiglia a
 * un anno: "n.d.", vuoto, null e altri residui restano fuori.
 *
 * Pura e verificata in `e2e/ranking.spec.mjs`, come `punteggioImmagine`.
 */
export function costruisciQuery(produttore, vino, annata) {
  const grezza = String(annata ?? "").trim();
  const anno = /^\d{4}$/.test(grezza) ? ` ${grezza}` : "";
  return `${vino} ${produttore}${anno} bottiglia vino`;
}

// Parole troppo comuni per dire qualcosa su QUALE vino sia.
const GENERICHE = new Set([
  "vino","wine","vini","wines","bianco","rosso","nero","rose","rosé",
  "fermo","frizzante","spumante","secco","dolce","passito","riserva",
  "bottiglia","bottle","produttore","cantina","azienda","agricola",
  "agricolo","della","delle","degli","dello","nella","nelle",
  "anno","annata","vintage","doc","docg","igt","dop","igp","classico",
]);

/** minuscolo, senza accenti: "Montealbì" e "montealbi" devono combaciare. */
const piatto = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Le parole che identificano DAVVERO questo vino.
 *
 * Lo split e' su tutto cio' che non e' lettera o cifra, quindi le virgolette
 * del nome restano fuori: prima producevano la keyword '"montealbi"', che in
 * un URL non si trova mai.
 */
export function parolePortanti(produttore, vino) {
  return [...new Set(piatto(`${produttore} ${vino}`).split(/[^a-z0-9]+/))]
    .filter(w => w.length >= 4 && !GENERICHE.has(w));
}

/**
 * Quanto un risultato parla di QUESTO vino.
 *
 * L'URL vale il doppio del titolo, e la ragione e' concreta: l'URL di uno
 * scatto prodotto nomina il prodotto — `peroni-montealbi.jpg` dice tutto —
 * mentre il titolo di una pagina e-commerce nomina anche altro (correlati,
 * categoria, briciole di pane). Era la falla: bastava UNA parola qualsiasi nel
 * titolo e passava, cosi' "maccaboni-francesco-donna-virginia" entrava in gara
 * e poi vinceva per il punteggio dell'immagine.
 */
export function rilevanza(parole, url, titolo) {
  const u = piatto(url), t = piatto(titolo);
  let p = 0;
  for (const w of parole) {
    if (u.includes(w)) p += 2;
    else if (t.includes(w)) p += 1;
  }
  return p;
}

/**
 * Sceglie l'immagine fra i risultati di Serper. Pura: e' verificata in
 * `e2e/ranking.spec.mjs` contro le URL vere che i log hanno registrato.
 *
 * Ordine: **prima la rilevanza, poi la qualita'**. Il punteggio dice quanto
 * l'immagine sembra uno scatto prodotto pulito, non se e' il vino giusto: da
 * solo, fra due foto egualmente pulite, sceglieva quella con l'URL piu'
 * fortunato. La soglia continua a valere sul punteggio.
 */
export function scegliImmagine(immagini, produttore, vino) {
  const salta   = /logo|icon|banner|avatar|flag|map|chart|graph/i;
  const estensione = /\.(jpg|jpeg|png|webp)(\?.*)?$/i;
  const parole  = parolePortanti(produttore, vino);

  const valutati = (immagini || [])
    .filter(i => i && i.imageUrl && !salta.test(i.imageUrl))
    // https prima di valutare: cambia il punteggio, e un http darebbe mixed
    // content su una pagina sicura.
    .map(i => ({ ...i, imageUrl: i.imageUrl.replace(/^http:\/\//, "https://") }))
    .map(i => ({
      url: i.imageUrl,
      punteggio: punteggioImmagine(i.imageUrl),
      rilevanza: parole.length ? rilevanza(parole, i.imageUrl, i.title) : 1,
    }))
    .filter(i => i.punteggio !== null && i.rilevanza > 0 && estensione.test(i.url))
    .sort((a, b) => b.rilevanza - a.rilevanza || b.punteggio - a.punteggio);

  return { parole, valutati, migliore: valutati[0] || null };
}

export default async function handler(req, res) {

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) return res.status(500).json({ error: "SERPER_API_KEY non configurata" });

  const { produttore, vino } = req.body || {};
  if (!produttore || !vino) return res.status(400).json({ error: "produttore e vino richiesti" });

  try {
    const query = costruisciQuery(produttore, vino, req.body.annata);
    console.log("Searching:", query);

    const serperRes = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: {
        "X-API-KEY": serperKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 5,
        gl: "it",
        hl: "it",
      }),
    });

    const data = await serperRes.json();
    console.log("Serper status:", serperRes.status, "results:", data.images?.length ?? 0);

    if (!serperRes.ok) {
      return res.status(502).json({ error: data.message || "Serper error" });
    }

    const { parole, valutati, migliore } = scegliImmagine(data.images, produttore, vino);

    console.log("Parole portanti:", parole);
    console.log("Valutati:", JSON.stringify(valutati));

    // Meglio nessuna immagine che una sbagliata: sotto soglia si restituisce
    // null e la riga resta con il segnaposto "senza foto".
    const url = migliore && migliore.punteggio >= SOGLIA_MINIMA ? migliore.url : null;
    console.log("Best URL:", url, migliore ? `(punteggio ${migliore.punteggio}, rilevanza ${migliore.rilevanza})` : "(nessun candidato)");

    return res.status(200).json({ url });

  } catch (err) {
    console.error("search-image error:", err);
    return res.status(500).json({ error: err.message });
  }
}
