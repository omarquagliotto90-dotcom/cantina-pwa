// v0.3 — data-driven
import { useState, useRef, useEffect } from "react";

// ─── Supabase client (no dipendenze esterne — REST API diretta) ───────────────
const SB_URL = "https://etbrgdldduadgbulasmy.supabase.co";
const SB_KEY = "sb_publishable_OKQmpbDBpDbPTOmKclMwZw_fRtg1KKR";

const sb = {
  async get(table) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?order=created_at.asc`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" }
    });
    if (!r.ok) return [];
    return r.json();
  },
  async getWhere(table, column, value) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" }
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data[0] || null;
  },
  async insert(table, row) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(row)
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data[0] || null;
  },
  async upsert(table, row, onConflict) {
    const qs = onConflict ? `?on_conflict=${onConflict}` : "";
    const r = await fetch(`${SB_URL}/rest/v1/${table}${qs}`, {
      method: "POST",
      headers: {
        apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row)
    });
    if (!r.ok) return null;
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  },
  async delete(table, column, value) {
    await fetch(`${SB_URL}/rest/v1/${table}?${column}=eq.${value}`, {
      method: "DELETE",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
    });
  },
  async patch(table, column, value, data) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?${column}=eq.${value}`, {
      method: "PATCH",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(data)
    });
    if (!r.ok) return null;
    const res = await r.json();
    return Array.isArray(res) ? res[0] : res;
  }
};

// ─── Cache in-memory immagini bottiglia ──
const imgSessionCache = new Map();

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

// ─── M3 Token System ────────────────────────────────────────────────────────
const M3 = {
  primary:                 "#9B3535",
  onPrimary:               "#FFFFFF",
  primaryContainer:        "#FFDAD6",
  onPrimaryContainer:      "#410002",
  secondary:               "#775652",
  onSecondary:             "#FFFFFF",
  secondaryContainer:      "#FFDAD6",
  onSecondaryContainer:    "#2C1512",
  surface:                 "#FFF8F7",
  onSurface:               "#201A19",
  surfaceVariant:          "#F5DEDD",
  onSurfaceVariant:        "#534341",
  surfaceContainerLowest:  "#FFFFFF",
  surfaceContainerLow:     "#F0E9E8",
  surfaceContainer:        "#F5EDEC",
  surfaceContainerHigh:    "#EFE7E6",
  surfaceContainerHighest: "#E9E1E0",
  outline:                 "#857370",
  outlineVariant:          "#D8C2BF",
  error:                   "#BA1A1A",
};

// ─── Icona SVG custom: Rosso fermo (rosso.svg) ───────────────────────────────
function RossoIcon({ size = 13, color = "currentColor" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      <path fill={color} d="m 13.287584,1.0538528 c -0.69781,0.6800915 -0.775344,1.2468419 -0.775344,4.7984209 0,3.5137989 -0.116302,4.2694503 -0.814111,5.4029403 -0.465206,0.717871 -1.201783,1.549096 -1.589454,1.85135 -0.4264395,0.264485 -1.2793181,1.284622 -1.8995928,2.229187 l -1.1242493,1.73801 v 14.244107 14.244119 l 1.1630159,1.133478 c 1.4343867,1.397963 3.1013752,1.662449 9.5367302,1.473535 5.039735,-0.113352 6.08645,-0.453398 7.365767,-2.38032 0.581508,-0.831224 0.659044,-2.531442 0.659044,-14.621934 0,-15.490949 0.07754,-15.188683 -3.217678,-18.173523 -0.891646,-0.831225 -1.783291,-1.889142 -1.977127,-2.380321 -0.193836,-0.528957 -0.348906,-2.6825735 -0.348906,-4.8739807 0,-4.94954234 -0.348904,-5.44072077 -3.876719,-5.44072077 -1.822059,0 -2.481101,0.15113271 -3.101376,0.75565227 z m 4.574529,1.4735353 c 0.348906,0.1889131 0.465206,0.9823568 0.387672,2.5314417 L 18.133483,7.2880174 H 16.38896 14.644437 L 14.528135,5.0588298 c -0.116302,-2.4180893 0.155068,-2.8714874 1.860825,-2.8714874 0.542741,0 1.201783,0.1511326 1.473153,0.3400457 z M 18.792526,11.0663 c 0.465207,1.209051 1.356852,2.531443 2.597403,3.702713 1.822057,1.738008 2.713704,3.551579 2.170962,4.420583 -0.155069,0.226693 -2.946306,0.377826 -7.404534,0.377826 H 9.0231928 v -1.095698 c 0,-0.793432 0.6202748,-1.738009 2.1709622,-3.476018 1.977128,-2.115835 2.558635,-3.060401 3.372746,-5.3651488 0.193836,-0.5289703 0.620277,-0.6800913 1.899593,-0.5667507 1.589455,0.1133526 1.666989,0.1889134 2.326032,2.0024935 z m 4.962202,19.420356 c 0.155068,6.61199 0.07754,9.256784 -0.232603,9.521258 C 23.01815,40.423532 9.7985368,40.347959 9.2170288,39.932304 8.9844261,39.743391 8.8681237,36.342933 8.9456582,30.599947 c 0.077536,-8.161075 0.1550693,-9.105652 0.7365773,-9.218993 0.3876715,-0.07561 3.6441155,-0.113353 7.2882325,-0.07561 l 6.590423,0.03776 z m 0.03876,11.826006 c 0.116303,1.246831 -0.155068,2.45588 -0.697809,3.022632 -0.54274,0.604518 -1.395618,0.680091 -6.706725,0.680091 -6.5904231,0 -6.9393283,-0.113353 -7.4820684,-2.191408 -0.4652066,-1.926922 -0.3489053,-1.964702 7.5208344,-1.964702 5.582478,0 7.327002,0.113341 7.365768,0.453387 z" />
      <path fill={color} d="m 13.830326,25.38598 -1.318086,1.284611 v 4.042757 4.042757 l 1.318086,1.284612 c 1.78329,1.738009 3.333978,1.738009 5.156036,-0.03775 l 1.356852,-1.322397 -0.155069,-4.19389 -0.116301,-4.19389 -1.279318,-1.095698 c -1.744523,-1.511317 -3.256445,-1.473536 -4.9622,0.188913 z m 3.799184,1.246831 c 0.969181,0.869004 1.046714,7.065377 0.03876,8.123294 -0.775344,0.831225 -1.589455,0.869004 -2.519868,0.03776 -0.581508,-0.491167 -0.697808,-1.20905 -0.697808,-3.967186 0,-3.55159 0.465205,-4.836201 1.705757,-4.836201 0.426438,0 1.08548,0.264485 1.473153,0.642311 z" />
      <path fill={color} d="m 30.22885,24.176929 c -0.852878,1.360172 -1.938361,7.25429 -1.744524,9.370127 0.271371,2.758145 2.170963,4.873982 5.504943,6.120812 0.387669,0.151133 0.503967,5.856338 0.07754,6.234164 -0.1163,0.151133 -1.124247,0.226694 -2.170963,0.151133 -1.550688,-0.0756 -1.93836,0.03776 -2.287265,0.680091 -0.310137,0.56674 -0.310137,0.831213 0.03876,1.057918 0.659041,0.377826 10.505917,0.491167 11.126192,0.113342 0.310131,-0.151133 0.42644,-0.60452 0.232595,-1.095698 -0.193833,-0.680092 -0.542738,-0.793433 -2.558635,-0.793433 H 36.160228 V 42.879412 39.74344 l 1.35686,-0.491179 c 4.884661,-1.700229 5.892615,-5.591854 3.60535,-13.450674 -0.736585,-2.455882 -0.736585,-2.455882 -5.776318,-2.455882 -4.341925,0 -4.613294,0.03776 -5.117268,0.831224 z m 8.916452,2.229177 c 0.27137,0.528959 0.54274,1.397964 0.581513,1.889141 0.116298,0.906786 0.116298,0.906786 -4.419458,1.020138 -5.078507,0.113353 -5.156041,0.07561 -4.148094,-2.455881 0.581507,-1.511315 0.969179,-1.624657 4.419462,-1.549096 2.907541,0.113353 3.140137,0.188913 3.566577,1.095698 z m 1.201788,6.120811 c 0.232607,2.720367 -2.170968,5.176248 -5.078508,5.176248 -2.442329,0 -5.233568,-2.720366 -5.311103,-5.138456 0,-1.435754 0.659043,-1.624667 5.582474,-1.549096 l 4.690839,0.07561 z" />
    </svg>
  );
}

