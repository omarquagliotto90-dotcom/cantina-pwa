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

// Molti siti rispondono 403 a chi non sembra un browser: guardano User-Agent e
// Referer. Misurato il 21/09/2026 su rossopastrengo.com, vignetiradica.it e
// triplea.it — 3 host su 6 fra i piu' numerosi. Con questi header il proxy si
// presenta come il browser che sta gia' caricando quella stessa foto nell'<img>
// della scheda: non prende niente che l'app non stia gia' prendendo, serve solo
// ad avere i byte sul nostro dominio e quindi accesso ai pixel.
const UA_BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

function intestazioniDaBrowser(u) {
  return {
    "User-Agent": UA_BROWSER,
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
    // Il Referer e' l'anti-hotlink piu' diffuso: vuole vedere una pagina del
    // sito stesso. L'origine nuda basta e non finge una pagina che non esiste.
    "Referer": u.origin + "/",
  };
}

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

  // 3 foto in cantina sono salvate con schema http. Rifiutarle e basta le
  // rendeva impossibili da rifilare per sempre; provare in https e' sia piu'
  // sicuro sia l'unica speranza che funzionino.
  if (u.protocol === "http:") u.protocol = "https:";

  const motivo = indirizzoAmmesso(u);
  if (motivo) return res.status(400).json({ error: motivo });

  try {
    const r = await fetch(u.toString(), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      headers: intestazioniDaBrowser(u),
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
