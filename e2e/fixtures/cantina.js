// Dataset di prova. Rispecchia lo schema REALE dopo A2b/A3 — è quindi anche
// documentazione eseguibile del contratto dati: se una migrazione cambia un
// tipo (es. `annata` da smallint a text), questi fixture vanno aggiornati e
// il test che fallisce dice esattamente dove il client non è allineato.
//
// Campi nullable secondo A2b: annata, prezzo, denominazione, macerazione,
// fermentazione, malolattica, valore, rating. Niente più placeholder "—"/"n.d."
// salvati nel DB: quelli esistono solo a display, prodotti da normalizzaWine().

/** Vino completo, 3 bottiglie. "Pieropan" è nel Set Slow Wine hardcoded. */
const VINO_COMPLETO = {
  id: 1,
  produttore: "Pieropan",
  vino: "Soave Classico La Rocca",
  annata: 2021,
  tipologia: "Bianco fermo",
  bottiglie: 3,
  prezzo: 12,
  valore: 18,
  denominazione: "DOC",
  vitigno: "Garganega",
  macerazione: "nessuna",
  fermentazione: "acciaio",
  malolattica: "svolta",
  note: "Nota di prova",
  note_cantina: null,
  slow_vino_bott: true,
  created_at: "2026-01-10T10:00:00+00:00",
};

/** Tutti i campi opzionali a NULL: verifica i placeholder di normalizzaWine(). */
const VINO_MINIMO = {
  id: 2,
  produttore: "Azienda Senza Dati",
  vino: "Rosso Anonimo",
  annata: null,
  tipologia: "Rosso fermo",
  bottiglie: 2,
  prezzo: null,
  valore: null,
  denominazione: null,
  vitigno: null,
  macerazione: null,
  fermentazione: null,
  malolattica: null,
  note: null,
  note_cantina: null,
  slow_vino_bott: false,
  created_at: "2026-02-01T10:00:00+00:00",
};

/** Ultima bottiglia: distingue il ramo "decrementa" da quello "elimina riga". */
const VINO_ULTIMA_BOTTIGLIA = {
  id: 3,
  produttore: "Cantina Singola",
  vino: "Orange Unico",
  annata: 2020,
  tipologia: "Orange",
  bottiglie: 1,
  prezzo: 20,
  valore: null,
  denominazione: "IGT",
  vitigno: "Ribolla",
  macerazione: "30 giorni",
  fermentazione: "anfora",
  malolattica: null,
  note: null,
  note_cantina: null,
  slow_vino_bott: false,
  created_at: "2026-03-01T10:00:00+00:00",
};

/** Esaurito: fuori dalla Lista, ma deve restare risolvibile dalla tab Bevuti. */
const VINO_ESAURITO = {
  id: 4,
  produttore: "Cantine Belisario",
  vino: "Verdicchio Cambrugiano",
  annata: 2019,
  tipologia: "Bianco fermo",
  bottiglie: 0,
  prezzo: 15,
  valore: 22,
  denominazione: "DOCG",
  vitigno: "Verdicchio",
  macerazione: null,
  fermentazione: "acciaio",
  malolattica: null,
  note: null,
  note_cantina: null,
  slow_vino_bott: false,
  created_at: "2026-01-20T10:00:00+00:00",
};

const WINES = [VINO_COMPLETO, VINO_MINIMO, VINO_ULTIMA_BOTTIGLIA, VINO_ESAURITO];

// `bevuti` porta uno snapshot dei dati del vino al momento del consumo.
// `wine_id` è NULL quando il vino è stato cancellato (FK ON DELETE SET NULL).
// NB: `annata` qui è text, mentre in `wines` è smallint — è la divergenza di
// tipi descritta in ANALISI_ARCHITETTURA.md (D4), riprodotta di proposito.
const BEVUTI = [
  {
    uid: 1789000000001, wine_id: 4, consumed_on: "2026-09-10",
    created_at: "2026-09-10T19:44:59+00:00", nota: "Ottimo", rating: 4.5,
    produttore: "Cantine Belisario", vino: "Verdicchio Cambrugiano",
    annata: "2019", tipologia: "Bianco fermo", prezzo: 15,
  },
  // Due bevute dello STESSO vino con voti divergenti (D5, 5 vini reali).
  // Di proposito la più recente vale MENO del massimo: così il test distingue
  // "mostra il massimo" (vecchio comportamento) da "mostra la più recente"
  // (dopo lo stopgap di P0). Rispecchia il caso reale di Vina Krapez, 5.0 → 4.5.
  {
    uid: 1789000000002, wine_id: 1, consumed_on: "2026-08-01",
    created_at: "2026-08-01T20:00:00+00:00", nota: "", rating: 4.0,
    produttore: "Pieropan", vino: "Soave Classico La Rocca",
    annata: "2021", tipologia: "Bianco fermo", prezzo: 12,
  },
  {
    uid: 1789000000003, wine_id: 1, consumed_on: "2026-09-01",
    created_at: "2026-09-01T20:00:00+00:00", nota: "Meno brillante", rating: 3.0,
    produttore: "Pieropan", vino: "Soave Classico La Rocca",
    annata: "2021", tipologia: "Bianco fermo", prezzo: 12,
  },
  // Orfano: il vino non esiste più in `wines`, resta solo lo snapshot.
  {
    uid: 1789000000004, wine_id: null, consumed_on: "2026-07-15",
    created_at: "2026-07-15T20:00:00+00:00", nota: "", rating: null,
    produttore: "Produttore Cancellato", vino: "Vino Fantasma",
    annata: "2018", tipologia: "Rosso fermo", prezzo: 10,
  },
];