const TIPO = {
  "Rosso fermo":    { container: "#FFDAD6", onContainer: "#410002", indicator: "#6D0B0B", label: <RossoIcon /> },
  "Bianco fermo":   { container: "#FBDFA6", onContainer: "#261A00", indicator: "#C8B44A", label: "🥂" },
  "Orange":         { container: "#FFE0B2", onContainer: "#4A2800", indicator: "#E07B20", label: "🍊" },
  "Spumante":       { container: "#FFF8DC", onContainer: "#3A2E00", indicator: "#C9A227", label: "✨" },
  "Spumante rosso": { container: "#FFD7F5", onContainer: "#390048", indicator: "#C2415A", label: "🫧" },
  "Sidro":          { container: "#C8E6C9", onContainer: "#002106", indicator: "#2E7D32", label: "🍐" },
};

const FILTERS = ["Tutti", "Rosso fermo", "Bianco fermo", "Orange", "Spumante", "Spumante rosso", "Sidro"];

// ─── Icone SVG M3 ────────────────────────────────────────────────────────────
const IC = {
  lista:    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  bevuti:   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3l4 8 5-5 1 12H6L7 8l5 5z"/><line x1="6" y1="21" x2="18" y2="21"/></svg>,
  stats:    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  chevronDown: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  search:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  close:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  add:      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  edit:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  save:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  arrowBack:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  openIn:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  camera:   <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  ai:       <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L9 9H2l5.5 4-2 7L12 16l6.5 4-2-7L22 9h-7z"/></svg>,
  calendar: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  grape:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="10" r="2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="10" r="2"/><circle cx="10" cy="14" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="12" cy="18" r="2"/><path d="M12 5V3"/></svg>,
  timer:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 14 15"/><path d="M9 3h6"/><path d="M12 3v2"/></svg>,
  flask:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6"/><path d="M10 3v7l-4 8a1 1 0 0 0 .9 1.5h10.2a1 1 0 0 0 .9-1.5l-4-8V3"/></svg>,
  sync:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.8-3.3L23 10"/><path d="M20.5 15a9 9 0 0 1-14.8 3.3L1 14"/></svg>,
  notes:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  wineglass:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8l-1 9a4 4 0 0 1-6 0z"/><line x1="12" y1="12" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg>,
  wineglassFull:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8l-1 9a4 4 0 0 1-6 0z"/><path d="M9 8h6" strokeWidth="3"/><line x1="12" y1="12" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg>,
  bottle:   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8M9 3v3.5L6 10v11a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10l-3-3.5V3"/><line x1="6" y1="14" x2="18" y2="14"/></svg>,
  eco:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 22c1-4 4-8 10-10C18 10 22 6 22 2c-4 0-8 4-10 10C10 6 6 2 2 2c0 4 4 8 10 10"/></svg>,
  verified: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>,
  globe:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  instagram:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/></svg>,
  spinner:  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" opacity="0.3"/><path d="M12 2v4"/></svg>,
  star:     (filled) => <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  spumante: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2h6v4l2 3v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9l2-3V2z"/><line x1="5" y1="9" x2="13" y2="9"/><path d="M17 7c0 2.5-2 4-2 4h4s-2-1.5-2-4z"/><line x1="17" y1="11" x2="17" y2="17"/><line x1="15" y1="17" x2="19" y2="17"/><line x1="20" y1="4" x2="21" y2="3"/><line x1="22" y1="6" x2="23" y2="6"/><line x1="20" y1="8" x2="21" y2="9"/></svg>,
};

// ─── Slow Wine 2025 ───────────────────────────────────────────────────────────
const SW_CANTINA_CHIOCCIOLA = new Set([
  "Pieropan", "Ca' dei Zago", "Bele Casel", "Miotto", "Malibràn", "Occhipinti",
]);
const SW_VINO_BOTTIGLIA = new Set([
  "Bertani|Valpolicella Classico Superiore Ognisanti 2022",
  "Ca' dei Zago|Vigneto Mariarosa",
  "Bele Casel|Asolo Prosecco Superiore Extra Brut 2023",
]);
const hasCantina = (produttore) => SW_CANTINA_CHIOCCIOLA.has(produttore);

const websiteCache = {};

function getGoogleFallback(produttore, vino) {
  const q = encodeURIComponent(`${produttore} ${vino || ""} cantina sito ufficiale`);
  return `https://www.google.com/search?q=${q}`;
}

// ─── Filter Chip M3 ───────────────────────────────────────────────────────────
function FilterChip({ label, active, onClick }) {
  const t = TIPO[label];
  const [pressed, setPressed] = useState(false);
  const bgColor  = active ? (t?.container || M3.secondaryContainer) : "transparent";
  const textColor = active ? (t?.onContainer || M3.onSecondaryContainer) : M3.onSurfaceVariant;
  const shadow   = active ? "0px 1px 2px rgba(0,0,0,0.30), 0px 1px 3px 1px rgba(0,0,0,0.15)" : "none";
  return (
    <button onClick={onClick} onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, height: 32,
        padding: active ? "0 16px 0 8px" : "0 16px", borderRadius: 8,
        border: active ? "none" : `1px solid ${M3.outline}`, background: bgColor,
        boxShadow: pressed ? "none" : shadow, color: textColor,
        fontSize: 14, fontFamily: "'Roboto', sans-serif", fontWeight: 500, letterSpacing: 0.1,
        cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, overflow: "hidden",
        transform: pressed ? "scale(0.94)" : "scale(1)",
        transition: ["background 200ms cubic-bezier(0.2,0,0,1)","color 200ms cubic-bezier(0.2,0,0,1)","border 200ms cubic-bezier(0.2,0,0,1)","box-shadow 200ms cubic-bezier(0.2,0,0,1)","transform 120ms cubic-bezier(0.2,0,0,1)","padding 200ms cubic-bezier(0.2,0,0,1)"].join(", "), outline: "none",
      }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: 8, background: textColor, opacity: pressed ? 0.08 : 0, transition: "opacity 120ms cubic-bezier(0.2,0,0,1)", pointerEvents: "none" }} />
      {active && (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={textColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, position: "relative", zIndex: 1 }}><polyline points="20 6 9 17 4 12" /></svg>)}
      {t && (<span style={{ display: "inline-flex", alignItems: "center", position: "relative", zIndex: 1 }}><TipoLabel tipo={label} size={13} color={textColor} /></span>)}
      <span style={{ position: "relative", zIndex: 1 }}>{label}</span>
    </button>
  );
}

// ─── TipoLabel ────────────────────────────────────────────────────────────────
function TipoLabel({ tipo, size = 13, color = "currentColor" }) {
  // Rosso fermo → icona SVG custom
  if (tipo === "Rosso fermo") {
    return <RossoIcon size={size} color={color} />;
  }
  // Spumante e Spumante rosso → SVG bottiglia frizzante
  if (tipo === "Spumante" || tipo === "Spumante rosso") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 2h6v4l2 3v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9l2-3V2z"/>
        <line x1="5" y1="9" x2="13" y2="9"/>
        <path d="M17 7c0 2.5-2 4-2 4h4s-2-1.5-2-4z"/>
        <line x1="17" y1="11" x2="17" y2="17"/>
        <line x1="15" y1="17" x2="19" y2="17"/>
        <line x1="20" y1="4" x2="21" y2="3"/>
        <line x1="22" y1="6" x2="23" y2="5"/>
        <line x1="20" y1="8" x2="21" y2="9"/>
      </svg>
    );
  }
  // Tutte le altre tipologie → emoji dal TIPO
  const t = TIPO[tipo];
  if (!t?.label) return null;
  return <span style={{ fontSize: size, lineHeight: 1 }}>{t.label}</span>;
}

