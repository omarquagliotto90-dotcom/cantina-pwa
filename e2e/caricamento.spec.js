const { test, expect, apriApp } = require("./support/harness");
const { ATTESI } = require("./fixtures/cantina");

test.describe("Caricamento e Lista", () => {
  test("mostra solo i vini con bottiglie > 0", async ({ page, cantina }) => {
    await apriApp(page);

    await expect(page.getByText("Soave Classico La Rocca")).toBeVisible();
    await expect(page.getByText("Rosso Anonimo")).toBeVisible();
    await expect(page.getByText("Orange Unico")).toBeVisible();
    // Esaurito (bottiglie = 0): fuori dalla Lista, ma ancora nel DB.
    await expect(page.getByText("Verdicchio Cambrugiano")).toHaveCount(0);
  });

  test("i totali di header e Lista usano la stessa formula", async ({ page, cantina }) => {
    await apriApp(page);

    // Header: bottiglie · costo d'acquisto della giacenza.
    await expect(page.getByText(`${ATTESI.bottiglie} · ~${ATTESI.costo}€`)).toBeVisible();

    // Le tile della Lista devono concordare con l'header: è la regressione
    // chiusa in A1, quando lo stesso dato dava 1.566 € / 1.457,5 € / 2.051,5 €.
    await expect(page.getByText(String(ATTESI.referenze), { exact: true })).toBeVisible();
    await expect(page.getByText(`~${ATTESI.costo}€`, { exact: true })).toBeVisible();
    await expect(page.getByText(`~${ATTESI.mediaBottiglia}€`, { exact: true })).toBeVisible();
  });

  test("i campi NULL diventano placeholder, non stringhe vuote", async ({ page, cantina }) => {
    await apriApp(page);
    await page.getByRole("button", { name: /Rosso Anonimo/ }).first().click();

    // A2b: nel DB sono NULL; "n.d." e "—" esistono solo a display.
    await expect(page.getByText("n.d.").first()).toBeVisible();
    await expect(page.getByText("—").first()).toBeVisible();
  });

  test("filtra per tipologia", async ({ page, cantina }) => {
    await apriApp(page);

    await page.getByText("Orange", { exact: true }).first().click();
    await expect(page.getByText("Orange Unico")).toBeVisible();
    await expect(page.getByText("Soave Classico La Rocca")).toHaveCount(0);
  });

  test("cerca per produttore", async ({ page, cantina }) => {
    await apriApp(page);

    await page.getByPlaceholder("Cerca produttore, vino, vitigno…").fill("pieropan");
    await expect(page.getByText("Soave Classico La Rocca")).toBeVisible();
    await expect(page.getByText("Rosso Anonimo")).toHaveCount(0);
  });

  test("un errore HTTP mostra il banner, non 'Nessun vino trovato'", async ({ page, cantina }) => {
    // A1 ha introdotto sb.getOrThrow proprio per distinguere i due casi:
    // prima, su rete lenta, un errore appariva come cantina vuota.
    cantina.failTable("wines");
    await apriApp(page);

    await expect(page.getByText(/impossibile caricare la cantina/i)).toBeVisible();
  });
});
