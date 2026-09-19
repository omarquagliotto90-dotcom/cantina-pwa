const { test, expect, apriApp } = require("./support/harness");
const { PRODUTTORI } = require("./fixtures/cantina");

// P3 / D3. Slow Wine e sito produttore vivevano in due posti sbagliati: un Set
// hardcoded nel bundle e una tabella interrogata con una query malformata.
// Ora stanno entrambi nell'anagrafica `produttori`, caricata una volta all'avvio.

test.describe("Anagrafica produttori", () => {
  test("il conteggio Slow Wine viene dal database", async ({ page, cantina }) => {
    await apriApp(page);
    await page.getByText("Statistiche", { exact: true }).click();

    // Pieropan ha slow_chiocciola = true e 3 bottiglie in cantina.
    await expect(page.getByText("3 bottiglie")).toBeVisible();
  });

  test("togliere la chiocciola in anagrafica azzera il conteggio", async ({ page, cantina }) => {
    // Prima di P3 questo test era impossibile: i 6 nomi premiati erano un Set
    // nel bundle, quindi cambiarli richiedeva un deploy.
    cantina.setTable("produttori", PRODUTTORI.map(p => ({ ...p, slow_chiocciola: false })));
    await apriApp(page);
    await page.getByText("Statistiche", { exact: true }).click();

    await expect(page.getByText("0 bottiglie")).toBeVisible();
  });

  test("il sito arriva con l'anagrafica, senza interrogare Serper", async ({ page, cantina }) => {
    await apriApp(page);
    await page.getByRole("button", { name: /Soave Classico La Rocca/ }).first().click();
    await page.getByText("Web", { exact: true }).click();

    await expect(page.getByText("www.pieropan.it")).toBeVisible();
    // Il punto della regressione chiusa in P3: prima la cache non veniva mai
    // letta (due `?` nella query string → 400 inghiottito da sb.get) e questa
    // chiamata partiva a ogni apertura della tab.
    expect(cantina.calls.filter(c => c.name === "search-website")).toHaveLength(0);
    // E nessuna query per vino: il dato era già in memoria.
    expect(cantina.calls.filter(c => c.name === "produttori")).toHaveLength(1);
  });

  test("senza sito in anagrafica cerca una volta, e non salva il fallback Google", async ({ page, cantina }) => {
    // La route stub risponde { url: null }: nessun sito ufficiale trovato.
    // L'app mostra il fallback su Google ma NON deve scriverlo in anagrafica,
    // altrimenti una ricerca Google diventerebbe per sempre il "sito ufficiale".
    await apriApp(page);
    await page.getByRole("button", { name: /Orange Unico/ }).first().click();
    await page.getByText("Web", { exact: true }).click();

    await expect.poll(() => cantina.calls.filter(c => c.name === "search-website").length).toBe(1);
    expect(cantina.rpcCalls("salva_sito_produttore")).toHaveLength(0);
  });
});
