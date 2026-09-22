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
    await expect(page.getByTestId("tot-costo")).toHaveText(`${ATTESI.costo} €`);
    await expect(page.getByTestId("tot-valore")).toHaveText(`${ATTESI.valoreMercato} €`);
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

  // ── Il "+" resta raggiungibile ──────────────────────────────────────────
  // Prima stava nell'intestazione, che scorre via: dopo 1200px era a y=-1191
  // e per aggiungere un vino bisognava risalire tutta la lista (~11.500px
  // sulla cantina vera). Ora e' flottante. Questo test e' l'unica cosa che
  // impedisce a un ritocco futuro di rimetterlo dentro il contenitore che
  // scorre, perche' il difetto non si vede finche' la lista e' corta.

  const listaLunga = () => Array.from({ length: 40 }, (_, i) => ({
    id: i + 1, produttore: `Produttore ${i + 1}`, produttore_id: 1,
    vino: `Vino numero ${i + 1}`, annata: 2020, tipologia: "Rosso fermo",
    bottiglie: 2, prezzo: 12, valore: 18, denominazione: "DOC", vitigno: "Sangiovese",
    macerazione: null, fermentazione: null, malolattica: null, note: null,
    note_cantina: null, slow_vino_bott: false,
    created_at: "2026-01-10T10:00:00+00:00", deleted_at: null,
  }));

  test("il + resta a schermo dopo aver scorso la lista", async ({ page, cantina }) => {
    cantina.setTable("wines", listaLunga()).setTable("bevuti", []).setTable("wine_images", []);
    await apriApp(page);

    const piu = page.getByRole("button", { name: "Aggiungi un vino" });
    await expect(piu).toBeVisible();

    const scrollato = await page.evaluate(() => {
      const el = [...document.querySelectorAll("div")]
        .find(d => d.scrollHeight > d.clientHeight + 50 && getComputedStyle(d).overflowY === "auto");
      el.scrollTop = 1500;
      return el.scrollTop;
    });
    expect(scrollato).toBeGreaterThan(1000);

    // Visibile e dentro il viewport, non solo presente nel DOM.
    await expect(piu).toBeVisible();
    const box = await piu.boundingBox();
    const vp = page.viewportSize();
    expect(box.y).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);

    // E funziona: apre il foglio di inserimento. Dal ridisegno del 22/09/2026
    // la scelta manuale/foto non e' piu' una schermata a se': il foglio ha i
    // campi e, in cima, il pulsante per fotografare l'etichetta.
    await piu.click();
    await expect(page.getByRole("heading", { name: "Aggiungi alla cantina" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Fotografa l/ })).toBeVisible();
    await expect(page.getByLabel("Produttore", { exact: true })).toBeVisible();
  });

  test("il blocco 117 bottiglie e' centrato nel riepilogo", async ({ page }) => {
    // La colonna di destra (referenze/costo/valore) e' alta 90px e detta
    // l'altezza della riga; questa cella ne occupa 55. Con l'`alignItems: end`
    // della sezione restava in fondo, con 36px di vuoto sopra e 1 sotto —
    // misurato il 21/09/2026, ed era ben visibile una volta tolte le due
    // righe di troppo sotto "bottiglie".
    await apriApp(page);
    const m = await page.evaluate(() => {
      const cella = document.querySelector('[data-testid="tot-bottiglie"]').parentElement;
      const sez = cella.parentElement;
      const cs = getComputedStyle(sez);
      const s = sez.getBoundingClientRect(), c = cella.getBoundingClientRect();
      return {
        sopra: c.top - (s.top + parseFloat(cs.paddingTop)),
        sotto: (s.bottom - parseFloat(cs.paddingBottom)) - c.bottom,
      };
    });
    // Tolleranza 1px: l'altezza della riga non e' sempre pari, quindi il
    // centraggio puo' cadere su mezzo pixel per parte. Il difetto vero valeva
    // 35px di scarto, quindi 1 non gli fa da scappatoia.
    expect(Math.abs(m.sopra - m.sotto), `sopra ${m.sopra}px, sotto ${m.sotto}px`).toBeLessThanOrEqual(1);
  });

  test("Annulla chiude il foglio senza salvare", async ({ page, cantina }) => {
    // Fino al 22/09/2026 l'unica uscita era toccare fuori dal foglio: invisibile
    // e, su un foglio alto quanto lo schermo, quasi irraggiungibile.
    await apriApp(page);
    await page.getByRole("button", { name: "Aggiungi un vino" }).click();
    await page.getByLabel("Produttore", { exact: true }).fill("Da buttare");

    await page.getByRole("button", { name: "Annulla" }).click();

    await expect(page.getByRole("heading", { name: "Aggiungi alla cantina" })).toHaveCount(0);
    expect(cantina.rpcCalls("aggiungi_o_incrementa")).toHaveLength(0);
  });

  test("il + sparisce quando si apre la scheda di un vino", async ({ page, cantina }) => {
    // La scheda e' un overlay a tutto schermo: un "+" che ci resta sopra
    // sarebbe il bug del FAB, non una scorciatoia.
    cantina.setTable("wines", listaLunga()).setTable("bevuti", []).setTable("wine_images", []);
    await apriApp(page);

    await page.getByRole("button", { name: /Vino numero 1\b/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aggiungi un vino" })).toHaveCount(0);
  });
});
