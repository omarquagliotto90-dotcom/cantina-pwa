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

    // Preferisci immagini con estensione esplicita, poi qualsiasi URL
    const imgExtRe = /\.(jpg|jpeg|png|webp)(\?.*)?$/i;
    const skipRe   = /logo|icon|banner|avatar|flag|map|chart|graph/i;

    const best =
      images.find(i => imgExtRe.test(i.imageUrl) && !skipRe.test(i.imageUrl)) ||
      images.find(i => !skipRe.test(i.imageUrl)) ||
      images[0] || null;

    const url = best?.imageUrl || null;
    console.log("Best URL:", url);

    return res.status(200).json({ url });

  } catch (err) {
    console.error("search-image error:", err);
    return res.status(500).json({ error: err.message });
  }
}
