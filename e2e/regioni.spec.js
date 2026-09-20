// Le foto di regione si aggiungono in due posti: il file in `public/regioni/`
// e la regione in `REGIONI_CON_FOTO`. Se i due non combaciano non succede
// niente di rumoroso — la foto semplicemente non appare, e te ne accorgi solo
// aprendo la scheda giusta. Questo test rende quel disallineamento un errore.
//
// Non serve il browser: e' un confronto fra una costante e una cartella.

const { test, expect } = require("@playwright/test");
const { regioniConFoto } = require("./support/harness");
const fs = require("fs");
const path = require("path");

const CARTELLA = path.join(__dirname, "..", "public", "regioni");

// Copia dello slug di `WineDetail.jsx`. Importarlo da li' trascinerebbe JSX in
// un test Node; la formula e' tre righe e il test fallisce se divergono.
const slug = (r) => r.toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const fotoSuDisco = () => fs.readdirSync(CARTELLA).filter(f => f.endsWith(".jpg"));

test.describe("Foto delle regioni", () => {
  test("ogni regione elencata ha il suo file", () => {
    for (const regione of regioniConFoto()) {
      const atteso = `${slug(regione)}.jpg`;
      expect(fs.existsSync(path.join(CARTELLA, atteso)),
        `"${regione}" e' in REGIONI_CON_FOTO ma manca public/regioni/${atteso}`).toBe(true);
    }
  });

  test("ogni file ha la sua regione elencata", () => {
    const attesi = regioniConFoto().map(r => `${slug(r)}.jpg`);
    for (const file of fotoSuDisco()) {
      expect(attesi, `public/regioni/${file} non e' elencato in REGIONI_CON_FOTO, quindi non viene mai mostrato`)
        .toContain(file);
    }
  });

  test("le foto non sono troppo pesanti", () => {
    // Sono sfondi sotto un velo, non gallerie. 300 KB e' il tetto oltre il
    // quale l'hero pesa piu' della pagina che decora.
    for (const file of fotoSuDisco()) {
      const kb = Math.round(fs.statSync(path.join(CARTELLA, file)).size / 1024);
      expect(kb, `public/regioni/${file} pesa ${kb} KB`).toBeLessThanOrEqual(300);
    }
  });
});
