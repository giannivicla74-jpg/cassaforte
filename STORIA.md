# Cassaforte · Diario del progetto

Riassunto del lavoro fatto nelle conversazioni con gli assistenti (Claude e Gemini), così la "memoria" non si perde
cambiando PC. Le chat restano solo sul PC dove sono state fatte: **questo file è la memoria condivisa**.
Il repo è pubblico: qui solo informazioni non riservate.

Come aggiornarlo: a ogni versione pubblicata aggiungere una riga in "Versioni"; decisioni importanti in "Decisioni";
problemi non ancora risolti in "Cose aperte".

---

## Cos'è
PWA "Cassaforte Password" di GC CodeLab (Giovanni Cavallo): custodisce password, carte, Wi-Fi, note e foto,
tutto cifrato sul dispositivo (AES-256). Sito: **https://cassaforte.gccodelab.it** (Firebase Hosting).
Dettagli tecnici e procedura di pubblicazione: `CLAUDE.md` / `GEMINI.md`.

## Versioni (dalla più recente)
| Data | Versione | Cosa |
|---|---|---|
| 23/11/2026 | 1.17.0 | 🪪 Scheda Documento con codice a barre del Codice Fiscale, ⏳ Radar Scadenze, 🔍 controllo "Furti online", 📊 Statistiche e Livello, 📳 Scuoti/Esc per bloccare, 📄 Kit di Emergenza (scritte da Gemini); Claude ha corretto il conteggio dei giorni di scadenza (era sfasato di 1), il bollino "Rubata" dopo il cambio password, "Scuoti" su iPhone, e aggiunto test, versione, manuale e novità |
| 23/11/2026 | 1.16.0 | 📷 Foto cifrate in ogni scheda (avviata da Gemini), poi rese leggere (~56 KB) con controllo dello spazio del backup; fix icona al ricaricamento e blocco pull-to-refresh (Gemini) |
| 20-23/11/2026 | 1.15.0 | 🎸 Chitarra e 🍃 suoni della natura (pioggia con gocce vere e tuono, mare, uccellini, foresta); corretto bug che ammutoliva l'audio |
| 20/11/2026 | 1.14.x | Schede 💳 Carta, 📶 Wi-Fi con QR, 📝 Nota; ✨ riconoscimento automatico di ~150 servizi; finestra "Tutto quello che sa fare"; messaggi chiari per gli errori del Cloud; eliminazione con avviso e Annulla (8 s, conto alla rovescia) |
| 20/11/2026 | 1.13.0 | 🎵 Musica di sottofondo generata (Ambient, Lounge, Cyber) |
| 19-20/11/2026 | 1.12.x | 👆 Sblocco con impronta/viso; 🎨 5 colori; 🎰 generatore slot machine; riflesso sulla scritta e anello di luce sullo scudo |
| 19/11/2026 | 1.10–1.11 | 💯 Pannello Salute Password; categorie con simbolo e colore; animazioni; vista a elenco; pulsanti Copia utente / Copia password |
| 19/11/2026 | 1.9.x | 👥 Più account per lo stesso servizio; pulsante giorno/notte; intestazione leggibile sul telefono; avvio veloce con segnale debole |

## Decisioni importanti (e perché)
- **Avvio con segnale debole**: il service worker aspetta la rete al massimo 3 s, poi usa la copia salvata.
- **Cloud in sottofondo**: il salvataggio sul Cloud non blocca più l'app (timeout 20 s).
- **Musica e suoni generati dall'app** (Web Audio): niente file audio scaricati → niente diritti d'autore, funziona offline.
  La pioggia è calcolata "a pezzi" per non bloccare i telefoni lenti.
- **Impronta/viso** con WebAuthn PRF: la password principale resta sempre valida. Su molti Android il viso non è
  permesso alle app (solo impronta o PIN): è una regola di Android, non un difetto.
- **Foto**: max 3 per scheda, compresse a ~56 KB. Tutta la cassaforte cifrata deve stare sotto ~1 MB (limite di un
  documento del database, vale anche con il piano a pagamento): l'app rifiuta la foto che farebbe superare il limite.
- **Furti online** (Have I Been Pwned): si invia solo l'inizio (5 caratteri) dell'impronta SHA-1 della password,
  mai la password; per questo il sito `api.pwnedpasswords.com` è permesso nella CSP (`index.html` e `firebase.json`).
- **Scuoti per bloccare**: acceso di serie, tranne su iPhone/iPad dove il sensore richiede il permesso (si attiva a mano).
- **Più account per lo stesso servizio**: schede raggruppate per nome (non un nuovo formato dati) per restare
  compatibili con backup e versioni vecchie.
- **Pubblicazione**: `firebase.json` è dentro `cassaforte-main` (spostato il 19/11 per averlo su GitHub);
  il sito principale si aggiorna solo con il deploy su Firebase, non da GitHub.
- **Due assistenti**: Claude e Gemini lavorano sullo stesso repo; le regole comuni sono in `CLAUDE.md` e `GEMINI.md`.

## Cose aperte
- Revisione delle app aziendali collegate allo stesso progetto Firebase: in programma (dettagli solo nelle note private).
- Possibile miglioramento: conservare sul Cloud anche le ultime versioni del backup (oggi si tiene solo l'ultima).
- Sul piano Firebase: il progetto del sito è sul piano gratuito (verificato il 23/11/2026); il limite di ~1 MB non dipende dal piano.

## Per chi riprende il lavoro (PC diverso, assistente diverso)
1. `git pull` in `cassaforte-main`.
2. Leggere `CLAUDE.md` (o `GEMINI.md`) e questo file.
3. Le conversazioni vecchie restano sul PC dove sono state fatte (`C:\Users\<utente>\.claude` e `.gemini`):
   si possono copiare a mano con una chiavetta, **mai su GitHub**.
