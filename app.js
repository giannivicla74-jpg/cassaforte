const $=s=>document.querySelector(s);
let key=null, salt=null, iter=0, items=[], editId=null, qId=null, shown=new Set(), lockT, clipT, clipAt=0, clipClearPending=false;
let syncHandle=null, pendingHandle=null, pendingImport=null;
let sess=0;            // cresce a ogni blocco: invalida le operazioni asincrone iniziate prima
let saveQ=Promise.resolve(); // serializza i salvataggi
let cloudQ=Promise.resolve(); // invii al Cloud in sottofondo, uno alla volta
const totpNow=new Map(); // codici 2FA del momento (id → codice), per copiarli subito
let trash=[], trashK=null, trashDirty=false; // Cestino (in chiaro solo a cassaforte aperta); trashK = chiave con cui è salvato
let extUntil=0;        // finestra in cui la pagina può andare in background (condivisione, selettore file) senza bloccarsi
/* Versione dell'app: a ogni modifica pubblicata aumenta il numero e aggiungi una voce in CHANGELOG */
const APP_VERSION='1.18.2';
const CHANGELOG=[
  ['1.18.2',[
    'L’avviso “Nuova versione” controlla più spesso: quando torni nell’app (dopo 1 minuto) e appena torna internet'
  ]],
  ['1.18.1',[
    '🌈 L’anello di luce intorno allo scudo cambia anche colore mentre gira (oro, verde, azzurro, viola, rosa)'
  ]],
  ['1.18.0',[
    '🔢 Codici 2FA a 6 cifre dentro la scheda dell’account, come Google Authenticator, con conto alla rovescia e “Copia codice”',
    '🗑️ Cestino: le schede eliminate restano 30 giorni e si possono ripristinare da Opzioni → Cestino',
    '⬆️ Avviso “Nuova versione · Aggiorna” quando esce un aggiornamento, e riquadro con le novità',
    '🎧 La mia musica: scegli fino a 5 canzoni dal telefono come musica di sottofondo'
  ]],
  ['1.17.0',[
    '🪪 Nuova scheda Documento (Carta d’Identità, Tessera Sanitaria, Patente, Passaporto) con codice a barre del Codice Fiscale da mostrare in farmacia',
    '⏳ Radar Scadenze: avvisa per carte e documenti scaduti o in scadenza entro 60 giorni',
    '🔍 Controllo “Furti online”: verifica in privacy se una password è comparsa in furti di dati (la password non esce mai dal telefono)',
    '📊 Statistiche e Livello della Cassaforte (Bronzo → Diamante) in Opzioni',
    '📳 Scuoti il telefono (o premi Esc sul PC) per bloccare subito',
    '📄 Kit di Emergenza da stampare con il QR del Codice Cloud'
  ]],
  ['1.16.0',[
    '📷 Foto cifrate in ogni scheda (fino a 3), nascoste finché non tocchi Mostra',
    'Foto compresse a circa 60 KB e controllo dello spazio: il backup sul Cloud non si riempie più per sbaglio',
    'Icona dello scudo senza difetti al ricaricamento; niente più ricarica per sbaglio tirando giù la pagina'
  ]],
  ['1.15.0',[
    'Nuovi suoni: 🎸 Chitarra e suoni della natura (🌧️ Pioggia, 🌊 Onde del mare, 🐦 Uccellini, 🌲 Foresta)'
  ]],
  ['1.14.4',[
    'Sezione “Tutto quello che sa fare” aggiornata con eliminazione sicura e avvisi del Cloud'
  ]],
  ['1.14.3',[
    'Conto alla rovescia sul pulsante “Annulla” dopo un’eliminazione'
  ]],
  ['1.14.2',[
    'Cloud Sync: messaggi chiari se manca la connessione, se il limite giornaliero è esaurito o se il Cloud è pieno',
    'Indicatore dello spazio usato sul Cloud quando supera il 50%',
    'Eliminazione più sicura: finestra di avviso con il nome della scheda e 8 secondi per annullare'
  ]],
  ['1.14.1',[
    'Nuova sezione “✨ Tutto quello che sa fare la Cassaforte” con l’elenco di tutte le funzioni'
  ]],
  ['1.14.0',[
    'Nuove schede: 💳 Carta (disegnata come una carta vera), 📶 Wi-Fi con codice QR per gli ospiti, 📝 Nota segreta',
    'Riconoscimento automatico di oltre 150 servizi: categoria e sito si compilano da soli',
    'Nuove categorie: Svago, Utenze, Viaggi, Pubblica Amm., Wi-Fi, Note'
  ]],
  ['1.13.0',[
    'Musica di sottofondo originale in 3 stili (Ambient, Lounge jazz, Cyber), con pulsante 🎵 per spegnerla'
  ]],
  ['1.12.3',[
    'Anello di luce che gira intorno allo scudo, nel colore scelto'
  ]],
  ['1.12.2',[
    'Guida: nuova sezione passo passo “Sblocco con impronta o viso”',
    'Riflesso di luce sulla scritta più intenso e più frequente'
  ]],
  ['1.12.1',[
    'Riflesso di luce animato sulla scritta “Cassaforte”, nel colore scelto'
  ]],
  ['1.12.0',[
    'Sblocco con impronta digitale o riconoscimento del viso (da attivare in Opzioni)',
    'Colore della cassaforte a scelta: Oro, Smeraldo, Rubino, Zaffiro, Ametista',
    'Generatore “slot machine”: i caratteri girano e si fermano sulla nuova password'
  ]],
  ['1.11.1',[
    'Pulsanti più chiari: “Copia utente” e “Copia password”, che diventano verdi con ✓ dopo la copia'
  ]],
  ['1.11.0',[
    'Nuova vista a elenco compatto, oltre a quella a schede (pulsante accanto a “+ Aggiungi”)'
  ]],
  ['1.10.0',[
    'Pannello Salute Password con punteggio da 0 a 100',
    'Simbolo e colore per ogni categoria (✉️ Email, 🏦 Banca, 🛒 Shopping…)',
    'Nuova schermata di apertura con animazione della cassaforte che si apre',
    'Animazioni più morbide, spunta verde e leggera vibrazione quando copi'
  ]],
  ['1.9.3',[
    'Più account per lo stesso servizio (es. due account Amazon) nella stessa scheda, con il pulsante “+ Altro account”',
    'Sul telefono la scritta “Cassaforte” torna leggibile: i pulsanti vanno sulla riga sotto'
  ]],
  ['1.9.2',[
    'Pulsante Giorno/Notte (sole e luna) nella barra in alto',
    'La password si cambia solo da “Modifica”: tolto il pulsante “Cambia” dalla scheda'
  ]],
  ['1.9.1',[
    'Avvio e salvataggio veloci anche con segnale internet debole',
    'Conferma prima di sostituire la cassaforte del dispositivo con un backup'
  ]],
  ['1.9.0',[
    'Cloud Sync Cifrato automatico (Zero-Knowledge) con Codice Cloud anti-rottura telefono',
    'Ripristino immediato dalla schermata iniziale (da Codice Cloud o file JSON su Google Drive)',
    'Avviso immediato sul banner dopo ogni modifica non ancora salvata in un backup esterno'
  ]],
  ['1.8.0',[
    'Lucchetto "Resta aperta" per sospendere temporaneamente il blocco automatico',
    'Controllo Salute Password: avviso su password riutilizzate, deboli o vecchie (>1 anno)',
    'Cronologia delle ultime 5 password precedenti per ogni account',
    'Generatore di Passphrase con parole in italiano',
    'Importazione rapida da file CSV (Chrome, Edge, Firefox, Bitwarden, Safari)',
    'Categorie personalizzate e ordinamento (A→Z, Recenti, Categoria)'
  ]],
  ['1.7.1',['Nuovo indirizzo: cassaforte.gccodelab.it (reinstalla l’app da qui e importa il backup)']],
  ['1.7.0',['Stampa archivio cartaceo con le password (protetta dalla password principale)']],
  ['1.6.0',['Tema chiaro, scuro o automatico a scelta in Opzioni']],
  ['1.5.0',['Numero di versione visibile e sezione Novità nel manuale']],
  ['1.4.0',['Nuova grafica dell’avviso di backup','Intestazione adatta agli schermi del telefono']],
  ['1.3.0',['Blocco automatico regolabile in Opzioni (inattività e cambio app)']],
  ['1.2.0',['Protezione più forte: 600.000 iterazioni PBKDF2 (backup vecchi ancora validi)','Content-Security-Policy contro codice malevolo']],
  ['1.1.0',['Import sicuro con scelta Unisci / Sostituisci','Correzioni di bug che potevano far perdere dati','Auto-sync su file ricordato dopo il riavvio']],
  ['1.0.0',['Prima versione: cassaforte cifrata, generatore, backup']]
];

const getVault=()=>{try{return JSON.parse(localStorage.getItem('vault'))}catch{return null}};
/* Porta in background la cassaforte al numero di iterazioni attuale (nuova chiave e nuovo salt) */
async function upgradeKdf(pw){
  if(iter>=ITER)return;
  const s=sess, ns=crypto.getRandomValues(new Uint8Array(16)), nk=await derive(pw,ns,ITER);
  if(s!==sess||!key)return;
  const os=salt, ok=key, oi=iter; salt=ns; key=nk; iter=ITER;
  try{await persist()}catch(e){console.warn('Aggiornamento protezione non riuscito',e);if(s===sess){salt=os;key=ok;iter=oi}}
}

/* Salvataggio: cifra e scrive in coda, così due salvataggi non si sovrappongono */
function persist(){
  const k=key, s=salt, it=iter, snapshot=[...items];
  // il Cestino si riscrive se è cambiato o se è cambiata la chiave (nuova password, ripristino)
  const trSnap=(trashDirty||k!==trashK)?[...trash]:null; trashDirty=false;
  const job=saveQ.then(async()=>{
    if(!k||!s||!it)throw new Error('Cassaforte bloccata');
    const vStr=await encryptVault(k,s,it,snapshot);
    localStorage.setItem('vault',vStr);
    if(trSnap)await saveTrash(k,trSnap);
    await syncWrite(vStr);
    // Il Cloud non blocca il salvataggio: con segnale debole l'app resterebbe ferma ad aspettare
    cloudQ=cloudQ.then(()=>cloudWrite(vStr)).catch(()=>{});
  });
  saveQ=job.catch(()=>{});
  return job;
}
/* Il Cestino non deve mai far fallire il salvataggio: se la memoria è piena perde le schede più vecchie */
async function saveTrash(k,list){
  try{
    let l=list.slice(0,TRASH_MAX);
    while(l.length){
      const str=await encryptTrash(k,l);
      if(str.length<=1500000){try{localStorage.setItem('trash',str);trashK=k;return}catch{}}
      l=l.slice(0,-1);
    }
    localStorage.removeItem('trash'); trashK=k;
  }catch(e){console.warn('Cestino non salvato',e);trashDirty=true}
}
async function loadTrash(){
  const k=key, t=await decryptTrash(k,localStorage.getItem('trash'));
  if(k!==key)return;
  if(trash.length)trashDirty=true; // eliminazioni fatte mentre il cestino si apriva
  trash=purgeTrash([...trash,...(t||[])]);
  if(t&&t.length>trash.length)trashDirty=true; // schede oltre i 30 giorni tolte
  trashK=t?k:null; // cestino di un'altra chiave: sarà sostituito al prossimo salvataggio
}
/* Applica una modifica e la salva; se il salvataggio fallisce la annulla */
async function commit(fn,msg){
  const prev=structuredClone(items), prevTrash=[...trash], prevChg=localStorage.getItem('lastChange'), s=sess;
  fn();
  localStorage.setItem('lastChange',Date.now());
  try{await persist();render();if(msg)toast(msg,true);return true}
  catch(e){
    console.error(e);
    if(s===sess){
      items=prev; trash=prevTrash; trashDirty=true;
      if(prevChg)localStorage.setItem('lastChange',prevChg);else localStorage.removeItem('lastChange');
      render();toast('Salvataggio non riuscito: modifica annullata');
    }
    else toast('Cassaforte bloccata: modifica non salvata');
    return false;
  }
}
function toast(t,ok){const e=$('#toast');e.innerHTML=(ok?'<span class="ti" aria-hidden="true">✓</span>':'')+esc(t);e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),2200)}
const buzz=ms=>{try{navigator.vibrate?.(ms)}catch{}};

function resetPwEyes(){
  document.querySelectorAll('.pw-eye[data-eye]').forEach(b=>{
    const inp=$(b.dataset.eye);
    if(inp)inp.type='password';
    if(typeof IC!=='undefined')b.innerHTML=IC.eye;
    b.setAttribute('aria-label','Mostra password');
  });
}
addEventListener('click',e=>{
  const b=e.target.closest('.pw-eye[data-eye]');
  if(!b)return;
  const inp=$(b.dataset.eye); if(!inp)return;
  const show=inp.type==='password';
  inp.type=show?'text':'password';
  b.innerHTML=show?IC.eyeoff:IC.eye;
  b.setAttribute('aria-label',show?'Nascondi password':'Mostra password');
});

/* Blocco / sblocco */
function showLock(){
  const v=getVault(), nuovo=!v;
  $('#lockMsg').textContent=nuovo?'Crea una password principale. Non si può recuperare: se la dimentichi, i dati restano illeggibili.':'Inserisci la password principale per aprire i tuoi account.';
  $('#mp2w').classList.toggle('hide',!nuovo); $('#mp2').required=nuovo;
  $('#lockBtn').textContent=nuovo?'Crea cassaforte':'Sblocca';
  $('#mp').value=$('#mp2').value=''; $('#err').textContent='';
  resetPwEyes(); updBioLock();
  $('#lock').classList.remove('hide'); $('#app').classList.add('hide');
}
function lock(){
  sess++; key=null; salt=null; iter=0; items=[]; trash=[]; trashK=null; trashDirty=false; totpNow.clear(); totpCache.clear(); shown.clear(); clearTimeout(lockT); clearTimeout(awayT);
  editId=qId=null; pendingImport=null; cat='Tutti'; extUntil=0; hiddenAt=0; keepOpen=false; updKeepUI();
  clearClip(true);
  slotStop?.(); Snd.stop(); updMusicUI();
  hideUndo(); // la copia della scheda eliminata non resta in memoria a cassaforte chiusa
  ['dlg','dlgSet','dlgQ','dlgHelp','dlgImp','dlgPrint','dlgCloud','dlgQr','dlgFeat','dlgDel','dlgPhoto','dlgBarcode','dlgTrash'].forEach(i=>{if($('#'+i).open)$('#'+i).close()});
  $('#qrBox').innerHTML=''; $('#qrPass').textContent=''; $('#cPrev').innerHTML='';
  $('#bcSvg').innerHTML=''; $('#bcCode').textContent=''; $('#expBox').classList.add('hide'); $('#expBox').innerHTML='';
  pwnedMap.clear(); $('#pwnMsg').textContent=''; $('#trList').innerHTML=''; $('#totpPrev').textContent='';
  editPhotos=[]; $('#fPhotos').innerHTML=''; $('#photoFull').removeAttribute('src');
  ['#pwForm','#fQ','#form','#impForm','#cloudForm'].forEach(f=>$(f).reset());
  $('#pErr').textContent=''; $('#impErr').textContent=''; $('#cErr').textContent=''; $('#bioPw').value=''; $('#bioErr').textContent='';
  // Nessun dato in chiaro deve restare nella pagina mentre è bloccata
  $('#list').innerHTML=''; $('#chips').innerHTML=''; $('#count').textContent=''; $('#q').value='';
  $('#bk').classList.add('hide'); $('#printArea').innerHTML=''; $('#printSheet').innerHTML=''; $('#prForm').reset();
  $('#histList').innerHTML=''; $('#histBox').classList.add('hide'); $('#fCatNew').classList.add('hide');
  showLock();
}
/* Impostazioni del blocco automatico (scelte in Opzioni; accettati solo i valori del menu) */
const IDLE_OPTS=[1,2,5,10,15,30], AWAY_OPTS=[0,30,60,300];
function lockCfg(){
  let c={};try{c=JSON.parse(localStorage.getItem('lockCfg'))||{}}catch{}
  // iPhone/iPad chiedono il permesso per il sensore di movimento: lì "Scuoti" parte spento finché non lo attivi tu
  const iOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  return{idle:IDLE_OPTS.includes(c.idle)?c.idle:2, away:AWAY_OPTS.includes(c.away)?c.away:0, shake:typeof c.shake==='boolean'?c.shake:!iOS};
}
function saveLockCfg(){
  const c={idle:+$('#sIdle').value, away:+$('#sAway').value, shake:$('#sShake').checked};
  try{localStorage.setItem('lockCfg',JSON.stringify(c))}catch{}
  return lockCfg();
}
let keepOpen=false, hiddenAt=0, awayT;
function updKeepUI(){
  const b=$('#bKeep'); if(!b)return;
  b.classList.toggle('keep-on',keepOpen);
  b.setAttribute('aria-pressed',keepOpen);
  b.title=keepOpen?'Blocco automatico sospeso (clicca per riattivarlo)':'Mantieni sbloccata (sospende il blocco automatico)';
}
function bump(){clearTimeout(lockT);if(key&&!keepOpen)lockT=setTimeout(lock,lockCfg().idle*60*1000)}
['click','keydown','touchstart'].forEach(e=>addEventListener(e,bump,{passive:true}));
const allowExternal=(ms=120000)=>{extUntil=Date.now()+ms};
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)Snd.pause(); else if(key)Snd.resume(); // niente musica con l'app in sottofondo
  if(document.hidden){
    if(!key||keepOpen)return;
    hiddenAt=Date.now();
    // tolleranza: la maggiore tra quella scelta dall'utente e quella di un'operazione in corso (condivisione, file)
    const grace=Math.max(lockCfg().away*1000, extUntil-hiddenAt);
    if(grace<=0)return lock();
    clearTimeout(awayT); awayT=setTimeout(()=>{if(document.hidden&&key&&!keepOpen)lock()},grace);
  }else{
    clearTimeout(awayT);
    // i timer in background possono essere sospesi: ricontrolla al ritorno
    if(key&&!keepOpen&&hiddenAt&&Date.now()-hiddenAt>Math.max(lockCfg().away*1000, extUntil-hiddenAt))lock();
    hiddenAt=0; extUntil=0;
  }
});
const minTxt=m=>m===1?'1 minuto':m+' minuti';
const awayTxt=s=>s===0?'subito':s<60?`dopo ${s} secondi`:`dopo ${minTxt(s/60)}`;
$('#sIdle').addEventListener('change',()=>{const c=saveLockCfg();bump();toast('Blocco dopo '+minTxt(c.idle)+' di inattività')});
$('#sAway').addEventListener('change',()=>{const c=saveLockCfg();toast('Cambiando app: blocco '+awayTxt(c.away))});
$('#sShake').addEventListener('change',async()=>{
  if($('#sShake').checked&&typeof DeviceMotionEvent!=='undefined'&&typeof DeviceMotionEvent.requestPermission==='function'){
    try{
      const r=await DeviceMotionEvent.requestPermission();
      if(r!=='granted'){$('#sShake').checked=false;toast('Permesso sensore di movimento negato')}
    }catch{}
  }
  const c=saveLockCfg();
  toast(c.shake?'Scuoti-per-bloccare attivo (o Esc su PC)':'Scuoti-per-bloccare disattivato');
});
/* Scuoti per bloccare (Shake-to-Lock) su smartphone + tasto Esc rapido su PC */
let shX=null, shY=null, shZ=null, shHits=0, shLast=0;
addEventListener('devicemotion',e=>{
  if(!key||!lockCfg().shake)return;
  const a=e.accelerationIncludingGravity||e.acceleration;
  if(!a||a.x==null)return;
  if(shX!==null){
    const d=Math.abs(a.x-shX)+Math.abs(a.y-shY)+Math.abs(a.z-shZ);
    const now=Date.now();
    if(d>24){
      shHits=(now-shLast<700)?shHits+1:1;
      shLast=now;
      if(shHits>=2){shHits=0;shX=shY=shZ=null;buzz([35,40,35]);lock();toast('Cassaforte bloccata al volo');return}
    }
  }
  shX=a.x; shY=a.y; shZ=a.z;
},{passive:true});
addEventListener('keydown',e=>{
  if(e.key!=='Escape'||!key||!lockCfg().shake)return;
  if(document.querySelector('dialog[open]'))return;
  if(document.activeElement===$('#q')&&$('#q').value)return;
  e.preventDefault(); lock(); toast('Cassaforte bloccata (Esc)');
});
// Un'altra scheda ha modificato la cassaforte: blocca per non sovrascrivere i suoi dati
addEventListener('storage',e=>{
  if(e.key!=='vault'&&e.key!==null)return;
  if(key){lock();toast('Cassaforte modificata in un’altra scheda: sbloccala di nuovo')}
  else if(!$('#mp').value)showLock();
});

