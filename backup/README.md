# Backup della cantina

Export completi delle tabelle Supabase, un file per data:
`cantina-AAAA-MM-GG.json`.

Chiude il punto 3 di **P1b** (`PIANO_DATI.md`). Il backup di A2a fu manuale e
una tantum; questo è ripetibile e automatico.

## Perché serve

Il piano gratuito di Supabase **non ha point-in-time recovery**. Senza un
export proprio, un `DELETE` andato a buon fine non si recupera in alcun modo.
Il soft delete di P1b protegge dalle cancellazioni fatte *dall'app*; questi
file sono ciò che resta se il danno arriva da altrove — una query sbagliata nel
SQL Editor, o chiunque abbia la chiave publishable, che è pubblica nel bundle.

## Come si aggiorna

- **Da solo**, ogni lunedì mattina: `.github/workflows/backup.yml`.
- **A mano quando serve**, prima di una modifica rischiosa:
  - dal repo: `npm run backup`
  - da GitHub: Actions → *Backup cantina* → **Run workflow**

Il commit automatico contiene `[skip ci]`, così Vercel non ribuilda l'app per
un backup.

## Cosa c'è dentro

```json
{
  "generato_il": "2026-09-20T...Z",
  "progetto": "https://....supabase.co",
  "conteggi": { "wines": 126, "bevuti": 48, ... },
  "dati": { "wines": [...], "bevuti": [...], ... }
}
```

Le tabelle attive: `wines`, `bevuti`, `wine_images`, `wine_websites`,
`produttori` e `audit_log`. Lo script pagina a 1000 righe per volta e insiste
finché la tabella è finita: non tronca in silenzio.

`audit_log` (P1b.3) merita una nota: è la sola copia di ciò che
`riporta_bottiglia` distrugge fisicamente, perché il campo `dettaglio` porta la
riga cancellata per intero. Lasciarlo fuori dal backup vorrebbe dire non
salvare la rete di sicurezza.

## Come si ripristina

Non c'è un comando di restore, ed è voluto: un ripristino automatico è il tipo
di strumento che fa danni quando lo si usa di fretta. La procedura è manuale e
si decide caso per caso.

0. Se il dato è sparito **attraverso l'app**, guarda prima in `audit_log`: è più
   aggiornato del backup settimanale. `dettaglio->'bevuta_cancellata'` contiene
   la bevuta rimossa da "Riporta in cantina"; `dettaglio->'wine_prima'` lo stato
   del vino prima di una modifica o di un'eliminazione.
1. Altrimenti apri il file della data che ti serve e trova le righe perdute.
2. Reinseriscile con il **server MCP di Supabase** (`execute_sql`), non dalla
   PWA: l'app passa dalle RPC, che assegnano id nuovi.
3. Rispetta l'ordine delle FK: prima `produttori`, poi `wines`, poi
   `bevuti` / `wine_images` / `wine_websites`.
4. **Attenzione al trigger** `wines_set_updated_at`: un reinserimento massivo
   azzera `updated_at` ovunque. Vale la stessa trappola registrata in P2 —
   `DISABLE TRIGGER` prima, riabilitare dopo.

## Crescita

Circa 200 KB a file, un file a settimana: ~10 MB l'anno. Trascurabile per ora.
Se un giorno dà fastidio, la potatura è banale — i file vecchi si cancellano e
restano comunque nella storia git.
