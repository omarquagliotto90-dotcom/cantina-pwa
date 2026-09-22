const { test, expect, apriApp } = require("./support/harness");
const { BOTTIGLIE } = require("./fixtures/cantina");

// P5 (22/09/2026). Il voto sta sulla singola degustazione, e la Cantina mostra
// la MEDIA per etichetta. Sostituisce lo stopgap di P0, che faceva scrivere e
// leggere il voto della bevuta piu' recente: era una scorciatoia nata quando il
// rating viveva per etichetta.
//
// Il motivo, nelle parole di Omar: due bottiglie della stessa etichetta e
// annata non sono la stessa bevuta, e possono meritare voti diversi. Sui dati
// veri 5 vini avevano gia' voti divergenti in tabella.
//
// Il fixture del Soave ha due bevute: 4,0 il 2026-08-01 e 3,0 il 2026-09-01.
//
// Lo slider vive solo nella scheda aperta da Bevuti: dalla Cantina si guarda
// l'etichetta e non c'e' una degustazione da votare. Le asserzioni sulla
// scheda restano circoscritte al dialog, perche' lo stesso numero compare
// anche nella riga di Bevuti.
//
// La media per etichetta NON si fa: decisione di Omar del 22/09/2026, "non
// mettiamo la media per ora". `mediaPerVino` e la mappa `ratings` sono state
// tolte invece di restare come codice che nessuno esercita — se un giorno
// servono, si recuperano dal commit di P5.

async function apriBevuti(page) {
  await page.getByText("Bevuti", { exact: true }).click();
}

test.describe("Voto per degustazione", () => {
  test("in Bevuti ogni degustazione mostra il proprio voto", async ({ page, cantina }) => {
    // È il cuore di P5: prima le due righe leggevano `ratings[wine_id]` e
    // mostravano per forza lo stesso numero.
    await apriApp(page);
    await apriBevuti(page);

    await expect(page.getByText("4,0")).toBeVisible();
    await expect(page.getByText("3,0")).toBeVisible();
  });

  test("lo slider vota la degustazione aperta, non il vino", async ({ page, cantina }) => {
    await apriApp(page);
    await apriBevuti(page);

    // La bevuta del 2026-08-01 vale 4,0: aprendola, lo slider deve dire 4,0 e
    // non 3,0, che è il voto dell'altra bevuta dello stesso vino.
    await page.getByRole("button", { name: /1 agosto 2026/ }).first().click();
    await expect(page.getByRole("dialog").getByText("4,0")).toBeVisible();
  });

});