$('#lockForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(musicCfg().on)Snd.prime(); // l'audio va acceso subito, dentro il tocco
  const pw=$('#mp').value, v=getVault(), btn=$('#lockBtn'); $('#err').textContent='';
  btn.disabled=true;
  try{
    if(!v){
      if(pw.length<8){$('#err').textContent='Usa almeno 8 caratteri.';return}
      if(pw!==$('#mp2').value){$('#err').textContent='Le due password non coincidono.';return}
      salt=crypto.getRandomValues(new Uint8Array(16)); key=await derive(pw,salt,ITER); iter=ITER; items=[]; trash=[]; trashK=null; setSeen();
      try{await persist()}catch(err){console.error(err);key=salt=null;iter=0;$('#err').textContent='Impossibile salvare nel browser (memoria piena o bloccata).';return}
    }else{
      let decRes;
      try{decRes=await decryptVault(pw,v)}
      catch{
        if(bioTry){
          // la password principale è cambiata (es. ripristino da backup): l'impronta non è più valida
          bioOff(); updBioLock(); $('#mp').value='';
          $('#err').textContent='La password principale è cambiata: entra con la password e riattiva l’impronta in Opzioni.';
        }else $('#err').textContent='Password errata.';
        shake($('.lockcard'));buzz([40,60,40]);return
      }
      salt=decRes.salt; key=decRes.key; iter=decRes.iter; items=decRes.items; trash=[]; trashK=null; loadTrash();
    }
    const s0=sess; await openAnim(); if(s0!==sess||!key)return;
    $('#lock').classList.add('hide'); $('#app').classList.remove('hide'); render(); enterAnim(); bump(); checkAndRequestPersistence(true); initSync(); musicPlay();
    upgradeKdf(pw);
  }finally{btn.disabled=false;bioTry=false}
});
$('#bLock').onclick=lock;
$('#bKeep').onclick=()=>{
  keepOpen=!keepOpen;
  if(keepOpen){clearTimeout(lockT);clearTimeout(awayT);hiddenAt=0}
  else bump();
  updKeepUI();
  toast(keepOpen?'Lucchetto aperto: non si chiuderà da sola':'Blocco automatico riattivato');
};

/* Elenco */
const ic=p=>`<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC={user:ic('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),key:ic('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>'),eye:ic('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),eyeoff:ic('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6A16 16 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),link:ic('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),edit:ic('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),copy:ic('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),cards:ic('<rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/>'),lines:ic('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>')};
const hue=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))%360;return h};
let cat='Tutti';
const star=f=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="${f?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>`;
function updMeter(){const r=strength($('#fPass').value);$('#mBar').style.width=r.p+'%';$('#mBar').style.background=r.c;$('#mTxt').textContent=r.t?'Robustezza: '+r.t:''}
$('#fPass').addEventListener('input',updMeter);
$('#chips').addEventListener('click',e=>{const b=e.target.closest('[data-c]');if(!b)return;cat=b.dataset.c;render()});
try{const sb=localStorage.getItem('sortBy');if(['az','recent','cat'].includes(sb))$('#sortBy').value=sb}catch{}
$('#sortBy').addEventListener('change',()=>{try{localStorage.setItem('sortBy',$('#sortBy').value)}catch{};render()});

/* Simbolo e colore di ogni categoria (le categorie personalizzate prendono un colore dal nome) */
const CAT_INFO={Email:['✉️',210],Social:['👥',275],Banca:['🏦',150],Lavoro:['💼',28],Shopping:['🛒',340],Altro:['📁',195],
  Svago:['🎬',300],Utenze:['💡',45],Viaggi:['✈️',190],'Pubblica Amm.':['🏛️',225],'Wi-Fi':['📶',170],Note:['📝',60],Documenti:['🪪',205]};
/* Tipi di scheda: nome, simbolo e categoria proposta */
const TYPE_INFO={login:{t:'account',e:'🔑',cat:'Altro'},card:{t:'carta',e:'💳',cat:'Banca'},wifi:{t:'Wi-Fi',e:'📶',cat:'Wi-Fi'},note:{t:'nota',e:'📝',cat:'Note'},doc:{t:'documento',e:'🪪',cat:'Documenti'}};
const last4=n=>digits(n).slice(-4);
const maskCard=n=>{const d=digits(n);return d?'•••• •••• •••• '+d.slice(-4):'•••• •••• •••• ••••'};
/* Carta disegnata come una carta vera; numero completo solo se "Mostra" è attivo */
function cardHtml(i,reveal){
  const b=cardBrand(i.number), hueC={VISA:222,MASTERCARD:20,AMEX:190,MAESTRO:260}[b]??catInfo(i.cat).h;
  return `<div class="ccard" style="--cc:${hueC}">
    <div class="cc-top"><span class="chip-ic"></span><span class="brand-t">${esc(b||i.name)}</span></div>
    <div class="cc-num">${esc(reveal?(fmtCard(i.number)||'—'):maskCard(i.number))}</div>
    <div class="cc-bot"><div><small>Intestatario</small>${esc(i.holder||'—')}</div><div><small>Scade</small>${esc(i.exp||'--/--')}</div></div>
  </div>`;
}
/* Sottotitolo sotto il nome, secondo il tipo */
function subOf(i){
  const t=typeOf(i);
  if(t==='card')return [cardBrand(i.number),i.number?'•••• '+last4(i.number):''].filter(Boolean).join(' ')||'Carta';
  if(t==='wifi')return 'Rete Wi-Fi'+(i.wsec==='nopass'?' aperta':'');
  if(t==='note')return 'Nota segreta';
  if(t==='doc')return [i.docType,i.number].filter(Boolean).join(' · ')||'Documento';
  return i.user;
}
const catInfo=c=>CAT_INFO[c]?{e:CAT_INFO[c][0],h:CAT_INFO[c][1]}:{e:'🏷️',h:hue(c||'Altro')};
const catTag=c=>{const k=catInfo(c);return `<span class="tag cat" style="--ch:${k.h}">${k.e} ${esc(c||'Altro')}</span>`};

/* Pannello Salute Password: percentuale di password senza problemi */
function updHealth(audit){
  const box=$('#health'), withPass=items.filter(i=>i.pass).length;
  if(!items.length||!withPass){box.classList.add('hide');return}
  const bad=audit.warnIds.size, score=Math.round(100*(withPass-bad)/withPass);
  const col=score>=80?'#2f9e6b':score>=50?'#d99a1a':'var(--bad)';
  box.style.setProperty('--hc',col);
  $('#hRing').style.strokeDashoffset=(169.6*(1-score/100)).toFixed(1);
  $('#hScore').textContent=score;
  $('#hStatus').textContent=score===100?'Ottima! 🎉':score>=80?'Buona':score>=50?'Da migliorare':'A rischio';
  const parts=[[audit.weakIds.size,'debol','e','i'],[audit.dupIds.size,'riutilizzat','a','e'],[audit.oldIds.size,'vecchi','a','e']]
    .filter(p=>p[0]).map(([n,s,one,many])=>`${n} ${s}${n===1?one:many}`);
  $('#hDet').textContent=bad?`${bad===1?'1 password da migliorare':bad+' password da migliorare'}: ${parts.join(' · ')}`:`Tutte le ${withPass} password sono a posto`;
  $('#hGo').classList.toggle('hide',!bad||cat==='!warn');
  box.classList.remove('hide');
}
$('#hGo').onclick=()=>{cat='!warn';render();$('#chips').scrollIntoView({behavior:'smooth',block:'start'})};

/* Controllo Data Breach (Have I Been Pwned k-Anonymity: la password non esce mai dal dispositivo) */
const pwnedMap=new Map();
$('#hPwn').onclick=async()=>{
  const list=items.filter(i=>i.pass), btn=$('#hPwn'), s=sess;
  if(!list.length){toast('Nessuna password da controllare');return}
  btn.disabled=true; const oldTxt=btn.textContent; btn.textContent='⏳ Controllo…';
  const cache=new Map(); let found=0;
  try{
    pwnedMap.clear();
    for(const it of list){
      if(s!==sess||!key)return;
      const n=await checkPwnedPassword(it.pass,cache);
      if(n>0){pwnedMap.set(it.id,n);found++}
    }
    if(s!==sess||!key)return;
    render();
    if(found)toast(`🚨 ${found===1?'1 password trovata':found+' password trovate'} in furti di dati online!`);
    else toast('✅ Ottimo! Nessuna password comparsa in furti online',true);
  }catch(e){
    console.warn('HIBP',e);
    toast('Controllo non riuscito (verifica la connessione Internet)');
  }finally{btn.disabled=false;btn.textContent=oldTxt}
};
$('#bPwnOne').onclick=async()=>{
  const pw=$('#fPass').value, msg=$('#pwnMsg'), btn=$('#bPwnOne');
  if(!pw){msg.textContent='Inserisci prima una password.';msg.style.color='var(--mute)';return}
  btn.disabled=true; msg.textContent='Controllo in privacy (k-Anonymity)…'; msg.style.color='var(--mute)';
  try{
    const n=await checkPwnedPassword(pw);
    if(n>0){
      msg.innerHTML=`<span class="badge-no">🚨 Trovata in ${n.toLocaleString('it-IT')} furti di dati online! Cambiala subito.</span>`;
    }else{
      msg.innerHTML='<span class="badge-ok">✓ Sicura: mai comparsa nei furti di dati noti.</span>';
    }
  }catch{
    msg.textContent='Impossibile verificare (serve connessione Internet).'; msg.style.color='var(--mute)';
  }finally{btn.disabled=false}
};

/* Radar Scadenze: avvisa su Carte e Documenti scaduti o in scadenza entro 60 giorni */
function updExpiry(){
  const box=$('#expBox'), list=expiringItems(items,Date.now(),60);
  if(!list.length){box.classList.add('hide');box.innerHTML='';return}
  const hasUrgent=list.some(x=>x.expired||x.days<=15);
  box.classList.toggle('urgent',hasUrgent);
  box.innerHTML=`<div class="exp-h">⏳ Radar Scadenze (${list.length})</div>`+list.map(x=>{
    const icn=TYPE_INFO[typeOf(x.item)]?.e||'📄';
    return `<div class="exp-row"><span>${icn} <b>${esc(x.item.name)}</b> · <span class="${x.expired||x.days<=15?'exp-bad':'mute'}">${esc(x.label)}</span></span><button type="button" class="btn s" data-exp-id="${esc(x.item.id)}">Apri</button></div>`;
  }).join('');
  box.classList.remove('hide');
}
$('#expBox').addEventListener('click',e=>{
  const b=e.target.closest('button[data-exp-id]'); if(!b)return;
  const it=items.find(x=>x.id===b.dataset.expId);
  if(it)openForm(it);
});

/* Animazioni: apertura della cassaforte e comparsa delle schede */
const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function openAnim(){
  if(calm())return;
  $('#lock').classList.add('opening');
  await pause(580);
  $('#lock').classList.remove('opening');
}
function enterAnim(){
  if(calm())return;
  const l=$('#list'),a=$('#app');
  l.classList.add('anim');a.classList.add('anim');
  clearTimeout(enterAnim.t);enterAnim.t=setTimeout(()=>{l.classList.remove('anim');a.classList.remove('anim')},1000);
}
function shake(el){el.classList.remove('shake');void el.offsetWidth;el.classList.add('shake');el.addEventListener('animationend',()=>el.classList.remove('shake'),{once:true})}

/* Vista: schede (predefinita) oppure elenco compatto; la scelta resta salvata */
const getView=()=>{try{return localStorage.getItem('view')==='list'?'list':'cards'}catch{return'cards'}};
function updViewUI(){
  const l=getView()==='list';
  $('#bView').innerHTML=l?IC.cards:IC.lines;
  $('#bView').title=l?'Mostra a schede':'Mostra a elenco';
  $('#bView').setAttribute('aria-label',$('#bView').title);
}
$('#bView').onclick=()=>{
  const next=getView()==='list'?'cards':'list';
  try{localStorage.setItem('view',next)}catch{}
  updViewUI();render();enterAnim();
  toast(next==='list'?'Vista a elenco':'Vista a schede');
};
updViewUI();

