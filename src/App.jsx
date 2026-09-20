// v0.3 — data-driven
import { useState, useRef, useEffect } from "react";
import { M3, S } from "./ui/theme";
import { TIPO, IC, RatingDial, SearchIcon, PhotoCameraIcon, GlobeSearchIcon, SchedaTecnicaIcon } from "./ui/components";
import { costoGiacenza, formatDataIt, setProduttori, produttoreDi, getGoogleFallback } from "./ui/domain";
import TabLista from "./ui/Lista";
import TabStatistiche from "./ui/Statistiche";
import TabBevuti from "./ui/Bevuti";

// Contatore progressivo delle modifiche ad App.jsx: sale di 0.1 a ogni
// modifica del file e compare accanto al titolo nell'app bar. Sostituisce il
// vecchio marcatore fisso "b2".
const REV = "0.3";

// ─── Supabase client (no dipendenze esterne — REST API diretta) ───────────────
const SB_URL = "https://etbrgdldduadgbulasmy.supabase.co";
const SB_KEY = "sb_publishable_OKQmpbDBpDbPTOmKclMwZw_fRtg1KKR";
const SB_TIMEOUT_MS = 15000;

// Fetch verso PostgREST con timeout. Lancia sempre (mai fallimento silenzioso);
// i metodi pubblici di `sb` la richiamano e decidono se propagare o inghiottire.
async function sbFetch(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SB_TIMEOUT_MS);
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      ...options,
      signal: controller.signal,
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...options.headers },
    });
    if (!r.ok) {
      const err = new Error(`Supabase ${options.method || "GET"} ${path}: HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return r;
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error(`Supabase ${options.method || "GET"} ${path}: timeout`);
      err.status = "timeout";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

const sb = {
  async get(table) {
    try { return await (await sbFetch(`${table}?order=created_at.asc`)).json(); }
    catch { return []; }
  },
  // Come get(), ma propaga un errore tipizzato (err.status: HTTP status o "timeout")
  // invece di inghiottirlo — per i punti che devono distinguere errore da risultato vuoto.
  async getOrThrow(table, { order = "created_at.asc" } = {}) {
    return (await sbFetch(`${table}?order=${order}`)).json();
  },
  async getWhere(table, column, value) {
    try {
      const data = await (await sbFetch(`${table}?${column}=eq.${encodeURIComponent(value)}&limit=1`)).json();
      return data[0] || null;
    } catch { return null; }
  },
  async insert(table, row) {
    try {
      const data = await (await sbFetch(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) })).json();
      return data[0] || null;
    } catch { return null; }
  },
  async upsert(table, row, onConflict) {
    const qs = onConflict ? `?on_conflict=${onConflict}` : "";
    try {
      const data = await (await sbFetch(`${table}${qs}`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) })).json();
      return Array.isArray(data) ? data[0] : data;
    } catch { return null; }
  },
  async delete(table, column, value) {
    try { await sbFetch(`${table}?${column}=eq.${value}`, { method: "DELETE" }); return true; }
    catch { return false; }
  },
  async patch(table, column, value, data) {
    try {
      const res = await (await sbFetch(`${table}?${column}=eq.${value}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(data) })).json();
      return Array.isArray(res) ? res[0] : res;
    } catch { return null; }
  },
  // A3: chiama una funzione RPC Postgres (SECURITY DEFINER). Restituisce l'oggetto
  // di risposta, `true` per le funzioni void (204 senza corpo), o `null` su errore.
  async rpc(fn, args = {}) {
    try {
      const r = await sbFetch(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
      if (r.status === 204) return true;
      const text = await r.text();
      return text ? JSON.parse(text) : true;
    } catch { return null; }
  }
};

// ─── Dominio: normalizzazioni e calcolo valore (unificano le formule duplicate) ─
// Snake_case → camelCase e placeholder di visualizzazione per i campi vuoti.
function normalizzaWine(w) {
  return {
    ...w,
    slowVinoBott: !!w.slow_vino_bott,
    // A2b: annata ora è smallint|NULL nel DB — per il display resta il numero reale
    // o il placeholder "n.d.", stesso pattern degli altri campi opzionali.
    annata: w.annata ?? "n.d.",
    denominazione: w.denominazione || "n.d.",
    macerazione:   w.macerazione   || "—",
    fermentazione: w.fermentazione || "—",
    malolattica:   w.malolattica   || "—",
  };
}

// A2b: converte il valore del form annata (numero, stringa numerica, "n.d." o vuoto)
// in smallint|NULL per la scrittura su DB.
function annataDaForm(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "n.d.") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Rating mostrato per vino, a partire dalle righe di `bevuti`.
//
// Il rating in DB è PER BEVUTA (decisione aperta Q3), mentre la UI ne mostra
// uno solo per vino. Prima si prendeva il massimo: ma dopo lo stopgap di P0 la
// RPC `valuta_vino` scrive sulla bevuta PIÙ RECENTE, quindi leggere il massimo
// avrebbe fatto "tornare indietro" il voto appena dato. Qui si legge dove si
// scrive: il voto della bevuta più recente fra quelle valutate.
//
// "fra quelle valutate" e non "la più recente in assoluto": altrimenti una
// bevuta nuova senza voto nasconderebbe un voto precedente. Dopo una scrittura
// le due definizioni coincidono comunque, perché la più recente diventa valutata.
function ratingPerVino(bevute) {
  const piuRecente = {};
  for (const b of bevute) {
    if (b.wine_id == null || b.rating == null) continue;
    const corrente = piuRecente[b.wine_id];
    const piuNuova = !corrente ||
      b.consumed_on > corrente.consumed_on ||
      (b.consumed_on === corrente.consumed_on && b.uid > corrente.uid);
    if (piuNuova) piuRecente[b.wine_id] = b;
  }
  return Object.fromEntries(
    Object.entries(piuRecente).map(([wineId, b]) => [wineId, Number(b.rating)])
  );
}

// A2b: converte stringa vuota o vecchio placeholder testuale in NULL —
// un solo modo di dire "non specificato", invece di "—"/"n.d." salvati nel DB.
function opzionale(v, placeholder) {
  if (v == null) return null;
  const t = String(v).trim();
  return (t === "" || t === placeholder) ? null : t;
}

// ─── Cache in-memory immagini bottiglia ──
const imgSessionCache = new Map();
// N5: id dei vini con una ricerca immagine già in volo, per evitare enqueue duplicati su remount
const imgInFlight = new Set();

// ─── Coda globale per le ricerche immagini ─────────────────────────────────
const imgQueue = {
  _running: false,
  _queue: [],
  add(fn) {
    return new Promise((resolve, reject) => {
      this._queue.push({ fn, resolve, reject });
      this._run();
    });
  },
  async _run() {
    if (this._running || this._queue.length === 0) return;
    this._running = true;
    const { fn, resolve, reject } = this._queue.shift();
    try {
      const result = await fn();
      resolve(result);
    } catch (e) {
      reject(e);
    } finally {
      await new Promise(r => setTimeout(r, 2000));
      this._running = false;
      this._run();
    }
  }
};

