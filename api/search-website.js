// api/search-website.js
// Cerca il sito ufficiale di un produttore via Serper.dev
// Priorità: 1) sito ufficiale  2) Instagram  3) Google Search fallback

const EXCLUDE_DOMAINS = [
  "vivino.com", "wine-searcher.com", "winesearcher.com", "tannico.it",
  "callmewine.com", "winemag.it", "decanter.com", "wine-spectator.com",
  "italianavini.it", "amazon.com", "amazon.it",
  "signorvino.com", "vino.com", "diemmevini.com", "trovaprezzi.it",
  "wikipedia.org", "tripadvisor.com", "facebook.com",
  "youtube.com", "slowfood.it", "gamberorosso.it", "winetourism.com",
  "cellartracker.com", "ratemywine", "eataly", "etilika", "intravino.com",
  "enoteca", "shop.", "acquista", "comprare", "prezzo", "offerta", "scontato",
  "divinegolositatoscane", "italysfinestwines", "winealchemy", "bowlerwine",
  "florwine", "vinonews24", "winemag", "italvinus", "sorgentedelvino",
];

function isOfficialSite(url, produttore) {
  const lower = url.toLowerCase();
  if (EXCLUDE_DOMAINS.some(d => lower.includes(d))) return false;
  // Instagram escluso da questo check — gestito separatamente
  if (lower.includes("instagram.com")) return false;
  const keywords = produttore.toLowerCase()
    .replace(/[àáâãäå]/g, "a").replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i").replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u").replace(/[^a-z0-9\s]/g, "")
    .split(" ").filter(w => w.length > 3);
  return keywords.some(k => lower.includes(k));
}

function isAggregator(url) {
  return EXCLUDE_DOMAINS.some(d => url.toLowerCase().includes(d));
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    const cleanPath = parsed.pathname.replace(/\/$/, "");
    const genericPaths = ["/it", "/en", "/home", "/index", "/chi-siamo", "/about"];
    if (genericPaths.includes(cleanPath) || cleanPath === "") {
      return `${parsed.protocol}//${parsed.host}/`;
    }
  } catch {}
  return url;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { produttore, vino } = req.body;
  if (!produttore) return res.status(400).json({ error: "produttore required" });

  const SERPER_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_KEY) return res.status(500).json({ error: "SERPER_API_KEY not set" });

  try {
    const query = `${produttore} cantina vino sito ufficiale`;
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl: "it", hl: "it", num: 10 }),
    });

    const data = await response.json();
    const organic = data.organic || [];

    // ── 1° tentativo: sito ufficiale con parole chiave produttore ──
    let found = organic.find(r => isOfficialSite(r.link, produttore));

    // ── 2° tentativo: qualsiasi risultato non-aggregatore e non-Instagram ──
    if (!found) {
      found = organic.find(r =>
        !isAggregator(r.link) && !r.link.toLowerCase().includes("instagram.com")
      );
    }

    // ── 3° tentativo: Instagram (solo se non c'è nulla di meglio) ──
    if (!found) {
      const igResult = organic.find(r => r.link.toLowerCase().includes("instagram.com"));
      if (igResult) {
        return res.json({
          url: igResult.link,
          source: "instagram",
          title: igResult.title,
        });
      }
    }

    // ── 4° fallback: Google Search ──
    if (!found) {
      const q = encodeURIComponent(`${produttore} ${vino || ""} cantina`);
      return res.json({ url: `https://www.google.com/search?q=${q}`, source: "fallback" });
    }

    return res.json({
      url: normalizeUrl(found.link),
      source: "serper",
      title: found.title,
    });

  } catch (err) {
    console.error("search-website error:", err);
    const q = encodeURIComponent(`${produttore} ${vino || ""} cantina sito ufficiale`);
    return res.json({ url: `https://www.google.com/search?q=${q}`, source: "fallback" });
  }
}
