// Rifilo del margine — `riquadroContenuto` in `src/ui/domain.js`.
//
// E' cio' che rende le bottiglie tutte della stessa altezza: toglie il bianco
// attorno, cosi' la dimensione non dipende piu' da come e' stato inquadrato lo
// scatto. Funzione pura su ImageData, quindi si verifica senza browser e senza
// rete, su immagini sintetiche con margini NOTI.

import { test, expect } from "@playwright/test";
import { riquadroContenuto, scontornaFondo } from "../src/ui/domain.js";

/** Tela piena di `fondo` con un rettangolo `oggetto` dentro. */
function tela({ w, h, fondo = [255, 255, 255, 255], oggetto = null }) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set(fondo, i * 4);
  if (oggetto) {
    const { x, y, larghezza, altezza, colore = [20, 20, 20, 255] } = oggetto;
    for (let yy = y; yy < y + altezza; yy++)
      for (let xx = x; xx < x + larghezza; xx++) d.set(colore, (yy * w + xx) * 4);
  }
  return d;
}

test.describe("Rifilo del margine", () => {
  test("trova la bottiglia dentro un margine bianco", () => {
    const d = tela({ w: 200, h: 300, oggetto: { x: 70, y: 40, larghezza: 60, altezza: 220 } });
    expect(riquadroContenuto(d, 200, 300)).toEqual({ sx: 70, su: 40, larghezza: 60, altezza: 220 });
  });

  test("funziona anche su fondo trasparente, non solo bianco", () => {
    const d = tela({ w: 120, h: 160, fondo: [0, 0, 0, 0], oggetto: { x: 30, y: 20, larghezza: 50, altezza: 120 } });
    expect(riquadroContenuto(d, 120, 160)).toEqual({ sx: 30, su: 20, larghezza: 50, altezza: 120 });
  });

  test("un margine trascurabile non fa ridisegnare niente", () => {
    // 2px su 200: sotto il 3%, non vale la pena. Deve dire "niente da fare".
    const d = tela({ w: 200, h: 200, oggetto: { x: 2, y: 2, larghezza: 196, altezza: 196 } });
    expect(riquadroContenuto(d, 200, 200)).toBeNull();
  });

  test("una foto ambientata non viene rifilata a caso", () => {
    // Angoli tutti diversi = non c'e' un fondo uniforme da togliere. Meglio
    // lasciare l'immagine com'e' che ritagliarla a casaccio.
    const d = tela({ w: 100, h: 100, fondo: [120, 200, 90, 255] });
    const ang = [[0, 0, [10, 10, 10, 255]], [99, 0, [240, 240, 240, 255]], [0, 99, [200, 30, 30, 255]]];
    for (const [x, y, c] of ang) d.set(c, (y * 100 + x) * 4);
    expect(riquadroContenuto(d, 100, 100)).toBeNull();
  });

  test("un'immagine tutta fondo non produce un riquadro vuoto", () => {
    expect(riquadroContenuto(tela({ w: 50, h: 50 }), 50, 50)).toBeNull();
  });

  test("tollera il rumore JPEG attorno alla bottiglia", () => {
    // Il bianco compresso non e' mai esattamente 255: se la tolleranza fosse
    // zero, il rifilo non toglierebbe niente.
    const d = tela({ w: 200, h: 300, fondo: [252, 250, 248, 255],
                     oggetto: { x: 80, y: 50, larghezza: 40, altezza: 200 } });
    const r = riquadroContenuto(d, 200, 300);
    expect(r).toEqual({ sx: 80, su: 50, larghezza: 40, altezza: 200 });
  });
});

