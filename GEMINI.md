# Cassaforte Password: istruzioni per Gemini

Le note complete del progetto sono in **`CLAUDE.md`** (stessa cartella): leggile prima di modificare qualcosa.
Qui sotto le regole essenziali, valide per qualunque assistente.

> ⚠️ **REGOLA OBBLIGATORIA, anche per una correzione piccola:** prima di ogni pubblicazione aumenta
>  in , scrivi lo **stesso numero** in , aggiungi la voce **in cima** a
>  e una riga in . Senza il numero nuovo i telefoni **non** mostrano l'avviso
> "Nuova versione · Aggiorna" né le Novità. Controllo: ✔ iterOf restituisce le iterazioni valide o il fallback ITER_OLD (1.2531ms)
✔ cifratura e decifratura round-trip con PBKDF2 + AES-GCM (184.1882ms)
✔ b64 e unb64 gestiscono correttamente byte arbitrari (0.3329ms)
✔ esc esegue escape dei caratteri HTML pericolosi (0.2589ms)
✔ clean e parseItems supportano categorie personalizzate e deduplicano ID (0.9429ms)
✔ recordPasswordChange conserva le ultime 5 password precedenti (0.6936ms)
✔ auditItems rileva password duplicate, deboli e vecchie (>1 anno) (0.6277ms)
✔ normUrl e safeUrl bloccano schemi non sicuri (0.6088ms)
✔ filterItems cerca nelle note, filtra per !warn e ordina per az/recent/cat (13.3093ms)
✔ mergeItems deduplica per id e per contenuto identico con id diverso (0.4946ms)
✔ generatePassword supporta modalità caratteri e passphrase in italiano (1.8429ms)
✔ parseCsvItems importa CSV in formato Chrome e Bitwarden (1.2711ms)
✔ generateCloudCode e cloudDocId generano un ID SHA-256 deterministico (6.9619ms)
✔ clean conserva carte, Wi-Fi e note e ripulisce gli account normali (0.4004ms)
✔ sameItem distingue due carte con lo stesso nome ma numero diverso (0.2106ms)
✔ carte: circuito, formattazione e controllo del numero (0.4707ms)
✔ wifiQr crea il testo standard con i caratteri speciali protetti (0.2382ms)
✔ recognize riconosce i servizi più comuni senza falsi positivi (1.1205ms)
✔ clean accetta solo foto valide, al massimo 3, su ogni tipo di scheda (0.4393ms)
✔ scheda documento: tiene CF, ente e date; cambiando tipo spariscono (0.1701ms)
✔ codice a barre Code 39 del Codice Fiscale (0.2977ms)
✔ Radar Scadenze: carte MM/AA e documenti AAAA-MM-GG (1.1153ms)
✔ Furti online: si invia solo il prefisso di 5 caratteri e si legge il conteggio (38.1388ms)
✔ Radar Scadenze: oggi, ieri e domani contati per giorni di calendario (0.5784ms)
✔ Codici 2FA: valori ufficiali dello standard RFC 6238 (4.1045ms)
✔ Codici 2FA: chiavi non valide rifiutate, solo negli account (0.639ms)
✔ Cestino: tiene 30 giorni, al massimo 50, cifrato e leggibile solo con la chiave giusta (3.1856ms)
✔ Aggiornamenti: confronto versioni e version.json allineato ad APP_VERSION (1.6504ms)
ℹ tests 28
ℹ suites 0
ℹ pass 28
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 372.1881 deve essere tutto verde.

## Dove si lavora
- La cartella del progetto è **`cassaforte\cassaforte-main`** (è quella salvata su GitHub).
- `firebase.json` e `.firebaserc` sono **qui dentro**, non nella cartella esterna `cassaforte\`.
  Se non trovi `firebase.json`, sei nella cartella sbagliata: spostati in `cassaforte-main`, non saltare la pubblicazione.

## Prima di lavorare
- `git fetch` + `git status`, poi `git pull` se serve (si usano due PC; GitHub è la copia di riferimento).
- Test: `node --test tests/` (devono essere tutti verdi).

## Quando aggiungi o cambi una funzione (sempre, prima di pubblicare)
1. Aumenta `APP_VERSION` in `app.js` (es. 1.16.0 → 1.17.0 per una funzione nuova, 1.16.1 per una correzione)
   e scrivi **lo stesso numero in `version.json`**: è quello che fa comparire agli utenti l'avviso "Nuova versione · Aggiorna"
   (un test controlla che siano uguali).
2. Aggiungi una voce **in cima** a `CHANGELOG` in `app.js` (compare in Guida → Novità).
3. Aggiorna il **manuale** (Guida, sezione "Funzioni Intelligenti" in `index.html`).
4. Aggiorna la finestra **"✨ Tutto quello che sa fare"** (`#dlgFeat` in `index.html`).
5. Se tocchi `core.js`, aggiungi un test in `tests/vault.test.mjs` e verifica `node --test tests/`.
6. Pensa allo **spazio**: tutta la cassaforte cifrata deve stare sotto **~1 MB** (limite di un documento Firestore,
   vale anche con il piano a pagamento), altrimenti il backup sul Cloud si ferma.
7. Aggiungi una riga in `STORIA.md` (diario del progetto).

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
