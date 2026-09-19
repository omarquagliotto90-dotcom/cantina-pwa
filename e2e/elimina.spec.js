const { test, expect, apriApp } = require("./support/harness");
const { ATTESI } = require("./fixtures/cantina");

// `elimina_bottiglia` ha due rami dentro la stessa RPC: decrementa se restano
// altre bottiglie, cancella la riga se era l'ultima (e la FK CASCADE di A2a
// porta via anche l'immagine). I due rami vanno distinti dai test, perché
// lato UI producono risultati opposti: riga che resta vs riga che sparisce.

async function eliminaBottiglia(page, nomeVino) {
  await page.getByRole("button", { name: new RegExp(nomeVino) }).first().click();
  await page.getByRole("button", { name: /Elimina dalla cantina/ }).click();
  await page.getByRole("button", { name: "Sì, elimina" }).click();
}

test.describe("Elimina dalla cantina", () => {
  test("con più bottiglie decrementa e la riga resta in Lista", async ({ page, cantina }) => {
    await apriApp(page);
    await eliminaBottiglia(page, "Soave Classico La Rocca");

    await expect.poll(() => cantina.rpcCalls("elimina_bottiglia").length).toBe(1);
    expect(cantina.lastRpcArgs("elimina_bottiglia")).toEqual({ p_wine_id: 1 });

    await expect(page.getByText(`${ATTESI.bottiglie - 1} · ~${ATTESI.costo - 12}€`)).toBeVisible();
    // Il dettaglio resta aperto sopra la Lista, quindi il nome compare due
    // volte: basta sapere che il vino non è sparito.
    await expect(page.getByText("Soave Classico La Rocca").first()).toBeVisible();
  });

  test("l'ultima bottiglia fa sparire la riga", async ({ page, cantina }) => {
    await apriApp(page);
    await eliminaBottiglia(page, "Orange Unico");

    await expect(page.getByText("Orange Unico")).toHaveCount(0);
    await expect(page.getByText(`${ATTESI.bottiglie - 1} · ~${ATTESI.costo - 20}€`)).toBeVisible();
  });

  test("se la RPC fallisce, la riga torna al suo posto", async ({ page, cantina }) => {
    cantina.failRpc("elimina_bottiglia");
    await apriApp(page);
    await eliminaBottiglia(page, "Orange Unico");

    await expect(page.getByText("Errore: eliminazione non riuscita")).toBeVisible();
    // Rollback: il vino torna in Lista (e il dettaglio si riapre, da cui .first()).
    await expect(page.getByText("Orange Unico").first()).toBeVisible();
    await expect(page.getByText(`${ATTESI.bottiglie} · ~${ATTESI.costo}€`)).toBeVisible();
  });
});