// Totali attesi sulla Lista (solo i vini con bottiglie > 0: id 1, 2, 3).
// Calcolati con le formule unificate in A1 — se divergono di nuovo, i test
// falliscono qui invece che sul telefono.
const ATTESI = {
  referenze: 3,
  bottiglie: 6,                 // 3 + 2 + 1
  costo: 56,                    // costoGiacenza: 12*3 + null*2 + 20*1
  mediaBottiglia: 9,            // round(56 / 6)
  valoreMercato: 18 * 3 + 0 * 2 + 20 * 1, // valoreBottiglia con fallback = 74
};

// P3: anagrafica produttori. `slow_chiocciola` e `sito` vivono qui, non più
// in un Set hardcoded nel bundle e in `wine_websites`.
// `nome_norm` è una colonna generata (`lower(btrim(nome))`): va riprodotta,
// perché è la chiave con cui il client indicizza la mappa.
const PRODUTTORI = [
  {
    id: 1, nome: "Pieropan", nome_norm: "pieropan",
    sito: "https://www.pieropan.it/", sito_source: "serper",
    slow_chiocciola: true, regione: "Veneto",
  },
  {
    id: 2, nome: "Azienda Senza Dati", nome_norm: "azienda senza dati",
    sito: null, sito_source: null, slow_chiocciola: false, regione: null,
  },
  {
    id: 3, nome: "Cantina Singola", nome_norm: "cantina singola",
    sito: null, sito_source: null, slow_chiocciola: false, regione: null,
  },
  {
    id: 4, nome: "Cantine Belisario", nome_norm: "cantine belisario",
    sito: null, sito_source: null, slow_chiocciola: false, regione: "Marche",
  },
];

// P6 fase 4a: `bottiglie` e' la fonte di verita' del client. La giacenza e'
// il NUMERO di righe in cantina, lo storico sono le righe bevute: `wines.bottiglie`
// e `bevuti` esistono ancora in tabella, ma nessuno li legge piu'.
//
// Le righe si generano da WINES e BEVUTI invece di scriverle a mano, cosi'
// non possono divergere da ATTESI quando un fixture cambia. L'unica eccezione
// scritta a mano e' la Magnum del Soave: e' il caso misto — due Standard e una
// Magnum sullo stesso vino — che serve al badge dei formati.
const FORMATO_DI = { 1: ["Standard", "Standard", "Magnum"] };

const BOTTIGLIE = [];
let _seqBott = 1;
for (const w of WINES) {
  if (w.deleted_at != null) continue;
  for (let i = 0; i < (w.bottiglie ?? 0); i++) {
    BOTTIGLIE.push({
      id: _seqBott++, wine_id: w.id,
      formato: FORMATO_DI[w.id]?.[i] ?? "Standard",
      stato: "in_cantina", prezzo_pagato: w.prezzo ?? null,
      acquistata_il: null, posizione: null,
      consumed_on: null, nota: null, rating: null,
      produttore: null, vino: null, annata: null, tipologia: null,
      legacy_uid: null, created_at: w.created_at,
    });
  }
}
for (const b of BEVUTI) {
  BOTTIGLIE.push({
    id: _seqBott++, wine_id: b.wine_id, formato: "Standard", stato: "bevuta",
    prezzo_pagato: b.prezzo ?? null, acquistata_il: null, posizione: null,
    consumed_on: b.consumed_on, nota: b.nota || null, rating: b.rating,
    produttore: b.produttore, vino: b.vino,
    annata: /^\d{4}$/.test(String(b.annata)) ? Number(b.annata) : null,
    tipologia: b.tipologia, legacy_uid: b.uid, created_at: b.created_at,
  });
}

module.exports = {
  WINES, BEVUTI, PRODUTTORI, BOTTIGLIE, ATTESI,
  VINO_COMPLETO, VINO_MINIMO, VINO_ULTIMA_BOTTIGLIA, VINO_ESAURITO,
};
