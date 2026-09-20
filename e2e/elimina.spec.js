const { test, expect, apriApp } = require("./support/harness");
const { ATTESI } = require("./fixtures/cantina");

// `elimina_bottiglia` ha due rami dentro la stessa RPC: decrementa se restano
// altre bottiglie, marca la riga come eliminata se era l'ultima. I due rami
// vanno distinti dai test, perché lato UI producono risultati opposti: riga
// che resta vs riga che sparisce.
//
// P1b: il secondo ramo non cancella più fisicamente la riga, valorizza
// `deleted_at`. Per la UI non cambia nulla — il vino sparisce comunque — ma
// riaggiungerlo lo fa tornare con id, immagine e storico, invece di creare un
// doppione. È l'ultimo test di questo file.

async function eliminaBottiglia(page, nomeVino) {
  await page.getByRole("button", { name: new RegExp(nomeVino) }).first().click();
  await page.getByRole("button", { name: /^Elimina$/ }).click();
  await page.getByRole("button", { name: "Sì, elimina" }).click();
}

/** Input del form di ModalAggiungi: l'etichetta è un div fratello, non un <label>. */
function campo(page, etichetta) {
  return page.locator(`div:has(> div:text-is("${etichetta}")) > input`);
}

test.describe("Elimina dalla cantina", () => {
  test("con più bottiglie decrementa e la riga resta in Lista", async ({ page, cantina }) => {
    await apriApp(page);
    await eliminaBottiglia(page, "Soave Classico La Rocca");

    await expect.poll(() => cantina.rpcCalls("elimina_bottiglia").length).toBe(1);
    expect(cantina.lastRpcArgs("elimina_bottiglia")).toEqual({ p_wine_id: 1 });

    await expect(page.getByTestId("tot-bottiglie")).toHaveText(String(ATTESI.bottiglie - 1));
    // Il dettaglio resta aperto sopra la Lista, quindi il nome compare due
    // volte: basta sapere che il vino non è sparito.
    await expect(page.getByText("Soave Classico La Rocca").first()).toBeVisible();
  });

  test("l'ultima bottiglia fa sparire la riga", async ({ page, cantina }) => {
    await apriApp(page);
    await eliminaBottiglia(page, "Orange Unico");

    await expect(page.getByText("Orange Unico")).toHaveCount(0);
    await expect(page.getByTestId("tot-bottiglie")).toHaveText(String(ATTESI.bottiglie - 1));
    await expect(page.getByTestId("tot-costo")).toHaveText(`~${ATTESI.costo - 20} €`);
  });

  test("se la RPC fallisce, la riga torna al suo posto", async ({ page, cantina }) => {
    cantina.failRpc("elimina_bottiglia");
    await apriApp(page);
    await eliminaBottiglia(page, "Orange Unico");

    await expect(page.getByText("Errore: eliminazione non riuscita")).toBeVisible();
    // Rollback: il vino torna in Lista (e il dettaglio si riapre, da cui .first()).
    await expect(page.getByText("Orange Unico").first()).toBeVisible();
    await expect(page.getByTestId("tot-bottiglie")).toHaveText(String(ATTESI.bottiglie));
  });

  // P1b, il caso che il soft delete esiste per rendere possibile.
  test("un vino eliminato e riaggiunto torna con il suo storico", async ({ page, cantina }) => {
    await apriApp(page);
    await eliminaBottiglia(page, "Orange Unico");
    await expect(page.getByText("Orange Unico")).toHaveCount(0);

    // Ricaricare non e' un dettaglio: e' la verifica che il vino resti fuori
    // anche dopo una GET vera. La riga ora esiste ancora in tabella, ed e' il
    // filtro `deleted_at=is.null` del client a tenerla nascosta. Senza quel
    // filtro, qui il vino ricomparirebbe.
    await apriApp(page);
    await expect(page.getByText("Orange Unico")).toHaveCount(0);

    // Riaggiunta a mano, compilando solo i tre campi che formano la chiave
    // normalizzata. La scheda tecnica NON viene ricompilata di proposito.
    await page.getByRole("button", { name: "Aggiungi un vino" }).click();
    await page.getByRole("button", { name: /Inserimento manuale/ }).click();
    await campo(page, "Produttore").fill("Cantina Singola");
    await campo(page, "Nome vino").fill("Orange Unico");
    await campo(page, "Annata").fill("2020");
    await page.getByRole("button", { name: "Salva in cantina" }).click();

    await expect.poll(() => cantina.rpcCalls("aggiungi_o_incrementa").length).toBe(1);
    await expect(page.getByText("Orange Unico").first()).toBeVisible();

    // La prova che è una resurrezione e non un doppione: la riga in tabella è
    // sempre una sola, ha ripreso l'id originale e non è più marcata eliminata.
    const righe = cantina.tables.wines.filter(w => w.vino === "Orange Unico");
    expect(righe).toHaveLength(1);
    expect(righe[0].id).toBe(3);
    expect(righe[0].deleted_at).toBeNull();

    // E la scheda tecnica d'archivio è tornata con lei, benché il form fosse
    // vuoto: un inserimento nuovo avrebbe mostrato il placeholder "—".
    await page.getByRole("button", { name: /Orange Unico/ }).first().click();
    await expect(page.getByText("Ribolla")).toBeVisible();
    await expect(page.getByText("30 giorni")).toBeVisible();
  });
});
