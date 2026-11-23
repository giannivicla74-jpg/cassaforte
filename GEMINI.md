# Cassaforte Password: istruzioni per Gemini

Le note complete del progetto sono in **`CLAUDE.md`** (stessa cartella): leggile prima di modificare qualcosa.
Qui sotto le regole essenziali, valide per qualunque assistente.

## Dove si lavora
- La cartella del progetto è **`cassaforte\cassaforte-main`** (è quella salvata su GitHub).
- `firebase.json` e `.firebaserc` sono **qui dentro**, non nella cartella esterna `cassaforte\`.
  Se non trovi `firebase.json`, sei nella cartella sbagliata: spostati in `cassaforte-main`, non saltare la pubblicazione.

## Prima di lavorare
- `git fetch` + `git status`, poi `git pull` se serve (si usano due PC; GitHub è la copia di riferimento).
- Test: `node --test tests/` (devono essere tutti verdi).

## Pubblicare "su tutto" (solo dopo l'ok di Gianni), sempre da `cassaforte-main`
1. `git push origin main` → repo `cassaforte` (copia di riferimento);
2. `firebase.cmd deploy --only hosting:cassaforte-gccodelab` → il sito **https://cassaforte.gccodelab.it**
   (account Firebase principale; se `firebase` dà "esecuzione di script disabilitata" usa `firebase.cmd`);
3. `git push dominio main` → repo `cassaforte-app` (si aggiorna da solo su github.io).
- Il sito principale **non** si aggiorna da GitHub: senza il passo 2 resta alla versione vecchia.
- Prima: aumentare `APP_VERSION` e aggiungere una voce in cima a `CHANGELOG` in `app.js`.
- Dopo: controllare che i file online siano uguali a quelli locali.
- Se aggiungi un file all'app, mettilo anche nell'elenco `FILES` di `sw.js`.

## Attenzione
- **Non** aggiungere regole Firestore a `firebase.json` e non fare `firebase deploy` senza `--only hosting:…`:
  il database è condiviso con altre app aziendali e si sovrascriverebbero le loro regole.
- Il repo è **pubblico**: niente password, chiavi API, nomi di dipendenti o dettagli sulla sicurezza del database.
- Rispondere a Gianni in italiano, con spiegazioni semplici.
