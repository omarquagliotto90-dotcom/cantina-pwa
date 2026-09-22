const { test, expect, apriApp, regioniConFoto } = require("./support/harness");
const { PRODUTTORI } = require("./fixtures/cantina");

// P3 / D3. Slow Wine e sito produttore vivevano in due posti sbagliati: un Set
// hardcoded nel bundle e una tabella interrogata con una query malformata.
// Ora stanno entrambi nell'anagrafica `produttori`, caricata una volta all'avvio.

test.describe("Anagrafica produttori", () => {
  test("il conteggio Slow Wine viene dal database", async ({ page, cantina }) => {
    await apriApp(page);
    await page.getByText("Statistiche", { exact: true }).click();

    // Pieropan ha slow_chiocciola = true e 3 bottiglie in cantina.
    await expect(page.getByTestId("stat-slowwine")).toHaveText("3");
  });

  test("togliere la chiocciola in anagrafica azzera il conteggio", async ({ page, cantina }) => {
    // Prima di P3 questo test era impossibile: i 6 nomi premiati erano un Set
    // nel bundle, quindi cambiarli richiedeva un deploy.
    cantina.setTable("produttori", PRODUTTORI.map(p => ({ ...p, slow_chiocciola: false })));
    await apriApp(page);
    await page.getByText("Statistiche", { exact: true }).click();

    await expect(page.getByTestId("stat-slowwine")).toHaveText("0");
  });

  test("il sito arriva con l'anagrafica, senza interrogare Serper", async ({ page, cantina }) => {
    await apriApp(page);
    await page.getByRole("button", { name: /Soave Classico La Rocca/ }).first().click();

    // C5: la scheda non ha piu' la tab "Web" con l'iframe. Il sito e' un link
    // esterno, e l'indirizzo viene dall'anagrafica caricata all'avvio.
    // Due porte per lo stesso posto: il bottone tondo in alto e quello largo
    // in fondo. Devono portare entrambe all'indirizzo dell'anagrafica.
    const link = page.getByRole("link", { name: "Sito del produttore" });
    await expect(link).toHaveCount(2);
    await expect(link.first()).toHaveAttribute("href", "https://www.pieropan.it/");
    await expect(link.last()).toHaveAttribute("href", "https://www.pieropan.it/");
    // Il punto della regressione chiusa in P3: prima la cache non veniva mai
    // letta (due `?` nella query string → 400 inghiottito da sb.get).
    expect(cantina.calls.filter(c => c.name === "search-website")).toHaveLength(0);
    // E nessuna query per vino: il dato era già in memoria.
    expect(cantina.calls.filter(c => c.name === "produttori")).toHaveLength(1);
  });

  test("senza sito in anagrafica il link cade su Google, senza cercare", async ({ page, cantina }) => {
    // Cambio dichiarato in C5: con `WebsiteView` e' sparita anche la ricerca
    // automatica del sito. Prima aprire la tab "Web" di un produttore ignoto
    // interrogava Serper e salvava il risultato in anagrafica; ora il link
    // porta a una ricerca Google e basta.
    //
    // L'invariante che il test proteggeva resta vera, e a maggior ragione: il
    // fallback Google non diventa mai il "sito ufficiale" del produttore.
    await apriApp(page);
    await page.getByRole("button", { name: /Orange Unico/ }).first().click();

    await expect(page.getByRole("link", { name: "Cerca il produttore" }))
      .toHaveAttribute("href", /^https:\/\/www\.google\.com\/search\?q=/);
    // Il bottone tondo in alto porta allo stesso fallback.
    await expect(page.getByLabel("Sito del produttore"))
      .toHaveAttribute("href", /^https:\/\/www\.google\.com\/search\?q=/);
    expect(cantina.calls.filter(c => c.name === "search-website")).toHaveLength(0);
    expect(cantina.rpcCalls("salva_sito_produttore")).toHaveLength(0);
  });

  // ── Foto di regione nell'hero ─────────────────────────────────────────────
  // Lo sfondo lo sceglie la regione del PRODUTTORE, non il vino, e si accende
  // solo per le regioni elencate in `REGIONI_CON_FOTO` (vedi
  // `public/regioni/README.md`). Il punto fragile e' l'aggancio nome-file:
  // aggiungere una foto significa mettere il file e scrivere la regione
  // nell'elenco, e uno slug sbagliato non fa rumore, semplicemente non appare.

  test("l'hero prende la foto della regione del produttore", async ({ page, cantina }) => {
    cantina.setTable("produttori", [{
      id: 1, nome: "Pieropan", nome_norm: "pieropan",
      sito: null, sito_source: null, slow_chiocciola: false,
      regione: "Trentino-Alto Adige",
    }]);
    await apriApp(page);
    await page.getByRole("button", { name: /Soave Classico La Rocca/ }).first().click();

    await expect(page.getByTestId("hero-foto")).toHaveCSS(
      "background-image", /\/regioni\/trentino-alto-adige\.jpg/);
  });

  test("una regione senza foto lascia l'hero a fondo pieno", async ({ page, cantina }) => {
    // Serve una regione che una foto NON ce l'abbia. La prima versione usava
    // il Veneto e si e' rotta appena il Veneto l'ha avuta: qui la premessa e'
    // verificata, cosi' il giorno che tocca al Molise il test dice cosa fare
    // invece di fallire sull'asserzione vera.
    const SENZA_FOTO = "Molise";
    expect(regioniConFoto(),
      `"${SENZA_FOTO}" ha ora una foto: scegli un'altra regione per questo test`)
      .not.toContain(SENZA_FOTO);

    cantina.setTable("produttori", [{
      id: 1, nome: "Pieropan", nome_norm: "pieropan",
      sito: null, sito_source: null, slow_chiocciola: false, regione: SENZA_FOTO,
    }]);
    await apriApp(page);
    await page.getByRole("button", { name: /Soave Classico La Rocca/ }).first().click();

    // Nel dialogo, non nella riga di Lista che resta dietro: il nome del vino
    // sta in tutte e due e senza `getByRole("dialog")` ne trova due.
    const dettaglio = page.getByRole("dialog");
    await expect(dettaglio.getByRole("heading", { name: "Soave Classico La Rocca" })).toBeVisible();
    await expect(page.getByTestId("hero-foto")).toHaveCount(0);
  });
});
