#!/usr/bin/env node
// Export completo della cantina in un file JSON.
//
// Chiude il punto 3 di P1b: il backup di A2a fu manuale e una tantum, questo
// e' ripetibile. Il piano gratuito di Supabase non ha point-in-time recovery:
// senza un export proprio, un DELETE andato a buon fine non si recupera.
//
// Uso:
//   node scripts/backup.mjs              → backup/cantina-AAAA-MM-GG.json
//   node scripts/backup.mjs --stdout     → sullo standard output
//   node scripts/backup.mjs --out X.json → su un percorso scelto
//
// Nessuna dipendenza npm: usa la fetch nativa di Node 18+.
//
// Credenziali: di default vengono lette da src/App.jsx, che e' la stessa
// sorgente che usa l'app. Non c'e' niente da configurare e niente che possa
// divergere. La chiave publishable e' gia' pubblica (sta nel bundle servito
// ai browser), quindi leggerla dal repo non espone nulla di nuovo. Si possono
// comunque sovrascrivere con le variabili d'ambiente SB_URL e SB_KEY.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Le 5 tabelle attive. `wine_websites` e' in via di dismissione (fase 3 di P3)
// ma finche' esiste va salvata: un backup parziale non e' un backup.
const TABELLE = ["wines", "bevuti", "wine_images", "wine_websites", "produttori"];

async function credenziali() {
  if (process.env.SB_URL && process.env.SB_KEY) {
    return { url: process.env.SB_URL, key: process.env.SB_KEY };
  }
  const app = await readFile(resolve(ROOT, "src/App.jsx"), "utf8");
  const url = app.match(/^const SB_URL = "([^"]+)"/m)?.[1];
  const key = app.match(/^const SB_KEY = "([^"]+)"/m)?.[1];
  if (!url || !key) {
    throw new Error(
      "Credenziali non trovate: src/App.jsx non espone piu' SB_URL/SB_KEY. " +
      "Passale con le variabili d'ambiente SB_URL e SB_KEY."
    );
  }
  return { url, key };
}

// PostgREST pagina a 1000 righe per default: si insiste con Range finche'
// la pagina torna corta. Oggi nessuna tabella ci arriva, ma un export che
// tronca in silenzio e' peggio di nessun export.
async function scarica(url, key, tabella) {
  const PAGINA = 1000;
  const righe = [];
  for (let da = 0; ; da += PAGINA) {
    const r = await fetch(`${url}/rest/v1/${tabella}?select=*`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${da}-${da + PAGINA - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!r.ok) {
      throw new Error(`${tabella}: HTTP ${r.status} ${await r.text().catch(() => "")}`);
    }
    const blocco = await r.json();
    righe.push(...blocco);
    if (blocco.length < PAGINA) return righe;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const suStdout = args.includes("--stdout");
  const outIdx = args.indexOf("--out");
  const { url, key } = await credenziali();

  const dati = {};
  const conteggi = {};
  for (const t of TABELLE) {
    dati[t] = await scarica(url, key, t);
    conteggi[t] = dati[t].length;
  }

  const oggi = new Date().toISOString().slice(0, 10);
  const backup = {
    generato_il: new Date().toISOString(),
    progetto: url,
    conteggi,
    dati,
  };
  const json = JSON.stringify(backup, null, 2);

  if (suStdout) {
    process.stdout.write(json);
  } else {
    const dest = outIdx >= 0 && args[outIdx + 1]
      ? resolve(args[outIdx + 1])
      : resolve(ROOT, "backup", `cantina-${oggi}.json`);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, json);
    console.log(dest);
  }
  console.error(
    Object.entries(conteggi).map(([t, n]) => `${t}: ${n}`).join(" · ")
  );
}

main().catch((e) => {
  console.error("Backup fallito:", e.message);
  process.exit(1);
});
