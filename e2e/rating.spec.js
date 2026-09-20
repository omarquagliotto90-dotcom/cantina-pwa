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
// Dal ridisegno C5 la scheda non ha piu' tab: lo slider del voto e' una
// sezione della pagina, visibile appena si apre una bevuta. E dal C3 il voto
// compare anche nella riga del diario, quindi le asserzioni sulla scheda sono
// circoscritte al dialog: "3,0" da solo troverebbe due elementi.

async function apriBevuti(page) {
  await page.getByText("Bevuti", { exact: true }).click();
}

async function apriVoto(page, nomeVino) {
  await apriBevuti(page);
  await page.getByRole("button", { name: new RegExp(nomeVino) }).first().click();
}

/** Il voto come lo mostra lo slider, dentro la scheda e non altrove. */
const votoNellaScheda = (page) => page.getByRole("dialog").getByText("3,0");

test.describe("Rating per vino", () => {
  test("mostra il voto della bevuta più recente, non il massimo", async ({ page, cantina }) => {
    await apriApp(page);

    // In riga, prima ancora di aprire il dettaglio.
    await apriBevuti(page);
    await expect(page.getByText("3,0").first()).toBeVisible();
    await expect(page.getByText("4,0")).toHaveCount(0);

    await page.getByRole("button", { name: /Soave Classico La Rocca/ }).first().click();
    await expect(votoNellaScheda(page)).toBeVisible();
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

    await expect(votoNellaScheda(page)).toBeVisible();
  });
});
