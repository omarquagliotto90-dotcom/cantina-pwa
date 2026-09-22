// Harness condiviso dei test e2e.
//
// REGOLA NON NEGOZIABILE: i test non parlano mai con Supabase o con le route
// /api reali. L'app punta al progetto di produzione (SB_URL è hardcoded in
// App.jsx), quindi un test che clicca "Conferma" senza stub scalerebbe una
// bottiglia vera. Qui ogni richiesta verso l'esterno è intercettata, e quelle
// non previste vengono registrate come "leak" e fanno fallire il test in
// teardown — così un test nuovo non può sfuggire per dimenticanza.
//
// Uso:
//   const { test, expect } = require("./support/harness");
//   test("…", async ({ page, cantina }) => { … });

const base = require("@playwright/test");
const { WINES, BEVUTI, PRODUTTORI, BOTTIGLIE } = require("../fixtures/cantina");

const RE_SUPABASE = /supabase\.co/;
const RE_API = /\/api\//;
const RE_FONTS = /fonts\.(googleapis|gstatic)\.com/;

const JSON_HEADERS = { "content-type": "application/json" };

class Cantina {
  constructor(page) {
    this.page = page;
    /** Ogni chiamata intercettata: { kind, name, args, method } */
    this.calls = [];
    /** Richieste verso l'esterno non previste da nessuno stub. */
    this.leaks = [];
    /** Contenuto delle tabelle servito sulle GET REST. */
    this.tables = {
      wines: WINES.map(w => ({ ...w })),
      bevuti: BEVUTI.map(b => ({ ...b })),
      produttori: PRODUTTORI.map(p => ({ ...p })),
      wine_images: [],
      bottiglie: BOTTIGLIE.map(b => ({ ...b })),
      // P3: non più letta dal client, resta finché la fase 3 non la elimina.
      wine_websites: [],
    };
    this.rpcOverrides = {};
    /** Risposte su misura per le route /api: nome -> { status, body }. */
    this.apiOverrides = {};
    this.failing = new Set();
    this._nextUid = 1789000000100;
  }

  // ─── Configurazione ────────────────────────────────────────────────────────

  /** Sostituisce il contenuto di una tabella prima del caricamento pagina. */
  setTable(name, rows) {
    this.tables[name] = rows.map(r => ({ ...r }));
    // P6 fase 4a: il client conta le righe di `bottiglie`, non legge piu'
    // `wines.bottiglie`. Un test che imposta solo `wines` si ritroverebbe una
    // cantina vuota senza capire perche', quindi le righe si generano qui.
    // Un `setTable("bottiglie", ...)` successivo le sovrascrive.
    if (name === "wines") this._generaBottiglie();
    return this;
  }

  /** Fa fallire una RPC (HTTP 500) — `sb.rpc` restituirà null e l'app farà rollback. */
  failRpc(fn) {
    this.failing.add(fn);
    return this;
  }

  /** Fa fallire la GET di una tabella — per i percorsi d'errore del caricamento. */
  failTable(name) {
    this.failing.add(name);
    return this;
  }

  /** Risposta su misura per una RPC. */
  onRpc(fn, handler) {
    this.rpcOverrides[fn] = handler;
    return this;
  }

  // ─── Interrogazione ────────────────────────────────────────────────────────

  /** Tutte le chiamate a una RPC, in ordine. */
  rpcCalls(fn) {
    return this.calls.filter(c => c.kind === "rpc" && c.name === fn);
  }

  /** Argomenti dell'ultima chiamata a una RPC, o undefined. */
  lastRpcArgs(fn) {
    const list = this.rpcCalls(fn);
    return list.length ? list[list.length - 1].args : undefined;
  }

  // ─── Intercettazione ───────────────────────────────────────────────────────

  async install() {
    // L'ordine conta: Playwright valuta le route in ordine INVERSO di
    // registrazione, quindi la guardia va registrata per prima per finire
    // ultima nella catena.
    await this.page.route(
      url => RE_SUPABASE.test(url.href) || RE_API.test(url.href),
      route => {
        const req = route.request();
        this.leaks.push(`${req.method()} ${req.url()}`);
        return route.fulfill({ status: 500, headers: JSON_HEADERS, body: '{"error":"richiesta non prevista dallo stub"}' });
      }
    );

    // I font non servono a nessuna asserzione e rallentano l'avvio.
    await this.page.route(url => RE_FONTS.test(url.href), route => route.abort());

    await this.page.route(url => RE_SUPABASE.test(url.href), route => this._handleSupabase(route));
    await this.page.route(url => RE_API.test(url.href), route => this._handleApi(route));
    return this;
  }

