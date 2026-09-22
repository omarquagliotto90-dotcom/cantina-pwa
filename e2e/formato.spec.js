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
