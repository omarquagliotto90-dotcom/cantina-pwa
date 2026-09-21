// Foto di bottiglia, comportamento in pagina.
//
// `e2e/rifilo.spec.mjs` verifica la matematica del riquadro; qui si verifica
// la catena intera nel browser — decodifica, canvas, sostituzione dell'img —
// e soprattutto la garanzia che conta: se il rifilo fallisce NON si perde la
// foto, si mostra l'originale.

const { test, expect, apriApp } = require("./support/harness");

// Bottiglia finta: rettangolo scuro 100x300 dentro una tela bianca 400x400,
// cioe' 150px di margine ai lati. Un `data:` URL salta il proxy, quindi il
// test non tocca la rete e il canvas non viene contaminato.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">`
  + `<rect width="400" height="400" fill="#ffffff"/>`
  + `<rect x="150" y="50" width="100" height="300" fill="#221111"/></svg>`;
const CON_MARGINE = "data:image/svg+xml;utf8," + encodeURIComponent(SVG);

const VINO = {
  id: 1, produttore: "Pieropan", produttore_id: 1, vino: "Soave Classico La Rocca",
  annata: 2021, tipologia: "Bianco fermo", bottiglie: 3, prezzo: 12, valore: 18,
  denominazione: "DOC", vitigno: "Garganega", macerazione: null, fermentazione: null,
  malolattica: null, note: null, note_cantina: null, slow_vino_bott: false,
  created_at: "2026-01-10T10:00:00+00:00", deleted_at: null,
};

