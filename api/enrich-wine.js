// api/enrich-wine.js — Vercel Serverless Function
// Arricchimento dati vino via Google Gemini + Google Search grounding.
// Richiede GEMINI_API_KEY come variabile d'ambiente su Vercel.

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY non configurata" });
  }

  const { produttore, vino, annata } = req.body || {};
  if (!produttore || !vino) {
    return res.status(400).json({ error: "produttore e vino sono richiesti" });
  }

  const etichetta = `${produttore} — ${vino}${annata && annata !== "n.d." ? " " + annata : ""}`;

  const prompt = `Cerca sul web la scheda tecnica e il prezzo medio di mercato di questo vino: ${etichetta}.

Privilegia il sito del produttore per i dati tecnici e i siti di e-commerce/aste vino per il prezzo.

Restituisci SOLO un oggetto JSON (nessun markdown, nessun testo prima o dopo) con questi campi:
{
  "vitigno": "vitigno/i con eventuali percentuali, oppure ''",
  "macerazione": "descrizione sintetica (es. '15 giorni su bucce'), oppure ''",
  "fermentazione": "descrizione sintetica (es. 'acciaio, lieviti indigeni'), oppure ''",
  "malolattica": "affinamento in legno: utilizzo del legno (sì/no), tempo in legno, tipo di legno (es. 'barrique usate, 12 mesi') ed eventuale presenza di fermentazione malolattica. Oppure ''",
  "note": "descrizione del vino in 2-3 frasi in italiano, oppure ''",
  "prezzo_stimato": numero in euro per bottiglia 0.75L (es. 18.50), oppure null
}

Regole rigorose:
- NON inventare dati: se un'informazione non emerge dalla ricerca, usa '' (o null per il prezzo). Non scrivere supposizioni o frasi come 'probabile' o 'non specificato'.
- I dati devono riferirsi a QUESTO vino specifico (e se possibile a questa annata), non ad altri vini dello stesso produttore.
- prezzo_stimato deve essere un numero, non una stringa né un intervallo.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
        }),
      }
    );

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      const errMsg = data.error?.message || JSON.stringify(data);
      console.error("Gemini error", geminiRes.status, errMsg);
      return res.status(502).json({ error: `[${geminiRes.status}] ${errMsg}` });
    }

    // La risposta Gemini: candidates[0].content.parts[] — concateniamo i blocchi text.
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text || "").join("").trim();

    // Estrai l'oggetto JSON presente nel testo (ignora eventuali ```json e testo extra)
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
      return res.status(200).json({ raw: text });
    }

    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      // Normalizza prezzo: numero o null, mai stringa
      let prezzo = parsed.prezzo_stimato;
      if (typeof prezzo === "string") {
        // Estrae tutti i numeri (gestisce intervalli tipo "21,99 - 23,00") e ne fa la media
        const nums = (prezzo.replace(/,/g, ".").match(/\d+(\.\d+)?/g) || [])
          .map(parseFloat)
          .filter(n => Number.isFinite(n) && n > 0);
        prezzo = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      }
      if (typeof prezzo !== "number" || !Number.isFinite(prezzo) || prezzo <= 0) {
        prezzo = null;
      }
      if (prezzo != null) prezzo = Math.round(prezzo * 100) / 100;
      // Difensivo: se un campo testuale torna come oggetto/array, lo appiattiamo in stringa
      const toStr = (v) => {
        if (v == null) return "";
        if (typeof v === "string") return v;
        if (typeof v === "object") return Object.values(v).filter(Boolean).join(", ");
        return String(v);
      };
      return res.status(200).json({
        vitigno: toStr(parsed.vitigno),
        macerazione: toStr(parsed.macerazione),
        fermentazione: toStr(parsed.fermentazione),
        malolattica: toStr(parsed.malolattica),
        note: toStr(parsed.note),
        prezzo_stimato: prezzo,
      });
    } catch {
      return res.status(200).json({ raw: text });
    }

  } catch (err) {
    console.error("enrich-wine error:", err);
    return res.status(500).json({ error: err.message });
  }
}