  async _handleSupabase(route) {
    const req = route.request();
    const url = req.url();

    // Tutto ciò che non è /rest/v1 (es. /auth/v1/token quando arriverà il login
    // di A4) non ha uno stub: va segnalato, non servito come risposta vuota.
    if (!url.includes("/rest/v1/")) {
      this.leaks.push(`endpoint Supabase senza stub: ${req.method()} ${url}`);
      return route.fulfill({ status: 500, headers: JSON_HEADERS, body: "{}" });
    }

    const path = url.split("/rest/v1/")[1] || "";
    const [target] = path.split("?");

    if (target.startsWith("rpc/")) {
      const fn = target.slice(4);
      let args = {};
      try { args = JSON.parse(req.postData() || "{}"); } catch { /* corpo non JSON */ }
      this.calls.push({ kind: "rpc", name: fn, args, method: req.method() });

      if (this.failing.has(fn)) {
        return route.fulfill({ status: 500, headers: JSON_HEADERS, body: '{"message":"errore simulato"}' });
      }
      const handler = this.rpcOverrides[fn] || DEFAULT_RPC[fn];
      const body = handler ? handler(args, this) : true;
      return route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify(body) });
    }

    this.calls.push({ kind: "rest", name: target, args: path, method: req.method() });
    if (req.method() !== "GET") {
      // Dopo A3 il client scrive solo via RPC: una scrittura REST diretta è una
      // regressione, non un caso da stubbare.
      this.leaks.push(`scrittura REST diretta: ${req.method()} ${req.url()}`);
      return route.fulfill({ status: 500, headers: JSON_HEADERS, body: "{}" });
    }
    if (this.failing.has(target)) {
      return route.fulfill({ status: 500, headers: JSON_HEADERS, body: '{"message":"errore simulato"}' });
    }
    // P1b: il client chiede `wines?deleted_at=is.null`. Se lo stub servisse la
    // tabella intera, una regressione sul filtro passerebbe inosservata.
    let righe = this.tables[target] ?? [];
    if (path.includes("deleted_at=is.null")) {
      righe = righe.filter(r => r.deleted_at == null);
    }
    // P6: il client chiede le sole bottiglie in giacenza. Come sopra, servire
    // la tabella intera nasconderebbe una regressione sul filtro — e qui
    // peserebbe il doppio, perche' le righe bevute hanno anche loro un formato.
    if (path.includes("stato=eq.in_cantina")) {
      righe = righe.filter(r => r.stato === "in_cantina");
    }
    return route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(righe),
    });
  }

  async _handleApi(route) {
    const req = route.request();
    const name = req.url().split("/api/")[1].split("?")[0];
    this.calls.push({ kind: "api", name, args: req.postData(), method: req.method() });
    const su_misura = this.apiOverrides[name];
    if (su_misura) {
      return route.fulfill({
        status: su_misura.status ?? 200,
        headers: JSON_HEADERS,
        body: JSON.stringify(su_misura.body ?? {}),
      });
    }
    return route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(DEFAULT_API[name] ?? {}),
    });
  }

  nextUid() {
    return this._nextUid++;
  }

  /** Una riga `bottiglie` in cantina per ogni bottiglia dichiarata in `wines`. */
  _generaBottiglie() {
    let seq = 1;
    this.tables.bottiglie = [];
    for (const w of this.tables.wines) {
      if (w.deleted_at != null) continue;
      for (let i = 0; i < (w.bottiglie ?? 0); i++) {
        this.tables.bottiglie.push({
          id: seq++, wine_id: w.id, formato: "Standard", stato: "in_cantina",
          prezzo_pagato: w.prezzo ?? null, acquistata_il: null, posizione: null,
          consumed_on: null, nota: null, rating: null, produttore: null,
          vino: null, annata: null, tipologia: null, legacy_uid: null,
          created_at: w.created_at,
        });
      }
    }
  }
}

