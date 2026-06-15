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
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        temperature: 0,
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
              text: `Sei un esperto di etichette di vino. Analizza l'immagine in due passaggi.

PASSAGGIO 1 — Trascrivi nel campo "testo_visibile" TUTTO il testo che leggi sull'etichetta, riga per riga, esattamente come appare (produttore, nome, denominazione, annata, gradazione, volume, diciture varie).

PASSAGGIO 2 — Sulla base SOLO di ciò che hai trascritto, compila gli altri campi.

Restituisci SOLO questo oggetto JSON, senza markdown né testo aggiuntivo:
{
  "testo_visibile": "tutto il testo letto, separato da | ",
  "produttore": "nome della cantina/azienda produttrice",
  "vino": "tutto il testo che identifica il vino TRANNE la sigla di classificazione: nome proprio/cru e/o appellazione testuale con eventuali menzioni (es. 'Montefalco Rosso Riserva', 'Soave Classico La Rocca'). Se non identificabile, ''",
  "denominazione": "SOLO la sigla di classificazione, ESATTAMENTE una di: DOC, DOCG, IGT, AOC, IGP, QbA, QmP, AVA. Se sull'etichetta non c'è o non è riconducibile a queste, usa 'n.d.'",
  "annata": "anno di vendemmia a 4 cifre, oppure 'n.d.' se non presente",
  "tipologia": "una di: Rosso fermo, Bianco fermo, Orange, Spumante, Spumante rosso, Sidro",
  "vitigno": "vitigno/i indicati sull'etichetta, oppure '' se non visibile"
}

REGOLE:
- DENOMINAZIONE: nel campo "denominazione" va SOLO la sigla (DOC, DOCG, IGT, AOC, IGP, QbA, QmP, AVA). Il testo dell'appellazione (es. 'Montefalco Rosso', 'Soave Classico', 'Barolo') NON va qui: va in "vino". Le forme tedesche si scrivono 'QbA' e 'QmP'. Se la sigla non è presente o non rientra nell'elenco, 'n.d.'.
- VINO: include nome proprio + appellazione testuale + menzioni (Classico, Riserva, Superiore…), ma MAI la sigla. Esempio: etichetta 'MONTEFALCO ROSSO RISERVA DOC' → vino 'Montefalco Rosso Riserva', denominazione 'DOC'.
- ANNATA: è l'anno della vendemmia, di solito una sola data a 4 cifre vicino al nome del vino. NON confonderla con: gradazione alcolica (es. 13,5%), volume (es. 750 ml / 0,75 L), anno di fondazione della cantina (spesso preceduto da 'dal', 'since', 'est.'), codici di lotto. Se nessun anno è chiaramente la vendemmia, usa 'n.d.'.
- Non inventare: se un campo non è leggibile, usa '' (o 'n.d.' dove indicato).
- La tipologia deve essere esattamente una delle opzioni date.

ESEMPI:
- 'FATTORIA DI MILZIADE ANTANO — MONTEFALCO ROSSO RISERVA DOC' → produttore 'Fattoria di Milziade Antano', vino 'Montefalco Rosso Riserva', denominazione 'DOC', annata 'n.d.'.
- 'PIEROPAN — SOAVE CLASSICO DOC — LA ROCCA — 2021' → produttore 'Pieropan', vino 'Soave Classico La Rocca', denominazione 'DOC', annata '2021'.`,
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
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const clean = start !== -1 && end !== -1 ? text.slice(start, end + 1) : text;

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
