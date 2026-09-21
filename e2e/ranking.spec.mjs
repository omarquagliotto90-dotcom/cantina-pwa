// Ranking delle immagini di bottiglia — `api/search-image.js`.
//
// Non serve il browser: e' una funzione pura. Il file e' `.mjs` perche' la
// route e' un modulo ES, come `scripts/backup.mjs`.
//
// I casi NON sono inventati: sono URL vere, prese da `wine_images` il
// 21/09/2026. E' l'unico modo di verificare regole che altrimenti si
// collauderebbero in produzione — cosi' e' gia' emerso che PrestaShop scrive
// `1057-large_default` col trattino, non `/large_default`.

import { test, expect } from "@playwright/test";
import { punteggioImmagine, SOGLIA_MINIMA } from "../api/search-image.js";

// Scartate: sono il ritaglio dell'etichetta, non la bottiglia.
const NON_BOTTIGLIE = [
  "https://images.vivino.com/labels/zlByd02_QdKjMX5ugDyM6A.jpg",
  "https://images.vivino.com/labels/TnUuHq-mT0mgs20l9PNjdw.jpg",
  "https://cdn.ct-static.com/labels/7029c5c2-87f4-463c-94f9-60d4ae30a61c.jpg",
];

// Scatti prodotto da e-commerce: bottiglia intera su fondo bianco.
const BUONE = [
  "https://www.gardavino.it/1057-large_default/peroni-monteritto-trebbiano.jpg",
  "https://distilwine.com/3242-large_default/vespaiolo-doc-breganze-maucalan-75cl.jpg",
  "https://www.parlapa.com/store/image/cache/data/incoming/pix/P-03657-640x640.jpg",
  "https://pistis-sophia.com/wp-content/uploads/2022/03/leon-sangiovese-2018-1.jpg",
  "https://wivood.com/cdn/shop/files/Bianchetta-Metodo-Classico-2017.jpg",
  "https://www.bernabei.it/ARTICOLI/L_5238.png",
];

test.describe("Ranking immagini bottiglia", () => {
  test("i ritagli di etichetta vengono scartati, non solo penalizzati", () => {
    for (const url of NON_BOTTIGLIE) {
      expect(punteggioImmagine(url), url).toBeNull();
    }
  });

  test("gli scatti prodotto superano la soglia", () => {
    for (const url of BUONE) {
      expect(punteggioImmagine(url), url).toBeGreaterThanOrEqual(SOGLIA_MINIMA);
    }
  });

  test("un JPEG da un percorso qualsiasi resta sotto soglia", () => {
    // "Meglio niente che sbagliato": senza nessun segnale non si tiene.
    const url = "https://www.wineexpert.it/upload/img/dc18fd4e-a40b-46a1.jpg";
    expect(punteggioImmagine(url)).toBeLessThan(SOGLIA_MINIMA);
  });

  test("una scontornata dichiarata batte tutto il resto", () => {
    const scontornata = "https://originalitalia.it/wp-content/uploads/2020/10/foll4-removebg-preview-1.png";
    const normale = "https://www.gardavino.it/1057-large_default/peroni.jpg";
    expect(punteggioImmagine(scontornata)).toBeGreaterThan(punteggioImmagine(normale));
  });

  test("http vale meno di https, a parita' di tutto il resto", () => {
    const base = "wivood.com/cdn/shop/files/Bianchetta.jpg";
    expect(punteggioImmagine(`https://${base}`)).toBeGreaterThan(punteggioImmagine(`http://${base}`));
  });
});
