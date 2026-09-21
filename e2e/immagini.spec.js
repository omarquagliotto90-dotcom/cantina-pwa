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
});
