const { test, expect, apriApp } = require("./support/harness");

// Ricerca nei Bevuti (22/09/2026). Stessa forma di quella della Cantina —
// sezione appiccicata in alto, titolo a sinistra, lente a destra che al tap
// diventa campo — con una differenza voluta da Omar: **cerca anche nella
// nota**. Nei Bevuti la nota e' spesso l'unica cosa che distingue due
// degustazioni dello stesso vino, quindi e' il campo che si cerca davvero.
//
// I fixture: 4 bevute, di cui due dello stesso Soave (4,0 il 2026-08-01 con
// nota vuota, 3,0 il 2026-09-01 con nota "Meno brillante") e una del
// Verdicchio con nota "Ottimo".

async function apriBevuti(page) {
  await page.getByText("Bevuti", { exact: true }).click();
}

async function cerca(page, testo) {
  await page.getByRole("button", { name: "Cerca", exact: true }).click();
  await page.getByLabel("Cerca nei bevuti").fill(testo);
}

test.describe("Ricerca nei Bevuti", () => {
  test("filtra per produttore", async ({ page, cantina }) => {
    await apriApp(page);
    await apriBevuti(page);
    await cerca(page, "pieropan");

    await expect(page.getByText("Soave Classico La Rocca").first()).toBeVisible();
    await expect(page.getByText("Verdicchio Cambrugiano")).toHaveCount(0);
  });

  test("cerca anche nella nota della degustazione", async ({ page, cantina }) => {
    // È la differenza rispetto alla Cantina, e l'unica asserzione che la
    // distingue: "brillante" non compare in nessun altro campo.
    await apriApp(page);
    await apriBevuti(page);
    await cerca(page, "brillante");

    await expect(page.getByText("Soave Classico La Rocca").first()).toBeVisible();
    // Delle due bevute dello stesso Soave resta solo quella con la nota: il
    // voto 3,0 è suo, il 4,0 è dell'altra.
    await expect(page.getByText("3,0")).toBeVisible();
    await expect(page.getByText("4,0")).toHaveCount(0);
  });

  test("gli anni senza risultati spariscono, non restano vuoti", async ({ page, cantina }) => {
    await apriApp(page);
    await apriBevuti(page);
    await cerca(page, "verdicchio");

    // Il Verdicchio è del 2026-09-10; le altre bevute stanno in anni o mesi
    // diversi. Senza il filtro applicato PRIMA del raggruppamento resterebbero
    // divisori d'anno con niente sotto.
    await expect(page.getByText("Verdicchio Cambrugiano").first()).toBeVisible();
    await expect(page.getByText("Soave Classico La Rocca")).toHaveCount(0);
  });

  test("una ricerca senza esiti lo dice, e si azzera", async ({ page, cantina }) => {
    await apriApp(page);
    await apriBevuti(page);
    await cerca(page, "zibibbo di pantelleria");

    await expect(page.getByText("Nessuna degustazione")).toBeVisible();

    await page.getByRole("button", { name: "Azzera ricerca" }).click();
    await expect(page.getByText("Verdicchio Cambrugiano").first()).toBeVisible();
  });

  test("il riepilogo segue la ricerca", async ({ page, cantina }) => {
    // Come in Cantina, dove i totali seguono i filtri. Un conteggio che resta
    // sul totale mentre la lista è filtrata è una cifra che mente.
    await apriApp(page);
    await apriBevuti(page);
    await expect(page.getByTestId("tot-bevute")).toHaveText("4");

    await cerca(page, "verdicchio");
    await expect(page.getByTestId("tot-bevute")).toHaveText("1");
  });
});
