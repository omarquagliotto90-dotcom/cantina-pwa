// api/search-image.js — Vercel Serverless Function
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY non configurata" });

  const { produttore, vino } = req.body || {};
  if (!produttore || !vino) return res.status(400).json({ error: "produttore e vino richiesti" });

  // Strategia: chiamata a claude-sonnet-4-5 con web_search
  // max_tokens adeguato per completare il ciclo tool_use
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
        max_tokens: 1024,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Find a direct image URL for the wine bottle: "${produttore} ${vino}".
Search on vivino.com, tannico.it, or the producer website.
Return ONLY the direct image URL (ending in .jpg, .jpeg, .png, or .webp).
No explanation. Just the URL. If nothing found: NOT_FOUND`
        }],
      }),
    });

    const data = await anthropicRes.json();

    // Log completo per diagnostica (visibile nei Vercel Function Logs)
    console.log("Anthropic response:", JSON.stringify({
      status: anthropicRes.status,
      stop_reason: data.stop_reason,
      usage: data.usage,
      content_types: (data.content || []).map(c => c.type),
      error: data.error,
    }));

    if (!anthropicRes.ok) {
      return res.status(502).json({ error: data.error?.message || "Anthropic error", detail: data.error });
    }

    // Raccogli tutto il testo dalla risposta finale
    const raw = (data.content || [])
      .filter(c => c.type === "text")
      .map(c => c.text || "")
      .join("").trim();

    console.log("Raw text response:", raw.slice(0, 300));

    if (!raw || raw.includes("NOT_FOUND")) return res.status(200).json({ url: null });

    // Estrai URL immagine dalla risposta
    const candidates = [...raw.matchAll(/https:\/\/[^\s"'<>)]+/g)]
      .map(m => m[0].replace(/[.,;)\]>]+$/, ""));

    const imgExtRe = /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i;
    const cdnRe    = /\/(image|img|photo|media|cdn|static|assets|upload|product|thumb)\//i;

    const bestUrl =
      candidates.find(u => imgExtRe.test(u)) ||
      candidates.find(u => cdnRe.test(u))    ||
      candidates[0] || null;

    console.log("Best URL found:", bestUrl);
    return res.status(200).json({ url: bestUrl });

  } catch (err) {
    console.error("search-image error:", err);
    return res.status(500).json({ error: err.message });
  }
}
