// api/analyze-label.js — Vercel Serverless Function
// Proxy sicuro per il riconoscimento etichetta vino via Claude Vision.
// Richiede ANTHROPIC_API_KEY come variabile d'ambiente su Vercel.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY non configurata" });
  }

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: "imageBase64 è richiesto" });
  }

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
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType || "image/jpeg",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `Analizza questa etichetta di vino e restituisci SOLO un oggetto JSON con questi campi (nessun testo aggiuntivo, nessun markdown):
{
  "produttore": "nome del produttore/cantina",
  "vino": "nome commerciale del vino",
  "annata": "anno in formato 4 cifre oppure 'n.d.' se non visibile",
  "tipologia": "una di: Rosso fermo, Bianco fermo, Orange, Spumante, Spumante rosso, Sidro",
  "vitigno": "vitigno/i indicati sull'etichetta, oppure '' se non visibile"
}
Se un campo non è leggibile, usa stringa vuota. La tipologia deve essere esattamente una delle opzioni date.`,
            },
          ],
        }],
      }),
    });

    const data = await anthropicRes.json();
    if (!anthropicRes.ok) {
      return res.status(502).json({ error: data.error?.message || "Anthropic error" });
    }

    const text = (data.content || []).map(c => c.text || "").join("").trim();
    const clean = text.replace(/```json|```/g, "").trim();

    try {
      const parsed = JSON.parse(clean);
      return res.status(200).json(parsed);
    } catch {
      return res.status(200).json({ raw: text });
    }

  } catch (err) {
    console.error("analyze-label error:", err);
    return res.status(500).json({ error: err.message });
  }
}