function allKnownCats(){
  return [...new Set([...CATS,...items.map(i=>i.cat||'Altro')])];
}
function render(){
  queueMicrotask(tickTotp); // i codici 2FA compaiono subito, senza aspettare il secondo successivo
  if(!key)return;
  const audit=auditItems(items);
  const inCat=i=>cat==='Tutti'||(cat==='★'?i.fav:cat==='!warn'?audit.warnIds.has(i.id):(i.cat||'Altro')===cat);
  if(!items.some(inCat))cat='Tutti';
  updBackup();
  const q=$('#q').value;
  $('#count').textContent=items.length===1?'1 account':items.length+' account';
  const usedCats=allKnownCats().filter(c=>items.some(i=>(i.cat||'Altro')===c));
  const chips=[
    'Tutti',
    ...(items.some(i=>i.fav)?['★']:[]),
    ...(audit.warnIds.size?['!warn']:[]),
    ...usedCats
  ];
  $('#chips').innerHTML=items.length?chips.map(c=>{
    const lbl=c==='★'?'★ Preferiti':c==='!warn'?`⚠️ Da controllare (${audit.warnIds.size})`:c==='Tutti'?'Tutti':`<span class="ce">${catInfo(c).e}</span>${esc(c)}`;
    const cls=`chip${c==='!warn'?' warn-chip':''}${c===cat?' on':''}`;
    return `<button class="${cls}" data-c="${esc(c)}">${lbl}</button>`;
  }).join(''):'';
  updHealth(audit);
  updExpiry();
  updNews();
  const rows=filterItems(items,cat,q,$('#sortBy').value,audit.warnIds);
  // Account con lo stesso nome di servizio (es. due account Amazon) stanno nella stessa scheda
  const groups=new Map();
  for(const i of rows){const k=typeOf(i)+'|'+i.name.trim().toLowerCase();if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i)}
  const expTag=i=>{const ex=expiryInfo(i);return ex&&ex.days<=60?`<span class="tag w">⏳ ${esc(ex.label)}</span>`:''};
  const pwnTag=i=>{const n=pwnedMap.get(i.id);return n?`<span class="tag w">🚨 Rubata (${n.toLocaleString('it-IT')}×)</span>`:''};
  const warnTags=i=>[
    pwnTag(i),
    audit.weakIds.has(i.id)?'<span class="tag w">Password debole</span>':'',
    audit.dupIds.has(i.id)?'<span class="tag w">Password riutilizzata</span>':'',
    audit.oldIds.has(i.id)?'<span class="tag w">Oltre 1 anno</span>':'',
    expTag(i)
  ].join('');
  const showBtn=i=>`<button class="btn s" data-a="sh">${shown.has(i.id)?IC.eyeoff+'Nascondi':IC.eye+'Mostra'}</button>`;
  const editBtn=`<button class="btn s" data-a="ed">${IC.edit}Modifica</button>`;
  const noteHtml=i=>i.note?`<div class="note">${esc(i.note)}</div>`:'';
  const photosHtml=(i,open)=>{
    const ph=Array.isArray(i.photos)?i.photos:[];
    if(!ph.length)return '';
    return open
      ?`<div class="ph-grid">${ph.map((src,idx)=>`<div class="ph-th"><img src="${src}" alt="Foto ${idx+1}" data-a="ph" data-idx="${idx}"></div>`).join('')}</div>`
      :`<div class="ph-hint">📷 ${ph.length} foto allegat${ph.length===1?'a':'e'} (premi Mostra)</div>`;
  };
  const accBody=i=>{
    const t=typeOf(i), open=shown.has(i.id);
    if(t==='card')return `${cardHtml(i,open)}
      ${open&&(i.cvv||i.pin)?`<div class="secrets">${i.cvv?`<div class="sv"><small>CVV</small>${esc(i.cvv)}</div>`:''}${i.pin?`<div class="sv"><small>PIN</small>${esc(i.pin)}</div>`:''}</div>`:''}
      ${photosHtml(i,open)}
      ${noteHtml(i)}
      <div class="acts">
        <button class="btn s" data-a="cn"${digits(i.number)?'':' disabled'}>${IC.copy}Copia numero</button>
        ${i.cvv?`<button class="btn s" data-a="cv">${IC.key}Copia CVV</button>`:''}
        ${showBtn(i)}${editBtn}
      </div>`;
    if(t==='doc'){
      const fmtDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')?d.split('-').reverse().join('/'):(d||'—');
      const mask=v=>v?(open?esc(v):'••••••••'):'—';
      const cfClean=String(i.cf||'').trim().toUpperCase();
      return `<div class="doc-grid">
        ${i.docType?`<div><small>Tipo</small><b>${esc(i.docType)}</b></div>`:''}
        ${i.number?`<div><small>Numero</small><b>${mask(i.number)}</b></div>`:''}
        ${cfClean?`<div><small>Codice Fiscale</small><b>${mask(cfClean)}</b></div>`:''}
        ${i.issuer?`<div><small>Rilasciato da</small><b>${esc(i.issuer)}</b></div>`:''}
        ${i.issued?`<div><small>Rilascio</small><b>${esc(fmtDate(i.issued))}</b></div>`:''}
        ${i.exp?`<div><small>Scadenza</small><b>${esc(fmtDate(i.exp))}</b></div>`:''}
      </div>
      ${open&&cfClean?`<div class="bc-card">${code39Svg(cfClean)}<div class="bc-txt">${esc(cfClean)}</div></div>`:''}
      ${photosHtml(i,open)}
      ${noteHtml(i)}
      <div class="acts">
        ${cfClean?`<button class="btn s" data-a="bc">🏥 Codice a barre CF</button><button class="btn s" data-a="cf">${IC.copy}Copia CF</button>`:''}
        ${i.number?`<button class="btn s" data-a="cn">${IC.copy}Copia numero</button>`:''}
        ${showBtn(i)}${editBtn}
      </div>`;
    }
    if(t==='note'){
      const hasPh=Array.isArray(i.photos)&&i.photos.length>0;
      return `<div class="secretbox">${i.secret?(open?esc(i.secret):'•••••••• testo nascosto ••••••••'):(hasPh?'<i>solo foto allegate</i>':'<i>vuota</i>')}</div>
      ${photosHtml(i,open)}
      ${noteHtml(i)}
      <div class="acts">
        <button class="btn s" data-a="cs"${i.secret?'':' disabled'}>${IC.copy}Copia testo</button>
        ${showBtn(i)}${editBtn}
      </div>`;
    }
    return `
      ${i.pass?`<div class="pwbox"><span>${open?esc(i.pass):'••••••••••'}</span></div>`:`<div class="pwbox none"><span>${t==='wifi'?'Rete senza password':'Nessuna password salvata'}</span></div>`}
      ${t==='login'&&i.totp?totpHtml(i):''}
      ${photosHtml(i,open)}
      ${noteHtml(i)}
      <div class="acts">
        ${t==='wifi'
          ?`<button class="btn s" data-a="qr">▦ Codice QR</button>`
          :`<button class="btn s" data-a="cu">${IC.user}Copia utente</button>`}
        <button class="btn s" data-a="cp"${i.pass?'':' disabled'}>${IC.key}Copia password</button>
        ${showBtn(i)}${editBtn}
      </div>`;
  };
  const asList=getView()==='list';
  $('#list').classList.toggle('lines',asList);
  // Vista a elenco: una riga compatta per account, con i pulsanti rapidi
  if(asList&&rows.length){
    $('#list').innerHTML=[...groups.values()].flat().map(x=>{
      const ci=catInfo(x.cat), warn=audit.warnIds.has(x.id), t=typeOf(x), nm=esc(x.name);
      const ib=(a,title,icon,dis)=>`<button class="btn s ic" data-a="${a}" title="${title}" aria-label="${title}: ${nm}"${dis?' disabled':''}>${icon}</button>`;
      const btns=t==='card'?ib('cn','Copia numero',IC.copy,!digits(x.number))+(x.cvv?ib('cv','Copia CVV',IC.key):'')
        :t==='doc'?(x.cf?ib('bc','Codice a barre CF','🏥'):'')+(x.number?ib('cn','Copia numero',IC.copy):'')
        :t==='note'?ib('cs','Copia testo',IC.copy,!x.secret)
        :t==='wifi'?ib('qr','Codice QR','▦')+ib('cp','Copia password',IC.key,!x.pass)
        :ib('cu','Copia utente',IC.user)+ib('cp','Copia password',IC.key,!x.pass)+(x.totp?ib('ct','Copia codice 2FA','🔢'):'');
      return`
    <li class="ln" data-id="${esc(x.id)}" data-ids="${esc(x.id)}">
      <div class="av sm" style="--h:${ci.h}">${esc(x.name.trim().charAt(0).toUpperCase())}<span class="ae" aria-hidden="true">${t==='login'?ci.e:TYPE_INFO[t].e}</span></div>
      <div class="ln-t"><div class="ln-n">${x.fav?'<span class="ln-f" aria-label="Preferito">★</span>':''}${nm}${warn?' <span class="ln-w" title="Password da controllare">⚠️</span>':''}</div><div class="u">${esc(subOf(x))||'<i>senza utente</i>'}</div></div>
      <div class="ln-a">${btns}${ib('ed','Modifica',IC.edit)}</div>
    </li>`}).join('');
    return;
  }
  $('#list').innerHTML=rows.length?[...groups.values()].map(g=>{
    const i=g[0], multi=g.length>1, fav=g.some(x=>x.fav), t=typeOf(i);
    const href=t==='login'?safeUrl(g.find(x=>safeUrl(x.url))?.url||''):'';
    const head=`${catTag(i.cat)}${multi?`<span class="tag">${g.length} ${t==='login'?'account':'schede'}</span>`:warnTags(i)}`, ci=catInfo(i.cat);
    return`
    <li class="it" data-id="${esc(i.id)}" data-ids="${esc(g.map(x=>x.id).join(','))}">
      <div class="top">
        <div class="av" style="--h:${ci.h}">${esc(i.name.trim().charAt(0).toUpperCase())}<span class="ae" aria-hidden="true">${t==='login'?ci.e:TYPE_INFO[t].e}</span></div>
        <div class="meta"><h2>${esc(i.name)}${head}</h2>${multi?'':`<div class="u">${esc(subOf(i))}</div>`}</div>
        <button class="star${fav?' on':''}" data-a="fv" aria-label="${fav?'Rimuovi dai preferiti':'Aggiungi ai preferiti'}">${star(fav)}</button>
      </div>
      ${multi?g.map(x=>`<div class="acc" data-id="${esc(x.id)}"><div class="u acc-u">${t==='login'?IC.user:TYPE_INFO[t].e}<span>${esc(subOf(x))||'<i>senza utente</i>'}</span>${warnTags(x)}</div>${accBody(x)}</div>`).join(''):`<div data-id="${esc(i.id)}">${accBody(i)}</div>`}
      ${t==='login'?`<div class="acts grp">
        <button class="btn s" data-a="ad">+ Altro account</button>
        ${href?`<a class="btn s" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${IC.link}Sito</a>`:''}
      </div>`:''}
    </li>`}).join(''):`<li class="empty mute"><div class="mark" style="width:56px;height:56px;border-radius:18px"><img src="icon-192.png" alt="Cassaforte"></div>${items.length?'Nessun account corrisponde.':'Non hai ancora salvato nulla.<br>Premi <b>+ Aggiungi</b> per inserire il primo account.'}</li>`;
}
$('#q').addEventListener('input',render);

/* Appunti: svuotati dopo 30 s. Il browser permette di scrivere negli appunti solo con la pagina in primo piano,
   quindi se in quel momento sei in un'altra app li svuotiamo appena torni (o al blocco manuale). */
async function copy(t,m){
  try{await navigator.clipboard.writeText(t);toast(m,true);buzz(25);clipAt=Date.now();clipClearPending=false;clearTimeout(clipT);clipT=setTimeout(()=>clearClip(),30000);return true}
  catch{toast('Copia non riuscita');return false}
}
/* Il pulsante di copia diventa verde con ✓ per un attimo, così si vede che ha funzionato */
function copiedFx(b){
  if(b.classList.contains('done'))return;
  const old=b.innerHTML, small=b.classList.contains('ic');
  b.classList.add('done');b.innerHTML=small?'✓':'✓ Copiato';
  setTimeout(()=>{if(b.isConnected){b.classList.remove('done');b.innerHTML=old}},1600);
}
function clearClip(force){
  if(!clipAt)return;
  if(force){clipClearPending=true;clearTimeout(clipT)}
  if((!force&&!clipClearPending&&Date.now()-clipAt<30000)||!document.hasFocus())return;
  navigator.clipboard.writeText('').then(()=>{clipAt=0;clipClearPending=false;clearTimeout(clipT)}).catch(()=>{});
}
addEventListener('focus',()=>clearClip());

$('#list').addEventListener('click',e=>{
  const b=e.target.closest('button[data-a],img[data-a]'); if(!b)return;
  const li=b.closest('li'), a=b.dataset.a;
  const id=(b.closest('[data-id]')||li).dataset.id, it=items.find(x=>x.id===id); if(!it)return;
  if(a==='ph'){const src=it.photos?.[+b.dataset.idx];if(src)openPhoto(src);return}
  if(a==='fv'||a==='ad'){
    const ids=new Set((li.dataset.ids||id).split(',')), g=items.filter(x=>ids.has(x.id));
    if(a==='fv'){const on=!g.some(x=>x.fav);commit(()=>{g.forEach(x=>{x.fav=on})})}
    else openForm(null,{name:it.name,url:it.url,cat:it.cat});
    return;
  }
  if(a==='cu')copy(it.user,'Utente copiato').then(ok=>{if(ok)copiedFx(b)});
  if(a==='cp')copy(it.pass,typeOf(it)==='wifi'?'Password del Wi-Fi copiata':'Password copiata: incollala nel sito').then(ok=>{if(ok)copiedFx(b)});
  if(a==='cn')copy(typeOf(it)==='card'?digits(it.number):it.number,'Numero copiato').then(ok=>{if(ok)copiedFx(b)});
  if(a==='cv')copy(it.cvv,'CVV copiato').then(ok=>{if(ok)copiedFx(b)});
  if(a==='cf')copy((it.cf||'').toUpperCase(),'Codice Fiscale copiato').then(ok=>{if(ok)copiedFx(b)});
  if(a==='bc')openBarcode(it);
  if(a==='ct'){const c=totpNow.get(it.id);if(c)copy(c,'Codice 2FA copiato: incollalo nel sito').then(ok=>{if(ok)copiedFx(b)});else toast('Codice non ancora pronto, riprova')}
  if(a==='cs')copy(it.secret,'Testo copiato').then(ok=>{if(ok)copiedFx(b)});
  if(a==='qr')openQr(it);
  if(a==='sh'){shown.has(id)?shown.delete(id):shown.add(id);render()}
  if(a==='ed')openForm(it);
  if(a==='fv')commit(()=>{it.fav=!it.fav});
  if(a==='qp')openQuick(it);
});

/* Modulo */
function populateCatSelect(selected='Altro'){
  const cats=allKnownCats();
  if(selected&&!cats.includes(selected))cats.push(selected);
  $('#fCat').innerHTML=cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')+'<option value="__new__">+ Nuova categoria...</option>';
  $('#fCat').value=selected||'Altro';
  $('#fCatNew').value='';
  $('#fCatNew').classList.add('hide');
}
$('#fCat').addEventListener('change',()=>{
  const isNew=$('#fCat').value==='__new__';
  $('#fCatNew').classList.toggle('hide',!isNew);
  if(isNew)$('#fCatNew').focus();
});
$('#histList').addEventListener('click',e=>{
  const b=e.target.closest('button[data-hp]');
  if(b)copy(b.dataset.hp,'Vecchia password copiata (si cancella tra 30 s)');
});

/* Foto allegate alle note segrete (ridimensionate e compresse in locale, poi cifrate nella cassaforte) */
let editPhotos=[];
function openPhoto(src){$('#photoFull').src=src;$('#dlgPhoto').showModal()}
$('#photoClose').onclick=()=>$('#dlgPhoto').close();
$('#dlgPhoto').addEventListener('close',()=>{$('#photoFull').removeAttribute('src')});
/* Spazio: le foto pesano molto. Stima di quanto occuperà la cassaforte salvata (la cifratura la fa crescere di ~1/3)
   e confronto con il limite del backup sul Cloud (~1 MB) o, senza Cloud, con la memoria del browser (~5 MB). */
const PHOTO_TARGET=82000;            // ~60 KB per foto: documenti e tessere restano ben leggibili
const LOCAL_MAX=4500000;             // margine prudente sotto il limite della memoria del browser
const sumLen=a=>(a||[]).reduce((s,x)=>s+x.length,0);
function spaceInfo(extra=0){
  const saved=editId?sumLen(items.find(x=>x.id===editId)?.photos):0;
  const proj=(localStorage.getItem('vault')||'').length+Math.ceil((sumLen(editPhotos)-saved+extra)*1.36);
  const cloud=!!getCloudCode(), max=cloud?CLOUD_MAX*.97:LOCAL_MAX;
  return {proj,max,cloud,pct:Math.round(100*proj/(cloud?CLOUD_MAX:LOCAL_MAX))};
}
function renderEditPhotos(){
  $('#fPhotos').innerHTML=editPhotos.map((src,idx)=>`<div class="ph-th"><img src="${src}" alt="Foto ${idx+1}" data-pv="${idx}"><button type="button" class="ph-rm" data-rm="${idx}" aria-label="Rimuovi foto">✕</button></div>`).join('');
  $('#bAddPhoto').disabled=editPhotos.length>=MAX_PHOTOS;
  $('#bAddPhoto').textContent=editPhotos.length>=MAX_PHOTOS?'📷 Massimo 3 foto':'📷 Allega foto';
  const s=spaceInfo(), info=$('#fPhotoInfo');
  info.textContent=`Spazio ${s.cloud?'backup sul Cloud':'nella memoria'} usato: ${Math.min(s.pct,999)}%`+(s.pct>=80?' · quasi pieno: allega solo le foto indispensabili':'');
  info.style.color=s.pct>=100?'var(--bad)':s.pct>=80?'#d99a1a':'var(--mute)';
}
function compressPhoto(file){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      // prova dimensioni e qualità decrescenti finché la foto sta sotto ~60 KB
      let out='';
      for(const max of [1100,900,760,640,520]){
        const scale=Math.min(1,max/Math.max(img.width,img.height));
        const w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
        const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
        const g=cv.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,w,h); g.drawImage(img,0,0,w,h); // sfondo bianco per le immagini trasparenti
        for(const q of [.68,.58,.48,.4]){out=cv.toDataURL('image/jpeg',q);if(out.length<=PHOTO_TARGET)return res(out)}
      }
      res(out);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('Immagine non valida'))};
    img.src=url;
  });
}
$('#bAddPhoto').onclick=()=>{allowExternal();$('#fPhotoInp').click()};
$('#fPhotoInp').addEventListener('cancel',()=>{extUntil=0});
$('#fPhotoInp').addEventListener('change',async e=>{
  extUntil=0;
  const files=[...(e.target.files||[])]; e.target.value='';
  if(!files.length)return;
  const slots=MAX_PHOTOS-editPhotos.length;
  if(slots<=0){toast('Puoi allegare al massimo 3 foto per nota');return}
  let added=0, full=false;
  for(const f of files.slice(0,slots)){
    if(!f.type.startsWith('image/'))continue;
    let p; try{p=await compressPhoto(f)}catch{toast('Impossibile leggere una delle foto');continue}
    // controllo dello spazio PRIMA di aggiungerla: meglio una foto in meno che un backup che si ferma
    if(spaceInfo(p.length).proj>spaceInfo().max){full=true;break}
    editPhotos.push(p);added++;
  }
  if(added||full)renderEditPhotos();
  if(full){
    const c=!!getCloudCode();
    $('#fPhotoInfo').textContent=c
      ?'📦 Spazio esaurito: con questa foto il backup sul Cloud supererebbe il limite (circa 1 MB) e smetterebbe di salvare. Togli qualche foto da altre schede.'
      :'📦 Spazio esaurito: con questa foto la memoria del browser non basterebbe. Togli qualche foto da altre schede.';
    $('#fPhotoInfo').style.color='var(--bad)';
    toast(added?`${added} foto allegate, le altre non ci stanno`:'Foto non allegata: spazio esaurito');
  }else if(added)toast(added===1?'Foto allegata (verrà cifrata al salvataggio)':`${added} foto allegate`,true);
});
$('#fPhotos').addEventListener('click',e=>{
  const rm=e.target.closest('button[data-rm]');
  if(rm){editPhotos.splice(+rm.dataset.rm,1);renderEditPhotos();return}
  const pv=e.target.closest('img[data-pv]');
  if(pv&&editPhotos[+pv.dataset.pv])openPhoto(editPhotos[+pv.dataset.pv]);
});
/* Codice QR del Wi-Fi: lo inquadra la fotocamera dell'ospite e si collega senza scrivere la password */
if(window.qrcode&&qrcode.stringToBytesFuncs?.['UTF-8'])qrcode.stringToBytes=qrcode.stringToBytesFuncs['UTF-8'];
function openQr(it){
  if(!window.qrcode){toast('Codice QR non disponibile');return}
  try{
    const q=qrcode(0,'M'); q.addData(wifiQr(it.name,it.pass,it.wsec,it.whidden)); q.make();
    $('#qrBox').innerHTML=q.createSvgTag({cellSize:6,margin:2,scalable:true});
  }catch(e){console.warn('QR',e);toast('Impossibile creare il codice QR');return}
  $('#qrSsid').textContent='📶 '+it.name;
  $('#qrPass').textContent=it.wsec==='nopass'?'Rete aperta, senza password':'Password: '+it.pass;
  $('#dlgQr').showModal();
}
const closeQr=()=>{$('#qrBox').innerHTML='';$('#qrPass').textContent='';if($('#dlgQr').open)$('#dlgQr').close()};
$('#qrClose').onclick=closeQr;
$('#dlgQr').addEventListener('close',()=>{$('#qrBox').innerHTML='';$('#qrPass').textContent=''});

