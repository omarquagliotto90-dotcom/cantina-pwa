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
const { WINES, BEVUTI } = require("../fixtures/cantina");

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
      wine_images: [],
      wine_websites: [],
    };
    this.rpcOverrides = {};
    this.failing = new Set();
    this._nextUid = 1789000000100;
  }

  // ─── Configurazione ────────────────────────────────────────────────────────

  /** Sostituisce il contenuto di una tabella prima del caricamento pagina. */
  setTable(name, rows) {
    this.tables[name] = rows.map(r => ({ ...r }));
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
    return route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(this.tables[target] ?? []),
    });
  }

  async _handleApi(route) {
    const req = route.request();
    const name = req.url().split("/api/")[1].split("?")[0];
    this.calls.push({ kind: "api", name, args: req.postData(), method: req.method() });
    return route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(DEFAULT_API[name] ?? {}),
    });
  }

  nextUid() {
    return this._nextUid++;
  }
}

// Risposte predefinite delle 9 RPC, con la stessa forma di quelle reali
// (lette da pg_get_functiondef il 19/09/2026).
const DEFAULT_RPC = {
  bevi_bottiglia: (args, c) => {
    const wine = c.tables.wines.find(w => w.id === args.p_wine_id);
    return {
      uid: c.nextUid(),
      consumed_on: args.p_consumed_on || "2026-09-19",
      bottiglie_residue: Math.max((wine?.bottiglie ?? 1) - 1, 0),
    };
  },
  riporta_bottiglia: () => ({ bottiglie_residue: 1 }),
  elimina_bottiglia: (args, c) => {
    const wine = c.tables.wines.find(w => w.id === args.p_wine_id);
    const n = wine?.bottiglie ?? 0;
    return n > 1
      ? { eliminato: false, bottiglie_residue: n - 1 }
      : { eliminato: true, bottiglie_residue: 0 };
  },
  aggiungi_o_incrementa: (args, c) => ({
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
  }),
  modifica_vino: args => ({ id: args.p_id }),
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

/** Attende che il caricamento iniziale sia finito. */
async function apriApp(page) {
  await page.goto("/");
  await base.expect(page.getByText("Carico la cantina…")).toBeHidden({ timeout: 15_000 });
}

module.exports = { test, expect: base.expect, apriApp, Cantina };
