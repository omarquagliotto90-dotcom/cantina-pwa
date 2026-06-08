# 🍷 La Mia Cantina — Guida installazione PWA su iPhone

## Cosa hai in questa cartella
```
cantina-pwa/
├── public/
│   ├── index.html        ← pagina principale ottimizzata iPhone
│   ├── manifest.json     ← dice a iPhone come installare l'app
│   ├── sw.js             ← service worker (funzionamento offline)
│   └── icons/
│       ├── icon-192.png  ← icona app iPhone
│       └── icon-512.png  ← icona app grande
└── src/
    ├── index.js          ← entry point React
    └── App.jsx           ← tutta l'app (cantina completa)
```

---

## STEP 1 — Installa Node.js (una volta sola)
1. Vai su https://nodejs.org
2. Scarica la versione **LTS** (quella consigliata)
3. Installa normalmente su Windows

---

## STEP 2 — Crea account Vercel (gratis)
1. Vai su https://vercel.com
2. Clicca **Sign Up**
3. Registrati con Google o GitHub (consigliato GitHub)

---

## STEP 3 — Pubblica l'app

### Metodo A: drag & drop (più semplice, non serve terminale)
1. Vai su https://vercel.com/new
2. Clicca **"Deploy without Git"** → trascina la cartella `cantina-pwa`
3. Vercel rileva automaticamente React e fa il deploy
4. Ottieni un link tipo: `https://la-mia-cantina-xxxx.vercel.app`

### Metodo B: da terminale Windows
```bash
# Apri PowerShell o Terminale Windows nella cartella cantina-pwa
npm install
npm run build
npx vercel --prod
```
Segui le istruzioni a schermo (login Vercel).

---

## STEP 4 — Installa su iPhone
1. Apri **Safari** sul tuo iPhone (non Chrome, deve essere Safari)
2. Vai all'indirizzo che ti ha dato Vercel
3. Tocca l'icona **Condividi** (il quadrato con la freccia su)
4. Scorri e tocca **"Aggiungi a schermata Home"**
5. Dai il nome **"Cantina"** → tocca **Aggiungi**

✅ Ora hai l'icona 🍷 sulla schermata home. Si apre a schermo intero come un'app vera!

---

## Note importanti
- **I dati sono persistenti**: i vini che segni come bevuti restano salvati anche chiudendo l'app (localStorage)
- **Funziona offline**: dopo la prima apertura, l'app funziona senza connessione
- **Il Lune Vere 2022** è già segnato come bevuto (7 giugno 2025)
- Per aggiornare l'app: ricarica semplicemente la pagina in Safari

---

## Aggiornare l'app in futuro
Quando vuoi aggiornare i dati (nuovi vini, correzioni):
1. Modifica `src/App.jsx`
2. Trascina di nuovo la cartella su Vercel (sovrascrive il deploy precedente)
3. L'app si aggiorna automaticamente sul tuo iPhone

---

*Versione: 0.1 — giugno 2025*
