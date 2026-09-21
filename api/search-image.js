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
const RE_ECOMMERCE = /[-\/]large_default\/|\/cdn\/shop\/|\/image\/cache\/|\/wp-content\/uploads\/|\/media\/catalog\/|\/product[s]?\/|[-\/]cart_default\/|[-\/]home_default\//i;

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

    const images = data.images || [];

    const imgExtRe  = /\.(jpg|jpeg|png|webp)(\?.*)?$/i;
    const skipRe    = /logo|icon|banner|avatar|flag|map|chart|graph/i;

    // Parole generiche da escludere dalle keyword di rilevanza
    const genericWords = new Set([
      "vino","wine","vini","wines","bianco","rosso","nero","rose","rosé",
      "fermo","frizzante","spumante","secco","dolce","passito","riserva",
      "bottiglia","bottle","produttore","cantina","azienda","agricola",
      "agricolo","della","delle","degli","degli","dello","nella","nelle",
      "anno","annata","vintage","doc","docg","igt","dop","igp","classico"
    ]);

    // Keyword specifiche: solo parole non generiche con almeno 4 caratteri
    const keywords = `${produttore} ${vino}`
      .toLowerCase()
      .split(/[\s\-\/=+&@#%*()\[\]{}]+/)
      .filter(w => w.length >= 4 && !genericWords.has(w));

    console.log("Specific keywords:", keywords);

    // Rilevanza: almeno 1 keyword specifica nel titolo OPPURE nell'URL
    const isRelevant = (img) => {
      if (keywords.length === 0) return true; // nessuna keyword specifica → accetta tutto
      const haystack = `${(img.title || "")} ${(img.imageUrl || "")}`.toLowerCase();
      return keywords.some(kw => haystack.includes(kw));
    };

    const candidates = images.filter(i => !skipRe.test(i.imageUrl));
    const relevant   = candidates.filter(isRelevant);

    // La rilevanza resta un cancello, non un punteggio: un'immagine bellissima
    // di un altro vino non serve a niente.
    const valutati = relevant
      // HTTPS prima di valutare: l'upgrade cambia il punteggio, e comunque
      // un http:// darebbe mixed content sulla pagina sicura.
      .map(i => ({ ...i, imageUrl: i.imageUrl.replace(/^http:\/\//, "https://") }))
      .map(i => ({ url: i.imageUrl, punteggio: punteggioImmagine(i.imageUrl) }))
      .filter(i => i.punteggio !== null && imgExtRe.test(i.url))
      .sort((a, b) => b.punteggio - a.punteggio);

    console.log("Valutati:", JSON.stringify(valutati));

    const migliore = valutati[0];
    // Meglio nessuna immagine che una sbagliata: sotto soglia si restituisce
    // null e la riga resta con il segnaposto "senza foto".
    const url = migliore && migliore.punteggio >= SOGLIA_MINIMA ? migliore.url : null;
    console.log("Best URL:", url, migliore ? `(punteggio ${migliore.punteggio})` : "(nessun candidato)");

    return res.status(200).json({ url });

  } catch (err) {
    console.error("search-image error:", err);
    return res.status(500).json({ error: err.message });
  }
}
