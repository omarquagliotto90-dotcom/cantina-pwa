// La Mia Cantina — controller. La revisione è in REV, qui sotto: un solo
// numero in tutto il progetto, così non può tornare a divergere.
import { useState, useRef, useEffect } from "react";
import { M3, T, OCCHIELLO } from "./ui/theme";
import { TIPO, IC, SliderVoto, SchedaTecnicaIcon,
         NavCantinaIcon, NavBevutiIcon, NavStatisticheIcon } from "./ui/components";
import { formatDataIt, setProduttori } from "./ui/domain";
import TabLista from "./ui/Lista";
import TabStatistiche from "./ui/Statistiche";
import TabBevuti from "./ui/Bevuti";

// Contatore progressivo delle modifiche ad App.jsx: sale di 0.1 a ogni
// modifica del file e compare accanto al titolo nell'app bar. Sostituisce il
// vecchio marcatore fisso "b2" e, da 0.5, anche src/version.js, che era
// fermo a 0.3 e non veniva importato da nessuno.
const REV = "1.6";

// PWA aggiunta alla schermata Home: cambia come iOS misura il viewport (vedi
// il commento sul guscio in Cantina()). Non cambia a runtime, si legge una
// volta sola. `navigator.standalone` e' la variante iOS, non standard.
const STANDALONE = typeof window !== "undefined" && (
  window.matchMedia?.("(display-mode: standalone)").matches === true ||
  window.navigator.standalone === true
);

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
  // `filtro` è una condizione PostgREST già formata (es. "deleted_at=is.null").
  // Va composta qui e non concatenata al nome della tabella: un secondo "?"
  // nella query string fa rispondere 400 a PostgREST, ed è esattamente il bug
  // che in P3 teneva muta la cache dei siti produttore.
  async getOrThrow(table, { order = "created_at.asc", filtro = "" } = {}) {
    const qs = filtro ? `${filtro}&order=${order}` : `order=${order}`;
    return (await sbFetch(`${table}?${qs}`)).json();
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

  // C5: misure e resa dell'hero del ridisegno (190x264, mix-blend multiply
  // sul fondo caldo). La ricerca e la cache restano qui sopra: e' la ragione
  // per cui questo componente non e' mai sceso in ui/.
  const vuoto = (testo) => (
    <div style={{ width: 170, height: 246, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: T.tenueAlt, fontFamily: T.sans }}>
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 22h8" /><path d="M12 15v7" /><path d="M7 2h10l-1.2 8a3.9 3.9 0 0 1-7.6 0Z" />
      </svg>
      <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", textAlign: "center" }}>{testo}</span>
    </div>
  );

  if (status === "idle" || status === "loading") return vuoto("Ricerca in corso…");
  if (status === "error" || !url) return vuoto("Immagine non disponibile");

  return (
    <>
      {lightbox && <Lightbox url={url} onClose={() => setLightbox(false)} />}
      <img src={url} alt={wine.produttore + " " + wine.vino}
        onClick={() => setLightbox(true)}
        onError={() => { setStatus("error"); imgSessionCache.set(wine.id, "NOT_FOUND"); }}
        style={{ width: 190, height: 264, objectFit: "contain", borderRadius: T.raggio, mixBlendMode: "multiply", cursor: "zoom-in" }} />
        {/* `contain`: vedi il commento gemello in WineCard. Il rifilo del
            margine bianco, che rendera' le bottiglie tutte della stessa
            altezza, e' il passo successivo e richiede una route proxy. */}
    </>
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

  // C5: sheet del ridisegno. Il RatingDial lascia il posto a SliderVoto; i
  // campi sono filetti invece di riquadri. Restano a 16px, non ai 14 del
  // design: sotto quella soglia Safari su iOS zooma al tap.
  const campo = { width: "100%", boxSizing: "border-box", padding: "11px 0", border: 0, borderBottom: `1px solid ${T.divisore}`, background: "transparent", outline: 0, fontFamily: T.sans, fontSize: 16, color: T.testo };
  const etichetta = { display: "grid", gap: 7, color: T.secondarioAlt, fontFamily: T.sans, fontSize: 10, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", background: "rgba(31,27,25,.42)" }} onClick={onAnnulla}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxHeight: "88%", overflowY: "auto", background: T.superficie, borderTop: `1px solid ${T.divisore}`, padding: "26px 22px 28px", paddingBottom: "calc(28px + env(safe-area-inset-bottom))", fontFamily: T.sans, color: T.testo, animation: "slideUp 0.3s cubic-bezier(0.2,0,0,1)" }}>
        <p style={{ ...OCCHIELLO }}>Nuova bevuta</p>
        <h3 style={{ margin: "5px 0 4px", fontFamily: T.serif, fontSize: 28, fontWeight: 400 }}>Com'è stata?</h3>
        <p style={{ margin: 0, color: T.secondarioAlt, fontSize: 12 }}>{[wine.produttore, wine.vino, wine.annata].filter(Boolean).join(" · ")}</p>

        <SliderVoto value={rating} onChange={setRating} titolo="La mia valutazione" />

        <label style={{ ...etichetta, marginTop: 20 }}>Nota personale
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3}
            placeholder="Profumi, momento, persone…"
            style={{ ...campo, resize: "none", fontWeight: 400, letterSpacing: 0, textTransform: "none" }} />
        </label>

        <label style={{ ...etichetta, marginTop: 16 }}>Data apertura
          <input type="date" value={dataApertura} max={todayIso}
            onChange={e => setDataApertura(e.target.value || todayIso)}
            style={{ ...campo, fontWeight: 400, letterSpacing: 0, textTransform: "none" }} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 24 }}>
          <button type="button" onClick={onAnnulla}
            style={{ height: 52, border: `1px solid ${T.divisore}`, borderRadius: T.raggio, background: "transparent", color: T.testo, fontFamily: T.sans, fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer" }}>Annulla</button>
          <button type="button" onClick={() => onConferma(nota, dataApertura, rating)}
            style={{ height: 52, border: 0, borderRadius: T.raggio, background: T.accento, color: T.superficie, fontFamily: T.sans, fontSize: 12, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", cursor: "pointer" }}>Conferma</button>
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
  const [immagini, setImmagini] = useState({});   // wine_id -> url, per le miniature
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [fetchedWines, bev, produttori, immagini] = await Promise.all([
          // P1b: le righe soft-deleted restano in tabella ma fuori dall'app.
          sb.getOrThrow("wines", { order: "id.asc", filtro: "deleted_at=is.null" }),
          sb.getOrThrow("bevuti"),
          sb.getOrThrow("produttori", { order: "nome.asc" }),
          // C2: il ridisegno mette una miniatura in ogni riga della lista. Una
          // GET sola all'avvio invece di una ricerca per vino: senza questa,
          // scorrere la lista accoderebbe una chiamata Serper per ogni vino
          // senza immagine, e imgQueue le serializza con 2s di pausa.
          sb.getOrThrow("wine_images"),
        ]);
        if (cancelled) return;
        // P3: prima dei vini — badge Slow Wine e sito produttore leggono da qui.
        setProduttori(produttori);
        setWines(fetchedWines.map(normalizzaWine));
        // F5: 1:N — nessuna deduplica, uid è chiave univoca
        const bevFromDb = bev.map(b => ({ uid: b.uid, id: b.wine_id, data: b.data, consumedOn: b.consumed_on, nota: b.nota || "", produttore: b.produttore, vino: b.vino, annata: b.annata, tipologia: b.tipologia, prezzo: b.prezzo }));
        setBevuti(bevFromDb);
        setRatings(ratingPerVino(bev));
        // Le stesse url alimentano la lista e pre-riempiono la cache del
        // dettaglio: per i vini gia' fotografati BottleImage non fa piu' nulla.
        const mappa = {};
        for (const r of immagini) {
          if (!r.image_url) continue;
          mappa[r.wine_id] = r.image_url;
          if (!imgSessionCache.has(r.wine_id)) imgSessionCache.set(r.wine_id, r.image_url);
        }
        setImmagini(mappa);
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

  return { wines, setWines, bevuti, setBevuti, ratings, setRatings, immagini, loading, dbError, setDbError };
}

// ─── App principale ───────────────────────────────────────────────────────────

export default function Cantina() {
  const [tab, setTab] = useState("lista");
  const { wines, setWines, bevuti, setBevuti, ratings, setRatings, immagini, loading, dbError, setDbError } = useCantinaData();
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

  if (loading) return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: T.superficie, gap: 16 }}>
      <div style={{ color: M3.primary, animation: "spin 1.2s linear infinite" }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8l-1 9a4 4 0 0 1-6 0z"/><line x1="12" y1="12" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg></div>
      <div style={{ fontSize: 16, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>Carico la cantina…</div>
    </div>
  );

  // C1: icone e etichette del ridisegno. Il badge col numero di bevute non c'è
  // più — il design non lo prevede, e il conteggio è in cima alla schermata
  // Bevuti. Si rimette in due righe se serve.
  const NAV = [
    { id: "lista",       Icona: NavCantinaIcon,     label: "Cantina" },
    { id: "bevuti",      Icona: NavBevutiIcon,      label: "Bevuti" },
    { id: "statistiche", Icona: NavStatisticheIcon, label: "Statistiche" },
  ];

  // Il guscio riempie il viewport riportato, e basta. Provato e scartato il
  // 21/09/2026: allungarlo di `env(safe-area-inset-top)` in standalone, per
  // recuperare i 59px che iOS non conta, TAGLIA la barra di navigazione. La
  // webview si ferma davvero al viewport riportato e scarta quel che c'e'
  // sotto, quindi li' il CSS non arriva. La banda residua sull'iPhone si
  // chiude solo cambiando `apple-mobile-web-app-status-bar-style`.
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "100%",
      display: "flex", flexDirection: "column", background: T.superficie, fontFamily: T.sans, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');
        /* C1: le due famiglie del ridisegno. Roboto resta finché le schermate
           vecchie la usano, e se ne va con l'ultima. */
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; margin: 0; padding: 0; overflow: hidden; background: ${T.superficie}; }
        input, textarea, select { outline: none; }
        ::selection { background: ${T.selezione}; }
        ::-webkit-scrollbar { width: 0; height: 0; }
        @keyframes slideUp  { from { transform:translateY(100%) } to { transform:translateY(0) } }
        @keyframes slideInX  { from { transform:translateX(100%) } to { transform:translateX(0) } }
        @keyframes slideOutX { from { transform:translateX(0) } to { transform:translateX(100%) } }
        @keyframes spin     { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        @keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
      `}</style>

      {/* C2: l'app bar globale non c'e' piu'. Nel ridisegno ogni schermata
          porta la propria intestazione editoriale, e i totali che stavano
          nella pastiglia sono ora nel riepilogo della Cantina. Resta solo lo
          spazio per la status bar dell'iPhone. */}
      <div style={{ flexShrink: 0, paddingTop: "env(safe-area-inset-top)" }} />

      {/* ── DB Error Banner ── */}
      {dbError && (
        <div style={{ background: "#FDECEA", color: "#B71C1C", padding: "10px 16px", fontSize: 13, fontFamily: "'Roboto', sans-serif", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, zIndex: 15 }}>
          <span>{dbError}</span>
          <button onClick={() => setDbError(null)} style={{ background: "none", border: "none", color: "#B71C1C", cursor: "pointer", fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "0 4px" }}>✕</button>
        </div>
      )}

      {/* ── Scrollable content ── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        {tab === "lista" && <TabLista wines={allWines} bevuti={bevuti} onBevi={handleBevi} onElimina={handleElimina} onModifica={handleModifica} compact={compact} ratings={ratings} onRate={handleRate} onWineOpen={w => setSelectedWineForScheda(w)} onWineClose={() => setSelectedWineForScheda(null)} renderBottiglia={renderBottiglia} immagini={immagini} rev={REV} />}
        {tab === "bevuti" && <TabBevuti bevuti={bevuti} allWines={winesForBevuti} onRiporta={handleRiporta} onElimina={handleElimina} onModifica={handleModifica} ratings={ratings} onRate={handleRate} renderBottiglia={renderBottiglia} immagini={immagini} />}
        {tab === "statistiche" && <TabStatistiche wines={allWines} bevuti={bevuti} />}
      </div>

      {/* ── "+" flottante: l'azione primaria della Cantina ──
          Sta qui e non nell'intestazione di Lista perche' quella scorre via:
          il "+" spariva dopo poche decine di pixel e non tornava piu'. In
          basso a destra e' sempre a portata di pollice mentre si scorre.
          Sparisce quando e' aperta la scheda di un vino, che e' un overlay a
          tutto schermo: li' la slot ospita gia' "Scheda tecnica". Che la slot
          abbia ancora due significati resta il bug noto, e si chiude nello
          step B, quando "Scheda tecnica" entra nel dettaglio. */}
      {tab === "lista" && !selectedWineForScheda && (
        <button type="button" onClick={() => setShowAggiungi(true)} aria-label="Aggiungi un vino"
          style={{ position: "fixed", bottom: "calc(88px + env(safe-area-inset-bottom))", right: 16, zIndex: 50,
            width: 56, height: 56, display: "grid", placeItems: "center",
            border: `1px solid ${T.accento}`, borderRadius: "50%", background: T.accento, color: T.superficie,
            cursor: "pointer", boxShadow: "0 3px 8px rgba(0,0,0,0.14)",
            opacity: fabVisible ? 1 : 0,
            transform: fabVisible ? "translateY(0) scale(1)" : "translateY(10px) scale(0.92)",
            transition: "opacity 0.2s, transform 0.2s cubic-bezier(0.2,0,0,1)",
            pointerEvents: fabVisible ? "auto" : "none" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
        </button>
      )}

      {/* ── Extended FAB "Scheda tecnica" ── */}
      {tab === "lista" && (
        <div style={{ position: "fixed", bottom: "calc(88px + env(safe-area-inset-bottom))", right: 16, zIndex: 50, opacity: fabVisible ? 1 : 0, transform: fabVisible ? "translateY(0) scale(1)" : "translateY(10px) scale(0.92)", transition: "opacity 0.2s, transform 0.2s cubic-bezier(0.2,0,0,1)", pointerEvents: fabVisible ? "auto" : "none" }}>
          {selectedWineForScheda && (
            <button onClick={handleSchedaTecnica} disabled={schedaFabLoading} style={{ display: "flex", alignItems: "center", gap: 8, background: M3.primaryContainer, color: M3.onPrimaryContainer, border: "none", borderRadius: 16, padding: "14px 20px", fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: schedaFabLoading ? "default" : "pointer", boxShadow: "0 3px 8px rgba(0,0,0,0.14)", opacity: schedaFabLoading ? 0.7 : 1 }}>
              {schedaFabLoading
                ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Ricerca in corso…</span>
                : <span style={{ display: "flex", alignItems: "center", gap: 8 }}><SchedaTecnicaIcon size={18} /> Scheda tecnica</span>}
            </button>
          )}
        </div>
      )}

      {/* ── Navigation Bar — ridisegno 2026 ── */}
      {/* La pastiglia M3 lascia il posto a un trattino di 2px sopra la voce
          attiva.

          Il design e' `height:72px; padding-bottom:4px`, cioe' 68px di
          contenuto. Con `box-sizing: border-box` il safe-area dell'iPhone,
          che il prototipo non doveva gestire, andava SOTTRATTO da quei 72:
          su un telefono con home indicator il contenuto scendeva a 33px
          mentre i bottoni ne chiedono 37, e la barra si schiacciava.
          Ora il safe-area si somma all'altezza, quindi il contenuto resta
          68px su qualunque dispositivo. */}
      <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", height: "calc(72px + env(safe-area-inset-bottom))", paddingBottom: "calc(4px + env(safe-area-inset-bottom))", borderTop: `1px solid ${T.divisoreMedio}`, background: "rgba(255,252,247,.96)", backdropFilter: "blur(14px)", zIndex: 10 }}>
        {NAV.map(({ id, Icona, label }) => {
          const attiva = tab === id;
          return (
            <button key={id} type="button" onClick={() => setTab(id)} aria-current={attiva ? "page" : undefined}
              style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, border: 0, background: "transparent", color: attiva ? T.accento : T.testoUnita, cursor: "pointer", fontFamily: T.sans }}>
              <span aria-hidden="true" style={{ position: "absolute", top: 0, width: 22, height: 2, background: attiva ? T.accento : "transparent" }} />
              <Icona />
              <span style={{ fontSize: 11, letterSpacing: ".02em" }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Modals ── */}
      {pendingBevi && <ModalBevi wine={pendingBevi} onConferma={handleConferma} onAnnulla={() => setPendingBevi(null)} />}
      {showAggiungi && <ModalAggiungi onSalva={handleSalva} onAnnulla={() => setShowAggiungi(false)} />}
      {pendingModifica && <ModalModifica wine={pendingModifica} onSalva={handleSalvaModifica} onAnnulla={() => setPendingModifica(null)} />}
    </div>
  );
}
