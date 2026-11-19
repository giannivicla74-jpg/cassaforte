# Cassaforte Password: note del progetto

PWA per custodire password cifrate nel browser (AES-GCM 256, chiave da PBKDF2-SHA256 600.000 iterazioni).
Nessun server: i dati stanno nel `localStorage` del dispositivo; i backup sono file JSON cifrati.

## File
- `index.html`: interfaccia, stili e manuale. `app.js`: logica dell'app. `core.js`: funzioni pure (cifratura, CSV, audit), testate.
- `sw.js`: service worker. Rete prima, ma dopo **3 secondi** usa la copia in cache (segnale debole). Il download continua in sottofondo.
- `tests/vault.test.mjs`: test di `core.js`. Avvio: `node --test tests/`
- `server.js`: server locale di prova (`node server.js`, poi http://localhost:8080).

## Pubblicazione
- Sito: **https://cassaforte.gccodelab.it** = Firebase Hosting, sito `cassaforte-gccodelab` nel progetto `gestionale-flotta-d6448` (account Firebase principale).
- Pubblicare (da questa cartella): `firebase.cmd deploy --only hosting:cassaforte-gccodelab`
- Prima di pubblicare: test verdi, poi aumentare `APP_VERSION` e aggiungere una voce a `CHANGELOG` in `app.js`.
- Dopo: confrontare i file online con quelli locali.

## GitHub
- `origin` = repo `cassaforte` (copia di riferimento). C'è anche il remote `dominio` = repo `cassaforte-app`.
- Il workflow `.github/workflows/dominio.yml` gira solo in `cassaforte-app` e pubblica su GitHub Pages (`github.io/cassaforte-app`), **non** sul dominio, nonostante il nome. Il dominio è servito da Firebase.
- Le copie su github.io sono "indirizzi diversi": i dati salvati lì sono separati da quelli del dominio.

## Cloud Sync
- Backup cifrato salvato via REST in Firestore, raccolta `cassaforte_vaults` del progetto `gestionale-flotta-d6448`.
  L'id del documento è lo SHA-256 del Codice Cloud: il server non vede mai la password.
- Il salvataggio sul Cloud avviene **in sottofondo** (timeout 20 s) e non blocca l'app.
- Limite noto: due dispositivi con lo stesso codice si sovrascrivono il backup a vicenda (vince l'ultimo che salva).

## Attenzione
- Il database Firestore è condiviso con altre app aziendali: **non** aggiungere regole Firestore a questo `firebase.json`.
  Un `firebase deploy` completo sovrascriverebbe le regole di tutto il progetto.
- Non scrivere in questo repo (è pubblico) dettagli sulle regole di sicurezza del database.

## Sblocco con impronta (dalla v1.12)
- WebAuthn con estensione PRF: la password principale è cifrata con una chiave ricavata dal segreto del dispositivo (localStorage `bio`).
- La passkey è legata al dominio (rpId = hostname): va attivata separatamente su ogni dispositivo e su ogni indirizzo.
- Se la password principale cambia, `bio` viene cancellato (cambio password o sblocco fallito).
