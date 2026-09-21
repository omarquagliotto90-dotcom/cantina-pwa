// Rifilo del margine — `riquadroContenuto` in `src/ui/domain.js`.
//
// E' cio' che rende le bottiglie tutte della stessa altezza: toglie il bianco
// attorno, cosi' la dimensione non dipende piu' da come e' stato inquadrato lo
// scatto. Funzione pura su ImageData, quindi si verifica senza browser e senza
// rete, su immagini sintetiche con margini NOTI.

import { test, expect } from "@playwright/test";
import { riquadroContenuto } from "../src/ui/domain.js";

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
