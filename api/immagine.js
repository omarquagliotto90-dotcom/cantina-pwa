// api/immagine.js — Vercel Serverless Function
//
// Rimanda i byte di un'immagine remota dal NOSTRO dominio. Serve a una cosa
// sola: le foto di bottiglia sono hotlinkate dai siti dove sono state trovate,
// e un'immagine cross-origin CONTAMINA il canvas — `getImageData()` lancia
// SecurityError. Senza questo passaggio il rifilo del margine e' impossibile.
//
// Non trasforma niente: decodifica e ritaglio stanno nel browser, perche' farlo
// qui richiederebbe una libreria di image processing, e le dipendenze nuove
// sono fuori dai vincoli del progetto.

const TIMEOUT_MS = 8000;
const MAX_BYTE = 8 * 1024 * 1024;

// Un proxy che scarica URL arbitrarie e' un vettore SSRF: senza controlli
// qualunque estraneo potrebbe usarlo per raggiungere indirizzi interni. Questi
// filtri alzano l'asticella; NON sono una difesa completa, perche' un nome
// pubblico puo' comunque risolvere a un indirizzo privato (rebinding DNS). Per
// un'app personale senza rete interna da proteggere e' proporzionato, ma se un
// giorno gira accanto a qualcosa di sensibile va irrobustito.
const HOST_VIETATI = /^(localhost|.*\.local|.*\.internal|metadata\..*)$/i;
const IP_LETTERALE = /^\d{1,3}(\.\d{1,3}){3}$|^\[?[0-9a-f:]+\]?$/i;

function indirizzoAmmesso(u) {
  if (u.protocol !== "https:") return "solo https";
  if (HOST_VIETATI.test(u.hostname)) return "host non instradabile";
  // Gli IP scritti a mano non servono mai per una foto di bottiglia, e sono
  // il modo piu' diretto per puntare alla rete interna.
  if (IP_LETTERALE.test(u.hostname)) return "indirizzo IP non ammesso";
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const grezzo = req.query?.url;
  if (!grezzo || typeof grezzo !== "string") return res.status(400).json({ error: "parametro url mancante" });

  let u;
  try { u = new URL(grezzo); }
  catch { return res.status(400).json({ error: "url non valida" }); }

  const motivo = indirizzoAmmesso(u);
  if (motivo) return res.status(400).json({ error: motivo });

  try {
    const r = await fetch(u.toString(), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LaMiaCantina/1.0)" },
    });
    if (!r.ok) return res.status(502).json({ error: `origine ha risposto ${r.status}` });

    const tipo = r.headers.get("content-type") || "";
    if (!tipo.startsWith("image/")) return res.status(415).json({ error: `non e' un'immagine (${tipo || "tipo assente"})` });

    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength > MAX_BYTE) return res.status(413).json({ error: "immagine troppo grande" });

    res.setHeader("Content-Type", tipo);
    // L'immagine remota non cambia mai: vale la pena tenerla in cache a lungo,
    // sia nel browser sia sulla CDN di Vercel.
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");
    return res.status(200).send(buf);
  } catch (err) {
    const scaduto = err?.name === "TimeoutError" || err?.name === "AbortError";
    return res.status(scaduto ? 504 : 502).json({ error: scaduto ? "origine troppo lenta" : String(err?.message || err) });
  }
}
