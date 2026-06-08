// api/search-image.js — Vercel Serverless Function
// Proxy sicuro per ricerca immagine bottiglia. Richiede ANTHROPIC_API_KEY su Vercel.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY non configurata" });

  const { produttore, vino } = req.body || {};
  if (!produttore || !vino) return res.status(400).json({ error: "produttore e vino richiesti" });

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 150,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Search image URL for wine bottle: ${produttore} ${vino}. Reply with ONLY the direct image URL (jpg/png/webp). If not found reply: NOT_FOUND`
        }],
      }),
    });

    const data = await anthropicRes.json();
    if (!anthropicRes.ok) return res.status(502).json({ error: data.error?.message || "Anthropic error" });

    const raw = (data.content || [])
      .filter(c => c.type === "text")
      .map(c => c.text || "")
      .join("").trim();

    if (!raw || raw.includes("NOT_FOUND")) return res.status(200).json({ url: null });

    const candidates = [...raw.matchAll(/https:\/\/[^\s"'<>)]+/g)]
      .map(m => m[0].replace(/[.,;)\]>]+$/, ""));

    const imgExtRe = /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i;
    const cdnRe    = /\/(image|img|photo|media|cdn|static|assets|upload|product)\//i;

    const bestUrl =
      candidates.find(u => imgExtRe.test(u)) ||
      candidates.find(u => cdnRe.test(u))    ||
      candidates[0] || null;

    return res.status(200).json({ url: bestUrl });

  } catch (err) {
    console.error("search-image error:", err);
    return res.status(500).json({ error: err.message });
  }
}