/* Codice a barre Code 39 del Codice Fiscale (per scanner in farmacia / medico) */
function openBarcode(it){
  const cf=String(it?.cf||'').trim().toUpperCase();
  if(!cf){toast('Nessun Codice Fiscale salvato');return}
  $('#bcSvg').innerHTML=code39Svg(cf);
  $('#bcCode').textContent=cf;
  $('#bcOwner').textContent=[it.docType,it.name].filter(Boolean).join(' · ');
  $('#dlgBarcode').showModal();
}
$('#bcClose').onclick=()=>$('#dlgBarcode').close();
$('#dlgBarcode').addEventListener('close',()=>{$('#bcSvg').innerHTML='';$('#bcCode').textContent=''});

/* Codici 2FA: la scheda mostra il codice a 6 cifre del momento, aggiornato ogni secondo */
const totpStore=v=>{const c=parseTotp(v);return c?(/^otpauth:/i.test(v.trim())?v.trim():c.secret):''};
const fmtCode=c=>c.length===6?c.slice(0,3)+' '+c.slice(3):c.length===8?c.slice(0,4)+' '+c.slice(4):c;
const totpHtml=i=>`<div class="totp" data-totp="${esc(i.id)}">
  <span class="totp-l">🔢 Codice 2FA</span><b class="totp-c">··· ···</b>
  <span class="totp-r" aria-hidden="true"><i></i></span><span class="totp-s"></span>
  <button class="btn s" data-a="ct">${IC.copy}Copia codice</button></div>`;
const totpCache=new Map(); // id|periodo → codice (si ricalcola solo quando cambia)
let totpBusy=false;
async function tickTotp(){
  if(!key||totpBusy||document.hidden)return;
  const els=[...document.querySelectorAll('[data-totp]')];
  const ids=new Set(els.map(e=>e.dataset.totp));
  if(getView()==='list')items.forEach(i=>{if(i.totp)ids.add(i.id)}); // nella vista a elenco si copia senza vedere il codice
  if(!ids.size)return;
  totpBusy=true; const s=sess, now=Date.now();
  try{
    for(const id of ids){
      const it=items.find(x=>x.id===id), cfg=parseTotp(it?.totp); if(!cfg)continue;
      const ck=id+'|'+Math.floor(now/1000/cfg.period);
      let code=totpCache.get(ck);
      if(!code){code=await totpCode(cfg,now);if(s!==sess)return;totpCache.set(ck,code)}
      totpNow.set(id,code);
      const left=totpLeft(cfg,now);
      for(const el of els.filter(e=>e.dataset.totp===id)){
        el.querySelector('.totp-c').textContent=fmtCode(code);
        el.querySelector('.totp-s').textContent=left+' s';
        el.querySelector('.totp-r i').style.width=(100*left/cfg.period)+'%';
        el.classList.toggle('end',left<=5);
      }
    }
    if(totpCache.size>200)totpCache.clear();
  }catch(e){console.warn('2FA',e)}
  finally{totpBusy=false}
}
setInterval(tickTotp,1000);
/* Anteprima nel modulo: dice subito se la chiave è giusta e mostra il codice */
async function updTotpPrev(){
  const v=$('#fTotp').value.trim(), out=$('#totpPrev');
  if(!v){out.textContent='';out.className='small';return}
  const cfg=parseTotp(v);
  if(!cfg){out.textContent='Chiave non valida: copia tutto il codice che ti dà il sito (solo lettere A-Z e numeri 2-7).';out.className='small bad-t';return}
  try{
    const c=await totpCode(cfg);
    if($('#fTotp').value.trim()!==v)return;
    out.textContent=`✓ Chiave valida${cfg.issuer?' ('+cfg.issuer+')':''}: il codice adesso è ${fmtCode(c)}. Scrivilo nel sito per confermare.`;out.className='small ok-t';
  }catch{out.textContent='Questo dispositivo non riesce a calcolare il codice.';out.className='small bad-t'}
}
$('#fTotp').addEventListener('input',updTotpPrev);
/* Lettura del QR del sito da una foto (dove il telefono lo permette: Chrome su Android) */
const canScan='BarcodeDetector' in window;
$('#bTotpScan').classList.toggle('hide',!canScan);
$('#bTotpScan').onclick=()=>{allowExternal();$('#fTotpImg').value='';$('#fTotpImg').click()};
$('#fTotpImg').addEventListener('change',async e=>{
  const f=e.target.files?.[0]; if(!f)return;
  try{
    const bmp=await createImageBitmap(f);
    const codes=await new BarcodeDetector({formats:['qr_code']}).detect(bmp);
    bmp.close?.();
    const raw=codes.map(c=>c.rawValue).find(v=>/^otpauth:\/\/totp\//i.test(v||''));
    if(!raw){toast('Nella foto non trovo il QR della verifica in due passaggi');return}
    $('#fTotp').value=raw; updTotpPrev(); toast('QR letto',true);
  }catch(x){console.warn(x);toast('Impossibile leggere il QR: incolla la chiave a mano')}
  finally{e.target.value=''}
});

/* Tipo della scheda nel modulo: mostra solo i campi giusti */
let fType='login', catAuto=true, urlAuto=false;
const NAME_L={login:['Servizio','es. Netflix'],card:['Nome della carta','es. Visa Intesa'],wifi:['Nome della rete (SSID)','es. Casa Rossi'],note:['Titolo','es. Codici antifurto'],doc:['Nome del documento','es. Carta d’Identità Mario']};
function setFormType(t,isNew){
  fType=TYPES.includes(t)?t:'login';
  document.querySelectorAll('#fTypeSel [data-ty]').forEach(b=>{const on=b.dataset.ty===fType;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
  document.querySelectorAll('#form [data-for]').forEach(el=>el.classList.toggle('hide',!el.dataset.for.split(' ').includes(fType)));
  $('#fNameL').textContent=NAME_L[fType][0]; $('#fName').placeholder=NAME_L[fType][1];
  $('#fPassL').textContent=fType==='wifi'?'Password del Wi-Fi':'Password';
  if(!editId)$('#dlgT').textContent={login:'Nuovo account',card:'Nuova carta',wifi:'Nuova rete Wi-Fi',note:'Nuova nota segreta',doc:'Nuovo documento'}[fType];
  if(isNew&&catAuto)populateCatSelect(TYPE_INFO[fType].cat);
  $('#fHint').classList.add('hide');
  if(fType==='login'&&!editId)recognizeName();
  updCardPrev();
}
$('#fTypeSel').addEventListener('click',e=>{const b=e.target.closest('[data-ty]');if(b)setFormType(b.dataset.ty,!editId)});
/* Anteprima della carta mentre la scrivi, con circuito e controllo del numero */
function updCardPrev(){
  if(fType!=='card')return;
  const n=$('#fNumber').value, d=digits(n), b=cardBrand(d);
  $('#cPrev').innerHTML=cardHtml({name:$('#fName').value||'Carta',number:n,holder:$('#fHolder').value.toUpperCase(),exp:$('#fExp').value,cat:'Banca'},true);
  const info=$('#fNumInfo');
  if(d.length<12){info.textContent=b?b:'';info.style.color='var(--mute)'}
  else if(luhnOk(d)){info.textContent=(b?b+' · ':'')+'numero valido ✓';info.style.color='#2f9e6b'}
  else{info.textContent='⚠️ Controlla il numero: una cifra potrebbe essere sbagliata';info.style.color='var(--bad)'}
}
$('#fNumber').addEventListener('input',e=>{const el=e.target,end=el.selectionStart===el.value.length;el.value=fmtCard(el.value);if(end)el.selectionStart=el.selectionEnd=el.value.length;updCardPrev()});
$('#fExp').addEventListener('input',e=>{let d=digits(e.target.value).slice(0,4);if(d.length>=3)d=d.slice(0,2)+'/'+d.slice(2);e.target.value=d;updCardPrev()});
['#fHolder','#fName'].forEach(s=>$(s).addEventListener('input',updCardPrev));
['#fCvv','#fPin'].forEach(s=>$(s).addEventListener('input',e=>{e.target.value=digits(e.target.value)}));
/* Riconoscimento automatico: scrivendo "Amazon" propone categoria Shopping e sito amazon.it */
function recognizeName(){
  const h=$('#fHint');
  if(fType!=='login'||editId){h.classList.add('hide');return}
  const r=recognize($('#fName').value);
  if(r){
    if(catAuto)populateCatSelect(r.cat);
    if(!$('#fUrl').value||urlAuto){$('#fUrl').value=r.url;urlAuto=true}
    h.textContent=`✨ Riconosciuto: ${catInfo(r.cat).e} ${r.cat} · ${r.url}`; h.classList.remove('hide');
  }else{
    if(urlAuto){$('#fUrl').value='';urlAuto=false}
    if(catAuto)populateCatSelect('Altro');
    h.classList.add('hide');
  }
}
$('#fName').addEventListener('input',recognizeName);
$('#fUrl').addEventListener('input',()=>{urlAuto=false});
$('#fCat').addEventListener('change',()=>{catAuto=false});

function openForm(it,pre){
  editId=it?it.id:null; catAuto=!it&&!pre?.cat; urlAuto=false;
  const ty=it?typeOf(it):pre?.type||'login';
  $('#dlgT').textContent=it?'Modifica '+TYPE_INFO[ty].t:pre?'Altro account per '+pre.name:'Nuovo account';
  $('#fName').value=it?.name||pre?.name||'';$('#fUser').value=it?.user||'';$('#fPass').value=it?.pass||'';
  $('#fUrl').value=it?.url||pre?.url||'';$('#fTotp').value=it?.totp||'';updTotpPrev();$('#fNote').value=it?.note||'';$('#fFav').checked=!!it?.fav;
  $('#fHolder').value=it?.holder||'';$('#fNumber').value=fmtCard(it?.number||'');$('#fExp').value=it?.exp||'';
  $('#fCvv').value=it?.cvv||'';$('#fPin').value=it?.pin||'';$('#fWsec').value=it?.wsec||'WPA';$('#fWhidden').checked=!!it?.whidden;
  $('#fSecret').value=it?.secret||'';
  $('#fDocType').value=it?.docType||'Carta d’Identità';
  $('#fDocNum').value=ty==='doc'?(it?.number||''):'';
  $('#fCf').value=it?.cf||'';
  $('#fIssuer').value=it?.issuer||'';
  $('#fIssued').value=it?.issued||'';
  $('#fDocExp').value=ty==='doc'?(it?.exp||''):'';
  editPhotos=Array.isArray(it?.photos)?[...it.photos]:[];
  renderEditPhotos();
  populateCatSelect(it?.cat||pre?.cat||'Altro');
  setFormType(ty,!it&&!pre?.cat);
  // con una scheda già esistente si può cambiare tipo, ma solo i campi visibili vengono salvati
  $('#fTypeSel').classList.toggle('hide',!!pre);
  const hist=Array.isArray(it?.history)?it.history:[];
  if(hist.length){
    $('#histSum').textContent=`Cronologia password precedenti (${hist.length})`;
    $('#histList').innerHTML=hist.map(h=>{
      const dt=h.at?new Date(h.at).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}):'';
      return `<li class="hist-it"><div style="min-width:0"><div class="hist-pw">${esc(h.pass)}</div>${dt?`<div class="mute small">${esc(dt)}</div>`:''}</div><button type="button" class="btn s" data-hp="${esc(h.pass)}">Copia</button></li>`;
    }).join('');
    $('#histBox').open=false;
    $('#histBox').classList.remove('hide');
  }else{
    $('#histList').innerHTML='';
    $('#histBox').classList.add('hide');
  }
  $('#bDel').classList.toggle('hide',!it);
  $('#pwnMsg').textContent='';
  updMeter();$('#dlg').showModal();
}
$('#bAdd').onclick=()=>openForm(null);
$('#bCancel').onclick=()=>{slotStop?.();$('#dlg').close()};
/* Generatore "slot machine": i caratteri girano come rulli e si fermano uno alla volta sulla password vera.
   I caratteri che girano sono solo un effetto: la password finale è quella generata in modo sicuro. */
let slotStop=null;
function slotFill(inp,final,after){
  slotStop?.();
  if(calm()){inp.value=final;after();return}
  const pool='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?', t0=performance.now(), dur=650, per=Math.min(28,dur/final.length);
  let raf=0;
  const finish=()=>{cancelAnimationFrame(raf);slotStop=null;inp.value=final;inp.classList.remove('slotting');inp.classList.remove('slot-done');void inp.offsetWidth;inp.classList.add('slot-done');after()};
  slotStop=finish;
  inp.classList.add('slotting');buzz(15);
  const step=now=>{
    const fixed=Math.floor((now-t0-dur*.35)/per);
    if(fixed>=final.length)return finish();
    let s='';for(let k=0;k<final.length;k++)s+=k<fixed?final[k]:pool[Math.floor(Math.random()*pool.length)];
    inp.value=s;raf=requestAnimationFrame(step);
  };
  raf=requestAnimationFrame(step);
}
$('#bGen').onclick=()=>{const g=gen();if(g)slotFill($('#fPass'),g,updMeter)};
$('#form').addEventListener('submit',async e=>{
  e.preventDefault();
  slotStop?.(); // se i rulli stanno ancora girando, fermali sulla password vera prima di salvare
  let chosenCat=$('#fCat').value;
  if(chosenCat==='__new__'){
    chosenCat=$('#fCatNew').value.trim();
    if(!chosenCat){toast('Inserisci il nome della nuova categoria');$('#fCatNew').focus();return}
  }
  // si salvano solo i campi del tipo scelto (es. una carta non ha utente né password)
  const t=fType, has=f=>t===f;
  const d=clean({type:t,name:$('#fName').value.trim(),note:$('#fNote').value.trim(),cat:chosenCat,fav:$('#fFav').checked,
    user:has('login')?$('#fUser').value.trim():'',
    pass:has('login')||has('wifi')?$('#fPass').value:'',
    url:has('login')?normUrl($('#fUrl').value):'',
    totp:has('login')?totpStore($('#fTotp').value):'',
    holder:has('card')?$('#fHolder').value.trim().toUpperCase():'',number:has('card')?fmtCard($('#fNumber').value):(has('doc')?$('#fDocNum').value.trim().toUpperCase():''),
    exp:has('card')?$('#fExp').value.trim():(has('doc')?$('#fDocExp').value.trim():''),cvv:has('card')?$('#fCvv').value:'',pin:has('card')?$('#fPin').value:'',
    docType:has('doc')?$('#fDocType').value:'',cf:has('doc')?$('#fCf').value.trim().toUpperCase():'',issuer:has('doc')?$('#fIssuer').value.trim():'',issued:has('doc')?$('#fIssued').value.trim():'',
    wsec:has('wifi')?$('#fWsec').value:'',whidden:has('wifi')&&$('#fWhidden').checked,secret:has('note')?$('#fSecret').value:'',
    photos:editPhotos});
  if(!$('#fName').value.trim())return;
  if(has('login')&&$('#fTotp').value.trim()&&!d.totp){toast('Chiave 2FA non valida: controlla di averla copiata tutta');$('#fTotp').focus();return}
  if(d.url&&!safeUrl(d.url)){toast('Indirizzo del sito non valido (usa http:// o https://)');$('#fUrl').focus();return}
  if(t==='card'&&d.exp&&!/^(0[1-9]|1[0-2])\/\d{2}$/.test(d.exp)){toast('Scadenza non valida: usa MM/AA (es. 08/29)');$('#fExp').focus();return}
  const id=editId, btn=$('#bSave'); btn.disabled=true;
  try{
    const ok=await commit(()=>{
      if(id){
        const k=items.findIndex(x=>x.id===id);
        if(k>=0){
          const it=items[k];
          const meta=t==='login'||t==='wifi'?recordPasswordChange(it,d.pass):{updatedAt:Date.now()};
          if(it.pass!==d.pass)pwnedMap.delete(id); // password cambiata: il bollino "Rubata" non vale più
          // la scheda viene ricostruita: cambiando tipo non restano campi del tipo precedente
          items[k]=clean({...d,...meta,id});
        }
      }else{
        items.push({...d,id:crypto.randomUUID(),updatedAt:Date.now()});
      }
    },'Salvato');
    if(ok)$('#dlg').close();
  }finally{btn.disabled=false}
});
/* Eliminazione sicura: finestra di avviso con il nome della scheda, poi 8 secondi per annullare */
const DEL_TXT={
  title:'Eliminare questa scheda?',
  text:'La scheda andrà nel Cestino: subito puoi premere “Annulla” in basso, e per 30 giorni puoi recuperarla da Opzioni → Cestino.',
  yes:'Elimina'
};
function askDelete(name,o={}){
  return new Promise(res=>{
    const d=$('#dlgDel'); $('#delName').textContent=name;
    $('#delT').textContent=o.title||DEL_TXT.title; $('#delTxt').textContent=o.text||DEL_TXT.text; $('#delYes').textContent=o.yes||DEL_TXT.yes;
    const done=v=>{d.removeEventListener('close',onClose);if(d.open)d.close();res(v)};
    const onClose=()=>done(false); // tasto Indietro / Esc = annulla
    $('#delNo').onclick=()=>done(false);
    $('#delYes').onclick=()=>done(true);
    d.addEventListener('close',onClose);
    d.showModal(); $('#delNo').focus();
  });
}
let undoT=null, undoTick=null, undoData=null;
const UNDO_SEC=8;
function hideUndo(){clearTimeout(undoT);clearInterval(undoTick);undoData=null;$('#undoBar').classList.add('hide');$('#undoBar').classList.remove('run')}
function showUndo(name){
  clearTimeout(undoT);clearInterval(undoTick);
  const bar=$('#undoBar'), end=Date.now()+UNDO_SEC*1000;
  $('#undoTxt').textContent=`“${name}” nel Cestino`;
  $('#undoSec').textContent=UNDO_SEC;
  bar.classList.remove('hide','run'); void bar.offsetWidth; bar.classList.add('run'); // riparte la linea che si accorcia
  // conto alla rovescia: 8, 7, 6… (calcolato sull'orario, così resta giusto anche se il telefono rallenta)
  undoTick=setInterval(()=>{$('#undoSec').textContent=Math.max(1,Math.ceil((end-Date.now())/1000))},250);
  undoT=setTimeout(hideUndo,UNDO_SEC*1000);
}
$('#undoBtn').onclick=async()=>{
  const u=undoData; if(!u||!key)return hideUndo();
  hideUndo();
  if(await commit(()=>{if(!items.some(x=>x.id===u.item.id))items.splice(Math.min(u.at,items.length),0,u.item);trash=trash.filter(x=>x.item.id!==u.item.id);trashDirty=true},'Scheda ripristinata'))buzz(20);
};
$('#bDel').onclick=async()=>{
  const id=editId, at=items.findIndex(x=>x.id===id); if(at<0)return;
  const item=structuredClone(items[at]);
  if(!await askDelete(item.name))return;
  if(await commit(()=>{items=items.filter(x=>x.id!==id);trash=purgeTrash([{item,deletedAt:Date.now()},...trash]);trashDirty=true})){
    $('#dlg').close(); buzz(30);
    showUndo(item.name); undoData={item,at};
  }
};

/* Cestino: schede eliminate negli ultimi 30 giorni, da ripristinare o eliminare per sempre */
function updTrashBtn(){$('#bTrash').textContent=`🗑️ Apri il Cestino (${trash.length})`}
function renderTrash(){
  const now=Date.now(), ul=$('#trList');
  trash=purgeTrash(trash,now);
  $('#trEmpty').disabled=!trash.length;
  updTrashBtn();
  if(!trash.length){ul.innerHTML='<li class="tr-none">Il Cestino è vuoto.</li>';return}
  const day=d=>new Date(d).toLocaleDateString('it-IT',{day:'numeric',month:'short'});
  ul.innerHTML=trash.map(e=>{
    const i=e.item, t=typeOf(i), left=trashLeftDays(e,now);
    return `<li data-id="${esc(i.id)}">
      <span class="tr-e" aria-hidden="true">${t==='login'?catInfo(i.cat).e:TYPE_INFO[t].e}</span>
      <div class="tr-t"><b>${esc(i.name)}</b><small>${esc(subOf(i)||TYPE_INFO[t].t)} · eliminata il ${esc(day(e.deletedAt))} · ${left===1?'sparisce domani':`sparisce tra ${left} giorni`}</small></div>
      <div class="tr-a"><button type="button" class="btn s" data-t="r">↩️ Ripristina</button><button type="button" class="btn s ic" data-t="x" title="Elimina per sempre" aria-label="Elimina per sempre: ${esc(i.name)}">✕</button></div>
    </li>`;
  }).join('');
}
$('#bTrash').onclick=()=>{renderTrash();$('#dlgTrash').showModal()};
$('#trClose').onclick=()=>$('#dlgTrash').close();
$('#dlgTrash').addEventListener('close',()=>{$('#trList').innerHTML=''});
$('#trList').addEventListener('click',async e=>{
  const b=e.target.closest('button[data-t]'); if(!b||!key)return;
  const id=b.closest('li').dataset.id, en=trash.find(x=>x.item.id===id); if(!en)return;
  if(b.dataset.t==='r'){
    const ok=await commit(()=>{
      const it=structuredClone(en.item);
      if(items.some(x=>x.id===it.id))it.id=crypto.randomUUID();
      items.push(it); trash=trash.filter(x=>x!==en); trashDirty=true;
    },`“${en.item.name}” ripristinata`);
    if(ok){buzz(20);hideUndo()}
  }else{
    if(!await askDelete(en.item.name,{title:'Eliminare per sempre?',text:'Dal Cestino la scheda sparisce del tutto e non si potrà più recuperare.',yes:'Elimina per sempre'}))return;
    await commit(()=>{trash=trash.filter(x=>x!==en);trashDirty=true},'Eliminata per sempre');
  }
  if($('#dlgTrash').open)renderTrash();
});
$('#trEmpty').onclick=async()=>{
  if(!trash.length||!key)return;
  const n=trash.length;
  if(!await askDelete(n===1?'1 scheda nel Cestino':`${n} schede nel Cestino`,{title:'Svuotare il Cestino?',text:'Tutte le schede del Cestino spariranno per sempre e non si potranno più recuperare.',yes:'Svuota'}))return;
  if(await commit(()=>{trash=[];trashDirty=true},'Cestino svuotato'))renderTrash();
};

/* Backup: il file resta cifrato con la password principale */
function markBackup(){localStorage.setItem('lastBackup',Date.now());localStorage.removeItem('bkSnooze');updBackup();updBkInfo()}
async function exportBackup(forceDownload=false){
  const v=localStorage.getItem('vault'); if(!v)return;
  const filename='cassaforte-backup-'+new Date().toISOString().slice(0,10)+'.json';
  const blob=new Blob([v],{type:'application/json'});
  if(!forceDownload&&navigator.canShare){
    try{
      const file=new File([blob],filename,{type:'application/json'});
      if(navigator.canShare({files:[file]})){
        allowExternal(); // il foglio di condivisione manda la pagina in background: non bloccare
        try{
          await navigator.share({
            title:'Backup Cassaforte Password',
            text:'Backup cifrato della Cassaforte (salvalo su Drive/iCloud o inviatelo via WhatsApp/Email).',
            files:[file]
          });
        }finally{extUntil=0}
        markBackup();toast('Backup condiviso');return;
      }
    }catch(err){
      if(err.name==='AbortError')return;
      console.warn('Share fallito, uso download',err);
    }
  }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  markBackup();toast('File di backup scaricato');
}
$('#bExport').onclick=()=>exportBackup(true);
$('#bShare').onclick=()=>exportBackup(false);

/* Import: la cassaforte attuale NON viene toccata finché il backup non è stato decifrato con successo */
$('#bImport').onclick=()=>{allowExternal();$('#file').click()};
$('#file').addEventListener('cancel',()=>{extUntil=0});
$('#file').addEventListener('change',async e=>{
  extUntil=0;
  const f=e.target.files[0]; e.target.value=''; if(!f||!key)return;
  try{
    const v=JSON.parse(await f.text());
    if(!(v&&typeof v.salt==='string'&&typeof v.iv==='string'&&typeof v.data==='string'))throw 0;
    unb64(v.salt);unb64(v.iv);unb64(v.data);
    pendingImport=v;
  }catch{toast('File di backup non valido');return}
  $('#impForm').reset();$('#impErr').textContent='';
  $('#impInfo').textContent='File: '+f.name+'. Gli account importati saranno protetti con la tua password principale attuale.';
  if($('#dlgSet').open)$('#dlgSet').close();
  $('#dlgImp').showModal();
});
$('#impCancel').onclick=()=>{pendingImport=null;$('#dlgImp').close()};
$('#impForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const v=pendingImport, s=sess, err=$('#impErr'), btn=$('#impOk'); if(!v)return;
  err.textContent=''; btn.disabled=true;
  try{
    let imp;
    try{imp=(await decryptVault($('#impPw').value,v)).items}
    catch{err.textContent='Password errata o file danneggiato. I tuoi dati attuali non sono stati toccati.';return}
    if(s!==sess||!key)return;
    const mode=$('#impForm').elements.impMode.value;
    if(mode==='replace'&&items.length&&!confirm(`Eliminare i ${items.length} account attuali e sostituirli con i ${imp.length} del backup?`))return;
    let added=0, same=0;
    const ok=await commit(()=>{
      if(mode==='replace'){items=imp;added=imp.length;return}
      const res=mergeItems(items,imp);
      items=res.items; added=res.added; same=res.same;
    });
    if(ok){
      pendingImport=null;$('#dlgImp').close();
      toast(mode==='replace'?`Backup importato: ${added} account`:`Unione completata: ${added} aggiunti${same?`, ${same} già presenti`:''}`);
    }
  }finally{btn.disabled=false}
});

