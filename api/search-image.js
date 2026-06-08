// api/search-image.js — Vercel Serverless Function
// Usa Serper.dev Google Images API (2500 req/mese gratis, zero rate limit)
// Richiede SERPER_API_KEY come variabile d'ambiente su Vercel.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) return res.status(500).json({ error: "SERPER_API_KEY non configurata" });

  const { produttore, vino } = req.body || {};
  if (!produttore || !vino) return res.status(400).json({ error: "produttore e vino richiesti" });

  try {
    const annata = req.body.annata || "";
    const query = `${produttore} ${vino}${annata ? " " + annata : ""} bottiglia vino`;
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

    // Parole chiave dal produttore e dal vino (minimo 4 caratteri)
    const keywords = `${produttore} ${vino}`
      .toLowerCase()
      .split(/[\s\-\/=]+/)
      .filter(w => w.length >= 4);

    // Controlla se un risultato è rilevante: almeno 1 keyword nel titolo o nell'URL
    const isRelevant = (img) => {
      const haystack = `${(img.title || "")} ${(img.imageUrl || "")}`.toLowerCase();
      return keywords.some(kw => haystack.includes(kw));
    };

    const candidates = images.filter(i => !skipRe.test(i.imageUrl));
    const relevant   = candidates.filter(isRelevant);

    // Usa risultati rilevanti se esistono, altrimenti non restituire nulla
    const pool = relevant.length > 0 ? relevant : [];

    const best =
      pool.find(i => imgExtRe.test(i.imageUrl)) ||
      pool[0] || null;

    let url = best?.imageUrl || null;
    // Forza sempre HTTPS per evitare Mixed Content su pagine sicure
    if (url) url = url.replace(/^http:\/\//, "https://");
    console.log("Best URL:", url);

    return res.status(200).json({ url });

  } catch (err) {
    console.error("search-image error:", err);
    return res.status(500).json({ error: err.message });
  }
}
