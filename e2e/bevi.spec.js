const { test, expect, apriApp } = require("./support/harness");
const { ATTESI } = require("./fixtures/cantina");

// "Segna come bevuto" è il flusso più delicato dell'app: dopo A3 è una sola
// RPC transazionale, ma la UI aggiorna in modo ottimistico e deve saper tornare
// indietro. È anche il flusso che P1 (auth) e P5/P6 rimetteranno in discussione,
// quindi il contratto va bloccato qui.

async function apriModaleBevi(page, nomeVino) {
  await page.getByRole("button", { name: new RegExp(nomeVino) }).first().click();
  await page.getByRole("button", { name: /Segna come bevuto/ }).click();
  await expect(page.getByRole("button", { name: "Conferma" })).toBeVisible();
}

test.describe("Segna come bevuto", () => {
  test("chiama bevi_bottiglia con i parametri attesi e nessuna scrittura REST", async ({ page, cantina }) => {
    await apriApp(page);
    await apriModaleBevi(page, "Soave Classico La Rocca");

    await page.getByPlaceholder(/Come ti è sembrato/).fill("Nota di test");
    await page.getByRole("button", { name: "Conferma" }).click();

    await expect.poll(() => cantina.rpcCalls("bevi_bottiglia").length).toBe(1);
    const args = cantina.lastRpcArgs("bevi_bottiglia");
    expect(args.p_wine_id).toBe(1);
    expect(args.p_nota).toBe("Nota di test");
    // Nessuna valutazione data: deve essere NULL, non 0 (CHECK di A2b).
    expect(args.p_rating).toBeNull();
    expect(args.p_consumed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Il guard dell'harness fa fallire il test in teardown se l'app ha scritto
    // via REST invece che via RPC — cioè se A3 regredisse.
  });

  test("scala una bottiglia dal totale", async ({ page, cantina }) => {
    await apriApp(page);
    await expect(page.getByTestId("tot-bottiglie")).toHaveText(String(ATTESI.bottiglie));

    await apriModaleBevi(page, "Soave Classico La Rocca");
    await page.getByRole("button", { name: "Conferma" }).click();

    // 6 → 5 bottiglie; il costo scende di un Soave (12 €).
    await expect(page.getByTestId("tot-bottiglie")).toHaveText(String(ATTESI.bottiglie - 1));
    await expect(page.getByTestId("tot-costo")).toHaveText(`~${ATTESI.costo - 12} €`);
  });

  test("se la RPC fallisce, la UI torna indietro e avvisa", async ({ page, cantina }) => {
    cantina.failRpc("bevi_bottiglia");
    await apriApp(page);

    await apriModaleBevi(page, "Soave Classico La Rocca");
    await page.getByRole("button", { name: "Conferma" }).click();

    await expect(page.getByText("Errore: bevuta non registrata")).toBeVisible();
    // Rollback completo: la bottiglia non deve risultare consumata.
    await expect(page.getByTestId("tot-bottiglie")).toHaveText(String(ATTESI.bottiglie));
    await expect(page.getByTestId("tot-costo")).toHaveText(`~${ATTESI.costo} €`);
  });

  test("la data apertura non può essere nel futuro", async ({ page, cantina }) => {
    // Bug noto annotato in CLAUDE.md: l'attributo HTML `max` non è applicato
    // da tutti i browser. Qui si verifica almeno che il vincolo sia dichiarato;
    // quando arriverà la validazione esplicita (o il CHECK su consumed_on),
    // questo test va esteso alla selezione effettiva di una data futura.
    await apriApp(page);
    await apriModaleBevi(page, "Soave Classico La Rocca");

    const oggi = new Date().toISOString().slice(0, 10);
    await expect(page.locator('input[type="date"]')).toHaveAttribute("max", oggi);
  });
});