/* Import CSV (da browser Chrome, Edge, Firefox, Bitwarden, Safari) */
$('#bImportCsv').onclick=()=>{allowExternal();$('#fileCsv').click()};
$('#fileCsv').addEventListener('cancel',()=>{extUntil=0});
$('#fileCsv').addEventListener('change',async e=>{
  extUntil=0;
  const f=e.target.files[0]; e.target.value=''; if(!f||!key)return;
  let csvItems;
  try{
    csvItems=parseCsvItems(await f.text());
    if(!csvItems.length)throw new Error('Nessun account trovato');
    // riconoscimento automatico della categoria per gli account senza categoria
    csvItems.forEach(i=>{if(i.cat==='Altro'){const r=recognize(i.name);if(r)i.cat=r.cat}});
  }catch{
    toast('File CSV non valido o vuoto');
    return;
  }
  let added=0, same=0;
  const ok=await commit(()=>{
    const res=mergeItems(items,csvItems);
    items=res.items; added=res.added; same=res.same;
  });
  if(ok){
    if($('#dlgSet').open)$('#dlgSet').close();
    toast(`CSV importato: ${added} aggiunti${same?`, ${same} già presenti`:''}`);
  }
});

/* Generatore */
let gMode='chars';
function setGMode(m){
  gMode=m==='words'?'words':'chars';
  document.querySelectorAll('#gModeSel [data-gm]').forEach(b=>b.classList.toggle('on',b.dataset.gm===gMode));
  $('#gCharsBox').classList.toggle('hide',gMode!=='chars');
  $('#gWordsBox').classList.toggle('hide',gMode!=='words');
}
function gen(){
  const p=gMode==='words'
    ?generatePassword({mode:'words',words:+$('#gWords').value,upper:$('#g_wupper').checked,num:$('#g_wnum').checked})
    :generatePassword({mode:'chars',len:+$('#gLen').value,lower:$('#g_lower').checked,upper:$('#g_upper').checked,num:$('#g_num').checked,sym:$('#g_sym').checked});
  if(!p)toast('Scegli almeno un tipo di carattere');
  return p;
}
function saveG(){
  localStorage.setItem('gopts',JSON.stringify({
    mode:gMode,len:+$('#gLen').value,lower:$('#g_lower').checked,upper:$('#g_upper').checked,num:$('#g_num').checked,sym:$('#g_sym').checked,
    words:+$('#gWords').value,wupper:$('#g_wupper').checked,wnum:$('#g_wnum').checked
  }));
}
try{
  const o=JSON.parse(localStorage.getItem('gopts'));
  if(o){
    if(o.len)$('#gLen').value=o.len;
    ['lower','upper','num','sym'].forEach(k=>{if(k in o)$('#g_'+k).checked=!!o[k]});
    if(o.words)$('#gWords').value=o.words;
    if('wupper' in o)$('#g_wupper').checked=!!o.wupper;
    if('wnum' in o)$('#g_wnum').checked=!!o.wnum;
    if(o.mode)setGMode(o.mode);
  }
}catch{}
$('#gLenV').textContent=$('#gLen').value;
$('#gWordsV').textContent=$('#gWords').value;
$('#gModeSel').addEventListener('click',e=>{const b=e.target.closest('[data-gm]');if(b){setGMode(b.dataset.gm);saveG()}});
$('#gOpts').addEventListener('input',()=>{$('#gLenV').textContent=$('#gLen').value;$('#gWordsV').textContent=$('#gWords').value;saveG()});

/* Modifica rapida password */
function updQ(){const r=strength($('#qPass').value);$('#qBar').style.width=r.p+'%';$('#qBar').style.background=r.c;$('#qTxt').textContent=r.t?'Robustezza: '+r.t:''}
function openQuick(it){qId=it.id;$('#qS').textContent=it.name+(it.user?' · '+it.user:'');$('#qPass').value='';updQ();$('#dlgQ').showModal()}
$('#qPass').addEventListener('input',updQ);
$('#qGen').onclick=()=>{const g=gen();if(g)slotFill($('#qPass'),g,updQ)};
$('#qCancel').onclick=()=>$('#dlgQ').close();
$('#fQ').addEventListener('submit',async e=>{
  e.preventDefault();
  slotStop?.();
  const id=qId, p=$('#qPass').value, it=items.find(x=>x.id===id); if(!it||!p)return;
  if(await commit(()=>{Object.assign(it,recordPasswordChange(it,p),{pass:p});pwnedMap.delete(id)},'Password aggiornata'))$('#dlgQ').close();
});

/* Avviso di backup proattivo (incluso avviso immediato dopo ogni modifica non salvata) */
const DAY=864e5;
function updBackup(){
  const now=Date.now(), last=+localStorage.getItem('lastBackup')||0, chg=+localStorage.getItem('lastChange')||0, snooze=+localStorage.getItem('bkSnooze')||0;
  if(items.length>0&&!last){
    const due=now>snooze;
    $('#bk').classList.toggle('hide',!due);
    $('#bk').classList.add('warn');
    $('#bkHead').textContent='Non hai ancora fatto un backup';
    $('#bkTxt').textContent='Le tue password sono salvate solo in questo browser. Attiva il Cloud Sync in Opzioni o inviati una copia cifrata (Drive, WhatsApp, email): se il telefono si rompe senza backup le perdi.';
    return;
  }
  if(items.length>0&&chg>last&&now>snooze){
    $('#bk').classList.remove('hide');
    $('#bk').classList.add('warn');
    $('#bkHead').textContent='Hai modifiche non salvate nel backup';
    $('#bkTxt').textContent='Hai aggiunto o modificato degli account dopo l’ultimo backup. Salva subito una copia su Drive/WhatsApp o attiva il Cloud Sync in Opzioni.';
    return;
  }
  const due=items.length>0&&(now-last>14*DAY)&&(now>snooze);
  $('#bk').classList.toggle('hide',!due);
  if(due){
    $('#bk').classList.remove('warn');
    const d=Math.floor((now-last)/DAY);
    $('#bkHead').textContent='È ora di aggiornare il backup';
    $('#bkTxt').textContent=`L'ultimo backup risale a ${d} giorni fa. Fanne uno nuovo per non perdere le modifiche recenti.`;
  }
}
function updBkInfo(){
  const l=+localStorage.getItem('lastBackup');
  $('#bkInfo').innerHTML=l
    ?`Ultimo backup: <b>${new Date(l).toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</b>`
    :`<span class="badge-no">NESSUN BACKUP EFFETTUATO!</span> I tuoi dati sono a rischio immediato di perdita in caso di pulizia del browser o cambio dispositivo.`;
}
$('#bkNow').onclick=()=>exportBackup(false);
$('#bkLater').onclick=()=>{localStorage.setItem('bkSnooze',Date.now()+2*DAY);updBackup();toast('Ti ricorderemo del backup tra 2 giorni')};