// Risposte predefinite delle 9 RPC, con la stessa forma di quelle reali
// (lette da pg_get_functiondef il 19/09/2026).
const DEFAULT_RPC = {
  // P6 fase 4a: gli stub mutano `bottiglie`, che e' cio' che il client legge.
  // `wines.bottiglie` viene tenuto allineato come fa la RPC vera, cosi' un
  // eventuale ritorno al vecchio modello resta verificabile.
  bevi_bottiglia: (args, c) => {
    const wine = c.tables.wines.find(w => w.id === args.p_wine_id);
    const consumed_on = args.p_consumed_on || "2026-09-19";
    const uid = c.nextUid();
    const riga = c.tables.bottiglie.find(b => b.wine_id === args.p_wine_id && b.stato === "in_cantina");
    if (riga) {
      Object.assign(riga, {
        stato: "bevuta", consumed_on, nota: args.p_nota || null,
        rating: args.p_rating ?? null, legacy_uid: uid,
        produttore: wine?.produttore ?? null, vino: wine?.vino ?? null,
        annata: wine?.annata ?? null, tipologia: wine?.tipologia ?? null,
      });
    }
    if (wine) wine.bottiglie = Math.max((wine.bottiglie ?? 1) - 1, 0);
    return {
      uid, bottiglia_id: riga?.id ?? null, consumed_on,
      bottiglie_residue: wine?.bottiglie ?? 0,
    };
  },
  riporta_bottiglia_per_id: (args, c) => {
    const riga = c.tables.bottiglie.find(b => b.id === args.p_bottiglia_id);
    if (riga) {
      Object.assign(riga, {
        stato: "in_cantina", consumed_on: null, nota: null, rating: null,
        legacy_uid: null, produttore: null, vino: null, annata: null, tipologia: null,
      });
      const wine = c.tables.wines.find(w => w.id === riga.wine_id);
      if (wine) wine.bottiglie = (wine.bottiglie ?? 0) + 1;
      return { bottiglie_residue: wine?.bottiglie ?? 1 };
    }
    return { bottiglie_residue: 1 };
  },
  // P1b: l'ultima bottiglia non cancella più la riga, la marca `deleted_at`.
  // Lo stub muta la tabella come fa la RPC vera, così un ricaricamento nel
  // test vede quello che vedrebbe l'app.
  elimina_bottiglia: (args, c) => {
    const wine = c.tables.wines.find(w => w.id === args.p_wine_id);
    const n = wine?.bottiglie ?? 0;
    // Come la RPC vera: una giacenza in meno, la piu' recente. Le righe gia'
    // bevute non si toccano mai.
    const inC = c.tables.bottiglie.filter(b => b.wine_id === args.p_wine_id && b.stato === "in_cantina");
    const ultima = inC[inC.length - 1];
    if (ultima) c.tables.bottiglie.splice(c.tables.bottiglie.indexOf(ultima), 1);
    if (n > 1) {
      if (wine) wine.bottiglie = n - 1;
      return { eliminato: false, bottiglie_residue: n - 1 };
    }
    if (wine) { wine.bottiglie = 0; wine.deleted_at = "2026-09-20T10:00:00+00:00"; }
    return { eliminato: true, bottiglie_residue: 0 };
  },
  // P1b: se esiste già una riga con lo stesso produttore+vino+annata
  // normalizzati, la RPC vera incrementa le bottiglie e azzera `deleted_at`
  // invece di inserirne una nuova — conservando id, immagine e storico.
  aggiungi_o_incrementa: (args, c) => {
    const norm = v => (v ?? "").trim().toLowerCase();
    const esistente = c.tables.wines.find(w =>
      norm(w.produttore) === norm(args.p_produttore) &&
      norm(w.vino) === norm(args.p_vino) &&
      (w.annata ?? null) === (args.p_annata ?? null));
    const creaRighe = (wineId) => {
      const prossimo = () => 1 + c.tables.bottiglie.reduce((m, b) => Math.max(m, b.id), 0);
      for (let i = 0; i < (args.p_bottiglie ?? 0); i++) {
        c.tables.bottiglie.push({
          id: prossimo(), wine_id: wineId, formato: args.p_formato || "Standard",
          stato: "in_cantina", prezzo_pagato: args.p_prezzo ?? null,
          acquistata_il: null, posizione: null, consumed_on: null, nota: null,
          rating: null, produttore: null, vino: null, annata: null,
          tipologia: null, legacy_uid: null, created_at: "2026-09-22T10:00:00+00:00",
        });
      }
    };
    if (esistente) {
      esistente.bottiglie = (esistente.bottiglie ?? 0) + args.p_bottiglie;
      esistente.deleted_at = null;
      creaRighe(esistente.id);
      return { ...esistente };
    }
    creaRighe(999);
    return {
    id: 999,
    produttore: args.p_produttore,
    vino: args.p_vino,
    denominazione: args.p_denominazione,
    annata: args.p_annata,
    tipologia: args.p_tipologia,
    bottiglie: args.p_bottiglie,
    prezzo: args.p_prezzo,
    vitigno: args.p_vitigno,
    note: args.p_note,
    macerazione: args.p_macerazione,
    fermentazione: args.p_fermentazione,
    malolattica: args.p_malolattica,
    valore: null,
    note_cantina: null,
    slow_vino_bott: false,
    created_at: "2026-09-19T12:00:00+00:00",
    };
  },
  // Come la RPC vera: `p_bottiglie` e' un TOTALE, quindi la giacenza si
  // riconcilia in entrambe le direzioni, e il formato si riscrive solo se e'
  // stato davvero chiesto.
  modifica_vino: (args, c) => {
    const inC = c.tables.bottiglie.filter(b => b.wine_id === args.p_id && b.stato === "in_cantina");
    const diff = (args.p_bottiglie ?? 0) - inC.length;
    if (diff > 0) {
      const prossimo = () => 1 + c.tables.bottiglie.reduce((m, b) => Math.max(m, b.id), 0);
      const formato = args.p_formato || inC[0]?.formato || "Standard";
      for (let i = 0; i < diff; i++) {
        c.tables.bottiglie.push({
          id: prossimo(), wine_id: args.p_id, formato, stato: "in_cantina",
          prezzo_pagato: args.p_prezzo ?? null, acquistata_il: null, posizione: null,
          consumed_on: null, nota: null, rating: null, produttore: null,
          vino: null, annata: null, tipologia: null, legacy_uid: null,
          created_at: "2026-09-22T10:00:00+00:00",
        });
      }
    } else if (diff < 0) {
      for (const riga of inC.slice(diff)) {
        c.tables.bottiglie.splice(c.tables.bottiglie.indexOf(riga), 1);
      }
    }
    for (const riga of c.tables.bottiglie) {
      if (riga.wine_id !== args.p_id || riga.stato !== "in_cantina") continue;
      riga.prezzo_pagato = args.p_prezzo ?? null;
      if (args.p_formato != null) riga.formato = args.p_formato;
    }
    const wine = c.tables.wines.find(w => w.id === args.p_id);
    if (wine) wine.bottiglie = args.p_bottiglie ?? wine.bottiglie;
    return { id: args.p_id };
  },
  aggiorna_scheda_tecnica: args => ({ id: args.p_id }),
  valuta_vino: () => true,
  salva_immagine_vino: () => true,
  salva_sito_produttore: () => true,
};