test.describe("Foto di bottiglia", () => {
  test("il margine viene rifilato e l'immagine mostrata e' quella ritagliata", async ({ page, cantina }) => {
    cantina.setTable("wines", [VINO]).setTable("bevuti", [])
      .setTable("wine_images", [{ wine_id: 1, image_url: CON_MARGINE }]);

    await apriApp(page);
    await page.getByRole("button", { name: /Soave Classico La Rocca/ }).first().click();

    const img = page.getByRole("dialog").getByRole("img", { name: /Pieropan/ });
    // Il rifilo produce un PNG: se `src` diventa un data:image/png, la catena
    // decodifica -> canvas -> ritaglio ha funzionato davvero.
    await expect(img).toHaveAttribute("src", /^data:image\/png/, { timeout: 10_000 });

    // E il ritaglio e' quello giusto: 100x300 piu' il 2% d'aria per lato.
    const dim = await img.evaluate(el => new Promise(ok => {
      const i = new Image();
      i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight });
      i.src = el.src;
    }));
    expect(dim.w).toBeGreaterThanOrEqual(100);
    expect(dim.w).toBeLessThanOrEqual(130);   // 100 + aria, non i 400 originali
    expect(dim.h).toBeGreaterThanOrEqual(300);
    expect(dim.h).toBeLessThanOrEqual(330);
  });

  test("se l'origine rifiuta il proxy, il motivo viene registrato", async ({ page, cantina }) => {
    // Il caso reale del 21/09/2026: rossopastrengo.com risponde 403 al proxy,
    // quindi i byte non arrivano e non c'e' nessuno scontorno da fare. Prima
    // il fallimento era muto e identico a ogni altro: per sapere la causa ho
    // dovuto interrogare il proxy a mano. Ora la ragione resta in memoria.
    const REMOTA = "https://rossopastrengo.example/Malibran-Teatrale.jpg";
    cantina.apiOverrides.immagine = { status: 502, body: { error: "origine ha risposto 403" } };
    cantina.setTable("wines", [VINO]).setTable("bevuti", [])
      .setTable("wine_images", [{ wine_id: 1, image_url: REMOTA }]);

    await apriApp(page);
    await page.getByRole("button", { name: /Soave Classico La Rocca/ }).first().click();

    // La garanzia di sempre: la foto non si perde, si mostra l'originale.
    const img = page.getByRole("dialog").getByRole("img", { name: /Pieropan/ });
    await expect(img).toHaveAttribute("src", REMOTA);

    // E la novita': il perche' e' leggibile invece che da dedurre.
    await expect.poll(
      () => page.evaluate(u => window.motiviRifilo?.get(u) ?? null, REMOTA),
      { timeout: 10_000 }
    ).toMatch(/502.*403/);
  });

  test("se il rifilo non trova margine si tiene l'originale", async ({ page, cantina }) => {
    // Tela tutta piena: niente da togliere. L'immagine non deve sparire.
    const pieno = "data:image/svg+xml;utf8," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300">`
      + `<rect width="200" height="300" fill="#221111"/></svg>`);
    cantina.setTable("wines", [VINO]).setTable("bevuti", [])
      .setTable("wine_images", [{ wine_id: 1, image_url: pieno }]);

    await apriApp(page);
    await page.getByRole("button", { name: /Soave Classico La Rocca/ }).first().click();

    const img = page.getByRole("dialog").getByRole("img", { name: /Pieropan/ });
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", pieno);
  });

  test("la bottiglia si vede intera: `contain`, non `cover`", async ({ page, cantina }) => {
    // `cover` riempiva il riquadro tagliando i lati della bottiglia.
    cantina.setTable("wines", [VINO]).setTable("bevuti", [])
      .setTable("wine_images", [{ wine_id: 1, image_url: CON_MARGINE }]);

    await apriApp(page);
    await expect(page.locator('img[alt=""]').first()).toHaveCSS("object-fit", "contain");

    await page.getByRole("button", { name: /Soave Classico La Rocca/ }).first().click();
    await expect(page.getByRole("dialog").getByRole("img", { name: /Pieropan/ }))
      .toHaveCSS("object-fit", "contain");
  });

  // ── Miniature della lista ────────────────────────────────────────────────
  // Stesso rifilo della scheda, ma pigro: parte quando la riga entra nello
  // schermo, non all'apertura. Con 91 righe la differenza sono ~82 richieste
  // al proxy risparmiate per immagini che magari non scorri nemmeno.

  const vinoN = (i, immagineDiversa = false) => ({
    ...VINO, id: i, vino: `Vino numero ${i}`, produttore: `Produttore ${i}`,
  });

  test("anche la miniatura in Cantina viene rifilata", async ({ page, cantina }) => {
    cantina.setTable("wines", [VINO]).setTable("bevuti", [])
      .setTable("wine_images", [{ wine_id: 1, image_url: CON_MARGINE }]);

    await apriApp(page);
    const mini = page.locator('img[alt=""]').first();
    await expect(mini).toHaveAttribute("src", /^data:image\/png/, { timeout: 10_000 });
  });

  test("le righe lontane non vengono rifilate finche' non le scorri", async ({ page, cantina }) => {
    const wines = Array.from({ length: 30 }, (_, i) => vinoN(i + 1));
    cantina.setTable("wines", wines).setTable("bevuti", [])
      .setTable("wine_images", wines.map(w => ({ wine_id: w.id, image_url: CON_MARGINE })));

    await apriApp(page);
    // La prima e' a schermo: si rifila.
    await expect(page.locator('img[alt=""]').first())
      .toHaveAttribute("src", /^data:image\/png/, { timeout: 10_000 });

    // L'ultima e' a migliaia di pixel di distanza: deve essere ancora
    // l'originale. Se questo test fallisse, l'osservatore non sta filtrando
    // niente e paghiamo 82 richieste a ogni apertura.
    const ultima = page.locator('img[alt=""]').last();
    await expect(ultima).toHaveAttribute("src", CON_MARGINE);

    // Portandocela davanti, si rifila anche lei.
    await ultima.scrollIntoViewIfNeeded();
    await expect(ultima).toHaveAttribute("src", /^data:image\/png/, { timeout: 10_000 });
  });

  test("la miniatura non straborda dal suo riquadro", async ({ page, cantina }) => {
    // Regressione vera, introdotta in REV 1.8 e vista da Omar: col rifilo le
    // immagini diventano strette e alte, e la dimensione minima automatica dei
    // grid item allargava la riga fino all'altezza naturale — img 62x279 in un
    // riquadro 62x84, con `overflow: hidden` che mostrava solo il tappo.
    // L'invariante e' semplice: l'immagine non puo' essere piu' grande del
    // riquadro che la contiene.
    const alta = "data:image/svg+xml;utf8," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">`
      + `<rect width="800" height="800" fill="#ffffff"/>`
      + `<rect x="340" y="90" width="120" height="630" fill="#2E4A2E"/></svg>`);
    cantina.setTable("wines", [VINO]).setTable("bevuti", [])
      .setTable("wine_images", [{ wine_id: 1, image_url: alta }]);

    await apriApp(page);
    const mini = page.locator('img[alt=""]').first();
    await expect(mini).toHaveAttribute("src", /^data:image\/png/, { timeout: 10_000 });

    const g = await mini.evaluate(el => {
      const r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect();
      return { img: { w: r.width, h: r.height }, box: { w: p.width, h: p.height } };
    });
    expect(g.img.h).toBeLessThanOrEqual(g.box.h + 1);
    expect(g.img.w).toBeLessThanOrEqual(g.box.w + 1);
  });

  test("il fondo viene reso trasparente, non solo ritagliato", async ({ page, cantina }) => {
    // Fondo GRIGIO di proposito: `mix-blend-mode: multiply` nasconde il bianco,
    // quindi col bianco non si distingue un vero scontorno da un ritaglio. Col
    // grigio si': se resta, si vede il riquadro attorno alla bottiglia.
    const grigio = "data:image/svg+xml;utf8," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">`
      + `<rect width="600" height="600" fill="#DEDEDE"/>`
      + `<rect x="250" y="80" width="100" height="480" rx="8" fill="#2E4A2E"/></svg>`);
    cantina.setTable("wines", [VINO]).setTable("bevuti", [])
      .setTable("wine_images", [{ wine_id: 1, image_url: grigio }]);

    await apriApp(page);
    const mini = page.locator('img[alt=""]').first();
    await expect(mini).toHaveAttribute("src", /^data:image\/png/, { timeout: 10_000 });

    const alpha = await mini.evaluate(el => new Promise(ok => {
      const i = new Image();
      i.onload = () => {
        const c = document.createElement("canvas");
        c.width = i.naturalWidth; c.height = i.naturalHeight;
        const x = c.getContext("2d"); x.drawImage(i, 0, 0);
        const d = x.getImageData(0, 0, i.naturalWidth, i.naturalHeight).data;
        const centro = ((Math.floor(i.naturalHeight / 2) * i.naturalWidth) + Math.floor(i.naturalWidth / 2)) * 4;
        ok({ angolo: d[3], centro: d[centro + 3] });
      };
      i.src = el.src;
    }));
    expect(alpha.angolo).toBe(0);      // fondo: trasparente
    expect(alpha.centro).toBe(255);    // bottiglia: opaca
  });
});
