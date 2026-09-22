const { test, expect, apriApp } = require("./support/harness");

// P6 fase 3 — il formato della bottiglia.
//
// Decisione di Omar (22/09/2026): il badge in lista compare SOLO quando il
// formato e' diverso da Standard. E' la parte che si rompe piu' facilmente,
// perche' la condizione giusta e' invisibile finche' tutto e' Standard: su 118
// bottiglie vere, 117 lo sono.

test.describe("Formato bottiglia", () => {
  test("il badge compare solo per i formati diversi da Standard", async ({ page, cantina }) => {
    await apriApp(page);

    // Il Soave ha due Standard e una Magnum: si nomina solo la Magnum.
    const soave = page.getByRole("button", { name: /Soave Classico La Rocca/ }).first();
    await expect(soave.getByText("Magnum", { exact: true })).toBeVisible();
    await expect(soave.getByText("Standard")).toHaveCount(0);

    // Il Rosso Anonimo e' tutto Standard: niente badge, nessuna parola in piu'.
    const anonimo = page.getByRole("button", { name: /Rosso Anonimo/ }).first();
    await expect(anonimo.getByText(/Magnum|Standard|Mezza|Jeroboam/)).toHaveCount(0);
  });

  test("le bottiglie gia' bevute non contano nel badge", async ({ page, cantina }) => {
    // Una Jeroboam bevuta anni fa non dice niente su cosa c'e' in cantina
    // oggi. Il filtro sta nella GET del client: se qualcuno lo togliesse, qui
    // comparirebbe un badge per un vino che non ha formati speciali.
    cantina.setTable("bottiglie", [
      { id: 1, wine_id: 2, formato: "Standard", stato: "in_cantina", prezzo_pagato: null },
      { id: 2, wine_id: 2, formato: "Standard", stato: "in_cantina", prezzo_pagato: null },
      { id: 3, wine_id: 2, formato: "Jeroboam", stato: "bevuta", consumed_on: "2025-04-02" },
    ]);
    await apriApp(page);

    const anonimo = page.getByRole("button", { name: /Rosso Anonimo/ }).first();
    await expect(anonimo.getByText("Jeroboam")).toHaveCount(0);
  });

  test("il formato scelto arriva alla RPC di salvataggio", async ({ page, cantina }) => {
    await apriApp(page);
    await page.getByRole("button", { name: "Aggiungi un vino" }).click();

    await page.getByLabel("Produttore", { exact: true }).fill("Cantina Formato");
    await page.getByLabel("Nome del vino", { exact: true }).fill("Vino Grande");
    await page.getByLabel("Formato", { exact: true }).selectOption("Magnum");
    await page.getByRole("button", { name: "Continua" }).click();

    await expect.poll(() => cantina.rpcCalls("aggiungi_o_incrementa").length).toBe(1);
    expect(cantina.lastRpcArgs("aggiungi_o_incrementa").p_formato).toBe("Magnum");
  });

  test("senza sceglierlo, il formato salvato e' Standard", async ({ page, cantina }) => {
    // Il default non e' un dettaglio: e' quello che vale per 117 bottiglie su
    // 118, quindi aggiungere un vino non deve costare un tocco in piu'.
    await apriApp(page);
    await page.getByRole("button", { name: "Aggiungi un vino" }).click();
    await page.getByLabel("Produttore", { exact: true }).fill("Cantina Normale");
    await page.getByLabel("Nome del vino", { exact: true }).fill("Vino Normale");
    await page.getByRole("button", { name: "Continua" }).click();

    await expect.poll(() => cantina.rpcCalls("aggiungi_o_incrementa").length).toBe(1);
    expect(cantina.lastRpcArgs("aggiungi_o_incrementa").p_formato).toBe("Standard");
  });
});

// P6 fase 4a — `bottiglie` e' la fonte di verita'.
test.describe("Giacenza dalle righe", () => {
  test("il conteggio viene dalle righe, non da wines.bottiglie", async ({ page, cantina }) => {
    // Si fa mentire di proposito la colonna vecchia: dice 99, le righe sono 2.
    // Se il client leggesse ancora `wines.bottiglie` mostrerebbe 99. E' l'unico
    // modo di distinguere le due fonti, che nei dati veri coincidono sempre.
    cantina.setTable("wines", [{
      id: 1, produttore: "Cantina Prova", produttore_id: 1, vino: "Vino Prova",
      annata: 2020, tipologia: "Rosso fermo", bottiglie: 99, prezzo: 10, valore: null,
      denominazione: null, vitigno: null, macerazione: null, fermentazione: null,
      malolattica: null, note: null, note_cantina: null, slow_vino_bott: false,
      created_at: "2026-01-10T10:00:00+00:00", deleted_at: null,
    }]);
    cantina.setTable("bottiglie", [
      { id: 1, wine_id: 1, formato: "Standard", stato: "in_cantina", prezzo_pagato: 10 },
      { id: 2, wine_id: 1, formato: "Standard", stato: "in_cantina", prezzo_pagato: 10 },
      // Una bevuta: non deve finire nella giacenza.
      { id: 3, wine_id: 1, formato: "Standard", stato: "bevuta", prezzo_pagato: 10,
        consumed_on: "2026-05-05", rating: 4, produttore: "Cantina Prova",
        vino: "Vino Prova", annata: 2020, tipologia: "Rosso fermo", legacy_uid: null },
    ]);
    await apriApp(page);

    await expect(page.getByTestId("tot-bottiglie")).toHaveText("2");
    // E il costo segue: 2 righe da 10 €, non 99.
    await expect(page.getByTestId("tot-costo")).toHaveText("20 €");
  });

  test("lo storico viene dalle righe bevute", async ({ page, cantina }) => {
    await apriApp(page);
    await page.getByRole("button", { name: "Bevuti" }).click();

    // Le 4 bevute dei fixture, ora lette da `bottiglie` e non piu' da `bevuti`.
    await expect(page.getByText("Verdicchio Cambrugiano").first()).toBeVisible();
    // La data in italiano prova che `consumed_on` arriva dalla riga-bottiglia:
    // e' l'unico campo che il client deriva, e nei fixture vale 10/09/2026.
    await expect(page.getByText("10 settembre 2026").first()).toBeVisible();

    // La nota vive nel dettaglio, non nella riga: si apre per verificarla.
    await page.getByRole("button", { name: /Verdicchio Cambrugiano/ }).first().click();
    await expect(page.getByText("Ottimo")).toBeVisible();
  });
});
