// api/search-website.js
// Cerca il sito ufficiale di un produttore/vino via Serper.dev
// Esclude aggregatori e ritorna il primo URL rilevante

const EXCLUDE_DOMAINS = [
  "vivino.com", "wine-searcher.com", "winesearcher.com", "tannico.it",
  "callmewine.com", "winemag.it", "decanter.com", "wine-spectator.com",
  "italianavini.it", "amazon.com", "amazon.it", "enoteca", "shop.",
  "signorvino.com", "vino.com", "diemmevini.com", "trovaprezzi.it",
  "wikipedia.org", "tripadvisor.com", "instagram.com", "facebook.com",
  "youtube.com", "slowfood.it", "gamberorosso.it", "winetourism.com",
  "cellartracker.com", "ratemywine", "dispensa", "eataly", "acquista",
  "comprare", "prezzo", "offerta", "scontato", "etilika", "intravino.com",
];

function isOfficialSite(url, produttore) {
  const lower = url.toLowerCase();
  // Escludi domini aggregatori
  if (EXCLUDE_DOMAINS.some(d => lower.includes(d))) return false;
  // Preferisci URL che contengono parole chiave del produttore
  const keywords = produttore.toLowerCase()
    .replace(/[àáâãäå]/g, "a").replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i").replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u").replace(/[^a-z0-9\s]/g, "")
    .split(" ").filter(w => w.length > 3);
  return keywords.some(k => lower.includes(k));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { produttore, vino } = req.body;
  if (!produttore) return res.status(400).json({ error: "produttore required" });

  const SERPER_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_KEY) return res.status(500).json({ error: "SERPER_API_KEY not set" });

  try {
    // Query principale: sito ufficiale del produttore
    const query = `${produttore} cantina vino sito ufficiale`;

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, gl: "it", hl: "it", num: 10 }),
    });

    const data = await response.json();
    const organic = data.organic || [];

    // 1° tentativo: URL ufficiale (contiene nome produttore, non è aggregatore)
    let found = organic.find(r => isOfficialSite(r.link, produttore));

    // 2° tentativo: qualsiasi risultato non-aggregatore
    if (!found) {
      found = organic.find(r => !EXCLUDE_DOMAINS.some(d => r.link.toLowerCase().includes(d)));
    }

    // 3° fallback: Google Search con produttore + vino
    if (!found) {
      const q = encodeURIComponent(`${produttore} ${vino || ""} cantina`);
      return res.json({ url: `https://www.google.com/search?q=${q}`, source: "fallback" });
    }

    // Normalizza URL: prendi solo il dominio root se è una pagina profonda inutile
    let url = found.link;
    try {
      const parsed = new URL(url);
      // Se il path è solo "/" o vuoto, usa la home
      const cleanPath = parsed.pathname.replace(/\/$/, "");
      // Se il path contiene parole generiche di navigazione, usa la home
      const genericPaths = ["/it", "/en", "/home", "/index", "/chi-siamo", "/about"];
      if (genericPaths.includes(cleanPath) || cleanPath === "") {
        url = `${parsed.protocol}//${parsed.host}/`;
      }
    } catch {}

    return res.json({ url, source: "serper", title: found.title });
  } catch (err) {
    console.error("search-website error:", err);
    const q = encodeURIComponent(`${produttore} ${vino || ""} cantina sito ufficiale`);
    return res.json({ url: `https://www.google.com/search?q=${q}`, source: "fallback" });
  }
}