test.describe("Scontorno del fondo", () => {
  const alpha = (d, w, x, y) => d[(y * w + x) * 4 + 3];

  test("il fondo attorno alla bottiglia diventa trasparente", () => {
    const d = tela({ w: 100, h: 200, oggetto: { x: 40, y: 20, larghezza: 20, altezza: 160 } });
    const tolti = scontornaFondo(d, 100, 200);
    expect(tolti).toBeGreaterThan(0);
    expect(alpha(d, 100, 2, 2)).toBe(0);        // angolo: via
    expect(alpha(d, 100, 50, 100)).toBe(255);   // bottiglia: intatta
  });

  test("il bianco DENTRO l'etichetta non viene bucato", () => {
    // E' il modo tipico di sbagliare uno scontorno: cancellare per colore
    // invece che per contiguita' dal bordo mangerebbe anche questa etichetta.
    const d = tela({ w: 100, h: 200, oggetto: { x: 30, y: 20, larghezza: 40, altezza: 160 } });
    // Etichetta bianca dentro il corpo scuro.
    for (let y = 80; y < 120; y++)
      for (let x = 35; x < 65; x++) d.set([255, 255, 255, 255], (y * 100 + x) * 4);

    scontornaFondo(d, 100, 200);
    expect(alpha(d, 100, 50, 100)).toBe(255);   // etichetta: ancora opaca
    expect(alpha(d, 100, 2, 2)).toBe(0);        // fondo: via
  });

  test("un'immagine senza fondo non viene cancellata per intero", () => {
    // Trovato da un test in rosso, non a tavolino: una tela tutta soggetto ha
    // gli angoli uguali, quindi il flood fill la mangiava tutta e restituiva
    // un PNG vuoto. Meglio non scontornare che far sparire la bottiglia.
    const d = tela({ w: 80, h: 120, fondo: [34, 17, 17, 255] });
    expect(scontornaFondo(d, 80, 120)).toBe(0);
    expect(alpha(d, 80, 40, 60)).toBe(255);
  });

  test("una foto ambientata non viene toccata", () => {
    const d = tela({ w: 60, h: 60, fondo: [120, 200, 90, 255] });
    d.set([10, 10, 10, 255], 0);
    d.set([240, 240, 240, 255], (59 * 60 + 59) * 4);
    expect(scontornaFondo(d, 60, 60)).toBe(0);
  });

  test("la tasca di fondo murata dall'ombra viene recuperata", () => {
    // Il difetto vero, visto sulla foto di Pistis Sophia il 21/09/2026: il
    // flood fill parte dai bordi e avanza sui contigui, quindi un'ombra
    // grigia attorno alla bottiglia gli fa da muro e il bianco chiuso dietro
    // resta opaco — un blocco bianco appiccicato alla bottiglia.
    const d = tela({ w: 200, h: 300, oggetto: { x: 80, y: 40, larghezza: 40, altezza: 220 } });
    const grigio = (x0, x1, y0, y1) => {
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) d.set([205, 205, 205, 255], (y * 200 + x) * 4);
    };
    // Un arco d'ombra che chiude una tasca a destra della bottiglia.
    grigio(120, 165, 200, 215);
    grigio(150, 165, 215, 262);
    grigio(120, 165, 248, 262);

    scontornaFondo(d, 200, 300);
    expect(alpha(d, 200, 135, 230), "la tasca deve sparire").toBe(0);
    expect(alpha(d, 200, 100, 150), "la bottiglia deve restare").toBe(255);
  });

  test("l'etichetta bianca resta anche col recupero delle tasche", () => {
    // La controprova del test sopra. Il recupero allarga la tolleranza, quindi
    // deve distinguere una tasca di fondo — contornata da fondo gia' tolto —
    // da un'etichetta, contornata dal vetro. Senza questa distinzione la
    // bottiglia di Pistis Sophia perderebbe l'etichetta, che e' bianca.
    const d = tela({ w: 100, h: 200, oggetto: { x: 30, y: 20, larghezza: 40, altezza: 160 } });
    for (let y = 80; y < 120; y++)
      for (let x = 32; x < 68; x++) d.set([255, 255, 255, 255], (y * 100 + x) * 4);

    scontornaFondo(d, 100, 200);
    expect(alpha(d, 100, 50, 100), "centro etichetta").toBe(255);
    expect(alpha(d, 100, 33, 100), "etichetta a filo del vetro").toBe(255);
  });

  test("un riflesso chiaro sul bordo del vetro non viene scavato", () => {
    // Il rischio che il recupero delle tasche porta con se': una lumeggiatura
    // sul fianco della bottiglia e' chiara quasi come il fondo e lo tocca. Non
    // e' una tasca, e' vetro: confina per meta' col soggetto, quindi la quota
    // del 70% la salva. Se un giorno questa soglia si alza, questo test cade.
    const d = tela({ w: 100, h: 200, oggetto: { x: 30, y: 20, larghezza: 40, altezza: 160 } });
    for (let y = 30; y < 170; y++)
      for (let x = 64; x < 70; x++) d.set([215, 215, 215, 255], (y * 100 + x) * 4);

    scontornaFondo(d, 100, 200);
    expect(alpha(d, 100, 66, 100), "il riflesso e' vetro, non fondo").toBe(255);
  });

  test("dopo lo scontorno il riquadro segue la sagoma, non il rettangolo", () => {
    // Bottiglia stretta con una base larga e chiara quasi come il fondo: senza
    // scontorno il riquadro la includerebbe, con lo scontorno no.
    const d = tela({ w: 120, h: 200, oggetto: { x: 50, y: 10, larghezza: 20, altezza: 180 } });
    scontornaFondo(d, 120, 200);
    const r = riquadroContenuto(d, 120, 200);
    expect(r).toEqual({ sx: 50, su: 10, larghezza: 20, altezza: 180 });
  });
});
