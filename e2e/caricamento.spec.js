const { test, expect, apriApp, cerca } = require("./support/harness");
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

  test("il riepilogo della Cantina usa le formule unificate", async ({ page, cantina }) => {
    await apriApp(page);

    // C2 ha tolto l'app bar: i totali che stavano nella pastiglia vivono ora
    // solo nel riepilogo, quindi la vecchia discordanza header/Lista non è più
    // rappresentabile. Resta da verificare che ogni voce usi la sua formula —
    // è la regressione chiusa in A1, quando lo stesso dato dava
    // 1.566 € / 1.457,5 € / 2.051,5 €.
    await expect(page.getByTestId("tot-bottiglie")).toHaveText(String(ATTESI.bottiglie));
    await expect(page.getByTestId("tot-referenze")).toHaveText(String(ATTESI.referenze));
    // Costo e valore sono grandezze diverse e devono restare distinte.
    await expect(page.getByTestId("tot-costo")).toHaveText(`~${ATTESI.costo} €`);
    await expect(page.getByTestId("tot-valore")).toHaveText(`~${ATTESI.valoreMercato} €`);
    await expect(page.getByTestId("media-bottiglia")).toHaveText(`~${ATTESI.mediaBottiglia} € l'una`);
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

    await cerca(page, "pieropan");
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