/* Protezione memoria del browser (Persistent Storage API) */
async function checkAndRequestPersistence(request=false){
  if(!navigator.storage||!navigator.storage.persisted){
    $('#stPersistInfo').textContent='Non supportata da questo browser';
    $('#bReqPersist').classList.add('hide');
    return;
  }
  let p=await navigator.storage.persisted();
  if(!p&&request&&navigator.storage.persist){
    p=await navigator.storage.persist().catch(()=>false);
  }
  $('#stPersistInfo').innerHTML=p
    ?'<span class="badge-ok">Attiva</span>: il browser non cancellerà i dati per liberare spazio su disco.'
    :'<span class="badge-no">Non attiva</span>: il sistema potrebbe cancellare i dati se la memoria è piena.';
  $('#bReqPersist').classList.toggle('hide',!!p);
}
$('#bReqPersist').onclick=async()=>{await checkAndRequestPersistence(true);toast('Richiesta inviata al browser')};

/* Auto-sync su file locale/cloud (File System Access API - PC/Desktop).
   Il collegamento al file viene ricordato in IndexedDB, così sopravvive alla chiusura del browser. */
const idb=(mode,fn)=>new Promise((res,rej)=>{
  const r=indexedDB.open('cassaforte',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('kv');
  r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const db=r.result,t=db.transaction('kv',mode),q=fn(t.objectStore('kv'));t.oncomplete=()=>{db.close();res(q.result)};t.onerror=()=>{db.close();rej(t.error)}};
});
const kvGet=k=>idb('readonly',s=>s.get(k)), kvSet=(k,v)=>idb('readwrite',s=>s.put(v,k)), kvDel=k=>idb('readwrite',s=>s.delete(k));
const FS_DEF='Salva automaticamente una copia cifrata su un file a scelta del computer (es. dentro Google Drive, OneDrive o Documenti).';
function setSyncUI(st){
  const n=esc((syncHandle||pendingHandle)?.name||''), info=$('#fsInfo');
  if(st==='on')info.innerHTML=`<span class="badge-ok">Attivo su:</span> <b>${n}</b> (ogni salvataggio aggiorna automaticamente questo file).`;
  else if(st==='paused')info.innerHTML=`<span class="badge-no">In pausa:</span> il browser chiede la tua autorizzazione per tornare a scrivere su <b>${n}</b>.`;
  else if(st==='error')info.innerHTML=`<span class="badge-no">Errore:</span> l'ultima scrittura su <b>${n}</b> non è riuscita. Riprova o collega di nuovo il file.`;
  else info.textContent=FS_DEF;
  $('#bSyncFile').textContent=st==='off'?'Collega file di auto-sync':'Cambia file';
  $('#bResumeSync').classList.toggle('hide',st!=='paused');
  $('#bStopSync').classList.toggle('hide',st==='off');
}
async function syncWrite(vStr){
  if(!syncHandle||!vStr)return false;
  try{const w=await syncHandle.createWritable();await w.write(vStr);await w.close();markBackup();setSyncUI('on');return true}
  catch(e){console.warn('Auto-sync write error',e);setSyncUI('error');toast('Auto-sync su file non riuscito: controlla in Opzioni');return false}
}
async function initSync(){
  if(!window.showSaveFilePicker||syncHandle||pendingHandle)return;
  try{
    const h=await kvGet('syncHandle'); if(!h)return;
    if(await h.queryPermission({mode:'readwrite'})==='granted'){syncHandle=h;await syncWrite(localStorage.getItem('vault'))}
    else{pendingHandle=h;setSyncUI('paused');toast('Auto-sync in pausa: riattivalo da Opzioni')}
  }catch(e){console.warn('Auto-sync init',e)}
}
if(!window.showSaveFilePicker){
  $('#fsBox').classList.add('hide');
}else{
  $('#bSyncFile').onclick=async()=>{
    allowExternal();
    try{
      const h=await window.showSaveFilePicker({
        suggestedName:'cassaforte-sync.json',
        types:[{description:'File JSON cifrato',accept:{'application/json':['.json']}}]
      });
      syncHandle=h; pendingHandle=null;
      await kvSet('syncHandle',h).catch(e=>console.warn('Impossibile ricordare il file di sync',e));
      if(await syncWrite(localStorage.getItem('vault')))toast('Auto-sync su file attivato');
    }catch(e){
      if(e.name!=='AbortError')toast('Impossibile collegare il file');
    }finally{extUntil=0}
  };
  $('#bResumeSync').onclick=async()=>{
    const h=pendingHandle; if(!h)return;
    try{
      if(await h.requestPermission({mode:'readwrite'})==='granted'){
        syncHandle=h; pendingHandle=null;
        if(await syncWrite(localStorage.getItem('vault')))toast('Auto-sync riattivato');
      }else toast('Permesso negato: auto-sync ancora in pausa');
    }catch(e){console.warn(e);toast('Impossibile riattivare: collega di nuovo il file')}
  };
  $('#bStopSync').onclick=async()=>{
    syncHandle=pendingHandle=null;
    await kvDel('syncHandle').catch(()=>{});
    setSyncUI('off');
    toast('Auto-sync disattivato');
  };
}

/* Cloud Sync Cifrato Zero-Knowledge (Firebase Firestore REST API) */
const CLOUD_URL='https://firestore.googleapis.com/v1/projects/gestionale-flotta-d6448/databases/(default)/documents/cassaforte_vaults/';
const getCloudCode=()=>localStorage.getItem('cloudCode')||'';
function updCloudUI(){
  const code=getCloudCode(), active=!!code;
  $('#cloudCodeWrap').classList.toggle('hide',!active);
  $('#cloudCodeTxt').textContent=code;
  $('#bCloudEnable').classList.toggle('hide',active);
  $('#bCloudLink').textContent=active?'Cambia Codice Cloud':'Ho già un Codice Cloud';
  $('#bCloudPull').classList.toggle('hide',!active);
  $('#bCloudKit').classList.toggle('hide',!active);
  $('#bCloudDisable').classList.toggle('hide',!active);
  const err=active?cloudErrGet():null;
  if(!active){
    $('#cloudInfo').textContent='Salva automaticamente una copia cifrata sul Cloud a ogni modifica. Nemmeno il server può leggerla senza la tua Password Principale.';
  }else if(err&&CLOUD_ERR[err.k]){
    const [title,txt]=CLOUD_ERR[err.k];
    $('#cloudInfo').innerHTML=`<span class="badge-no">${esc(title)}</span> ${esc(txt)}${err.c?` <span class="mute">(codice ${esc(err.c)})</span>`:''}`;
  }else{
    const t=+localStorage.getItem('lastCloudSync');
    const when=t?new Date(t).toLocaleString('it-IT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'attivo';
    const used=Math.round(100*(localStorage.getItem('vault')||'').length/CLOUD_MAX);
    $('#cloudInfo').innerHTML=`<span class="badge-ok">Cloud Sync attivo</span> (${esc(when)}): ogni modifica viene salvata cifrata sul Cloud.`
      +(used>=80?` <span class="badge-no">Spazio usato: ${used}%.</span> Quando arriva al 100% il backup online si ferma: tieni anche un backup su file.`:used>=50?` Spazio usato: ${used}%.`:'');
  }
}
/* Errori del Cloud: tipo salvato fino al prossimo salvataggio riuscito, con un messaggio chiaro per ogni caso */
const CLOUD_MAX=1000000; // limite del documento nel database (circa 1 MB)
const CLOUD_ERR={
  net:['📶 Nessuna connessione:','il salvataggio sul Cloud non è riuscito per segnale assente o troppo debole. Riproverà da solo alla prossima modifica. I dati sul telefono sono al sicuro.'],
  quota:['⏳ Limite giornaliero del Cloud raggiunto:','oggi il servizio gratuito ha esaurito i salvataggi disponibili. Riprende da solo domani mattina. I dati sul telefono sono al sicuro; se hai fatto modifiche importanti, fai anche un backup su file.'],
  full:['📦 Cloud pieno:','la cassaforte è diventata troppo grande per il backup online (circa 1 MB). Usa il backup su file (Invia / Condividi o Scarica JSON) per non perdere le modifiche.'],
  denied:['🚫 Salvataggio rifiutato dal Cloud:','il server non ha accettato la copia. Riprova più tardi; se continua, fai un backup su file e chiedi assistenza.'],
  other:['⚠️ Cloud non disponibile:','il server non ha risposto correttamente. Riproverà da solo alla prossima modifica.']
};
const cloudErrGet=()=>{try{return JSON.parse(localStorage.getItem('cloudErr'))}catch{return null}};
function cloudErrSet(k,c){
  const prev=cloudErrGet()?.k;
  try{k?localStorage.setItem('cloudErr',JSON.stringify({k,c:c||'',at:Date.now()})):localStorage.removeItem('cloudErr')}catch{}
  // avviso a comparsa solo per i problemi seri e solo la prima volta (il segnale debole non deve dare fastidio)
  if(k&&k!==prev&&(k==='quota'||k==='full'))toast(k==='quota'?'Limite Cloud di oggi raggiunto: riprende domani':'Cloud pieno: fai un backup su file');
}
/* Capisce dalla risposta del server che tipo di problema c'è */
async function cloudErrKind(res){
  let msg='';try{msg=JSON.stringify(await res.json())}catch{}
  if(res.status===429||/RESOURCE_EXHAUSTED|quota/i.test(msg))return 'quota';
  if(/exceeds the maximum|too large|maximum allowed size|longer than/i.test(msg))return 'full';
  if(res.status===403||res.status===401)return 'denied';
  if(res.status===400&&/size|bytes/i.test(msg))return 'full';
  return 'other';
}
async function cloudWrite(vStr){
  const code=getCloudCode();
  if(!code||!vStr)return false;
  // troppo grande: inutile provare, il server la rifiuterebbe
  if(vStr.length>=CLOUD_MAX){cloudErrSet('full');updCloudUI();return false}
  let res;
  try{
    const docId=await cloudDocId(code);
    res=await fetch(CLOUD_URL+docId,{
      method:'PATCH',
      signal:AbortSignal.timeout?AbortSignal.timeout(20000):undefined,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fields:{vault:{stringValue:vStr},updatedAt:{integerValue:String(Date.now())}}})
    });
  }catch(e){
    // nessuna risposta: rete assente, segnale debole o attesa oltre 20 secondi
    console.warn('Cloud sync: rete',e);
    cloudErrSet('net');updCloudUI();return false;
  }
  if(!res.ok){
    const k=await cloudErrKind(res);
    console.warn('Cloud sync: errore',res.status,k);
    cloudErrSet(k,res.status);updCloudUI();return false;
  }
  localStorage.setItem('lastCloudSync',Date.now());
  cloudErrSet(null);
  markBackup();
  updCloudUI();
  return true;
}
async function cloudRead(code){
  const docId=await cloudDocId(code);
  let res;
  try{res=await fetch(CLOUD_URL+docId,{signal:AbortSignal.timeout?AbortSignal.timeout(30000):undefined})}
  catch{throw new Error('Connessione al Cloud non riuscita o troppo lenta: riprova con un segnale migliore.')}
  if(res.status===404)throw new Error('Nessun backup trovato per questo Codice Cloud.');
  if(!res.ok)throw new Error('Errore di connessione al Cloud ('+res.status+').');
  const doc=await res.json();
  const vStr=doc?.fields?.vault?.stringValue;
  if(!vStr)throw new Error('Dati Cloud non validi.');
  const v=JSON.parse(vStr);
  if(!(v&&typeof v.salt==='string'&&typeof v.iv==='string'&&typeof v.data==='string'))throw new Error('Formato Cloud non valido.');
  unb64(v.salt);unb64(v.iv);unb64(v.data);
  return {v, vStr};
}
$('#bCloudEnable').onclick=async()=>{
  const vStr=localStorage.getItem('vault'); if(!vStr)return;
  const code=generateCloudCode();
  localStorage.setItem('cloudCode',code);
  updCloudUI();
  const btn=$('#bCloudEnable'); btn.disabled=true;
  try{
    if(await cloudWrite(vStr))toast('Cloud Sync attivato! Annota il tuo Codice Cloud');
    else toast('Codice creato, ma connessione al Cloud non riuscita');
  }finally{btn.disabled=false}
};
$('#bCopyCloud').onclick=()=>{const c=getCloudCode();if(c)copy(c,'Codice Cloud copiato')};
$('#bCloudDisable').onclick=()=>{
  if(!confirm('Disattivare il Cloud Sync automatico su questo dispositivo?'))return;
  localStorage.removeItem('cloudCode'); localStorage.removeItem('cloudErr');
  updCloudUI();
  toast('Cloud Sync disattivato');
};
/* Kit di Emergenza stampabile con QR Code del Codice Cloud (la Password Principale si scrive a penna) */
$('#bCloudKit').onclick=()=>{
  const code=getCloudCode();
  if(!code){toast('Attiva prima il Cloud Sync automatico');return}
  let qrSvg='';
  if(window.qrcode){
    try{const q=qrcode(0,'M');q.addData(code);q.make();qrSvg=q.createSvgTag({cellSize:5,margin:2,scalable:true})}catch{}
  }
  const when=new Date().toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});
  $('#printSheet').innerHTML=`<section class="kit-box">
    <h2 style="margin:0 0 4px;font-size:22px">🛡️ Cassaforte · Kit di Emergenza</h2>
    <div style="color:#555;font-size:12px">Generato il ${esc(when)} · Indirizzo app: <b>https://cassaforte.gccodelab.it</b></div>
    <p style="border:1.5px solid #b3261e;color:#b3261e;font-weight:700;font-size:12px;padding:8px 10px;border-radius:6px;margin:14px 0">DOCUMENTO RISERVATO: conserva questo foglio in un luogo sicuro e chiuso a chiave (es. cassaforte o cassetto). Serve per recuperare tutti gli account se il telefono si rompe o viene smarrito.</p>
    <div class="kit-grid">
      ${qrSvg?`<div class="kit-qr">${qrSvg}</div>`:''}
      <div>
        <div style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:.04em">Il tuo Codice Cloud</div>
        <div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:22px;font-weight:800;letter-spacing:.08em;margin:6px 0">${esc(code)}</div>
        <div style="font-size:12px;color:#555">Questo codice identifica la tua cassetta cifrata sul Cloud. Da solo <b>non</b> permette di leggere le password senza la Password Principale.</div>
      </div>
    </div>
    <div class="kit-pen">
      <div style="font-size:12px;color:#555;font-weight:700;margin-bottom:8px">✍️ SCRIVI QUI A PENNA LA TUA PASSWORD PRINCIPALE (non passa mai dalla stampante):</div>
      <div style="height:34px;border-bottom:1px dotted #888"></div>
    </div>
    <h3 style="margin:16px 0 6px;font-size:15px">Come recuperare tutto su un telefono o PC nuovo (3 passi):</h3>
    <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.6">
      <li>Apri <b>https://cassaforte.gccodelab.it</b> dal browser.</li>
      <li>Nella schermata iniziale tocca <b>"☁️ Telefono nuovo o rotto? Ripristina da Cloud / Backup"</b>.</li>
      <li>Inserisci il <b>Codice Cloud</b> qui sopra (o inquadra il QR) e la <b>Password Principale</b> scritta a penna, poi premi <b>Ripristina</b>.</li>
    </ol>
    <div style="margin-top:18px;color:#666;font-size:11px;border-top:1px solid #ccc;padding-top:6px">Cassaforte v${esc(APP_VERSION)} · GC CodeLab · Giovanni Cavallo</div>
  </section>`;
  allowExternal(10*60*1000);
  window.print();
};
$('#bCloudPull').onclick=async()=>{
  const code=getCloudCode(); if(!code||!key)return;
  const btn=$('#bCloudPull'); btn.disabled=true;
  try{
    const {v}=await cloudRead(code);
    pendingImport=v;
    $('#impForm').reset();$('#impErr').textContent='';
    $('#impInfo').textContent='Backup scaricato dal Cloud ('+code+'). Inserisci la password principale per unirlo o sostituirlo.';
    if($('#dlgSet').open)$('#dlgSet').close();
    $('#dlgImp').showModal();
  }catch(e){
    toast(e.message||'Impossibile scaricare dal Cloud');
  }finally{btn.disabled=false}
};
let cloudDlgFromLock=false, pendingLockFile=null;
function openCloudDialog(fromLock){
  cloudDlgFromLock=!!fromLock;
  pendingLockFile=null;
  $('#cloudForm').reset();
  $('#cErr').textContent='';
  $('#cCode').required=true;
  $('#cCode').disabled=false;
  $('#cCode').value=fromLock?'':getCloudCode();
  $('#cPw').required=true;
  $('#cFileAlt').classList.toggle('hide',!fromLock);
  $('#cloudDlgT').textContent=fromLock?'☁️ Ripristina Cassaforte':'☁️ Collega Codice Cloud';
  $('#cloudDlgMsg').textContent=fromLock
    ?'Hai cambiato o rotto il telefono? Inserisci il tuo Codice Cloud (oppure scegli il file .json da Google Drive) e la tua Password Principale.'
    :'Inserisci un Codice Cloud già esistente su un altro dispositivo per scaricare e sincronizzare gli account.';
  if($('#dlgSet').open)$('#dlgSet').close();
  $('#dlgCloud').showModal();
}
$('#bRestoreLock').onclick=()=>openCloudDialog(true);
$('#bCloudLink').onclick=()=>openCloudDialog(false);
$('#cCancel').onclick=()=>{pendingLockFile=null;$('#dlgCloud').close()};
$('#bRestoreFileLock').onclick=()=>$('#fileLock').click();
$('#fileLock').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f)return;
  try{
    const vStr=await f.text(), v=JSON.parse(vStr);
    if(!(v&&typeof v.salt==='string'&&typeof v.iv==='string'&&typeof v.data==='string'))throw 0;
    unb64(v.salt);unb64(v.iv);unb64(v.data);
    pendingLockFile={v,vStr,name:f.name};
    $('#cCode').required=false;
    $('#cCode').value='[File: '+f.name+']';
    $('#cCode').disabled=true;
    $('#cErr').textContent='';
    $('#cPw').focus();
  }catch{
    $('#cErr').textContent='File .json non valido.';
  }
});
$('#cloudForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(musicCfg().on)Snd.prime();
  const pw=$('#cPw').value, err=$('#cErr'), btn=$('#cOk');
  err.textContent=''; btn.disabled=true;
  try{
    let v, vStr, cleanCode='';
    if(pendingLockFile){
      v=pendingLockFile.v; vStr=pendingLockFile.vStr;
    }else{
      const rawCode=$('#cCode').value.trim();
      const norm=normalizeCloudCode(rawCode);
      if(norm.length<12){err.textContent='Inserisci un Codice Cloud valido (almeno 12 caratteri).';return}
      cleanCode=norm.match(/.{1,4}/g).join('-');
      try{({v,vStr}=await cloudRead(cleanCode))}
      catch(ex){err.textContent=ex.message||'Impossibile scaricare dal Cloud.';return}
    }
    let decRes;
    try{decRes=await decryptVault(pw,v)}
    catch{err.textContent='Password principale errata.';return}
    if(cloudDlgFromLock||!key){
      const cur=localStorage.getItem('vault');
      if(cur&&cur!==vStr&&!confirm('Su questo dispositivo c’è già una cassaforte. Sostituirla con quella del backup? Gli account presenti solo qui andranno persi.'))return;
      localStorage.setItem('vault',vStr);
      if(cleanCode){localStorage.setItem('cloudCode',cleanCode);localStorage.setItem('lastCloudSync',Date.now());localStorage.removeItem('cloudErr')}
      markBackup();
      salt=decRes.salt; key=decRes.key; iter=decRes.iter; items=decRes.items; trash=[]; trashK=null; loadTrash();
      $('#dlgCloud').close();
      $('#lock').classList.add('hide'); $('#app').classList.remove('hide');
      render(); enterAnim(); bump(); checkAndRequestPersistence(true); initSync(); musicPlay();
      upgradeKdf(pw);
      toast(`Cassaforte ripristinata: ${items.length} account`);
    }else{
      if(cleanCode){localStorage.setItem('cloudCode',cleanCode);localStorage.setItem('lastCloudSync',Date.now());localStorage.removeItem('cloudErr')}
      let added=0, same=0;
      const ok=await commit(()=>{
        const res=mergeItems(items,decRes.items);
        items=res.items; added=res.added; same=res.same;
      });
      if(ok){
        $('#dlgCloud').close();
        toast(`Cloud collegato: ${added} aggiunti${same?`, ${same} già presenti`:''}`);
      }
    }
  }finally{btn.disabled=false}
});