function SwBadge({ type }) {
  if (type === "chiocciola") return (
    <span title="Cantina premiata Slow Wine 2025" style={{ fontSize: 13, background: "#E8F5E9", color: "#2E7D32", padding: "1px 6px", borderRadius: 4, fontWeight: 600, fontFamily: "'Roboto', sans-serif", letterSpacing: 0.1, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: "#2E7D32", display: "flex" }}>{IC.eco}</span>Chiocciola
    </span>
  );
  if (type === "bottiglia") return (
    <span title="Vino premiato Slow Wine 2025" style={{ fontSize: 13, background: "#E3F2FD", color: "#0D47A1", padding: "1px 6px", borderRadius: 4, fontWeight: 600, fontFamily: "'Roboto', sans-serif", letterSpacing: 0.1, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: "#0D47A1", display: "flex" }}>{IC.verified}</span>Slow Wine
    </span>
  );
  return null;
}

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
      try {
        const bestUrl = await imgQueue.add(async () => {
          const res = await fetch("/api/search-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produttore: wine.produttore, vino: wine.vino, annata: wine.annata }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || res.status);
          return data.url || null;
        });
        if (bestUrl && !cancelled) {
          imgSessionCache.set(wine.id, bestUrl);
          sb.upsert("wine_images", { wine_id: wine.id, image_url: bestUrl }, "wine_id").catch(() => {});
          setUrl(bestUrl); setStatus("found");
        } else {
          imgSessionCache.set(wine.id, "NOT_FOUND");
          if (!cancelled) setStatus("error");
        }
      } catch (err) {
        imgSessionCache.set(wine.id, "NOT_FOUND");
        if (!cancelled) setStatus("error");
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
      if (websiteCache[key]) {
        if (!cancelled) { setUrl(websiteCache[key].url); setSource(websiteCache[key].source); setStatus("loading"); }
        return;
      }
      try {
        const rows = await sb.get(`wine_websites?produttore=eq.${encodeURIComponent(key)}&select=url,source`);
        if (rows?.length > 0 && rows[0].url) {
          websiteCache[key] = { url: rows[0].url, source: rows[0].source };
          if (!cancelled) { setUrl(rows[0].url); setSource(rows[0].source); setStatus("loading"); }
          return;
        }
      } catch {}
      try {
        const res = await fetch("/api/search-website", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produttore: wine.produttore, vino: wine.vino }) });
        const data = await res.json();
        const found = data.url || getGoogleFallback(wine.produttore, wine.vino);
        const src = data.source || "serper";
        websiteCache[key] = { url: found, source: src };
        sb.upsert("wine_websites", { produttore: key, url: found, source: src }, "produttore").catch(() => {});
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
  const sourceLabel = status === "searching" ? "🔍 Ricerca in corso…" : isInstagram ? `📸 ${domain}` : isGoogle ? `🔍 ${domain}` : `🌐 ${domain}`;

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", background: M3.surfaceContainerHighest }}>
      <div style={{ padding: "8px 12px", background: M3.surfaceContainer, display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${M3.outlineVariant}` }}>
        <div style={{ flex: 1, fontSize: 11, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sourceLabel}</div>
        {url && (<a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: M3.primary, fontFamily: "'Roboto', sans-serif", textDecoration: "none", flexShrink: 0, fontWeight: 500 }}><span style={{display:"flex",alignItems:"center",gap:4}}>Apri {IC.openIn}</span></a>)}
      </div>
      <div style={{ position: "relative", height: 380 }}>
        {status === "searching" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: M3.surfaceContainerHighest, zIndex: 3 }}>
            <div style={{ animation: "spin 1s linear infinite", color: M3.onSurfaceVariant, display:"flex" }}>{IC.search}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: M3.onSurface, fontFamily: "'Roboto', sans-serif" }}>Ricerca sito ufficiale…</div>
            <div style={{ fontSize: 11, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>{wine.produttore}</div>
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
              <div style={{ fontSize: 11, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>{domain}</div>
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

// ─── Wine Card ────────────────────────────────────────────────────────────────
function WineCard({ wine, expanded, onToggle, onBevi, onElimina, onModifica, bevutoInfo = null, ratings = {}, onRate, cardRefCallback }) {
  const t = TIPO[wine.tipologia] || TIPO["Bianco fermo"];
  const totalVal = wine.prezzo * wine.bottiglie;
  const cantinaSW = hasCantina(wine.produttore);
  const vinoSW = !!wine.slowVinoBott;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [closing, setClosing] = useState(false);
  const cardRef = useRef(null);

  const tabs = [
    { id: "scheda", label: "Scheda", icon: (active) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? M3.primary : M3.onSurfaceVariant} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>) },
    { id: "bottiglia", label: "Bottiglia", icon: (active) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? M3.primary : M3.onSurfaceVariant} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8M9 3v3.5L6 10v11a1 1 0 001 1h10a1 1 0 001-1V10l-3-3.5V3"/><line x1="6" y1="14" x2="18" y2="14"/></svg>) },
    { id: "website", label: "Web", icon: (active) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? M3.primary : M3.onSurfaceVariant} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>) },
    ...(bevutoInfo ? [{ id: "valutazione", label: "Voto", icon: (active) => (<svg width="18" height="18" viewBox="0 0 24 24" fill={active ? M3.primary : "none"} stroke={active ? M3.primary : M3.onSurfaceVariant} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>) }] : []),
  ];
  const [cardTab, setCardTab] = useState("scheda");

  const prevExpandedRef = useRef(expanded);
  useEffect(() => {
    const wasExpanded = prevExpandedRef.current;
    prevExpandedRef.current = expanded;

    if (!expanded && wasExpanded) {
      // Animazione di chiusura
      setClosing(true);
      const t = setTimeout(() => {
        setClosing(false);
        setCardTab("scheda");
        setConfirmDelete(false);
      }, 260);
      return () => clearTimeout(t);
    }
  }, [expanded]);

  const currentRating = ratings[wine.id] || 0;
  const [hoverRating, setHoverRating] = useState(0);

  return (
    <div ref={el => { cardRef.current = el; if (cardRefCallback) cardRefCallback(el); }} style={{
      borderRadius: 12,
      border: expanded ? `1px solid ${t.indicator}55` : `1px solid ${M3.outlineVariant}`,
      borderLeft: expanded ? `4px solid ${t.indicator}` : `1px solid ${M3.outlineVariant}`,
      background: expanded ? "#F4F3EE" : M3.surface,
      overflow: "hidden",
      transition: expanded
        ? "border-color 300ms cubic-bezier(0.2,0,0,1), background 300ms cubic-bezier(0.2,0,0,1), border-left-width 300ms cubic-bezier(0.2,0,0,1), box-shadow 300ms cubic-bezier(0.2,0,0,1)"
        : "border-color 250ms cubic-bezier(0.3,0,1,1), background 200ms cubic-bezier(0.3,0,1,1), border-left-width 250ms cubic-bezier(0.3,0,1,1), box-shadow 200ms cubic-bezier(0.3,0,1,1)",
      boxShadow: expanded ? "0 1px 2px rgba(0,0,0,0.10),0 2px 6px rgba(0,0,0,0.07)" : "0 1px 2px rgba(0,0,0,0.05)",
    }}>
      {/* ── Header ── */}
      <div onClick={onToggle} style={{ display: "flex", alignItems: "stretch", minHeight: 68, cursor: "pointer" }}>
        <div style={{ width: 4, flexShrink: 0, background: expanded ? t.indicator : "transparent", transition: "background 0.2s" }} />
        <div style={{ flex: 1, padding: "11px 12px", minWidth: 0 }}>
          <div style={{ fontSize: 10, fontFamily: "'Roboto', sans-serif", fontWeight: 500, letterSpacing: 0.5, color: M3.onSurfaceVariant, textTransform: "uppercase", marginBottom: 1 }}>
            {wine.produttore}
            {cantinaSW && <span style={{ marginLeft: 4, color: "#2E7D32", display:"inline-flex", verticalAlign:"middle" }}>{IC.eco}</span>}
          </div>
          <div style={{ fontSize: 15, fontFamily: "'Roboto', sans-serif", fontWeight: 500, color: M3.onSurface, lineHeight: 1.3, marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {wine.vino}
            {vinoSW && <span style={{ marginLeft: 4, color: "#0D47A1", display:"inline-flex", verticalAlign:"middle" }}>{IC.verified}</span>}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 4, background: t.container, color: t.onContainer, fontFamily: "'Roboto', sans-serif", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 3 }}>
              <TipoLabel tipo={wine.tipologia} size={13} color={t.onContainer} /> {wine.tipologia}
            </span>
            <span style={{ fontSize: 11, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>{wine.annata}</span>
            {bevutoInfo && currentRating > 0 && (
              <span style={{ fontSize: 11, letterSpacing: 1, display: "inline-flex", gap: 2 }}>
                {[...Array(5)].map((_, i) => <span key={i} style={{opacity: i < currentRating ? 1 : 0.25, display:"inline-flex"}}>{IC.wineglass}</span>)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", padding: "11px 12px 11px 6px", flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: M3.primary, fontFamily: "'Roboto', sans-serif" }}>~{totalVal}€</span>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {!bevutoInfo && <span style={{ fontSize: 11, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", display: "flex", alignItems: "center", gap: 3 }}>{IC.bottle} {wine.bottiglie}</span>}
            {bevutoInfo && <span style={{ color: M3.onSurfaceVariant, display: "flex", alignItems: "center" }}>{IC.wineglassFull}</span>}
            <span style={{ color: M3.onSurfaceVariant, transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 300ms cubic-bezier(0.2,0,0,1)", display: "flex", alignItems: "center" }}>{IC.chevronDown}</span>
          </div>
        </div>
      </div>

      {/* ── Contenuto espanso ── */}
      {(expanded || closing) && (
        <div className={closing ? "m3-closing" : "m3-expand-content"} style={{ padding: "0 14px 14px" }}>
          <div style={{ height: 1, background: M3.outlineVariant, marginBottom: 10 }} />

          {/* Tab switcher */}
          <div className="m3-stagger-1" onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 6, marginBottom: 14, justifyContent: "center", overflowX: "auto", scrollbarWidth: "none", background: M3.surfaceContainerHighest, borderRadius: 50, padding: "4px 6px" }}>
            {tabs.map(tab => {
              const active = cardTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setCardTab(tab.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: active ? "7px 16px" : "7px 12px", borderRadius: 50, border: "none", flexShrink: 0, background: active ? M3.primaryContainer : "transparent", color: active ? M3.primary : M3.onSurfaceVariant, fontSize: 13, fontWeight: active ? 600 : 400, fontFamily: "'Roboto', sans-serif", cursor: "pointer", letterSpacing: 0.1, transition: "background 0.18s, color 0.18s, padding 0.18s", whiteSpace: "nowrap" }}>
                  {tab.icon(active)}<span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Tab SCHEDA ── */}
          {cardTab === "scheda" && (
            <>
              {(cantinaSW || vinoSW) && (
                <div className="m3-stagger-2" style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                  {cantinaSW && <SwBadge type="chiocciola" />}
                  {vinoSW && <SwBadge type="bottiglia" />}
                </div>
              )}
              <div className="m3-stagger-2" style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
                {[{ l: "Prezzo", v: `~${wine.prezzo}€` }, { l: "Bottiglie", v: bevutoInfo ? "—" : wine.bottiglie }, { l: "Valore", v: `~${totalVal}€` }].map(s => (
                  <div key={s.l} style={{ flex: "1 1 70px", background: "#7A7A72", borderRadius: 10, padding: "9px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "#E8D8A0", fontFamily: "'Roboto', sans-serif" }}>{s.v}</div>
                    <div style={{ fontSize: 10, color: "rgba(232,216,160,0.7)", textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "'Roboto', sans-serif", marginTop: 1 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="m3-stagger-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                {[
                  { icon: IC.grape, label: "Vitigno",       val: wine.vitigno },
                  { icon: IC.timer, label: "Macerazione",   val: wine.macerazione },
                  { icon: IC.flask, label: "Fermentazione", val: wine.fermentazione },
                  { icon: IC.sync,  label: "Malolattica",   val: wine.malolattica },
                ].map(s => (
                  <div key={s.label} style={{ background: "#6B8FA8", borderRadius: 12, padding: "11px 12px", boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.06)" }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", fontFamily: "'Roboto', sans-serif", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>{s.icon}<span>{s.label}</span></div>
                    <div style={{ fontSize: 11, color: "#FFFFFF", fontFamily: "'Roboto', sans-serif", lineHeight: 1.5 }}>{s.val}</div>
                  </div>
                ))}
              </div>
              {wine.note && (
                <div className="m3-stagger-4" style={{ background: "#6B8FA8", borderRadius: 12, padding: "12px 14px", marginBottom: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.06)", borderLeft: `3px solid ${t.indicator}` }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", fontFamily: "'Roboto', sans-serif", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>{IC.notes}<span>Note</span></div>
                  <div style={{ fontSize: 12, color: "#FFFFFF", fontFamily: "'Roboto', sans-serif", lineHeight: 1.6 }}>{wine.note}</div>
                </div>
              )}
              {bevutoInfo?.nota && (
                <div style={{ background: "#6B8FA8", borderRadius: 12, padding: "12px 14px", marginBottom: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.06)", borderLeft: `3px solid ${M3.primary}` }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", fontFamily: "'Roboto', sans-serif", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>{IC.wineglass}<span>Nota di degustazione</span></div>
                  <div style={{ fontSize: 12, color: "#FFFFFF", fontFamily: "'Roboto', sans-serif", lineHeight: 1.6 }}>{bevutoInfo.nota}</div>
                </div>
              )}
            </>
          )}

          {/* ── Tab BOTTIGLIA ── */}
          {cardTab === "bottiglia" && (
            <div onClick={e => e.stopPropagation()} style={{ marginBottom: 12 }}>
              <BottleImage wine={wine} active={cardTab === "bottiglia"} />
            </div>
          )}

          {/* ── Tab WEBSITE ── */}
          {cardTab === "website" && (
            <div onClick={e => e.stopPropagation()} style={{ marginBottom: 12 }}>
              <WebsiteView wine={wine} />
            </div>
          )}

          {/* ── Tab VALUTAZIONE ── */}
          {cardTab === "valutazione" && bevutoInfo && (
            <div onClick={e => e.stopPropagation()} style={{ marginBottom: 12 }}>
              <div style={{ background: "#6B8FA8", borderRadius: 12, padding: "20px 16px", textAlign: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontFamily: "'Roboto', sans-serif", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 16, fontWeight: 500 }}>La tua valutazione</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 14 }}>
                  {[1, 2, 3, 4, 5].map(n => {
                    const active = n <= (hoverRating || currentRating);
                    return (
                      <button key={n} onClick={() => onRate(wine.id, n === currentRating ? 0 : n)} onMouseEnter={() => setHoverRating(n)} onMouseLeave={() => setHoverRating(0)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: 8, fontSize: 30, lineHeight: 1, filter: active ? "none" : "grayscale(1) opacity(0.35)", transform: active ? "scale(1.12)" : "scale(1)", transition: "transform 0.15s, filter 0.15s" }}
                        title={`${n} calice${n > 1 ? "i" : ""}`}>{IC.wineglass}</button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: currentRating ? "#FFFFFF" : "rgba(255,255,255,0.6)", fontFamily: "'Roboto', sans-serif", minHeight: 20 }}>
                  {currentRating === 0 && "Tocca un calice per valutare"}{currentRating === 1 && "Deludente"}{currentRating === 2 && "Nella media"}{currentRating === 3 && "Buono"}{currentRating === 4 && "Ottimo"}{currentRating === 5 && "Eccellente!"}
                </div>
              </div>
            </div>
          )}

          {/* ── Azioni ── */}
          <div className="m3-stagger-4">
            {!bevutoInfo ? (
              <button onClick={(e) => { e.stopPropagation(); onBevi(wine.id); }} style={{ width: "100%", padding: "10px 24px", borderRadius: 20, border: "none", background: "#D4E0D0", color: "#2E4A2E", fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer", letterSpacing: 0.1, marginBottom: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{display:"flex",alignItems:"center",gap:6}}>{IC.wineglass} Segna come bevuto</span>
              </button>
            ) : (
              <div style={{ width: "100%", padding: "10px 16px", borderRadius: 20, background: M3.surfaceContainerHighest, fontSize: 13, fontFamily: "'Roboto', sans-serif", color: M3.onSurfaceVariant, textAlign: "center", marginBottom: 8, letterSpacing: 0.1, boxSizing: "border-box" }}>
                🫗 Bottiglia aperta il <strong style={{ color: M3.onSurface }}>{bevutoInfo.data}</strong>
              </div>
            )}
            <button onClick={(e) => { e.stopPropagation(); onModifica(wine); }} style={{ width: "100%", padding: "10px 24px", borderRadius: 20, border: `1px solid #B5A898`, background: "transparent", color: M3.onSurface, fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer", letterSpacing: 0.1, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{display:"flex",alignItems:"center",gap:6}}>{IC.edit} Modifica dati</span>
            </button>
            {!confirmDelete ? (
              <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }} style={{ width: "100%", padding: "10px 24px", borderRadius: 20, border: `1px solid #B0A8C0`, background: "transparent", color: "#B0A8C0", fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer", letterSpacing: 0.1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{display:"flex",alignItems:"center",gap:6}}>{IC.trash} Elimina dalla cantina</span>
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ flex: 1, fontSize: 12, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>
                  {bevutoInfo ? "Rimuovi dall'archivio?" : wine.bottiglie > 1 ? `Rimuovi 1 bottiglia (rimangono ${wine.bottiglie - 1})?` : "Rimuovi l'ultima bottiglia?"}
                </span>
                <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }} style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${M3.outline}`, background: "transparent", color: M3.onSurfaceVariant, fontSize: 12, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>No</button>
                <button onClick={(e) => { e.stopPropagation(); onElimina(wine); setConfirmDelete(false); }} style={{ padding: "7px 14px", borderRadius: 20, border: "none", background: M3.error, color: "#FFFFFF", fontSize: 12, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>Sì, elimina</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modal: Aggiungi Vino ─────────────────────────────────────────────────────
function ModalAggiungi({ onSalva, onAnnulla }) {
  const [modo, setModo] = useState(null);
  const [form, setForm] = useState({ produttore: "", vino: "", annata: "", tipologia: "Rosso fermo", bottiglie: 1, prezzo: 0, vitigno: "", note: "" });
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
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
      setModo("analisi");
    };
    reader.readAsDataURL(file);
  };

  const handleAnalizzaEtichetta = async () => {
    if (!imageBase64) return;
    setAiLoading(true); setAiError(null);
    try {
      const response = await fetch("/api/analyze-label", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64, mediaType: "image/jpeg" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || response.status);
      if (data.raw !== undefined) throw new Error("Riconoscimento non riuscito. Puoi compilare manualmente.");
      setForm(prev => ({ ...prev, produttore: data.produttore || prev.produttore, vino: data.vino || prev.vino, annata: data.annata || prev.annata, tipologia: Object.keys(TIPO).includes(data.tipologia) ? data.tipologia : prev.tipologia, vitigno: data.vitigno || prev.vitigno }));
      setModo("manuale");
    } catch (err) {
      setAiError("Riconoscimento non riuscito. Puoi compilare manualmente.");
      setModo("manuale");
    } finally {
      setAiLoading(false);
    }
  };

  const field = (key, label, type = "text", opts = {}) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: M3.onSurfaceVariant, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "'Roboto', sans-serif", marginBottom: 4 }}>{label}</div>
      {opts.select ? (
        <select value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${M3.outline}`, background: M3.surfaceContainerHighest, fontSize: 14, fontFamily: "'Roboto', sans-serif", color: M3.onSurface, outline: "none" }}>
          {Object.keys(TIPO).map(t => <option key={t}>{t}</option>)}
        </select>
      ) : (
        <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${M3.outline}`, background: M3.surfaceContainerHighest, fontSize: 14, fontFamily: "'Roboto', sans-serif", color: M3.onSurface, outline: "none" }} />
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
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFotoChange} />
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
                <div style={{ fontSize: 15, fontWeight: 500, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", marginBottom: 6 }}>Analisi AI in corso…</div>
                <div style={{ fontSize: 13, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>Riconoscimento produttore, vino e annata</div>
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
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#2E7D32", fontFamily: "'Roboto', sans-serif" }}>{aiError ? "⚠️ Riconoscimento parziale" : "🤖 Campi pre-compilati da AI"}</div>
                  <div style={{ fontSize: 11, color: "#388E3C", fontFamily: "'Roboto', sans-serif", lineHeight: 1.4, marginTop: 2 }}>{aiError || "Verifica e correggi i campi se necessario"}</div>
                </div>
              </div>
            )}
            {field("produttore", "Produttore")}
            {field("vino", "Nome vino")}
            {field("annata", "Annata")}
            {field("tipologia", "Tipologia", "text", { select: true })}
            {field("bottiglie", "N. bottiglie", "number")}
            {field("prezzo", "Prezzo (€/bot.)", "number")}
            {field("vitigno", "Vitigno")}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: M3.onSurfaceVariant, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "'Roboto', sans-serif", marginBottom: 4 }}>Note</div>
              <textarea value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} rows={3} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${M3.outline}`, background: M3.surfaceContainerHighest, fontSize: 14, fontFamily: "'Roboto', sans-serif", color: M3.onSurface, outline: "none", resize: "vertical" }} />
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
    produttore: wine.produttore || "", vino: wine.vino || "", annata: wine.annata || "",
    tipologia: wine.tipologia || "Bianco fermo", bottiglie: wine.bottiglie ?? 1, prezzo: wine.prezzo ?? 0,
    vitigno: wine.vitigno || "", macerazione: wine.macerazione || "", fermentazione: wine.fermentazione || "",
    malolattica: wine.malolattica || "", note: wine.note || "",
  });

  const field = (key, label, type = "text", opts = {}) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: M3.onSurfaceVariant, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "'Roboto', sans-serif", marginBottom: 4 }}>{label}</div>
      {opts.select ? (
        <select value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${M3.outline}`, background: M3.surfaceContainerHighest, fontSize: 14, fontFamily: "'Roboto', sans-serif", color: M3.onSurface }}>
          {Object.keys(TIPO).map(t => <option key={t}>{t}</option>)}
        </select>
      ) : opts.textarea ? (
        <textarea value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} rows={opts.rows || 3} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${M3.outline}`, background: M3.surfaceContainerHighest, fontSize: 13, fontFamily: "'Roboto', sans-serif", color: M3.onSurface, outline: "none", resize: "vertical", lineHeight: 1.5 }} />
      ) : (
        <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: type === "number" ? Number(e.target.value) : e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${M3.outline}`, background: M3.surfaceContainerHighest, fontSize: 14, fontFamily: "'Roboto', sans-serif", color: M3.onSurface, outline: "none" }} />
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
        {field("produttore", "Produttore")}{field("vino", "Nome vino")}{field("annata", "Annata")}{field("tipologia", "Tipologia", "text", { select: true })}{field("bottiglie", "N. bottiglie", "number")}{field("prezzo", "Prezzo (€/bottiglia)", "number")}
        <div style={{ height: 1, background: M3.outlineVariant, margin: "8px 0 16px" }} />
        <div style={{ fontSize: 11, fontWeight: 600, color: M3.primary, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "'Roboto', sans-serif", marginBottom: 12 }}>Scheda tecnica</div>
        {field("vitigno", "🍇 Vitigno")}{field("macerazione", "⏱ Macerazione", "text", { textarea: true, rows: 2 })}{field("fermentazione", "🧪 Fermentazione", "text", { textarea: true, rows: 2 })}{field("malolattica", "🔄 Malolattica")}
        <div style={{ height: 1, background: M3.outlineVariant, margin: "8px 0 16px" }} />
        {field("note", "📝 Note", "text", { textarea: true, rows: 4 })}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={onAnnulla} style={{ flex: 1, padding: "11px", borderRadius: 20, border: `1px solid ${M3.outline}`, background: "transparent", color: M3.onSurface, fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>Annulla</button>
          <button onClick={() => { if (form.produttore && form.vino) onSalva(form); }}
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
  const [hoverRating, setHoverRating] = useState(0);
  if (!wine) return null;
  const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
  const labelRating = ["", "Deludente", "Nella media", "Buono", "Ottimo", "Eccellente!"];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.4)" }} onClick={onAnnulla}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", background: M3.surface, borderRadius: "28px 28px 0 0", padding: "24px 20px 32px", animation: "slideUp 0.3s cubic-bezier(0.2,0,0,1)" }}>
        <div style={{ width: 32, height: 4, background: M3.outlineVariant, borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ fontSize: 20, fontWeight: 500, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", marginBottom: 4, display:"flex", alignItems:"center", gap:8 }}>{IC.wineglass} Segna come bevuto</div>
        <div style={{ fontSize: 14, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", marginBottom: 16 }}>{wine.produttore} · {wine.vino} · {wine.annata}</div>
        <div style={{ background: M3.surfaceContainer, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>
          <span style={{display:"flex",alignItems:"center",gap:6}}>{IC.calendar} Data apertura: <strong style={{ color: M3.onSurface }}>{today}</strong></span>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>Valutazione (opzionale)</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 6 }}>
            {[1, 2, 3, 4, 5].map(n => {
              const active = n <= (hoverRating || rating);
              return (<button key={n} onClick={() => setRating(n === rating ? 0 : n)} onMouseEnter={() => setHoverRating(n)} onMouseLeave={() => setHoverRating(0)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: 8, fontSize: 28, lineHeight: 1, filter: active ? "none" : "grayscale(1) opacity(0.3)", transform: active ? "scale(1.15)" : "scale(1)", transition: "transform 0.15s, filter 0.15s" }}>{IC.wineglass}</button>);
            })}
          </div>
          <div style={{ textAlign: "center", fontSize: 12, fontWeight: 500, color: rating ? M3.primary : M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", minHeight: 18 }}>
            {rating ? `${labelRating[rating]}` : "Tocca un calice per valutare"}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>Nota di degustazione (opzionale)</div>
          <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Come ti è sembrato? Abbinamento, occasione…" style={{ width: "100%", minHeight: 70, background: M3.surfaceContainerHighest, border: "none", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "'Roboto', sans-serif", color: M3.onSurface, resize: "vertical", outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onAnnulla} style={{ flex: 1, padding: "11px", borderRadius: 20, border: `1px solid ${M3.outline}`, background: "transparent", color: M3.onSurface, fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>Annulla</button>
          <button onClick={() => onConferma(nota, today, rating)} style={{ flex: 1, padding: "11px", borderRadius: 20, border: "none", background: M3.primary, color: M3.onPrimary, fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer" }}>Conferma</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Lista ───────────────────────────────────────────────────────────────
function TabLista({ wines, bevuti, onBevi, onElimina, onModifica, onAggiungi, compact, ratings, onRate, scrollRef }) {
  const [filter, setFilter] = useState("Tutti");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const cardRefs = useRef({});

  const handleToggle = (wineId) => {
    // Stessa card: chiudi semplicemente
    if (expanded === wineId) { setExpanded(null); return; }

    // Nessuna card aperta: apri direttamente
    if (expanded === null) { setExpanded(wineId); return; }

    // C'è una card aperta diversa: coordina scroll + chiusura + apertura
    const container = scrollRef?.current;
    const targetRef = cardRefs.current[wineId];
    if (!container || !targetRef) { setExpanded(wineId); return; }

    const containerRect = container.getBoundingClientRect();
    const targetRect = targetRef.getBoundingClientRect();
    const targetScrollTop = container.scrollTop + targetRect.top - containerRect.top - 16;
    const distance = Math.abs(targetScrollTop - container.scrollTop);

    // Stima durata scroll: ~0.8ms per pixel, min 200ms, max 600ms
    const scrollDuration = Math.min(600, Math.max(200, distance * 0.8));

    // Chiudi la card corrente
    setExpanded(null);

    // Avvia scroll manuale verso la nuova card
    container.scrollTo({ top: targetScrollTop, behavior: "smooth" });

    // Dopo che scroll + chiusura sono completati, espandi la nuova
    setTimeout(() => setExpanded(wineId), scrollDuration + 80);
  };

  const bevutiIds = new Set(bevuti.map(b => b.id));
  const filtered = wines
    .filter(w => !bevutiIds.has(w.id))
    .filter(w => filter === "Tutti" || w.tipologia === filter)
    .filter(w => {
      const q = search.toLowerCase();
      return !q || w.produttore.toLowerCase().includes(q) || w.vino.toLowerCase().includes(q) || w.annata.includes(q) || (w.vitigno || "").toLowerCase().includes(q);
    });

  const totalB = filtered.reduce((a, w) => a + w.bottiglie, 0);
  const totalV = filtered.reduce((a, w) => a + w.prezzo * w.bottiglie, 0);

  return (
    <>
      <div style={{ padding: "6px 16px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: M3.surfaceContainerHighest, borderRadius: 28, padding: "7px 14px", height: compact ? 34 : 38, transition: "height 0.3s" }}>
          <span style={{ color: M3.onSurfaceVariant, display:"flex" }}>{IC.search}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca produttore, vino, vitigno…"
            style={{ flex: 1, background: "none", border: "none", fontSize: 14, color: M3.onSurface, fontFamily: "'Roboto', sans-serif" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: M3.onSurfaceVariant, fontSize: 15 }}><span style={{display:"flex"}}>{IC.close}</span></button>}
        </div>
      </div>
      {!compact && (
        <div style={{ display: "flex", gap: 7, padding: "4px 16px 6px", overflowX: "auto", scrollbarWidth: "none" }}>
          {FILTERS.map(f => <FilterChip key={f} label={f} active={filter === f} onClick={() => { setFilter(f); setExpanded(null); }} />)}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, padding: compact ? "4px 16px 6px" : "0 16px 8px" }}>
        {[{ l: "Referenze", v: filtered.length }, { l: "Bottiglie", v: totalB }, { l: "Valore", v: `~${totalV}€` }, { l: "Media/ref", v: `~${filtered.length ? Math.round(totalV / filtered.length) : 0}€` }].map(s => (
          <div key={s.l} style={{ flex: 1, background: M3.surfaceContainerHighest, boxShadow: "none", border: "none", borderRadius: 12, padding: compact ? "6px 4px" : "10px 4px", textAlign: "center", minWidth: 0, transition: "padding 0.3s cubic-bezier(0.2,0,0,1)" }}>
            <div style={{ fontSize: compact ? 13 : 16, fontWeight: 700, color: M3.primary, fontFamily: "'Roboto', sans-serif", letterSpacing: -0.2 }}>{s.v}</div>
            <div style={{ fontSize: 9, color: M3.onSurfaceVariant, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "'Roboto', sans-serif", marginTop: 2, fontWeight: 500 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "0 16px 100px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: M3.onSurfaceVariant }}>
            <div style={{ marginBottom: 10, color: M3.onSurfaceVariant, opacity:0.5 }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
            <div style={{ fontSize: 15, fontWeight: 500, color: M3.onSurface }}>Nessun vino trovato</div>
          </div>
        ) : filtered.map(wine => (
          <WineCard key={wine.id} wine={wine} expanded={expanded === wine.id}
            onToggle={() => handleToggle(wine.id)}
            cardRefCallback={el => { if (el) cardRefs.current[wine.id] = el; }}
            onBevi={onBevi} onElimina={onElimina} onModifica={onModifica}
            ratings={ratings} onRate={onRate} />
        ))}
      </div>
    </>
  );
}

// ─── Tab: Bevuti ──────────────────────────────────────────────────────────────
function TabBevuti({ bevuti, allWines, onRiporta, onElimina, onModifica, ratings, onRate, scrollRef }) {
  const [expanded, setExpanded] = useState(null);
  const cardRefs = useRef({});
  const wineMap = Object.fromEntries(allWines.map(w => [w.id, w]));

  const handleToggle = (uid) => {
    if (expanded === uid) { setExpanded(null); return; }
    if (expanded === null) { setExpanded(uid); return; }

    const container = scrollRef?.current;
    const targetRef = cardRefs.current[uid];
    if (!container || !targetRef) { setExpanded(uid); return; }

    const containerRect = container.getBoundingClientRect();
    const targetRect = targetRef.getBoundingClientRect();
    const targetScrollTop = container.scrollTop + targetRect.top - containerRect.top - 16;
    const distance = Math.abs(targetScrollTop - container.scrollTop);
    const scrollDuration = Math.min(600, Math.max(200, distance * 0.8));

    setExpanded(null);
    container.scrollTo({ top: targetScrollTop, behavior: "smooth" });
    setTimeout(() => setExpanded(uid), scrollDuration + 80);
  };
  const totalSpeso = bevuti.reduce((a, b) => a + (wineMap[b.id]?.prezzo || 0), 0);

  if (bevuti.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, color: M3.onSurfaceVariant }}>
        <div style={{ marginBottom: 16, color: M3.onSurfaceVariant, opacity:0.4 }}><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8l-1 9a4 4 0 0 1-6 0z"/><path d="M9 8h6" strokeWidth="3"/><line x1="12" y1="12" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg></div>
        <div style={{ fontSize: 18, fontWeight: 500, color: M3.onSurface, marginBottom: 8 }}>Nessun vino bevuto</div>
        <div style={{ fontSize: 14, textAlign: "center", lineHeight: 1.5 }}>Quando segni un vino come bevuto, apparirà qui con data e note.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 16px 100px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ background: M3.primaryContainer, borderRadius: 12, padding: "14px 16px", marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: M3.onPrimaryContainer, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "'Roboto', sans-serif", marginBottom: 6, opacity: 0.8 }}>Archivio degustazioni</div>
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: M3.onPrimaryContainer, fontFamily: "'Roboto', sans-serif" }}>{bevuti.length}</div>
            <div style={{ fontSize: 11, color: M3.onPrimaryContainer, opacity: 0.8, fontFamily: "'Roboto', sans-serif" }}>bottiglie aperte</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: M3.onPrimaryContainer, fontFamily: "'Roboto', sans-serif" }}>~{totalSpeso}€</div>
            <div style={{ fontSize: 11, color: M3.onPrimaryContainer, opacity: 0.8, fontFamily: "'Roboto', sans-serif" }}>valore consumato</div>
          </div>
        </div>
      </div>
      {[...bevuti].reverse().map(b => {
        const wine = wineMap[b.id];
        if (!wine) return null;
        return (
          <WineCard key={b.uid} wine={wine} expanded={expanded === b.uid}
            onToggle={() => handleToggle(b.uid)}
            cardRefCallback={el => { if (el) cardRefs.current[b.uid] = el; }}
            onBevi={() => {}} onElimina={() => onRiporta(b.uid)} onModifica={onModifica}
            bevutoInfo={{ data: b.data, nota: b.nota }}
            ratings={ratings} onRate={onRate} />
        );
      })}
    </div>
  );
}

// ─── Tab: Statistiche ─────────────────────────────────────────────────────────
function TabStatistiche({ wines, bevuti }) {
  const bevutiIds = new Set(bevuti.map(b => b.id));
  const cantina = wines.filter(w => !bevutiIds.has(w.id));
  const totB = cantina.reduce((a, w) => a + w.bottiglie, 0);
  const totV = cantina.reduce((a, w) => a + w.prezzo * w.bottiglie, 0);
  const totBevuto = bevuti.reduce((a, b) => { const w = wines.find(x => x.id === b.id); return a + (w?.prezzo || 0); }, 0);
  const swCount = cantina.filter(w => hasCantina(w.produttore)).reduce((a, w) => a + w.bottiglie, 0);

  const byTipo = {};
  cantina.forEach(w => { byTipo[w.tipologia] = (byTipo[w.tipologia] || 0) + w.bottiglie; });
  const tipoEntries = Object.entries(byTipo).sort((a, b) => b[1] - a[1]);
  const maxTipo = Math.max(...tipoEntries.map(([, v]) => v), 1);

  const byProd = {};
  cantina.forEach(w => { byProd[w.produttore] = (byProd[w.produttore] || 0) + w.bottiglie; });
  const topProd = Object.entries(byProd).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxProd = Math.max(...topProd.map(([, v]) => v), 1);

  const fasce = { "< 15€": 0, "15–30€": 0, "30–60€": 0, "> 60€": 0 };
  cantina.forEach(w => {
    if (w.prezzo < 15) fasce["< 15€"] += w.bottiglie;
    else if (w.prezzo < 30) fasce["15–30€"] += w.bottiglie;
    else if (w.prezzo < 60) fasce["30–60€"] += w.bottiglie;
    else fasce["> 60€"] += w.bottiglie;
  });

  const Card = ({ children, title }) => (
    <div style={{ background: M3.surfaceContainer, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
      {title && <div style={{ fontSize: 11, color: M3.onSurfaceVariant, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "'Roboto', sans-serif", marginBottom: 12, fontWeight: 500 }}>{title}</div>}
      {children}
    </div>
  );

  return (
    <div style={{ padding: "12px 16px 100px" }}>
      <Card>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-around", flexWrap: "wrap" }}>
          {[{ l: "Bottiglie", v: totB, s: "in cantina" }, { l: "Valore", v: `~${totV}€`, s: "stimato" }, { l: "Referenze", v: cantina.length }, { l: "Bevuti", v: bevuti.length, s: totBevuto ? `~${totBevuto}€` : "" }].map(s => (
            <div key={s.l} style={{ flex: "1 1 70px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: M3.primary, fontFamily: "'Roboto', sans-serif" }}>{s.v}</div>
              <div style={{ fontSize: 11, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", fontWeight: 500 }}>{s.l}</div>
              {s.s && <div style={{ fontSize: 10, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>{s.s}</div>}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ color: "#2E7D32" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 22c1-4 4-8 10-10C18 10 22 6 22 2c-4 0-8 4-10 10C10 6 6 2 2 2c0 4 4 8 10 10"/></svg></div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#2E7D32", fontFamily: "'Roboto', sans-serif" }}>{swCount} bottiglie</div>
            <div style={{ fontSize: 12, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>da cantine premiate Slow Wine 2025</div>
          </div>
        </div>
      </Card>
      <Card title="📊 Distribuzione per tipologia">
        {tipoEntries.map(([tipo, count]) => {
          const t = TIPO[tipo];
          const pct = Math.round((count / totB) * 100);
          return (
            <div key={tipo} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <TipoLabel tipo={tipo} size={14} color={M3.onSurface} /> {tipo}
                </span>
                <span style={{ fontSize: 13, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif" }}>{count} · {pct}%</span>
              </div>
              <div style={{ height: 8, background: M3.surfaceContainerHighest, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(count / maxTipo) * 100}%`, background: t?.indicator || M3.primary, borderRadius: 4 }} />
              </div>
            </div>
          );
        })}
      </Card>
      <Card title="🏆 Top 5 produttori">
        {topProd.map(([prod, count], i) => (
          <div key={prod} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: i === 0 ? M3.primaryContainer : M3.surfaceContainerHighest, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: i === 0 ? M3.onPrimaryContainer : M3.onSurfaceVariant, flexShrink: 0 }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 13, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prod}</span>
                <span style={{ fontSize: 12, color: M3.onSurfaceVariant, fontFamily: "'Roboto', sans-serif", flexShrink: 0, marginLeft: 6 }}>{count}</span>
              </div>
              <div style={{ height: 6, background: M3.surfaceContainerHighest, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(count / maxProd) * 100}%`, background: M3.primary, borderRadius: 3 }} />
              </div>
            </div>
          </div>
        ))}
      </Card>
      <Card title="💰 Fasce di prezzo">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(fasce).map(([fascia, count]) => (
            <div key={fascia} style={{ flex: "1 1 70px", background: M3.surfaceContainerHigh, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: M3.primary, fontFamily: "'Roboto', sans-serif" }}>{count}</div>
              <div style={{ fontSize: 11, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", fontWeight: 500 }}>{fascia}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── App principale ───────────────────────────────────────────────────────────
export default function Cantina() {
  const [tab, setTab] = useState("lista");
  const [bevuti, setBevuti] = useState([]);
  const [wines, setWines] = useState([]);
  const [pendingBevi, setPendingBevi] = useState(null);
  const [showAggiungi, setShowAggiungi] = useState(false);
  const [pendingModifica, setPendingModifica] = useState(null);
  const [compact, setCompact] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [bottleOverrides, setBottleOverrides] = useState({});
  const [dbError, setDbError] = useState(null);
  const [ratings, setRatings] = useState({});
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

  useEffect(() => {
    async function loadData() {
      try {
        const [fetchedWines, bev] = await Promise.all([
          fetch(`${SB_URL}/rest/v1/wines?order=id.asc`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" } }).then(r => r.ok ? r.json() : []),
          sb.get("bevuti"),
        ]);
        // Normalizza snake_case → camelCase e valori nulli
        setWines(fetchedWines.map(w => ({
          ...w,
          slowVinoBott: !!w.slow_vino_bott,
          macerazione:  w.macerazione  || "—",
          fermentazione: w.fermentazione || "—",
          malolattica:  w.malolattica  || "—",
        })));
        // F5: niente deduplica — 1:N, ogni riga bevuti ha uid univoco
        const bevFromDb = bev.map(b => ({ uid: b.uid, id: b.wine_id, data: b.data, nota: b.nota || "" }));
        setBevuti(bevFromDb);
        const ratingsFromDb = {};
        bev.forEach(b => { if (b.rating > 0) ratingsFromDb[b.wine_id] = b.rating; });
        setRatings(ratingsFromDb);
      } catch (e) {
        console.error("Errore caricamento dati:", e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const allWines = wines
    .map(w => bottleOverrides[w.id] !== undefined ? { ...w, bottiglie: w.bottiglie - bottleOverrides[w.id] } : w)
    .filter(w => w.bottiglie > 0);

  // F22: wineMap per TabBevuti usa wines non filtrato per bottiglie (include vini a 0)
  const winesForBevuti = wines
    .map(w => bottleOverrides[w.id] !== undefined ? { ...w, bottiglie: w.bottiglie - bottleOverrides[w.id] } : w);

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
    setWines(prev => prev.filter(w => w.id !== wine.id));
    await sb.delete("wines", "id", wine.id);
  };

  const handleBevi = (wineId) => setPendingBevi(allWines.find(w => w.id === wineId));

  const handleConferma = async (nota, data, rating) => {
    const uid = Date.now();
    const wineId = pendingBevi.id;
    const row = { uid, wine_id: wineId, data, nota: nota || "", rating: rating || 0 };
    setBevuti(prev => [...prev, { uid, id: wineId, data, nota: nota || "" }]);
    if (rating > 0) setRatings(prev => ({ ...prev, [wineId]: rating }));
    // F4: decrementa bottiglie nello state locale
    setWines(prev => prev.map(w => w.id === wineId ? { ...w, bottiglie: Math.max(0, (w.bottiglie || 1) - 1) } : w));
    const current = wines.find(w => w.id === wineId);
    setPendingBevi(null);
    await sb.insert("bevuti", row);
    // F4: PATCH bottiglie su Supabase
    if (current) {
      await sb.patch("wines", "id", wineId, { bottiglie: Math.max(0, (current.bottiglie || 1) - 1) });
    }
  };

  const handleRiporta = async (uid) => {
    setBevuti(prev => prev.filter(b => b.uid !== uid));
    await sb.delete("bevuti", "uid", uid);
  };

  const handleSalva = async (form) => {
    setShowAggiungi(false);
    setTab("lista");
    try {
      // id è integer senza autoincrement: legge il max corrente e usa max+1
      const maxRow = await fetch(`${SB_URL}/rest/v1/wines?select=id&order=id.desc&limit=1`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
      }).then(r => r.json());
      const nextId = ((maxRow[0]?.id) || 0) + 1;
      const row = { id: nextId, produttore: form.produttore, vino: form.vino, annata: form.annata || "n.d.", tipologia: form.tipologia, bottiglie: form.bottiglie, prezzo: form.prezzo, vitigno: form.vitigno || "", note: form.note || "", macerazione: form.macerazione || "—", fermentazione: form.fermentazione || "—", malolattica: form.malolattica || "—", slow_vino_bott: false };
      const inserted = await sb.insert("wines", row);
      const saved = inserted ?? row;
      setWines(prev => [...prev, { ...saved, slowVinoBott: !!saved.slow_vino_bott, macerazione: saved.macerazione || "—", fermentazione: saved.fermentazione || "—", malolattica: saved.malolattica || "—" }]);
    } catch (e) {
      setDbError("Errore salvataggio vino");
    }
  };

  const handleModifica = (wine) => setPendingModifica(wine);

  const handleSalvaModifica = async (form) => {
    const wine = pendingModifica;
    const fields = { ...form, bottiglie: Number(form.bottiglie), prezzo: Number(form.prezzo) };
    setWines(prev => prev.map(w => w.id === wine.id ? { ...w, ...fields } : w));
    await sb.upsert("wines", { id: wine.id, ...fields }, "id").catch(console.error);
    setPendingModifica(null);
  };

  const handleRate = async (wineId, score) => {
    setRatings(prev => ({ ...prev, [wineId]: score }));
    const bev = bevuti.find(b => b.id === wineId);
    if (bev) { await sb.patch("bevuti", "uid", bev.uid, { rating: score }).catch(console.error); }
  };

  const bevutiIds = new Set(bevuti.map(b => b.id));
  const cantina = allWines.filter(w => !bevutiIds.has(w.id));
  const totBottiglie = cantina.reduce((a, w) => a + w.bottiglie, 0);
  const totValore    = cantina.reduce((a, w) => a + w.prezzo * w.bottiglie, 0);

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
        @keyframes expandIn { from { opacity:0; transform:translateY(-5px) } to { opacity:1; transform:translateY(0) } }
        @keyframes slideUp  { from { transform:translateY(100%) } to { transform:translateY(0) } }
        @keyframes spin     { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        @keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
        @keyframes m3ContentIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes m3ContentOut {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-8px); }
        }
        @keyframes m3FadeIn { from { opacity: 0; } to { opacity: 1; } }
        .m3-expand-content { animation: m3ContentIn 300ms cubic-bezier(0.2, 0, 0, 1) both; }
        .m3-closing { animation: m3ContentOut 260ms cubic-bezier(0.2, 0, 0, 1) both; overflow: hidden; }
        .m3-stagger-1 { animation: m3FadeIn 250ms cubic-bezier(0.2, 0, 0, 1) 40ms both; }
        .m3-stagger-2 { animation: m3FadeIn 250ms cubic-bezier(0.2, 0, 0, 1) 80ms both; }
        .m3-stagger-3 { animation: m3FadeIn 250ms cubic-bezier(0.2, 0, 0, 1) 120ms both; }
        .m3-stagger-4 { animation: m3FadeIn 250ms cubic-bezier(0.2, 0, 0, 1) 160ms both; }
        .m3-stagger-5 { animation: m3FadeIn 250ms cubic-bezier(0.2, 0, 0, 1) 200ms both; }
      `}</style>

      {/* ── App Bar ── */}
      <div style={{ flexShrink: 0, zIndex: 20, paddingTop: "env(safe-area-inset-top)", background: compact ? M3.surfaceContainer : M3.surface, transition: "background 0.25s cubic-bezier(0.2,0,0,1)" }}>
        <div style={{ display: "flex", alignItems: "center", height: 64, padding: "0 16px", gap: 12 }}>
          <div style={{ flex: 1, fontSize: 22, fontWeight: 400, color: M3.onSurface, fontFamily: "'Roboto', sans-serif", letterSpacing: -0.3, lineHeight: 1 }}>La Mia Cantina</div>
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
        {tab === "lista" && <TabLista wines={allWines} bevuti={bevuti} onBevi={handleBevi} onElimina={handleElimina} onModifica={handleModifica} onAggiungi={() => setShowAggiungi(true)} compact={compact} ratings={ratings} onRate={handleRate} scrollRef={scrollRef} />}
        {tab === "bevuti" && <TabBevuti bevuti={bevuti} allWines={winesForBevuti} onRiporta={handleRiporta} onElimina={handleElimina} onModifica={handleModifica} ratings={ratings} onRate={handleRate} scrollRef={scrollRef} />}
        {tab === "statistiche" && <TabStatistiche wines={allWines} bevuti={bevuti} />}
      </div>

      {/* ── Extended FAB ── */}
      {tab === "lista" && (
        <div style={{ position: "fixed", bottom: 88, right: 16, zIndex: 20, opacity: fabVisible ? 1 : 0, transform: fabVisible ? "translateY(0) scale(1)" : "translateY(10px) scale(0.92)", transition: "opacity 0.2s, transform 0.2s cubic-bezier(0.2,0,0,1)", pointerEvents: fabVisible ? "auto" : "none" }}>
          <button onClick={() => setShowAggiungi(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: M3.primaryContainer, color: M3.onPrimaryContainer, border: "none", borderRadius: 16, padding: "14px 20px", fontSize: 14, fontWeight: 500, fontFamily: "'Roboto', sans-serif", cursor: "pointer", boxShadow: "0 3px 8px rgba(0,0,0,0.14)" }}>
            <span style={{display:"flex",alignItems:"center",gap:8}}>{IC.add} Aggiungi vino</span>
          </button>
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