// Le route serverless restituiscono "nessun risultato": i test non dipendono
// da Serper, Gemini o Anthropic.
const DEFAULT_API = {
  "search-image": { url: null },
  "search-website": { url: null, source: null },
  "enrich-wine": {},
  "analyze-label": {},
};

const test = base.test.extend({
  cantina: async ({ page }, use) => {
    const cantina = new Cantina(page);
    await cantina.install();
    await use(cantina);
    if (cantina.leaks.length) {
      throw new Error(
        "Richieste uscite dallo stub (i test non devono toccare Supabase o /api reali):\n  " +
        cantina.leaks.join("\n  ")
      );
    }
  },
});

/**
 * Apre la ricerca della Cantina e scrive la query.
 * Dal ridisegno C2 il campo e' nascosto dietro un bottone: il test deve fare
 * lo stesso percorso dell'utente, non scorciatoie.
 */
async function cerca(page, testo) {
  await page.getByRole("button", { name: "Cerca", exact: true }).click();
  await page.getByPlaceholder("Produttore, vino, annata, uva").fill(testo);
}

/** Attende che il caricamento iniziale sia finito. */
async function apriApp(page) {
  await page.goto("/");
  await base.expect(page.getByText("Carico la cantina…")).toBeHidden({ timeout: 15_000 });
}

/**
 * Le regioni con una foto di sfondo, lette da `WineDetail.jsx`.
 * Sta qui e non in ogni spec perche' la leggono in due, e una regex duplicata
 * diverge al primo ritocco della costante.
 */
function regioniConFoto() {
  const fs = require("fs"), path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "src", "ui", "WineDetail.jsx"), "utf8");
  const blocco = src.match(/export const REGIONI_CON_FOTO = \[([\s\S]*?)\];/);
  if (!blocco) throw new Error("REGIONI_CON_FOTO non trovato in WineDetail.jsx");
  return [...blocco[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
}

module.exports = { test, expect: base.expect, apriApp, cerca, Cantina, regioniConFoto };
