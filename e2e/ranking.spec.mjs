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
import { punteggioImmagine, SOGLIA_MINIMA, costruisciQuery, parolePortanti, rilevanza, scegliImmagine } from "../api/search-image.js";

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

test.describe("Stringa di ricerca", () => {
  test("prima il vino, poi la cantina", () => {
    // Col produttore in testa, "Peroni Marzemino Montelungo" tornava con la
    // bottiglia sbagliata: Peroni e' soprattutto una birra, e le prime parole
    // pesano di piu'. Invertire l'ordine e' la richiesta di Omar del
    // 21/09/2026.
    expect(costruisciQuery("Peroni", 'Marzemino "Montelungo"', null))
      .toBe('Marzemino "Montelungo" Peroni bottiglia vino');
  });

  test("l'annata entra solo se e' un'annata", () => {
    // Dal client arriva la stringa "n.d." quando non si conosce: e' un
    // segnaposto per il display, non un dato, e nella ricerca e' spazzatura.
    // Erano esattamente i due vini Peroni a portarsela dietro.
    expect(costruisciQuery("Peroni", "Merlot", "n.d.")).toBe("Merlot Peroni bottiglia vino");
    expect(costruisciQuery("Peroni", "Merlot", "")).toBe("Merlot Peroni bottiglia vino");
    expect(costruisciQuery("Peroni", "Merlot", null)).toBe("Merlot Peroni bottiglia vino");
    expect(costruisciQuery("Bisci", "Verdicchio", 2019)).toBe("Verdicchio Bisci 2019 bottiglia vino");
  });
});

// ── Il caso Peroni, 21/09/2026 ───────────────────────────────────────────────
// Non e' un esempio costruito: sono i 5 risultati che Serper ha davvero
// restituito, copiati dai log di produzione. Le foto GIUSTE venivano scartate
// e due sbagliate dello stesso sito passavano.
const RISULTATI_VERI_MARZEMINO = [
  { imageUrl: "https://www.gardavino.it/1356-home_default/maccaboni-francesco-donna-virginia-riserva-.jpg",
    title: "Maccaboni Francesco Donna Virginia Riserva" },
  { imageUrl: "https://www.gardavino.it/1190-home_default/pietta-groppello-pietta.jpg",
    title: "Pietta Groppello" },
  { imageUrl: "https://images.vivino.com/thumbs/Un9kloZZQnSCV5PueRNECw_pb_x960.png",
    title: "Peroni Marzemino" },
  { imageUrl: "https://www.gardavino.it/1171-medium_default/peroni-montelungo.jpg",
    title: "Peroni Montelungo Marzemino" },
];

test.describe("Formati PrestaShop", () => {
  test("medium_default vale come large_default", () => {
    // Il difetto: avevo elencato i formati visti nel campione invece di
    // riconoscere lo schema. Stesso negozio, stessa foto, 1 punto invece di 4.
    for (const f of ["small", "medium", "large", "home", "cart", "thickbox"]) {
      const url = `https://www.gardavino.it/1172-${f}_default/peroni-montealbi.jpg`;
      expect(punteggioImmagine(url), `${f}_default`).toBeGreaterThanOrEqual(SOGLIA_MINIMA);
    }
  });
});

test.describe("Rilevanza", () => {
  test("le virgolette del nome non finiscono nelle parole", () => {
    // Producevano la keyword '\"montealbi\"', che in un URL non si trova mai.
    expect(parolePortanti("Peroni", 'Merlot "Montealbi"')).toEqual(["peroni", "merlot", "montealbi"]);
  });

  test("l'accento non spezza il confronto", () => {
    // In etichetta e' "Montealbì", nel database "Montealbi".
    expect(parolePortanti("Peroni", 'Merlot "Montealbì"')).toContain("montealbi");
    expect(rilevanza(["montealbi"], "https://x.it/peroni-montealbì.jpg", "")).toBeGreaterThan(0);
  });

  test("l'URL pesa piu' del titolo", () => {
    // L'URL di uno scatto prodotto nomina il prodotto; il titolo di una pagina
    // e-commerce nomina anche i correlati.
    expect(rilevanza(["montelungo"], "https://x.it/peroni-montelungo.jpg", ""))
      .toBeGreaterThan(rilevanza(["montelungo"], "https://x.it/altro.jpg", "Peroni Montelungo"));
  });

  test("sui risultati veri sceglie la bottiglia giusta", () => {
    const { migliore } = scegliImmagine(RISULTATI_VERI_MARZEMINO, "Peroni", 'Marzemino "Montelungo"');
    expect(migliore.url).toBe("https://www.gardavino.it/1171-medium_default/peroni-montelungo.jpg");
    expect(migliore.punteggio).toBeGreaterThanOrEqual(SOGLIA_MINIMA);
  });

  test("vince anche se la sbagliata nomina il vino nel titolo", () => {
    // Il caso ostile: la pagina sbagliata cita produttore E vitigno fra i
    // correlati. Prima bastava quello per entrare in gara e vincere.
    const ostili = [
      { imageUrl: "https://www.gardavino.it/1356-home_default/maccaboni-donna-virginia.jpg",
        title: "Donna Virginia — vedi anche Peroni Marzemino Montelungo" },
      { imageUrl: "https://www.gardavino.it/1171-medium_default/peroni-montelungo.jpg",
        title: "Peroni Montelungo" },
    ];
    const { migliore } = scegliImmagine(ostili, "Peroni", 'Marzemino "Montelungo"');
    expect(migliore.url).toContain("peroni-montelungo");
  });
});
