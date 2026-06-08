// api/search-image.js — Vercel Serverless Function
// Proxy sicuro per chiamate Anthropic: la API key resta sul server, mai nel browser.
// Deploy: metti ANTHROPIC_API_KEY nelle Environment Variables di Vercel.

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY non configurata" });
  }

  const { produttore, vino } = req.body || {};
  if (!produttore || !vino) {
    return res.status(400).json({ error: "produttore e vino sono richiesti" });
  }

  const prompt = `Trova l'URL diretto di un'immagine della bottiglia di questo vino: "${produttore} ${vino}".

Usa web_search per cercare il vino su vivino.com, tannico.it, wine-searcher.com o il sito del produttore.
Dai risultati, estrai un URL diretto che punta all'immagine della bottiglia (jpg, jpeg, png, webp).

Rispondi SOLO con l'URL dell'immagine, nessun altro testo.
Se non trovi nulla scrivi esattamente: NOT_FOUND`;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 512,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      return res.status(502).json({ error: data.error?.message || "Anthropic error" });
    }

    // Estrai il testo dalla risposta finale
    const textBlocks = (data.content || []).filter(c => c.type === "text");
    const raw = textBlocks.map(c => c.text || "").join("").trim();

    if (!raw || raw.toUpperCase().includes("NOT_FOUND")) {
      return res.status(200).json({ url: null });
    }

    // Estrai il miglior URL immagine dalla risposta
    const candidates = [...raw.matchAll(/https:\/\/[^\s"'<>)]+/g)]
      .map(m => m[0].replace(/[.,;)\]>]+$/, ""));

    const imgExtRe = /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i;
    const cdnRe    = /\/(image|img|photo|media|cdn|static|assets|upload|product)\//i;

    const bestUrl =
      candidates.find(u => imgExtRe.test(u)) ||
      candidates.find(u => cdnRe.test(u))    ||
      candidates[0]                           ||
      null;

    return res.status(200).json({ url: bestUrl });

  } catch (err) {
    console.error("search-image error:", err);
    return res.status(500).json({ error: err.message });
  }
}