/* Sblocco con impronta o viso (WebAuthn + estensione PRF).
   Il dispositivo produce un segreto solo dopo impronta/viso; da quel segreto si ricava una chiave che
   cifra la password principale. In localStorage resta solo la password cifrata: senza impronta non si apre. */
let bioTry=false;
const bioGet=()=>{try{const b=JSON.parse(localStorage.getItem('bio'));return b&&typeof b.id==='string'&&typeof b.iv==='string'&&typeof b.ct==='string'?b:null}catch{return null}};
const bioOff=()=>{try{localStorage.removeItem('bio')}catch{}};
async function bioAvailable(){
  try{return !!(window.PublicKeyCredential&&navigator.credentials&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())}catch{return false}
}
const bioSalt=()=>crypto.subtle.digest('SHA-256',enc.encode('cassaforte-bio-prf-v1'));
async function bioKey(out){
  const base=await crypto.subtle.importKey('raw',out,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new Uint8Array(32),info:enc.encode('cassaforte-bio-key-v1')},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function bioAssert(id){
  const cred=await navigator.credentials.get({publicKey:{
    challenge:crypto.getRandomValues(new Uint8Array(32)),rpId:location.hostname,
    allowCredentials:[{type:'public-key',id:unb64(id)}],userVerification:'required',timeout:60000,
    extensions:{prf:{eval:{first:await bioSalt()}}}
  }});
  const r=cred?.getClientExtensionResults?.()?.prf?.results?.first;
  if(!r)throw new Error('noprf');
  return new Uint8Array(r);
}
async function bioEnable(pw){
  const cred=await navigator.credentials.create({publicKey:{
    rp:{name:'Cassaforte',id:location.hostname},
    user:{id:crypto.getRandomValues(new Uint8Array(16)),name:'Cassaforte',displayName:'Cassaforte'},
    challenge:crypto.getRandomValues(new Uint8Array(32)),
    pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
    authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'preferred'},
    timeout:60000,extensions:{prf:{eval:{first:await bioSalt()}}}
  }});
  const ext=cred.getClientExtensionResults?.()?.prf;
  if(!ext||ext.enabled===false)throw new Error('noprf');
  const id=b64(cred.rawId);
  // alcuni telefoni danno il segreto già alla creazione, altri chiedono l'impronta una seconda volta
  const out=ext.results?.first?new Uint8Array(ext.results.first):await bioAssert(id);
  const k=await bioKey(out), iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(pw));
  localStorage.setItem('bio',JSON.stringify({v:1,id,iv:b64(iv),ct:b64(ct)}));
}
async function bioPassword(){
  const b=bioGet(); if(!b)throw new Error('nobio');
  const k=await bioKey(await bioAssert(b.id));
  return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(b.iv)},k,unb64(b.ct)));
}
async function updBioUI(){
  const ok=await bioAvailable(), on=!!bioGet();
  $('#bioErr').textContent='';
  $('#bioOnWrap').classList.toggle('hide',!ok||on);
  $('#bBioOff').classList.toggle('hide',!on);
  $('#bioInfo').innerHTML=on
    ?'<span class="badge-ok">Attivo</span>: nella schermata iniziale tocca “Sblocca con impronta o viso”. La password principale funziona sempre.'
    :ok?'Apri la Cassaforte con l’impronta digitale o il viso invece di scrivere la password. Funziona solo su questo dispositivo. Su molti Android il telefono propone solo impronta o PIN: è normale.'
    :'Non disponibile: imposta nel telefono un blocco schermo con impronta, viso o PIN, poi riapri la Cassaforte. Istruzioni complete nella Guida, punto 7.';
}
function updBioLock(){$('#bBio').classList.toggle('hide',!(bioGet()&&getVault()))}
$('#bBio').onclick=async()=>{
  if(musicCfg().on)Snd.prime();
  const b=$('#bBio'); b.disabled=true; $('#err').textContent='';
  try{
    const pw=await bioPassword();
    bioTry=true; $('#mp').value=pw; $('#lockForm').requestSubmit();
  }catch(e){
    console.warn('Sblocco impronta',e);
    if(e?.name!=='NotAllowedError'&&e?.name!=='AbortError'){
      $('#err').textContent='Impronta non riuscita: entra con la password principale.';
    }
  }finally{b.disabled=false}
};
$('#bBioOn').onclick=async()=>{
  const pw=$('#bioPw').value, err=$('#bioErr'), btn=$('#bBioOn'); err.textContent='';
  if(!pw){err.textContent='Scrivi la password principale.';$('#bioPw').focus();return}
  btn.disabled=true; allowExternal();
  try{
    try{await decryptVault(pw,getVault())}catch{err.textContent='Password principale non corretta.';return}
    await bioEnable(pw);
    $('#bioPw').value=''; await updBioUI(); toast('Sblocco con impronta attivato',true); buzz(30);
  }catch(e){
    console.warn('Attivazione impronta',e);
    bioOff();
    err.textContent=e?.message==='noprf'
      ?'Questo dispositivo o browser non permette lo sblocco sicuro con impronta. Prova con Chrome aggiornato (Android) o Safari (iPhone).'
      :e?.name==='NotAllowedError'?'Operazione annullata.':'Attivazione non riuscita. Riprova.';
  }finally{btn.disabled=false;extUntil=0}
};
$('#bBioOff').onclick=async()=>{
  if(!confirm('Disattivare lo sblocco con impronta o viso su questo dispositivo?'))return;
  bioOff(); await updBioUI(); toast('Sblocco con impronta disattivato');
};

