const { test, expect, apriApp } = require("./support/harness");
const { BEVUTI } = require("./fixtures/cantina");

// D5 / P0. Il rating in DB è per bevuta, la UI ne mostra uno solo per vino.
// Lo stopgap di P0 fa sì che `valuta_vino` scriva sulla bevuta più recente
// invece che su tutte; questi test fissano la lettura corrispondente, perché
// leggere il massimo farebbe "tornare indietro" il voto appena dato.
//
// Il fixture del Soave ha due bevute: 4.0 il 2026-08-01, 3.0 il 2026-09-01.
// Massimo = 4,0 · più recente = 3,0.
//
// Il RatingDial esiste solo nella tab "Voto" del dettaglio, che a sua volta
// compare solo aprendo una bevuta dalla tab Bevuti.

async function apriVoto(page, nomeVino) {
  await page.getByText("Bevuti", { exact: true }).click();
  await page.getByRole("button", { name: new RegExp(nomeVino) }).first().click();
  await page.getByText("Voto", { exact: true }).click();
}

test.describe("Rating per vino", () => {
  test("mostra il voto della bevuta più recente, non il massimo", async ({ page, cantina }) => {
    await apriApp(page);
    await apriVoto(page, "Soave Classico La Rocca");

    await expect(page.getByText("3,0")).toBeVisible();
    await expect(page.getByText("4,0")).toHaveCount(0);
  });

  test("una bevuta recente senza voto non nasconde il voto precedente", async ({ page, cantina }) => {
    // Bevuta più recente di tutte, ma senza rating: il voto mostrato resta
    // quello del 2026-09-01. Se si leggesse "la più recente in assoluto",
    // il vino risulterebbe non valutato.
    cantina.setTable("bevuti", [
      ...BEVUTI,
      {
        uid: 1789000000009, wine_id: 1, consumed_on: "2026-09-18",
        created_at: "2026-09-18T20:00:00+00:00", nota: "", rating: null,
        produttore: "Pieropan", vino: "Soave Classico La Rocca",
        annata: "2021", tipologia: "Bianco fermo", prezzo: 12,
      },
    ]);
    await apriApp(page);
    await apriVoto(page, "Soave Classico La Rocca");

    await expect(page.getByText("3,0")).toBeVisible();
  });
});
