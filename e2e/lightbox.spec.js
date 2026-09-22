// Lightbox della foto di bottiglia.
//
// Difetto visto da Omar il 22/09/2026: ingrandendo la foto, il nome del
// produttore e quello del vino restavano dipinti SOPRA la foto ingrandita.
// Comportamento atteso, parole sue: "clicco sulla foto, compare solo la foto
// non il testo".
//
// La causa non e' il `z-index` del lightbox (200, piu' alto di tutto): e' che
// vive dentro `sopraFoto` — `position: relative; z-index: 2` nell'hero di
// `WineDetail` — e un elemento posizionato con `z-index` crea uno stacking
// context. Da li' dentro il 200 compete solo coi fratelli, non con il titolo
// che sta nello stesso contesto piu' avanti nel DOM. E' la stessa trappola
// gia' registrata in CLAUDE.md per `mix-blend-mode`.
//
// L'asserzione misura l'ordine di pittura vero, non lo stile: al centro del
// nome del produttore, `elementFromPoint` deve restituire qualcosa che sta
// dentro il lightbox. Se il titolo e' davanti, restituisce il titolo. Il
// lightbox si identifica dalla foto ingrandita risalendo al suo contenitore,
// cosi' il test non dipende da nessun attributo aggiunto per il test stesso e
// puo' essere verificato in rosso sul codice di prima.

const { test, expect, apriApp } = require("./support/harness");

const BOTTIGLIA = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">`
  + `<rect width="400" height="400" fill="#ffffff"/>`
  + `<rect x="150" y="50" width="100" height="300" fill="#221111"/></svg>`);

const VINO = {
  id: 1, produttore: "Pieropan", produttore_id: 1, vino: "Soave Classico La Rocca",
  annata: 2021, tipologia: "Bianco fermo", bottiglie: 3, prezzo: 12, valore: 18,
  denominazione: "DOC", vitigno: "Garganega", macerazione: null, fermentazione: null,
  malolattica: null, note: null, note_cantina: null, slow_vino_bott: false,
  created_at: "2026-01-10T10:00:00+00:00", deleted_at: null,
};

async function apriFoto(page, cantina) {
  cantina.setTable("wines", [VINO]).setTable("wine_images", [{ wine_id: 1, image_url: BOTTIGLIA }]);
  await apriApp(page);
  await page.getByRole("button", { name: /Soave Classico La Rocca/ }).first().click();
  await page.getByRole("dialog").getByRole("img", { name: /Pieropan/ }).click();
  await expect(page.getByRole("img", { name: "Bottiglia ingrandita" })).toBeVisible();
}

test.describe("Foto ingrandita", () => {
  test("sopra la foto ingrandita non resta nessun testo della scheda", async ({ page, cantina }) => {
    await apriFoto(page, cantina);

    // Ogni pezzo di testo dell'hero, uno per uno: al suo posto deve rispondere
    // il lightbox. Il produttore e' il caso dello screenshot, ma il titolo e
    // l'annata stanno nello stesso stacking context e cadrebbero insieme.
    for (const testo of ["Pieropan", "Soave Classico La Rocca", "2021"]) {
      const coperto = await page.evaluate((t) => {
        const el = [...document.querySelectorAll("p, h2")]
          .find(n => n.textContent.trim().startsWith(t));
        if (!el) return { trovato: false };
        const foto = document.querySelector('img[alt="Bottiglia ingrandita"]');
        const velo = foto.parentElement;
        const r = el.getBoundingClientRect();
        const sopra = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          trovato: true,
          nelLightbox: sopra === velo || velo.contains(sopra),
          chiCopre: sopra ? sopra.tagName + " " + sopra.textContent.trim().slice(0, 30) : null,
        };
      }, testo);
      expect(coperto.trovato, `testo "${testo}" non trovato nella scheda`).toBe(true);
      expect(coperto.nelLightbox, `"${testo}" e' davanti alla foto: copre ${coperto.chiCopre}`).toBe(true);
    }
  });

  test("chiudendo la foto la scheda torna com'era", async ({ page, cantina }) => {
    // Il rimedio sposta il lightbox fuori dalla scheda: questo verifica che
    // non si porti via nulla tornando indietro.
    await apriFoto(page, cantina);
    // Il velo si chiude al tap: e' il gesto vero, e non dipende da etichette.
    await page.getByRole("img", { name: "Bottiglia ingrandita" })
      .evaluate(el => el.parentElement.click());

    await expect(page.getByRole("img", { name: "Bottiglia ingrandita" })).toHaveCount(0);
    await expect(page.getByRole("dialog").getByRole("img", { name: /Pieropan/ })).toBeVisible();
  });
});