const DENOMINAZIONI = ["DOC", "DOCG", "IGT", "AOC", "IGP", "QbA", "QmP", "AVA", "n.d."];

// ─── Lightbox fullscreen ──────────────────────────────────────────────────────
function Lightbox({ url, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.18s ease", cursor: "zoom-out" }}>
      <img src={url} alt="Bottiglia ingrandita" onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.6)", cursor: "default" }} />
      <button onClick={onClose} style={{ position: "absolute", top: 18, right: 18, width: 40, height: 40, borderRadius: 20, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
        <span style={{display:"flex"}}>{IC.close}</span>
      </button>
    </div>
  );
}

// ─── BottleImage ──────────────────────────────────────────────────────────────
function BottleImage({ wine, active }) {
  const [status, setStatus] = useState("idle");
  const [url, setUrl]       = useState(null);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    if (!active) return;
    const cached = imgSessionCache.get(wine.id);
    if (cached) {
      if (cached === "NOT_FOUND") { setStatus("error"); return; }
      setUrl(cached); setStatus("found"); return;
    }
    let cancelled = false;
    async function fetchImage() {
      try {
        const row = await sb.getWhere("wine_images", "wine_id", wine.id);
        if (row && row.image_url) {
          imgSessionCache.set(wine.id, row.image_url);
          if (!cancelled) { setUrl(row.image_url); setStatus("found"); }
          return;
        }
      } catch (_) {}
      if (!cancelled) setStatus("loading");
      // N5: se una ricerca per questo vino è già in coda, non accodarne una seconda
      if (imgInFlight.has(wine.id)) return;
      imgInFlight.add(wine.id);
      try {
        const bestUrl = await imgQueue.add(async () => {
          const res = await fetch("/api/search-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produttore: wine.produttore, vino: wine.vino, annata: wine.annata }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || res.status);
          return data.url || null;
        });
        if (bestUrl && !cancelled) {
          imgSessionCache.set(wine.id, bestUrl);
          sb.rpc("salva_immagine_vino", { p_wine_id: wine.id, p_image_url: bestUrl }); // A3: RPC (best-effort, cache)
          setUrl(bestUrl); setStatus("found");
        } else {
          imgSessionCache.set(wine.id, "NOT_FOUND");
          if (!cancelled) setStatus("error");
        }
      } catch (err) {
        imgSessionCache.set(wine.id, "NOT_FOUND");
        if (!cancelled) setStatus("error");
      } finally {
        imgInFlight.delete(wine.id);
      }
    }
    fetchImage();
    return () => { cancelled = true; };
  }, [wine.id, active]);

  if (status === "idle" || status === "loading") {
    return (
      <div style={{ height: 200, borderRadius: 10, background: M3.surfaceContainerHighest, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <div style={{ animation: "spin 1.2s linear infinite", color: M3.onSurfaceVariant }}>{IC.search}</div>
        <div style={{ fontSize: 12, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>Ricerca immagine in corso…</div>
      </div>
    );
  }
  if (status === "error" || !url) {
    return (
      <div style={{ height: 140, borderRadius: 10, background: M3.surfaceContainerHighest, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <div style={{ color: M3.onSurfaceVariant, opacity: 0.5 }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8M9 3v3.5L6 10v11a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10l-3-3.5V3"/><line x1="6" y1="14" x2="18" y2="14"/></svg></div>
        <div style={{ fontSize: 12, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>Immagine non disponibile</div>
      </div>
    );
  }
  return (
    <>
      {lightbox && <Lightbox url={url} onClose={() => setLightbox(false)} />}
      <div onClick={() => setLightbox(true)} style={{ display: "flex", justifyContent: "center", alignItems: "center", background: M3.surfaceContainerHighest, borderRadius: 10, padding: "12px 0", cursor: "zoom-in", position: "relative", overflow: "hidden", minHeight: 180 }}>
        <img src={url} alt={wine.produttore + " " + wine.vino} onError={() => { setStatus("error"); imgSessionCache.set(wine.id, "NOT_FOUND"); }} style={{ maxHeight: 220, maxWidth: "100%", objectFit: "contain", borderRadius: 6, boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }} />
        <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.45)", borderRadius: 12, padding: "3px 8px", fontSize: 10, color: "#fff", fontFamily: "'Roboto', sans-serif", backdropFilter: "blur(4px)" }}>🔍 Tocca per ingrandire</div>
      </div>
    </>
  );
}

// ─── WebsiteView ──────────────────────────────────────────────────────────────
function WebsiteView({ wine }) {
  const [url, setUrl] = useState(null);
  const [source, setSource] = useState(null);
  const [status, setStatus] = useState("searching");

  useEffect(() => {
    let cancelled = false;
    async function findWebsite() {
      const key = wine.produttore;
      // P3: il sito arriva con l'anagrafica già caricata all'avvio — nessuna
      // query per vino. Prima si interrogava `wine_websites` con
      //   `wine_websites?produttore=eq.X&select=url,source` + `?order=...`
      // cioè due `?` nella stessa query string: PostgREST rispondeva 400,
      // `sb.get` inghiottiva l'errore e tornava [], quindi la cache non veniva
      // MAI letta e ogni apertura della tab Web richiamava Serper da capo.
      const produttore = produttoreDi(key);
      if (produttore?.sito) {
        if (!cancelled) { setUrl(produttore.sito); setSource(produttore.sito_source || "serper"); setStatus("loading"); }
        return;
      }
      try {
        const res = await fetch("/api/search-website", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produttore: wine.produttore, vino: wine.vino }) });
        const data = await res.json();
        const found = data.url || getGoogleFallback(wine.produttore, wine.vino);
        const src = data.source || "serper";
        // Si salva solo un sito vero: il fallback è una ricerca Google, e
        // scriverlo in anagrafica lo cristallizzerebbe come "sito ufficiale".
        if (data.url) {
          if (produttore) { produttore.sito = found; produttore.sito_source = src; }
          sb.rpc("salva_sito_produttore", { p_produttore: key, p_url: found, p_source: src });
        }
        if (!cancelled) { setUrl(found); setSource(src); setStatus("loading"); }
      } catch {
        const fallback = getGoogleFallback(wine.produttore, wine.vino);
        if (!cancelled) { setUrl(fallback); setSource("fallback"); setStatus("loading"); }
      }
    }
    setStatus("searching"); setUrl(null); setSource(null);
    findWebsite();
    return () => { cancelled = true; };
  }, [wine.produttore]);

  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => setStatus(s => s === "loading" ? "blocked" : s), 3000);
    return () => clearTimeout(t);
  }, [status, url]);

  const domain = url ? url.replace("https://", "").replace("http://", "").split("/")[0] : "";
  const isGoogle = source === "fallback";
  const isInstagram = source === "instagram";
  const sourceIcon = status === "searching" ? <SearchIcon size={12} /> : isInstagram ? <PhotoCameraIcon size={12} /> : isGoogle ? <SearchIcon size={12} /> : <GlobeSearchIcon size={12} />;
  const sourceText = status === "searching" ? "Ricerca in corso…" : domain;

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", background: M3.surfaceContainerHighest }}>
      <div style={{ padding: "8px 12px", background: M3.surfaceContainer, display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${M3.outlineVariant}` }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, ...S.meta, overflow: "hidden" }}>{sourceIcon}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sourceText}</span></div>
        {url && (<a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: M3.primary, fontFamily: "'Roboto', sans-serif", textDecoration: "none", flexShrink: 0, fontWeight: 500 }}><span style={{display:"flex",alignItems:"center",gap:4}}>Apri {IC.openIn}</span></a>)}
      </div>
      <div style={{ position: "relative", height: 380 }}>
        {status === "searching" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: M3.surfaceContainerHighest, zIndex: 3 }}>
            <div style={{ animation: "spin 1s linear infinite", color: M3.onSurfaceVariant, display:"flex" }}>{IC.search}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: M3.onSurface, fontFamily: "'Roboto', sans-serif" }}>Ricerca sito ufficiale…</div>
            <div style={S.meta}>{wine.produttore}</div>
          </div>
        )}
        {status === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: M3.surfaceContainerHighest, zIndex: 2 }}>
            <div style={{ animation: "spin 1s linear infinite", color: M3.onSurfaceVariant, display:"flex" }}>{IC.globe}</div>
            <div style={{ fontSize: 12, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>Caricamento…</div>
          </div>
        )}
        {status === "blocked" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: M3.surfaceContainerHighest, zIndex: 2, borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
            <div style={{ flex: "0 0 160px", background: `linear-gradient(135deg, ${M3.primaryContainer} 0%, ${M3.surfaceVariant} 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, position: "relative" }}>
              <div style={{ width: 64, height: 64, borderRadius: 32, background: M3.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: M3.onPrimary, fontFamily: "'Roboto', sans-serif", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                {isInstagram ? IC.instagram : wine.produttore.charAt(0).toUpperCase()}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", textAlign: "center", padding: "0 16px" }}>{wine.produttore}</div>
              <div style={S.meta}>{domain}</div>
            </div>
            <div style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
              <div style={{ fontSize: 12, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", textAlign: "center", lineHeight: 1.5 }}>
                {isInstagram ? "Questo produttore è presente su Instagram." : "Il sito non può essere visualizzato incorporato per motivi di sicurezza."}
              </div>
              {url && (<a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", padding: "11px 24px", borderRadius: 20, background: isInstagram ? "#E1306C" : M3.primary, color: "#FFFFFF", fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", textDecoration: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}>
                <span style={{display:"flex",alignItems:"center",gap:6}}>{isInstagram ? IC.instagram : IC.globe}{isInstagram ? "Apri su Instagram" : "Apri il sito"}{IC.openIn}</span>
              </a>)}
              {!isInstagram && url && (<a href={`https://www.google.com/search?q=${encodeURIComponent(wine.produttore + " " + wine.vino)}`} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", padding: "9px 24px", borderRadius: 20, border: `1px solid ${M3.outlineVariant}`, background: "transparent", color: M3.onSurfaceVariant, fontSize: 13, fontWeight: 400, fontFamily: "'Roboto', sans-serif", textDecoration: "none" }}>
                <span style={{display:"flex",alignItems:"center",gap:6}}>{IC.search} Cerca su Google</span>
              </a>)}
            </div>
          </div>
        )}
        {url && (<iframe key={url} src={url} title={`Sito ${wine.produttore}`}
          onLoad={(e) => {
            try {
              const doc = e.target.contentDocument || e.target.contentWindow?.document;
              const body = doc?.body?.innerText || "";
              const title = doc?.title || "";
              if (!body && !title) { setStatus("blocked"); return; }
              setStatus(s => s === "loading" ? "ok" : s);
            } catch {
              setStatus(s => s === "loading" ? "ok" : s);
            }
          }}
          onError={() => setStatus("blocked")}
          style={{ width: "100%", height: 380, border: "none", borderRadius: "0 0 12px 12px", opacity: status === "ok" ? 1 : 0, transition: "opacity 0.3s" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />)}
      </div>
    </div>
  );
}

// ─── Modal: Aggiungi Vino ─────────────────────────────────────────────────────
function ModalAggiungi({ onSalva, onAnnulla }) {
  const [modo, setModo] = useState(null);
  const [form, setForm] = useState({ produttore: "", vino: "", denominazione: "n.d.", annata: "", tipologia: "Rosso fermo", bottiglie: 1, prezzo: 0, vitigno: "", macerazione: "", fermentazione: "", malolattica: "", note: "" });
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMime, setImageMime] = useState("image/jpeg");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const fileRef = useRef();

  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(",")[1]);
      const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      setImageMime(supported.includes(file.type) ? file.type : "image/jpeg");
      setModo("analisi");
    };
    reader.readAsDataURL(file);
  };

  const handleAnalizzaEtichetta = async () => {
    if (!imageBase64) return;
    setAiLoading(true); setAiError(null);
    try {
      const response = await fetch("/api/analyze-label", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64, mediaType: imageMime }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (data.raw !== undefined) throw new Error(`Parse fallito. Risposta: ${data.raw?.slice(0, 120)}`);
      const base = {
        produttore: data.produttore || "",
        vino: data.vino || "",
        denominazione: DENOMINAZIONI.includes(data.denominazione) ? data.denominazione : "n.d.",
        annata: data.annata || "",
        tipologia: Object.keys(TIPO).includes(data.tipologia) ? data.tipologia : null,
        vitigno: data.vitigno || "",
      };
      setForm(prev => ({ ...prev, produttore: base.produttore || prev.produttore, vino: base.vino || prev.vino, denominazione: base.denominazione, annata: base.annata || prev.annata, tipologia: base.tipologia || prev.tipologia, vitigno: base.vitigno || prev.vitigno }));
      setModo("manuale");
    } catch (err) {
      setAiError(err.message || "Riconoscimento non riuscito. Puoi compilare manualmente.");
      setModo("manuale");
    } finally {
      setAiLoading(false);
    }
  };

  const field = (key, label, type = "text", opts = {}) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: M3.onSurfaceVariant, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "'Roboto', sans-serif", marginBottom: 4 }}>{label}</div>
      {opts.select ? (
        <select value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${M3.outline}`, background: M3.surfaceContainerHighest, fontSize: 16, fontFamily: "'Roboto', sans-serif", color: M3.onSurface, outline: "none" }}>
          {(opts.options || Object.keys(TIPO)).map(t => <option key={t}>{t}</option>)}
        </select>
      ) : (
        <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${M3.outline}`, background: M3.surfaceContainerHighest, fontSize: 16, fontFamily: "'Roboto', sans-serif", color: M3.onSurface, outline: "none" }} />
      )}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.45)" }} onClick={onAnnulla}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", background: M3.surface, borderRadius: "28px 28px 0 0", maxHeight: "90vh", overflowY: "auto", padding: "20px 20px 36px", animation: "slideUp 0.3s cubic-bezier(0.2,0,0,1)" }}>
        <div style={{ width: 32, height: 4, background: M3.outlineVariant, borderRadius: 2, margin: "0 auto 18px" }} />
        <div style={{ fontSize: 20, fontWeight: 500, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", marginBottom: 20 }}>
          <span style={{display:"flex",alignItems:"center",gap:8}}>{IC.add} Aggiungi vino</span>
        </div>
        {!modo && (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setModo("manuale")} style={{ flex: 1, padding: "24px 12px", borderRadius: 16, border: `1px solid ${M3.outlineVariant}`, background: M3.surfaceContainer, cursor: "pointer", textAlign: "center" }}>
              <div style={{ marginBottom: 8, color: M3.onSurface }}>{IC.edit}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: M3.onSurface, fontFamily: "'Roboto', sans-serif" }}>Inserimento manuale</div>
              <div style={{ fontSize: 12, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", marginTop: 4 }}>Compila i campi a mano</div>
            </button>
            <button onClick={() => fileRef.current?.click()} style={{ flex: 1, padding: "24px 12px", borderRadius: 16, border: `1px solid ${M3.outlineVariant}`, background: M3.surfaceContainer, cursor: "pointer", textAlign: "center" }}>
              <div style={{ marginBottom: 8, color: M3.onSurface }}>{IC.camera}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: M3.onSurface, fontFamily: "'Roboto', sans-serif" }}>Foto etichetta</div>
              <div style={{ fontSize: 12, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", marginTop: 4 }}>Scatta o carica una foto</div>
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFotoChange} />
          </div>
        )}
        {modo === "analisi" && (
          <div style={{ textAlign: "center" }}>
            {imagePreview && (<img src={imagePreview} alt="Etichetta" style={{ maxHeight: 200, maxWidth: "100%", borderRadius: 12, marginBottom: 16, objectFit: "contain" }} />)}
            {!aiLoading ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 500, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", marginBottom: 8 }}>Etichetta caricata ✓</div>
                <div style={{ fontSize: 13, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", marginBottom: 20, lineHeight: 1.5 }}>Clicca per avviare il riconoscimento automatico con AI.</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => { setModo("manuale"); setImagePreview(null); }} style={{ flex: 1, padding: "10px", borderRadius: 20, border: `1px solid ${M3.outline}`, background: "transparent", color: M3.onSurface, fontSize: 13, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>← Manuale</button>
                  <button onClick={handleAnalizzaEtichetta} style={{ flex: 2, padding: "10px 20px", borderRadius: 20, border: "none", background: M3.primary, color: M3.onPrimary, fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>
                    <span style={{display:"flex",alignItems:"center",gap:6}}>{IC.ai} Analizza etichetta</span>
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: "24px 0" }}>
                <div style={{ marginBottom: 12, color: M3.primary, animation: "spin 1s linear infinite" }}>{IC.ai}</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", marginBottom: 6 }}>{"Analisi AI in corso…"}</div>
                <div style={{ fontSize: 13, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>{"Riconoscimento produttore, vino e annata"}</div>
              </div>
            )}
          </div>
        )}
        {modo === "manuale" && (
          <>
            {imagePreview && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", background: "#E8F5E9", borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
                <img src={imagePreview} alt="" style={{ width: 40, height: 48, objectFit: "cover", borderRadius: 6 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#2E7D32", fontFamily: "'Roboto', sans-serif" }}>{aiError ? "⚠️ Attenzione" : "🤖 Campi pre-compilati da AI"}</div>
                  <div style={{ fontSize: 11, color: "#388E3C", fontFamily: "'Roboto', sans-serif", lineHeight: 1.4, marginTop: 2 }}>{aiError || "Verifica e correggi i campi se necessario"}</div>
                </div>
              </div>
            )}
            {field("produttore", "Produttore")}
            {field("vino", "Nome vino")}
            {field("denominazione", "Denominazione", "text", { select: true, options: DENOMINAZIONI })}
            {field("annata", "Annata")}
            {field("tipologia", "Tipologia", "text", { select: true })}
            {field("bottiglie", "N. bottiglie", "number")}
            {field("prezzo", "Prezzo di acquisto (€/bot.)", "number")}
            {field("vitigno", "Vitigno")}
            {field("macerazione", "Macerazione")}
            {field("fermentazione", "Fermentazione")}
            {field("malolattica", "Legno")}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: M3.onSurfaceVariant, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "'Roboto', sans-serif", marginBottom: 4 }}>Note</div>
              <textarea value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} rows={3} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${M3.outline}`, background: M3.surfaceContainerHighest, fontSize: 16, fontFamily: "'Roboto', sans-serif", color: M3.onSurface, outline: "none", resize: "vertical" }} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setModo(null); setImagePreview(null); setImageBase64(null); setAiError(null); }} style={{ flex: 1, padding: "11px", borderRadius: 20, border: `1px solid ${M3.outline}`, background: "transparent", color: M3.onSurface, fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>
                <span style={{display:"flex",alignItems:"center",gap:6}}>{IC.arrowBack} Indietro</span>
              </button>
              <button onClick={() => { if (form.produttore && form.vino) onSalva(form); }}
                style={{ flex: 2, padding: "11px", borderRadius: 20, border: "none", background: form.produttore && form.vino ? M3.primary : M3.surfaceContainerHighest, color: form.produttore && form.vino ? M3.onPrimary : M3.onSurfaceVariant, fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>
                Salva in cantina
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Modal: Modifica dati vino ────────────────────────────────────────────────
function ModalModifica({ wine, onSalva, onAnnulla }) {
  const [form, setForm] = useState({
    produttore: wine.produttore || "", vino: wine.vino || "", denominazione: wine.denominazione || "n.d.", annata: wine.annata || "",
    tipologia: wine.tipologia || "Bianco fermo", bottiglie: wine.bottiglie ?? 1, prezzo: wine.prezzo ?? 0,
    vitigno: wine.vitigno || "", macerazione: wine.macerazione || "", fermentazione: wine.fermentazione || "",
    malolattica: wine.malolattica || "", note: wine.note || "", note_cantina: wine.note_cantina || "",
  });
  const [formError, setFormError] = useState(null);
  const [schedaLoading, setSchedaLoading] = useState(false);
  const [schedaError, setSchedaError] = useState(null);

  const handleInserisciScheda = async () => {
    if (!form.produttore || !form.vino) { setSchedaError("Inserisci produttore e nome vino prima di cercare."); return; }
    setSchedaLoading(true); setSchedaError(null);
    try {
      const queryVino = [form.vino, form.denominazione !== "n.d." ? form.denominazione : ""].filter(Boolean).join(" ");
      const res = await fetch("/api/enrich-wine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produttore: form.produttore, vino: queryVino, annata: form.annata }) });
      const data = await res.json();
      if (!res.ok || data.raw !== undefined) throw new Error(data.error || "Ricerca non riuscita");
      setForm(prev => ({
        ...prev,
        vitigno: data.vitigno || prev.vitigno,
        fermentazione: data.fermentazione || prev.fermentazione,
        macerazione: data.macerazione || prev.macerazione,
        malolattica: data.malolattica || prev.malolattica,
        note: data.note || prev.note,
        note_cantina: data.note_cantina || prev.note_cantina,
      }));
    } catch (err) {
      setSchedaError("Scheda tecnica non trovata sul web. Puoi compilare a mano.");
    } finally {
      setSchedaLoading(false);
    }
  };

  const field = (key, label, type = "text", opts = {}) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: M3.onSurfaceVariant, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "'Roboto', sans-serif", marginBottom: 4 }}>{label}</div>
      {opts.select ? (
        <select value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${M3.outline}`, background: M3.surfaceContainerHighest, fontSize: 16, fontFamily: "'Roboto', sans-serif", color: M3.onSurface }}>
          {(opts.options || Object.keys(TIPO)).map(t => <option key={t}>{t}</option>)}
        </select>
      ) : opts.textarea ? (
        <textarea value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} rows={opts.rows || 3} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${M3.outline}`, background: M3.surfaceContainerHighest, fontSize: 16, fontFamily: "'Roboto', sans-serif", color: M3.onSurface, outline: "none", resize: "vertical", lineHeight: 1.5 }} />
      ) : (
        <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${M3.outline}`, background: M3.surfaceContainerHighest, fontSize: 16, fontFamily: "'Roboto', sans-serif", color: M3.onSurface, outline: "none" }} />
      )}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.45)" }} onClick={onAnnulla}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", background: M3.surface, borderRadius: "28px 28px 0 0", maxHeight: "92vh", overflowY: "auto", padding: "20px 20px 40px", animation: "slideUp 0.3s cubic-bezier(0.2,0,0,1)" }}>
        <div style={{ width: 32, height: 4, background: M3.outlineVariant, borderRadius: 2, margin: "0 auto 18px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", display:"flex", alignItems:"center", gap:8 }}>{IC.edit} Modifica dati</div>
            <div style={{ fontSize: 12, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", marginTop: 2 }}>{wine.produttore} · {wine.vino}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: M3.primary, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "'Roboto', sans-serif", marginBottom: 12 }}>Dati principali</div>
        {field("produttore", "Produttore")}{field("vino", "Nome vino")}{field("denominazione", "Denominazione", "text", { select: true, options: DENOMINAZIONI })}{field("annata", "Annata")}{field("tipologia", "Tipologia", "text", { select: true })}{field("bottiglie", "N. bottiglie", "number")}{field("prezzo", "Prezzo di acquisto (€/bot.)", "number")}
        <div style={{ height: 1, background: M3.outlineVariant, margin: "8px 0 16px" }} />
        <div style={{ fontSize: 11, fontWeight: 600, color: M3.primary, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "'Roboto', sans-serif", marginBottom: 12 }}>Scheda tecnica</div>
        <button onClick={handleInserisciScheda} disabled={schedaLoading || !form.produttore || !form.vino}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: (schedaLoading || !form.produttore || !form.vino) ? M3.surfaceContainerHighest : M3.primaryContainer, color: (schedaLoading || !form.produttore || !form.vino) ? M3.onSurfaceVariant : M3.onPrimaryContainer, border: "none", borderRadius: 16, padding: "14px 20px", fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: (schedaLoading || !form.produttore || !form.vino) ? "default" : "pointer", boxShadow: "0 3px 8px rgba(0,0,0,0.14)", marginBottom: 14 }}>
          {schedaLoading
            ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ display: "inline-flex", animation: "spin 1s linear infinite" }}>{IC.spinner}</span> Ricerca in corso…</span>
            : <span style={{ display: "flex", alignItems: "center", gap: 8 }}><SchedaTecnicaIcon size={20} /> Inserisci scheda tecnica</span>}
        </button>
        {schedaError && (
          <div style={{ background: "#FDECEA", color: "#B71C1C", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "'Roboto', sans-serif", marginBottom: 12 }}>{schedaError}</div>
        )}
        {field("vitigno", "🍇 Vitigno")}{field("macerazione", "⏱ Macerazione", "text", { textarea: true, rows: 2 })}{field("fermentazione", "🧪 Fermentazione", "text", { textarea: true, rows: 2 })}{field("malolattica", "🔄 Legno")}
        <div style={{ height: 1, background: M3.outlineVariant, margin: "8px 0 16px" }} />
        {field("note", "📝 Note", "text", { textarea: true, rows: 4 })}
        {field("note_cantina", "🏛 Note cantina", "text", { textarea: true, rows: 4 })}
        {formError && (
          <div style={{ background: "#FDECEA", color: "#B71C1C", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "'Roboto', sans-serif", marginBottom: 10 }}>{formError}</div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={onAnnulla} style={{ flex: 1, padding: "11px", borderRadius: 20, border: `1px solid ${M3.outline}`, background: "transparent", color: M3.onSurface, fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>Annulla</button>
          <button onClick={() => {
              if (!form.produttore || !form.vino) { setFormError("Produttore e nome vino sono obbligatori."); return; }
              if (form.bottiglie === "" || form.prezzo === "") { setFormError("Bottiglie e prezzo non possono essere vuoti."); return; }
              setFormError(null);
              onSalva(form);
            }}
            style={{ flex: 2, padding: "11px", borderRadius: 20, border: "none", background: form.produttore && form.vino ? M3.primary : M3.surfaceContainerHighest, color: form.produttore && form.vino ? M3.onPrimary : M3.onSurfaceVariant, fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>
            <span style={{display:"flex",alignItems:"center",gap:6}}>{IC.save} Salva modifiche</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Segna come bevuto ─────────────────────────────────────────────────
function ModalBevi({ wine, onConferma, onAnnulla }) {
  const [nota, setNota] = useState("");
  const [rating, setRating] = useState(0);
  // Data apertura: default oggi, modificabile (non oltre oggi)
  const todayIso = new Date().toISOString().slice(0, 10);
  const [dataApertura, setDataApertura] = useState(todayIso);
  if (!wine) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.4)" }} onClick={onAnnulla}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", background: M3.surface, borderRadius: "28px 28px 0 0", padding: "24px 20px 32px", animation: "slideUp 0.3s cubic-bezier(0.2,0,0,1)" }}>
        <div style={{ width: 32, height: 4, background: M3.outlineVariant, borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ fontSize: 20, fontWeight: 500, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", marginBottom: 4, display:"flex", alignItems:"center", gap:8 }}>{IC.wineglass} Segna come bevuto</div>
        <div style={{ fontSize: 14, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", marginBottom: 16 }}>{wine.produttore} · {wine.vino} · {wine.annata}</div>
        <div style={{ background: M3.surfaceContainer, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {IC.calendar} Data apertura:
            <input type="date" value={dataApertura} max={todayIso} onChange={e => setDataApertura(e.target.value || todayIso)}
              style={{ border: "none", background: "none", fontSize: 16, fontWeight: 700, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", padding: 0 }} />
          </label>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...S.meta, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" }}>Valutazione (opzionale)</div>
          <RatingDial value={rating} onChange={setRating} size={200} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ ...S.meta, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>Nota di degustazione (opzionale)</div>
          <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Come ti è sembrato? Abbinamento, occasione…" style={{ width: "100%", minHeight: 70, background: M3.surfaceContainerHighest, border: "none", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "'Roboto', sans-serif", color: M3.onSurface, resize: "vertical", outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onAnnulla} style={{ flex: 1, padding: "11px", borderRadius: 20, border: `1px solid ${M3.outline}`, background: "transparent", color: M3.onSurface, fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>Annulla</button>
          <button onClick={() => onConferma(nota, dataApertura, rating)} style={{ flex: 1, padding: "11px", borderRadius: 20, border: "none", background: M3.primary, color: M3.onPrimary, fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>Conferma</button>
        </div>
      </div>
    </div>
  );
}

// ─── Hook: caricamento dati cantina ─────────────────────────────────────────
// Estrae stato ed effetto di caricamento da Cantina(), distinguendo errore
// HTTP/timeout da risultato legittimamente vuoto (via sb.getOrThrow).
function useCantinaData() {
  const [wines, setWines] = useState([]);
  const [bevuti, setBevuti] = useState([]);
  const [ratings, setRatings] = useState({});
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [fetchedWines, bev, produttori] = await Promise.all([
          sb.getOrThrow("wines", { order: "id.asc" }),
          sb.getOrThrow("bevuti"),
          sb.getOrThrow("produttori", { order: "nome.asc" }),
        ]);
        if (cancelled) return;
        // P3: prima dei vini — badge Slow Wine e sito produttore leggono da qui.
        setProduttori(produttori);
        setWines(fetchedWines.map(normalizzaWine));
        // F5: 1:N — nessuna deduplica, uid è chiave univoca
        const bevFromDb = bev.map(b => ({ uid: b.uid, id: b.wine_id, data: b.data, consumedOn: b.consumed_on, nota: b.nota || "", produttore: b.produttore, vino: b.vino, annata: b.annata, tipologia: b.tipologia, prezzo: b.prezzo }));
        setBevuti(bevFromDb);
        setRatings(ratingPerVino(bev));
        setDbError(null);
      } catch (e) {
        if (cancelled) return;
        console.error("Errore caricamento dati:", e);
        setDbError(e.status === "timeout" ? "Errore: connessione troppo lenta, riprova" : "Errore: impossibile caricare la cantina");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  return { wines, setWines, bevuti, setBevuti, ratings, setRatings, loading, dbError, setDbError };
}

// ─── App principale ───────────────────────────────────────────────────────────

export default function Cantina() {
  const [tab, setTab] = useState("lista");
  const { wines, setWines, bevuti, setBevuti, ratings, setRatings, loading, dbError, setDbError } = useCantinaData();
  const [pendingBevi, setPendingBevi] = useState(null);
  const [showAggiungi, setShowAggiungi] = useState(false);
  const [pendingModifica, setPendingModifica] = useState(null);
  const [compact, setCompact] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);
  const [selectedWineForScheda, setSelectedWineForScheda] = useState(null);
  const [schedaFabLoading, setSchedaFabLoading] = useState(false);
  const scrollRef = useRef(null);
  const lastScrollY = useRef(0);

  // Forza aggiornamento Service Worker ad ogni deploy
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.update());
      });
    }
  }, []);

  const allWines = wines.filter(w => w.bottiglie > 0);

  // F22: per TabBevuti — include vini a 0 bottiglie (già bevuti)
  const winesForBevuti = wines;

  // BottleImage e WebsiteView fanno rete e cache: restano qui e scendono a
  // WineDetail come render prop, attraverso le schermate che lo montano.
  const renderBottiglia = (w, attiva) => <BottleImage wine={w} active={attiva} />;
  const renderSito = (w) => <WebsiteView wine={w} />;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const y = el.scrollTop;
      const goingDown = y > lastScrollY.current;
      setCompact(y > 40);
      setFabVisible(!goingDown || y < 60);
      lastScrollY.current = y;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const handleElimina = async (wine) => {
    setDbError(null);
    const current = wines.find(w => w.id === wine.id);
    const qty = current?.bottiglie ?? wine.bottiglie ?? 0;
    const prevWines = wines;
    // A3: RPC atomica — decrementa, o elimina la riga (CASCADE su wine_images) se restava l'ultima
    if (qty > 1) {
      setWines(prev => prev.map(w => w.id === wine.id ? { ...w, bottiglie: qty - 1 } : w));
    } else {
      setWines(prev => prev.filter(w => w.id !== wine.id));
      imgSessionCache.delete(wine.id);
    }
    const result = await sb.rpc("elimina_bottiglia", { p_wine_id: wine.id });
    if (!result) {
      setWines(prevWines);
      setDbError(qty > 1 ? "Errore: rimozione bottiglia non riuscita" : "Errore: eliminazione non riuscita");
    }
  };

  const handleBevi = (wineId) => setPendingBevi(allWines.find(w => w.id === wineId));

  const handleConferma = async (nota, dataIso, rating) => {
    setDbError(null);
    const wineId = pendingBevi.id;
    const current = wines.find(w => w.id === wineId);
    // Snapshot dati vino: bevuti è uno storico indipendente da wines
    const snap = current ? { produttore: current.produttore, vino: current.vino, annata: current.annata, tipologia: current.tipologia, prezzo: current.prezzo } : {};
    // A3: RPC atomica — insert bevuta + decremento bottiglie in un'unica transazione.
    // uid lo assegna il DB: uid temporaneo negativo finché non risponde.
    const tempUid = -Date.now();
    // Snapshot per rollback
    const prevBevuti = bevuti;
    const prevRatings = ratings;
    const prevWines = wines;
    // Update ottimistico (data apertura scelta nel modale, non necessariamente oggi)
    setBevuti(prev => [...prev, { uid: tempUid, id: wineId, data: formatDataIt(dataIso), consumedOn: dataIso, nota: nota || "", ...snap }]);
    if (rating > 0) setRatings(prev => ({ ...prev, [wineId]: rating }));
    // F4: decrementa bottiglie nello state locale
    setWines(prev => prev.map(w => w.id === wineId ? { ...w, bottiglie: Math.max(0, (w.bottiglie || 1) - 1) } : w));
    setPendingBevi(null);
    const result = await sb.rpc("bevi_bottiglia", { p_wine_id: wineId, p_nota: nota || "", p_rating: rating || null, p_consumed_on: dataIso });
    if (!result) {
      setBevuti(prevBevuti);
      setRatings(prevRatings);
      setWines(prevWines);
      setDbError("Errore: bevuta non registrata");
      return;
    }
    // Riallinea l'entry ottimistica con uid e consumed_on reali assegnati dal DB
    setBevuti(prev => prev.map(b => b.uid === tempUid ? { ...b, uid: result.uid, consumedOn: result.consumed_on } : b));
  };

  const handleRiporta = async (uid) => {
    setDbError(null);
    const entry = bevuti.find(b => b.uid === uid);
    if (!entry) return;
    // Snapshot per rollback
    const prevBevuti = bevuti;
    const prevWines = wines;
    // Ottimistico: rimuovi la bevuta e riaccredita la bottiglia
    setBevuti(prev => prev.filter(b => b.uid !== uid));
    setWines(prev => prev.map(w => w.id === entry.id ? { ...w, bottiglie: (w.bottiglie || 0) + 1 } : w));
    // A3: RPC atomica — elimina bevuta + riaccredito bottiglia in un'unica transazione
    const result = await sb.rpc("riporta_bottiglia", { p_uid: uid });
    if (!result) {
      setBevuti(prevBevuti);
      setWines(prevWines);
      setDbError("Errore: ripristino non riuscito");
    }
  };

  const handleSalva = async (form) => {
    setDbError(null);
    setShowAggiungi(false);
    setTab("lista");
    // A3: RPC atomica — incrementa se esiste già lo stesso produttore+vino+annata
    // (upsert sull'indice UNIQUE normalizzato di A2a), altrimenti inserisce una riga nuova.
    const result = await sb.rpc("aggiungi_o_incrementa", {
      p_produttore: form.produttore, p_vino: form.vino,
      p_denominazione: opzionale(form.denominazione, "n.d."), p_annata: annataDaForm(form.annata),
      p_tipologia: form.tipologia, p_bottiglie: form.bottiglie, p_prezzo: Number(form.prezzo) || null,
      p_vitigno: form.vitigno || "", p_note: form.note || "",
      p_macerazione: opzionale(form.macerazione, "—"), p_fermentazione: opzionale(form.fermentazione, "—"),
      p_malolattica: opzionale(form.malolattica, "—"),
    });
    if (!result) { setDbError("Errore salvataggio vino"); return; }
    setWines(prev => prev.some(w => w.id === result.id)
      ? prev.map(w => w.id === result.id ? normalizzaWine(result) : w)
      : [...prev, normalizzaWine(result)]);
  };

  const handleModifica = (wine) => setPendingModifica(wine);

  const handleSalvaModifica = async (form) => {
    setDbError(null);
    const wine = pendingModifica;
    // A2b: niente più placeholder testuali scritti nel DB — solo NULL per "non specificato".
    // annata è ora smallint|NULL, prezzo 0 diventa NULL (sconosciuto).
    const fields = {
      ...form, bottiglie: Number(form.bottiglie), prezzo: Number(form.prezzo) || null,
      annata: annataDaForm(form.annata),
      denominazione: opzionale(form.denominazione, "n.d."),
      macerazione: opzionale(form.macerazione, "—"),
      fermentazione: opzionale(form.fermentazione, "—"),
      malolattica: opzionale(form.malolattica, "—"),
    };
    const prevWines = wines;
    setWines(prev => prev.map(w => w.id === wine.id ? normalizzaWine({ ...w, ...fields }) : w));
    setPendingModifica(null);
    // A3: RPC atomica al posto dell'upsert diretto
    const result = await sb.rpc("modifica_vino", {
      p_id: wine.id, p_produttore: fields.produttore, p_vino: fields.vino,
      p_denominazione: fields.denominazione, p_annata: fields.annata, p_tipologia: fields.tipologia,
      p_bottiglie: fields.bottiglie, p_prezzo: fields.prezzo, p_vitigno: fields.vitigno || "",
      p_note: fields.note || "", p_note_cantina: fields.note_cantina || "",
      p_macerazione: fields.macerazione, p_fermentazione: fields.fermentazione, p_malolattica: fields.malolattica,
    });
    if (!result) {
      setWines(prevWines);
      setDbError("Errore: modifiche non salvate");
    }
  };

  const handleSchedaTecnica = async () => {
    if (!selectedWineForScheda || schedaFabLoading) return;
    setSchedaFabLoading(true);
    const wine = selectedWineForScheda;
    try {
      const queryVino = [wine.vino, wine.denominazione && wine.denominazione !== "n.d." ? wine.denominazione : ""].filter(Boolean).join(" ");
      const res = await fetch("/api/enrich-wine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produttore: wine.produttore, vino: queryVino, annata: wine.annata }) });
      const data = await res.json();
      if (!res.ok || data.raw !== undefined) throw new Error(data.error || "Ricerca non riuscita");
      const patch = {};
      if (data.vitigno) patch.vitigno = data.vitigno;
      if (data.fermentazione) patch.fermentazione = data.fermentazione;
      if (data.macerazione) patch.macerazione = data.macerazione;
      if (data.malolattica) patch.malolattica = data.malolattica;
      if (data.note) patch.note = data.note;
      if (data.note_cantina) patch.note_cantina = data.note_cantina;
      if (data.prezzo_stimato) patch.valore = data.prezzo_stimato;
      if (Object.keys(patch).length > 0) {
        setWines(prev => prev.map(w => w.id === wine.id ? { ...w, ...patch } : w));
        setSelectedWineForScheda(prev => prev ? { ...prev, ...patch } : prev);
        // A3: RPC atomica — aggiorna solo i campi forniti dall'AI
        await sb.rpc("aggiorna_scheda_tecnica", {
          p_id: wine.id, p_vitigno: patch.vitigno ?? null, p_fermentazione: patch.fermentazione ?? null,
          p_macerazione: patch.macerazione ?? null, p_malolattica: patch.malolattica ?? null,
          p_note: patch.note ?? null, p_note_cantina: patch.note_cantina ?? null, p_valore: patch.valore ?? null,
        });
      }
    } catch {
      setDbError("Scheda tecnica non trovata. Riprova o compila a mano.");
    } finally {
      setSchedaFabLoading(false);
    }
  };

  const handleRate = async (wineId, score) => {
    setDbError(null);
    const prevScore = ratings[wineId] ?? 0;
    setRatings(prev => ({ ...prev, [wineId]: score }));
    // N3: il rating è per-vino, ma in DB c'è una riga per bevuta.
    // A3: RPC atomica — aggiorna tutte le bevute del vino in un'unica transazione.
    if (bevuti.some(b => b.id === wineId)) {
      const result = await sb.rpc("valuta_vino", { p_wine_id: wineId, p_rating: score });
      if (!result) {
        setRatings(prev => ({ ...prev, [wineId]: prevScore }));
        setDbError("Errore: valutazione non salvata");
      }
    }
  };

  // 1:N — cantina = tutti i vini con bottiglie > 0 (già filtrati in allWines)
  const cantina = allWines;
  const totBottiglie = cantina.reduce((a, w) => a + w.bottiglie, 0);
  const totValore    = costoGiacenza(cantina);

  if (loading) return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: M3.surface, gap: 16 }}>
      <div style={{ color: M3.primary, animation: "spin 1.2s linear infinite" }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8l-1 9a4 4 0 0 1-6 0z"/><line x1="12" y1="12" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg></div>
      <div style={{ fontSize: 16, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>Carico la cantina…</div>
    </div>
  );

  const NAV = [
    { id: "lista",       icon: IC.lista,  label: "Lista" },
    { id: "bevuti",      icon: IC.bevuti, label: "Bevuti", badge: bevuti.length },
    { id: "statistiche", icon: IC.stats,  label: "Statistiche" },
  ];

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: M3.surface, fontFamily: "'Roboto', sans-serif", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; margin: 0; padding: 0; overflow: hidden; background: #FFF8F7; }
        input, textarea, select { outline: none; }
        ::-webkit-scrollbar { width: 0; height: 0; }
        @keyframes slideUp  { from { transform:translateY(100%) } to { transform:translateY(0) } }
        @keyframes slideInX  { from { transform:translateX(100%) } to { transform:translateX(0) } }
        @keyframes slideOutX { from { transform:translateX(0) } to { transform:translateX(100%) } }
        @keyframes spin     { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        @keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
      `}</style>

      {/* ── App Bar ── */}
      <div style={{ flexShrink: 0, zIndex: 20, paddingTop: "env(safe-area-inset-top)", background: compact ? M3.surfaceContainer : M3.surface, transition: "background 0.25s cubic-bezier(0.2,0,0,1)" }}>
        <div style={{ display: "flex", alignItems: "center", height: 64, padding: "0 16px", gap: 12 }}>
          <div style={{ flex: 1, fontSize: 22, fontWeight: 400, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", letterSpacing: -0.3, lineHeight: 1 }}>Wines di Omar<span style={{ fontSize: 10, fontWeight: 500, opacity: 0.4, marginLeft: 6, verticalAlign: "super" }}>{REV}</span></div>
          <div style={{ padding: "0 12px", height: 28, borderRadius: 14, background: M3.primaryContainer, color: M3.onPrimaryContainer, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, fontFamily: "'Roboto', sans-serif", flexShrink: 0 }}>
            <span style={{display:"flex",alignItems:"center",gap:5}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8M9 3v3.5L6 10v11a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10l-3-3.5V3"/><line x1="6" y1="14" x2="18" y2="14"/></svg> {totBottiglie} · ~{totValore}€</span>
          </div>
        </div>
      </div>

      {/* ── DB Error Banner ── */}
      {dbError && (
        <div style={{ background: "#FDECEA", color: "#B71C1C", padding: "10px 16px", fontSize: 13, fontFamily: "'Roboto', sans-serif", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, zIndex: 15 }}>
          <span>{dbError}</span>
          <button onClick={() => setDbError(null)} style={{ background: "none", border: "none", color: "#B71C1C", cursor: "pointer", fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "0 4px" }}>✕</button>
        </div>
      )}

      {/* ── Scrollable content ── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        {tab === "lista" && <TabLista wines={allWines} bevuti={bevuti} onBevi={handleBevi} onElimina={handleElimina} onModifica={handleModifica} onAggiungi={() => setShowAggiungi(true)} compact={compact} ratings={ratings} onRate={handleRate} onWineOpen={w => setSelectedWineForScheda(w)} onWineClose={() => setSelectedWineForScheda(null)} renderBottiglia={renderBottiglia} renderSito={renderSito} />}
        {tab === "bevuti" && <TabBevuti bevuti={bevuti} allWines={winesForBevuti} onRiporta={handleRiporta} onElimina={handleElimina} onModifica={handleModifica} ratings={ratings} onRate={handleRate} renderBottiglia={renderBottiglia} renderSito={renderSito} />}
        {tab === "statistiche" && <TabStatistiche wines={allWines} bevuti={bevuti} />}
      </div>

      {/* ── Extended FAB ── */}
      {tab === "lista" && (
        <div style={{ position: "fixed", bottom: 88, right: 16, zIndex: 50, opacity: fabVisible ? 1 : 0, transform: fabVisible ? "translateY(0) scale(1)" : "translateY(10px) scale(0.92)", transition: "opacity 0.2s, transform 0.2s cubic-bezier(0.2,0,0,1)", pointerEvents: fabVisible ? "auto" : "none" }}>
          {selectedWineForScheda ? (
            <button onClick={handleSchedaTecnica} disabled={schedaFabLoading} style={{ display: "flex", alignItems: "center", gap: 8, background: M3.primaryContainer, color: M3.onPrimaryContainer, border: "none", borderRadius: 16, padding: "14px 20px", fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: schedaFabLoading ? "default" : "pointer", boxShadow: "0 3px 8px rgba(0,0,0,0.14)", opacity: schedaFabLoading ? 0.7 : 1 }}>
              {schedaFabLoading
                ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Ricerca in corso…</span>
                : <span style={{ display: "flex", alignItems: "center", gap: 8 }}><SchedaTecnicaIcon size={18} /> Scheda tecnica</span>}
            </button>
          ) : (
            <button onClick={() => setShowAggiungi(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: M3.primaryContainer, color: M3.onPrimaryContainer, border: "none", borderRadius: 16, padding: "14px 20px", fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer", boxShadow: "0 3px 8px rgba(0,0,0,0.14)" }}>
              <span style={{display:"flex",alignItems:"center",gap:8}}>{IC.add} Aggiungi vino</span>
            </button>
          )}
        </div>
      )}

      {/* ── Navigation Bar M3 ── */}
      <div style={{ background: M3.surfaceContainer, flexShrink: 0, borderTop: `1px solid ${M3.outlineVariant}`, display: "flex", alignItems: "flex-start", justifyContent: "space-around", paddingTop: 10, paddingBottom: "env(safe-area-inset-bottom)", zIndex: 10 }}>
        {NAV.map(nav => (
          <div key={nav.id} onClick={() => setTab(nav.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}>
            <div style={{ position: "relative" }}>
              <div style={{ width: 64, height: 32, borderRadius: 16, background: tab === nav.id ? M3.secondaryContainer : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, transition: "background 0.2s" }}>
                {nav.icon}
              </div>
              {nav.badge > 0 && (
                <div style={{ position: "absolute", top: -2, right: 6, minWidth: 16, height: 16, borderRadius: 8, background: M3.primary, color: M3.onPrimary, fontSize: 10, fontWeight: 700, fontFamily: "'Roboto', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
                  {nav.badge}
                </div>
              )}
            </div>
            <span style={{ fontSize: 12, fontFamily: "'Roboto', sans-serif", fontWeight: tab === nav.id ? 700 : 400, color: tab === nav.id ? M3.onSecondaryContainer : M3.onSurfaceVariant, letterSpacing: 0.3 }}>
              {nav.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Modals ── */}
      {pendingBevi && <ModalBevi wine={pendingBevi} onConferma={handleConferma} onAnnulla={() => setPendingBevi(null)} />}
      {showAggiungi && <ModalAggiungi onSalva={handleSalva} onAnnulla={() => setShowAggiungi(false)} />}
      {pendingModifica && <ModalModifica wine={pendingModifica} onSalva={handleSalvaModifica} onAnnulla={() => setPendingModifica(null)} />}
    </div>
  );
}