/* Statistiche & Livello Cassaforte (Bronzo -> Argento -> Oro -> Diamante) */
function updStatsUI(){
  const box=$('#statsBox'); if(!box)return;
  const cnt={login:0,card:0,wifi:0,doc:0,note:0};
  let photos=0;
  for(const i of items){cnt[typeOf(i)]=(cnt[typeOf(i)]||0)+1;if(Array.isArray(i.photos))photos+=i.photos.length}
  const bytes=(localStorage.getItem('vault')||'').length;
  const cloudOn=!!getCloudCode(), lim=cloudOn?CLOUD_MAX:LOCAL_MAX; // stessi limiti del controllo delle foto
  const pct=Math.min(100,Math.round((bytes/lim)*100));
  const szTxt=bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1048576).toFixed(2)} MB`;
  const limTxt=cloudOn?'1 MB (Cloud)':'4,5 MB (Browser)';
  const audit=auditItems(items), exp=expiringItems(items,Date.now(),0);
  const lastBk=+localStorage.getItem('lastBackup')||0;
  const goals=[
    [items.length>0&&audit.warnIds.size===0&&!pwnedMap.size,'Tutte le password forti e uniche'],
    [cloudOn||!!syncHandle||(lastBk>0&&Date.now()-lastBk<14*DAY),'Cloud Sync o Backup recente attivo'],
    [!!bioGet()||lockCfg().shake,'Impronta / Viso o Scuoti-per-bloccare attivo'],
    [items.length>0&&exp.length===0,'Nessuna carta o documento scaduto']
  ];
  const score=goals.filter(g=>g[0]).length;
  const ranks=[
    ['🥉 Bronzo','#b45309'],
    ['🥉 Bronzo','#b45309'],
    ['🥈 Argento','#64748b'],
    ['🥇 Oro','#b5842a'],
    ['💎 Diamante','#2563c9']
  ];
  const [rName,rCol]=ranks[score];
  box.innerHTML=`
    <div class="dash-head">
      <div><div style="font-weight:700">Livello di Sicurezza</div><div class="mute small">${score}/4 obiettivi raggiunti</div></div>
      <span class="dash-rank" style="--rc:${rCol}">${rName}</span>
    </div>
    <div class="dash-grid">
      <div class="dash-tile"><b>${cnt.login}</b><span>🔑 Account</span></div>
      <div class="dash-tile"><b>${cnt.card}</b><span>💳 Carte</span></div>
      <div class="dash-tile"><b>${cnt.wifi}</b><span>📶 Wi-Fi</span></div>
      <div class="dash-tile"><b>${cnt.doc}</b><span>🪪 Documenti</span></div>
      <div class="dash-tile"><b>${cnt.note}</b><span>📝 Note</span></div>
      <div class="dash-tile"><b>${photos}</b><span>📷 Foto</span></div>
    </div>
    <div class="small" style="display:flex;justify-content:space-between"><span>Spazio archivio cifrato</span><b>${szTxt} / ${limTxt} (${pct}%)</b></div>
    <div class="dash-bar"><i style="width:${Math.max(2,pct)}%;background:${pct>80?'var(--bad)':'var(--brass)'}"></i></div>
    <div class="dash-goals">${goals.map(([ok,txt])=>`<div class="${ok?'badge-ok':'mute'}">${ok?'✓':'○'} ${esc(txt)}</div>`).join('')}</div>`;
}

/* Opzioni e cambio password principale */
$('#bSet').onclick=()=>{updBioUI();const c=lockCfg();$('#sIdle').value=c.idle;$('#sAway').value=c.away;$('#sShake').checked=c.shake;updStatsUI();updTrashBtn();updBkInfo();updCloudUI();checkAndRequestPersistence(false);$('#pErr').textContent='';$('#dlgSet').showModal()};
$('#bSetClose').onclick=()=>$('#dlgSet').close();
$('#pwForm').addEventListener('submit',async e=>{
  e.preventDefault(); const err=$('#pErr'); err.textContent='';
  const o=$('#pOld').value, n=$('#pNew').value, v=getVault(), s=sess;
  if(n.length<8){err.textContent='La nuova password deve avere almeno 8 caratteri.';return}
  if(n!==$('#pNew2').value){err.textContent='Le due nuove password non coincidono.';return}
  const btn=e.submitter; if(btn)btn.disabled=true;
  try{
    try{const k=await derive(o,unb64(v.salt),iterOf(v));await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv)},k,unb64(v.data))}
    catch{err.textContent='La password attuale non è corretta.';return}
    if(s!==sess||!key)return; // bloccata nel frattempo: non toccare nulla
    const ns=crypto.getRandomValues(new Uint8Array(16)), nk=await derive(n,ns,ITER);
    if(s!==sess||!key)return; // idem: senza questo controllo salveremmo una lista vuota con la nuova password
    const os=salt, ok=key, oi=iter; salt=ns; key=nk; iter=ITER;
    try{await persist()}
    catch(x){console.error(x);if(s===sess){salt=os;key=ok;iter=oi}err.textContent='Salvataggio non riuscito: la password principale NON è stata cambiata.';return}
    const hadBio=!!bioGet(); bioOff();
    $('#pwForm').reset(); $('#dlgSet').close(); toast(hadBio?'Password cambiata: riattiva l’impronta in Opzioni e fai un backup':'Password principale cambiata: fai un nuovo backup');
  }finally{if(btn)btn.disabled=false}
});

/* "Tutto quello che sa fare": vetrina di tutte le funzioni, separata dalla Guida */
const openFeat=()=>{if($('#dlgSet').open)$('#dlgSet').close();$('#dlgFeat').showModal();$('#dlgFeat').scrollTop=0};
['#bFeat','#bFeatLock','#bFeatSet'].forEach(s=>$(s).onclick=openFeat);
$('#featClose').onclick=()=>$('#dlgFeat').close();

/* Manuale e Guida Sicurezza */
const openHelp=()=>$('#dlgHelp').showModal();
const closeHelp=()=>$('#dlgHelp').close();
$('#bHelp').onclick=openHelp;
$('#bHelpLock').onclick=openHelp;
$('#bHelpFromSet').onclick=()=>{ $('#dlgSet').close(); openHelp(); };
$('#bHelpClose').onclick=closeHelp;
$('#bHelpCloseBottom').onclick=closeHelp;

/* Stampa archivio cartaceo: le password compaiono in chiaro solo dopo aver reinserito la password principale,
   e l'anteprima viene cancellata dalla pagina appena si chiude o la cassaforte si blocca */
function buildPrint(notes){
  const ord=c=>{const k=CATS.indexOf(c);return k<0?99:k};
  const rows=[...items].sort((a,b)=>ord(a.cat)-ord(b.cat)||a.name.localeCompare(b.name,'it',{numeric:true}));
  const when=new Date().toLocaleString('it-IT',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const f=v=>v?esc(v):'<span class="pr-empty">—</span>';
  let out=`<header class="pr-head"><h2>Cassaforte · Archivio password</h2><div class="pr-meta">Stampato il ${esc(when)} · ${rows.length} schede</div><p class="pr-warn">DOCUMENTO RISERVATO: contiene password in chiaro. Conservalo in un luogo sicuro e distruggi le stampe precedenti.</p></header>`;
  let cur=null;
  for(const i of rows){
    if(i.cat!==cur){cur=i.cat;out+=`<h3 class="pr-cat">${esc(cur)}</h3>`}
    const t=typeOf(i), tr=(k,v,cls='')=>`<tr><th>${k}</th><td${cls?` class="${cls}"`:''}>${f(v)}</td></tr>`;
    out+=`<section class="pr-item"><div class="pr-name">${i.fav?'★ ':''}${t==='login'?'':TYPE_INFO[t].e+' '}${esc(i.name)}</div><table>`
      +(t==='card'?tr('Intestatario',i.holder)+tr('Numero',fmtCard(i.number),'pr-pw')+tr('Scadenza',i.exp)+tr('CVV',i.cvv,'pr-pw')+(i.pin?tr('PIN',i.pin,'pr-pw'):'')
        :t==='wifi'?tr('Rete (SSID)',i.name)+tr('Password',i.pass,'pr-pw')
        :t==='note'?tr('Testo',i.secret,'pr-pw pr-note')
        :tr('Utente',i.user)+tr('Password',i.pass,'pr-pw'))
      +(i.url?`<tr><th>Sito</th><td>${esc(i.url)}</td></tr>`:'')
      +(notes&&i.note?`<tr><th>Note</th><td class="pr-note">${esc(i.note)}</td></tr>`:'')
      +'</table></section>';
  }
  return out+`<div class="pr-foot">Cassaforte v${esc(APP_VERSION)} · Questa stampa sostituisce quelle precedenti.</div>`;
}
function closePrint(){$('#printArea').innerHTML='';$('#printSheet').innerHTML='';$('#prForm').reset();extUntil=0;if($('#dlgPrint').open)$('#dlgPrint').close()}
$('#bPrint').onclick=()=>{
  if(!items.length){toast('Non ci sono account da stampare');return}
  $('#prForm').reset();$('#prErr').textContent='';$('#printArea').innerHTML='';
  $('#prStep1').classList.remove('hide');$('#prStep2').classList.add('hide');
  if($('#dlgSet').open)$('#dlgSet').close();
  $('#dlgPrint').showModal();
};
$('#prCancel').onclick=closePrint;
$('#prClose').onclick=closePrint;
$('#dlgPrint').addEventListener('close',()=>{$('#printArea').innerHTML='';$('#printSheet').innerHTML='';$('#prForm').reset()}); // anche con il tasto Esc
$('#prForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const s=sess, v=getVault(), err=$('#prErr'), btn=$('#prOk'); err.textContent=''; btn.disabled=true;
  try{
    try{const k=await derive($('#prPw').value,unb64(v.salt),iterOf(v));await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv)},k,unb64(v.data))}
    catch{err.textContent='Password non corretta.';return}
    if(s!==sess||!key)return;
    $('#prPw').value='';
    $('#printArea').innerHTML=buildPrint($('#prNotes').checked);
    $('#prStep1').classList.add('hide');$('#prStep2').classList.remove('hide');
    $('#dlgPrint').scrollTop=0;
  }finally{btn.disabled=false}
});
// La finestra di stampa (soprattutto su telefono) manda la pagina in background: non bloccare per 10 minuti
// Si stampa una copia fuori dalla finestra modale: dentro la modale il browser stamperebbe solo la prima pagina
$('#prGo').onclick=()=>{$('#printSheet').innerHTML=$('#printArea').innerHTML;allowExternal(10*60*1000);window.print()};
addEventListener('afterprint',()=>{$('#printSheet').innerHTML=''});

/* Tema: automatico (segue il sistema), chiaro o scuro. Applicato in anticipo da theme.js */
const curTheme=()=>document.documentElement.getAttribute('data-theme')||'auto';
const darkMq=matchMedia('(prefers-color-scheme: dark)');
const isDark=()=>curTheme()==='dark'||(curTheme()==='auto'&&darkMq.matches);
const SUN=ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>');
const MOON=ic('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>');
function updThemeUI(){
  document.querySelectorAll('#themeSel [data-t]').forEach(b=>{const on=b.dataset.t===curTheme();b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
  // Di notte mostra il sole (per passare al giorno), di giorno la luna (per passare alla notte)
  const d=isDark();
  $('#bTheme').innerHTML=(d?SUN:MOON)+`<span class="lbl"> ${d?'Giorno':'Notte'}</span>`;
  $('#bTheme').title=d?'Passa al tema giorno':'Passa al tema notte';
}
$('#bTheme').onclick=()=>{setTheme(isDark()?'light':'dark');toast(isDark()?'Tema notte':'Tema giorno')};
darkMq.addEventListener?.('change',updThemeUI);
function setTheme(t){
  if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);
  else{t='auto';document.documentElement.removeAttribute('data-theme')}
  try{t==='auto'?localStorage.removeItem('theme'):localStorage.setItem('theme',t)}catch{}
  updThemeUI();
}
$('#themeSel').addEventListener('click',e=>{const b=e.target.closest('[data-t]');if(b)setTheme(b.dataset.t)});
/* 🎧 La mia musica: fino a 5 brani scelti dal telefono, salvati in IndexedDB SOLO su questo dispositivo
   (non nella cassaforte: pesano troppo per il backup e il Cloud). Suonano in fila e poi ricominciano. */
const MY_MAX=5, MY_SIZE=25*1024*1024;
function myDb(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open('cassaforte-musica',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('songs',{keyPath:'id'});
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  });
}
async function myTx(mode,fn){
  const db=await myDb();
  return new Promise((res,rej)=>{
    const tx=db.transaction('songs',mode), req=fn(tx.objectStore('songs'));
    tx.oncomplete=()=>{db.close();res(req?.result)};
    tx.onerror=tx.onabort=()=>{db.close();rej(tx.error||new Error('IndexedDB'))};
  });
}
const My={
  el:new Audio(), list:[], i:0, on:false,
  get playing(){return this.on&&!this.el.paused},
  async load(){
    try{
      const rows=(await myTx('readonly',st=>st.getAll()))||[];
      this.list.forEach(s=>URL.revokeObjectURL(s.url));
      this.list=rows.sort((a,b)=>a.at-b.at).map(s=>({id:s.id,name:s.name,url:URL.createObjectURL(s.blob)}));
    }catch(e){console.warn('La mia musica',e);this.list=[]}
    if(this.i>=this.list.length)this.i=0;
  },
  track(i){
    if(!this.list.length)return false;
    this.i=((i%this.list.length)+this.list.length)%this.list.length;
    this.el.src=this.list[this.i].url; this.el.loop=this.list.length===1;
    return true;
  },
  start(i){
    if(!this.list.length)return false;
    this.on=true;
    if(i!=null||!this.el.src||!this.list.some(s=>s.url===this.el.src))this.track(i??this.i);
    this.el.muted=false; this.el.volume=.6;
    this.el.play().catch(e=>console.warn('La mia musica',e));
    return true;
  },
  stop(){this.on=false;this.el.pause()},
  pause(){this.el.pause()},
  resume(){if(this.on&&this.list.length)this.el.play().catch(()=>{})},
  // dentro il tocco dell'utente: su iPhone "sblocca" il lettore, senza far sentire nulla
  prime(){
    if(!this.list.length)return;
    if(!this.el.src)this.track(this.i);
    if(!this.el.paused)return;
    this.el.muted=true;
    this.el.play().then(()=>{if(!this.on)this.el.pause();this.el.muted=false}).catch(()=>{this.el.muted=false});
  }
};
My.el.preload='auto';
My.el.addEventListener('ended',()=>{if(My.on&&My.list.length>1){My.track(My.i+1);My.el.play().catch(()=>{})}});
['play','pause'].forEach(ev=>My.el.addEventListener(ev,()=>{updMusicUI();renderMy()}));
My.el.addEventListener('error',()=>{if(My.on&&My.el.src){console.warn('Brano non leggibile');if(My.list.length>1){My.track(My.i+1);My.el.play().catch(()=>{})}else{My.stop();toast('Questo brano non si può riprodurre su questo dispositivo')}}});
/* Un solo punto di comando per la musica generata (music.js) e per la propria playlist */
const Snd={
  get playing(){return !!window.Music?.playing||My.playing},
  mine(){return musicCfg().st==='mine'},
  stop(){window.Music?.stop();My.stop()},
  pause(){window.Music?.pause();My.pause()},
  resume(){if(this.mine())My.resume();else window.Music?.resume()},
  prime(){if(this.mine())My.prime();else window.Music?.prime()}
};
function renderMy(){
  const ul=$('#myList'); if(!ul)return;
  $('#bMyAdd').disabled=My.list.length>=MY_MAX;
  $('#myCount').textContent=`${My.list.length}/${MY_MAX}`;
  ul.innerHTML=My.list.length?My.list.map((s,k)=>{
    const cur=My.playing&&k===My.i;
    return `<li class="${cur?'on':''}" data-k="${k}"><span class="my-n">${cur?'<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>':(k+1)+'.'}</span><span class="my-t">${esc(s.name)}</span>
      <button type="button" class="btn s ic" data-y="p" title="Ascolta" aria-label="Ascolta ${esc(s.name)}">▶</button>
      <button type="button" class="btn s ic" data-y="x" title="Togli" aria-label="Togli ${esc(s.name)}">✕</button></li>`;
  }).join(''):'<li class="my-none">Nessuna canzone: tocca “Aggiungi canzoni dal telefono”.</li>';
}

/* Musica di sottofondo (music.js): parte da sola allo sblocco; si spegne con il pulsante in alto o da Opzioni */
const MUSIC_STYLES=['ambient','lounge','cyber','guitar','rain','sea','birds','forest','mine'];
const musicCfg=()=>{let on=true,st='ambient';try{on=localStorage.getItem('music')!=='off';const s=localStorage.getItem('musicStyle');if(MUSIC_STYLES.includes(s))st=s}catch{}return{on,st}};
const NOTE_P='<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';
const MUSIC_ON=ic(NOTE_P), MUSIC_OFF=ic(NOTE_P+'<path d="M2 2l20 20"/>');
function updMusicUI(){
  const c=musicCfg(), playing=Snd.playing, b=$('#bMusic');
  b.classList.toggle('on',c.on);
  b.innerHTML=(c.on&&playing?'<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>':c.on?MUSIC_ON:MUSIC_OFF)+'<span class="lbl"> Musica</span>';
  b.title=c.on?'Spegni la musica':'Accendi la musica'; b.setAttribute('aria-label',b.title); b.setAttribute('aria-pressed',c.on);
  document.querySelectorAll('#musicSel [data-m],#musicSel2 [data-m],#musicSel3 [data-m]').forEach(x=>{const on=c.on?x.dataset.m===c.st:x.dataset.m==='off';x.classList.toggle('on',on);x.setAttribute('aria-pressed',on)});
}
function musicPlay(){
  const c=musicCfg(); if(!c.on||!key||document.hidden)return;
  if(c.st==='mine'){window.Music?.stop();if(My.start())updMusicUI();return}
  My.stop(); if(!window.Music)return;
  Music.start(c.st).then(updMusicUI).catch(e=>console.warn('Musica',e));
}
function musicStop(){Snd.stop();updMusicUI();renderMy()}
$('#bMusic').onclick=()=>{
  const on=!musicCfg().on; try{localStorage.setItem('music',on?'on':'off')}catch{}
  if(on){Snd.prime();musicPlay();toast('Musica accesa',true)}else{musicStop();toast('Musica spenta')}
  updMusicUI();
};
const onMusicPick=e=>{
  const b=e.target.closest('[data-m]'); if(!b)return; const m=b.dataset.m;
  if(m==='off'){try{localStorage.setItem('music','off')}catch{};musicStop();return}
  if(!MUSIC_STYLES.includes(m))return;
  if(m==='mine'&&!My.list.length){toast('Aggiungi prima almeno una canzone dal telefono');$('#bMyAdd').focus();return}
  try{localStorage.setItem('music','on');localStorage.setItem('musicStyle',m)}catch{}
  Snd.prime();musicPlay();updMusicUI();
};
$('#musicSel').addEventListener('click',onMusicPick);
$('#musicSel2').addEventListener('click',onMusicPick);
$('#musicSel3').addEventListener('click',onMusicPick);
$('#bMyAdd').onclick=()=>{allowExternal();$('#myInp').value='';$('#myInp').click()};
$('#myInp').addEventListener('change',async e=>{
  const files=[...(e.target.files||[])]; e.target.value=''; if(!files.length)return;
  let added=0; const skip=[];
  for(const f of files){
    if(My.list.length+added>=MY_MAX){skip.push(`${f.name}: massimo ${MY_MAX} canzoni`);continue}
    if(!/^audio\//.test(f.type)&&!/\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i.test(f.name)){skip.push(`${f.name}: non è un file audio`);continue}
    if(f.size>MY_SIZE){skip.push(`${f.name}: troppo grande (max 25 MB)`);continue}
    try{
      const name=f.name.replace(/\.[^.]+$/,'').replace(/[_]+/g,' ').trim().slice(0,80)||'Canzone';
      await myTx('readwrite',st=>st.put({id:crypto.randomUUID(),name,blob:f,at:Date.now()+added}));
      added++;
    }catch(x){console.warn(x);skip.push(`${f.name}: spazio del telefono esaurito`);break}
  }
  await My.load(); renderMy();
  if(added){
    toast(added===1?'Canzone aggiunta':`${added} canzoni aggiunte`,true);
    // la prima volta passa subito alla propria musica
    try{localStorage.setItem('music','on');localStorage.setItem('musicStyle','mine')}catch{}
    if(key){My.start(My.list.length-added);updMusicUI()}
  }
  if(skip.length)$('#myInfo').textContent='Non aggiunte: '+skip.join(' · ');
});
$('#myList').addEventListener('click',async e=>{
  const b=e.target.closest('button[data-y]'); if(!b)return;
  const k=+b.closest('li').dataset.k, s=My.list[k]; if(!s)return;
  if(b.dataset.y==='p'){
    try{localStorage.setItem('music','on');localStorage.setItem('musicStyle','mine')}catch{}
    window.Music?.stop(); My.start(k); updMusicUI(); return;
  }
  const wasCur=k===My.i, wasOn=My.playing;
  if(wasCur){My.stop();My.el.removeAttribute('src');My.el.load()}
  try{await myTx('readwrite',st=>st.delete(s.id))}catch(x){console.warn(x);toast('Non riesco a togliere la canzone');return}
  if(k<My.i)My.i--;
  await My.load();
  if(!My.list.length&&musicCfg().st==='mine'){try{localStorage.setItem('musicStyle','ambient')}catch{}}
  if(wasCur&&wasOn&&My.list.length)My.start(My.i);
  renderMy(); updMusicUI(); toast('Canzone tolta');
});
My.load().then(renderMy);

updMusicUI();

/* Colore della cassaforte (applicato in anticipo da theme.js) */
const ACCENTS=['oro','smeraldo','rubino','zaffiro','ametista'];
const curAccent=()=>document.documentElement.getAttribute('data-accent')||'oro';
function updAccentUI(){document.querySelectorAll('#accentSel [data-ac]').forEach(b=>{const on=b.dataset.ac===curAccent();b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)})}
$('#accentSel').addEventListener('click',e=>{
  const b=e.target.closest('[data-ac]');if(!b||!ACCENTS.includes(b.dataset.ac))return;
  const a=b.dataset.ac;
  if(a==='oro')document.documentElement.removeAttribute('data-accent');else document.documentElement.setAttribute('data-accent',a);
  try{a==='oro'?localStorage.removeItem('accent'):localStorage.setItem('accent',a)}catch{}
  updAccentUI();toast('Colore: '+b.textContent.trim(),true);
});
updAccentUI();
updThemeUI();

/* Versione e novità */
document.querySelectorAll('.appver').forEach(e=>e.textContent=APP_VERSION);
$('#news').innerHTML=CHANGELOG.map(([v,l],i)=>`<div class="news-v"><span class="ver">v${esc(v)}</span>${i===0?'<span class="now">attuale</span>':''}</div><ul>${l.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul>`).join('');

/* Aggiornamenti: se sul sito c'è una versione più nuova compare l'avviso "Aggiorna" (version.json non passa dalla cache) */
let updAt=0;
async function checkUpdate(force){
  if(navigator.onLine===false||(!force&&Date.now()-updAt<60*1000))return;
  updAt=Date.now();
  try{
    const ctl=new AbortController(), t=setTimeout(()=>ctl.abort(),8000);
    const r=await fetch('version.json?t='+Date.now(),{cache:'no-store',signal:ctl.signal}); clearTimeout(t);
    if(!r.ok)return;
    const v=String((await r.json())?.version||'');
    if(cmpVer(v,APP_VERSION)>0){$('#updTxt').textContent=`Nuova versione ${v}`;$('#updBar').classList.remove('hide')}
  }catch{} // senza rete si riprova più tardi
}
$('#updBtn').onclick=async()=>{
  const b=$('#updBtn'); b.disabled=true; b.textContent='Aggiorno…';
  try{
    // scarica subito i file nuovi (aggiorna anche la copia offline), così il ricaricamento non riprende quelli vecchi
    const reg=await navigator.serviceWorker?.getRegistration?.(); await reg?.update().catch(()=>{});
    await Promise.race([
      Promise.all(['./','index.html','app.js','core.js','theme.js','music.js','qrcode.js'].map(f=>fetch(f,{cache:'no-store'}).catch(()=>{}))),
      new Promise(r=>setTimeout(r,15000))
    ]);
  }catch{}
  location.reload();
};
$('#updX').onclick=()=>$('#updBar').classList.add('hide');
setTimeout(()=>checkUpdate(true),4000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdate()});
addEventListener('online',()=>checkUpdate(true)); // tornato internet: controlla subito
setInterval(()=>checkUpdate(),30*60*1000);

/* Dopo un aggiornamento: riquadro con le novità, una volta sola */
const seenVer=()=>{try{return localStorage.getItem('seenVer')||''}catch{return ''}};
const setSeen=()=>{try{localStorage.setItem('seenVer',APP_VERSION)}catch{}};
function updNews(){
  const box=$('#newsBox');
  // chi usava già l'app prima di questa funzione non ha "seenVer": gli mostriamo le novità di questa versione
  const seen=seenVer()||(getVault()?CHANGELOG[1]?.[0]||'':APP_VERSION);
  if(!seenVer()&&!getVault())setSeen();
  if(cmpVer(APP_VERSION,seen)<=0){box.classList.add('hide');box.innerHTML='';return}
  if(box.innerHTML)return box.classList.remove('hide');
  const list=CHANGELOG.filter(([v])=>cmpVer(v,seen)>0).flatMap(([,l])=>l).slice(0,8);
  box.innerHTML=`<div class="nb-h">🎉 Cassaforte aggiornata alla versione ${esc(APP_VERSION)}</div>
    <ul>${list.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul>
    <div class="row" style="gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn s" data-n="all">✨ Tutto quello che sa fare</button><button type="button" class="btn s p" data-n="ok">Ok, ho capito</button></div>`;
  box.classList.remove('hide');
}
$('#newsBox').addEventListener('click',e=>{
  const b=e.target.closest('button[data-n]'); if(!b)return;
  setSeen(); $('#newsBox').classList.add('hide'); $('#newsBox').innerHTML='';
  if(b.dataset.n==='all')openFeat();
});

showLock();
resetPwEyes();
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
