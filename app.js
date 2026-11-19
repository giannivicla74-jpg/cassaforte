const $=s=>document.querySelector(s);
let key=null, salt=null, iter=0, items=[], editId=null, qId=null, shown=new Set(), lockT, clipT, clipAt=0, clipClearPending=false;
let syncHandle=null, pendingHandle=null, pendingImport=null;
let sess=0;            // cresce a ogni blocco: invalida le operazioni asincrone iniziate prima
let saveQ=Promise.resolve(); // serializza i salvataggi
let cloudQ=Promise.resolve(); // invii al Cloud in sottofondo, uno alla volta
let extUntil=0;        // finestra in cui la pagina può andare in background (condivisione, selettore file) senza bloccarsi
/* Versione dell'app: a ogni modifica pubblicata aumenta il numero e aggiungi una voce in CHANGELOG */
const APP_VERSION='1.9.2';
const CHANGELOG=[
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
  const job=saveQ.then(async()=>{
    if(!k||!s||!it)throw new Error('Cassaforte bloccata');
    const vStr=await encryptVault(k,s,it,snapshot);
    localStorage.setItem('vault',vStr);
    await syncWrite(vStr);
    // Il Cloud non blocca il salvataggio: con segnale debole l'app resterebbe ferma ad aspettare
    cloudQ=cloudQ.then(()=>cloudWrite(vStr)).catch(()=>{});
  });
  saveQ=job.catch(()=>{});
  return job;
}
/* Applica una modifica e la salva; se il salvataggio fallisce la annulla */
async function commit(fn,msg){
  const prev=structuredClone(items), prevChg=localStorage.getItem('lastChange'), s=sess;
  fn();
  localStorage.setItem('lastChange',Date.now());
  try{await persist();render();if(msg)toast(msg);return true}
  catch(e){
    console.error(e);
    if(s===sess){
      items=prev;
      if(prevChg)localStorage.setItem('lastChange',prevChg);else localStorage.removeItem('lastChange');
      render();toast('Salvataggio non riuscito: modifica annullata');
    }
    else toast('Cassaforte bloccata: modifica non salvata');
    return false;
  }
}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),2200)}

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
  resetPwEyes();
  $('#lock').classList.remove('hide'); $('#app').classList.add('hide');
}
function lock(){
  sess++; key=null; salt=null; iter=0; items=[]; shown.clear(); clearTimeout(lockT); clearTimeout(awayT);
  editId=qId=null; pendingImport=null; cat='Tutti'; extUntil=0; hiddenAt=0; keepOpen=false; updKeepUI();
  clearClip(true);
  ['dlg','dlgSet','dlgQ','dlgHelp','dlgImp','dlgPrint','dlgCloud'].forEach(i=>{if($('#'+i).open)$('#'+i).close()});
  ['#pwForm','#fQ','#form','#impForm','#cloudForm'].forEach(f=>$(f).reset());
  $('#pErr').textContent=''; $('#impErr').textContent=''; $('#cErr').textContent='';
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
  return{idle:IDLE_OPTS.includes(c.idle)?c.idle:2, away:AWAY_OPTS.includes(c.away)?c.away:0};
}
function saveLockCfg(){
  const c={idle:+$('#sIdle').value, away:+$('#sAway').value};
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
// Un'altra scheda ha modificato la cassaforte: blocca per non sovrascrivere i suoi dati
addEventListener('storage',e=>{
  if(e.key!=='vault'&&e.key!==null)return;
  if(key){lock();toast('Cassaforte modificata in un’altra scheda: sbloccala di nuovo')}
  else if(!$('#mp').value)showLock();
});

$('#lockForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const pw=$('#mp').value, v=getVault(), btn=$('#lockBtn'); $('#err').textContent='';
  btn.disabled=true;
  try{
    if(!v){
      if(pw.length<8){$('#err').textContent='Usa almeno 8 caratteri.';return}
      if(pw!==$('#mp2').value){$('#err').textContent='Le due password non coincidono.';return}
      salt=crypto.getRandomValues(new Uint8Array(16)); key=await derive(pw,salt,ITER); iter=ITER; items=[];
      try{await persist()}catch(err){console.error(err);key=salt=null;iter=0;$('#err').textContent='Impossibile salvare nel browser (memoria piena o bloccata).';return}
    }else{
      let decRes;
      try{decRes=await decryptVault(pw,v)}
      catch{$('#err').textContent='Password errata.';return}
      salt=decRes.salt; key=decRes.key; iter=decRes.iter; items=decRes.items;
    }
    $('#lock').classList.add('hide'); $('#app').classList.remove('hide'); render(); bump(); checkAndRequestPersistence(true); initSync();
    upgradeKdf(pw);
  }finally{btn.disabled=false}
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
const IC={user:ic('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),key:ic('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>'),eye:ic('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),eyeoff:ic('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6A16 16 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),link:ic('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),edit:ic('<path d="M4 20h4L19 9l-4-4L4 16z"/>')};
const hue=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))%360;return h};
let cat='Tutti';
const star=f=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="${f?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>`;
function updMeter(){const r=strength($('#fPass').value);$('#mBar').style.width=r.p+'%';$('#mBar').style.background=r.c;$('#mTxt').textContent=r.t?'Robustezza: '+r.t:''}
$('#fPass').addEventListener('input',updMeter);
$('#chips').addEventListener('click',e=>{const b=e.target.closest('[data-c]');if(!b)return;cat=b.dataset.c;render()});
try{const sb=localStorage.getItem('sortBy');if(['az','recent','cat'].includes(sb))$('#sortBy').value=sb}catch{}
$('#sortBy').addEventListener('change',()=>{try{localStorage.setItem('sortBy',$('#sortBy').value)}catch{};render()});

function allKnownCats(){
  return [...new Set([...CATS,...items.map(i=>i.cat||'Altro')])];
}
function render(){
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
    const lbl=c==='★'?'★ Preferiti':c==='!warn'?`⚠️ Da controllare (${audit.warnIds.size})`:esc(c);
    const cls=`chip${c==='!warn'?' warn-chip':''}${c===cat?' on':''}`;
    return `<button class="${cls}" data-c="${esc(c)}">${lbl}</button>`;
  }).join(''):'';
  const rows=filterItems(items,cat,q,$('#sortBy').value,audit.warnIds);
  $('#list').innerHTML=rows.length?rows.map(i=>{
    const href=safeUrl(i.url);
    const tags=[
      `<span class="tag">${esc(i.cat||'Altro')}</span>`,
      audit.weakIds.has(i.id)?'<span class="tag w">Password debole</span>':'',
      audit.dupIds.has(i.id)?'<span class="tag w">Password riutilizzata</span>':'',
      audit.oldIds.has(i.id)?'<span class="tag w">Oltre 1 anno</span>':''
    ].join('');
    return`
    <li class="it" data-id="${esc(i.id)}">
      <div class="top">
        <div class="av" style="--h:${hue(i.name)}">${esc(i.name.trim().charAt(0).toUpperCase())}</div>
        <div class="meta"><h2>${esc(i.name)}${tags}</h2><div class="u">${esc(i.user)}</div></div>
        <button class="star${i.fav?' on':''}" data-a="fv" aria-label="${i.fav?'Rimuovi dai preferiti':'Aggiungi ai preferiti'}">${star(i.fav)}</button>
      </div>
      ${i.pass?`<div class="pwbox"><span>${shown.has(i.id)?esc(i.pass):'••••••••••'}</span></div>`:`<div class="pwbox none"><span>Nessuna password salvata</span></div>`}
      ${i.note?`<div class="note">${esc(i.note)}</div>`:''}
      <div class="acts">
        <button class="btn s" data-a="cu">${IC.user}Utente</button>
        <button class="btn s" data-a="cp">${IC.key}Password</button>
        <button class="btn s" data-a="sh">${shown.has(i.id)?IC.eyeoff+'Nascondi':IC.eye+'Mostra'}</button>
        ${href?`<a class="btn s" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${IC.link}Sito</a>`:''}
        <button class="btn s" data-a="ed">${IC.edit}Modifica</button>
      </div>
    </li>`}).join(''):`<li class="empty mute"><div class="mark" style="width:56px;height:56px;border-radius:18px"><img src="icon-192.png" alt="Cassaforte"></div>${items.length?'Nessun account corrisponde.':'Non hai ancora salvato nulla.<br>Premi <b>+ Aggiungi</b> per inserire il primo account.'}</li>`;
}
$('#q').addEventListener('input',render);

/* Appunti: svuotati dopo 30 s. Il browser permette di scrivere negli appunti solo con la pagina in primo piano,
   quindi se in quel momento sei in un'altra app li svuotiamo appena torni (o al blocco manuale). */
async function copy(t,m){
  try{await navigator.clipboard.writeText(t);toast(m);clipAt=Date.now();clipClearPending=false;clearTimeout(clipT);clipT=setTimeout(()=>clearClip(),30000)}
  catch{toast('Copia non riuscita')}
}
function clearClip(force){
  if(!clipAt)return;
  if(force){clipClearPending=true;clearTimeout(clipT)}
  if((!force&&!clipClearPending&&Date.now()-clipAt<30000)||!document.hasFocus())return;
  navigator.clipboard.writeText('').then(()=>{clipAt=0;clipClearPending=false;clearTimeout(clipT)}).catch(()=>{});
}
addEventListener('focus',()=>clearClip());

$('#list').addEventListener('click',e=>{
  const b=e.target.closest('button[data-a]'); if(!b)return;
  const id=b.closest('li').dataset.id, it=items.find(x=>x.id===id); if(!it)return;
  const a=b.dataset.a;
  if(a==='cu')copy(it.user,'Utente copiato');
  if(a==='cp')copy(it.pass,'Password copiata (si cancella tra 30 s)');
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
function openForm(it){
  editId=it?it.id:null;
  $('#dlgT').textContent=it?'Modifica account':'Nuovo account';
  $('#fName').value=it?.name||'';$('#fUser').value=it?.user||'';$('#fPass').value=it?.pass||'';
  $('#fUrl').value=it?.url||'';$('#fNote').value=it?.note||'';$('#fFav').checked=!!it?.fav;
  populateCatSelect(it?.cat||'Altro');
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
  updMeter();$('#dlg').showModal();
}
$('#bAdd').onclick=()=>openForm(null);
$('#bCancel').onclick=()=>$('#dlg').close();
$('#bGen').onclick=()=>{const g=gen();if(g){$('#fPass').value=g;updMeter()}};
$('#form').addEventListener('submit',async e=>{
  e.preventDefault();
  let chosenCat=$('#fCat').value;
  if(chosenCat==='__new__'){
    chosenCat=$('#fCatNew').value.trim();
    if(!chosenCat){toast('Inserisci il nome della nuova categoria');$('#fCatNew').focus();return}
  }
  const d=clean({name:$('#fName').value.trim(),user:$('#fUser').value.trim(),pass:$('#fPass').value,url:normUrl($('#fUrl').value),note:$('#fNote').value.trim(),cat:chosenCat,fav:$('#fFav').checked});
  if(!$('#fName').value.trim())return;
  if(d.url&&!safeUrl(d.url)){toast('Indirizzo del sito non valido (usa http:// o https://)');$('#fUrl').focus();return}
  const id=editId, btn=$('#bSave'); btn.disabled=true;
  try{
    const ok=await commit(()=>{
      if(id){
        const it=items.find(x=>x.id===id);
        if(it){
          const meta=recordPasswordChange(it,d.pass);
          Object.assign(it,d,meta,{id});
        }
      }else{
        items.push({...d,id:crypto.randomUUID(),updatedAt:Date.now()});
      }
    },'Salvato');
    if(ok)$('#dlg').close();
  }finally{btn.disabled=false}
});
$('#bDel').onclick=async()=>{
  if(!confirm('Eliminare questo account? L’operazione non si può annullare.'))return;
  const id=editId;
  if(await commit(()=>{items=items.filter(x=>x.id!==id)},'Eliminato'))$('#dlg').close();
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
$('#qGen').onclick=()=>{const g=gen();if(g){$('#qPass').value=g;updQ()}};
$('#qCancel').onclick=()=>$('#dlgQ').close();
$('#fQ').addEventListener('submit',async e=>{
  e.preventDefault();
  const id=qId, p=$('#qPass').value, it=items.find(x=>x.id===id); if(!it||!p)return;
  if(await commit(()=>{Object.assign(it,recordPasswordChange(it,p),{pass:p})},'Password aggiornata'))$('#dlgQ').close();
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
function updCloudUI(state=''){
  const code=getCloudCode(), active=!!code;
  $('#cloudCodeWrap').classList.toggle('hide',!active);
  $('#cloudCodeTxt').textContent=code;
  $('#bCloudEnable').classList.toggle('hide',active);
  $('#bCloudLink').textContent=active?'Cambia Codice Cloud':'Ho già un Codice Cloud';
  $('#bCloudPull').classList.toggle('hide',!active);
  $('#bCloudDisable').classList.toggle('hide',!active);
  if(!active){
    $('#cloudInfo').textContent='Salva automaticamente una copia cifrata sul Cloud a ogni modifica. Nemmeno il server può leggerla senza la tua Password Principale.';
  }else if(state==='error'){
    $('#cloudInfo').innerHTML='<span class="badge-no">Errore di rete:</span> ultimo salvataggio Cloud non riuscito (riproverà al prossimo salvataggio).';
  }else{
    const t=+localStorage.getItem('lastCloudSync');
    const when=t?new Date(t).toLocaleString('it-IT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'attivo';
    $('#cloudInfo').innerHTML=`<span class="badge-ok">Cloud Sync attivo</span> (${esc(when)}): ogni modifica viene salvata cifrata sul Cloud.`;
  }
}
async function cloudWrite(vStr){
  const code=getCloudCode();
  if(!code||!vStr)return false;
  try{
    const docId=await cloudDocId(code);
    const res=await fetch(CLOUD_URL+docId,{
      method:'PATCH',
      signal:AbortSignal.timeout?AbortSignal.timeout(20000):undefined,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fields:{vault:{stringValue:vStr},updatedAt:{integerValue:String(Date.now())}}})
    });
    if(!res.ok)throw new Error('HTTP '+res.status);
    localStorage.setItem('lastCloudSync',Date.now());
    markBackup();
    updCloudUI('ok');
    return true;
  }catch(e){
    console.warn('Cloud sync write error',e);
    updCloudUI('error');
    return false;
  }
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
  localStorage.removeItem('cloudCode');
  updCloudUI();
  toast('Cloud Sync disattivato');
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
      if(cleanCode){localStorage.setItem('cloudCode',cleanCode);localStorage.setItem('lastCloudSync',Date.now())}
      markBackup();
      salt=decRes.salt; key=decRes.key; iter=decRes.iter; items=decRes.items;
      $('#dlgCloud').close();
      $('#lock').classList.add('hide'); $('#app').classList.remove('hide');
      render(); bump(); checkAndRequestPersistence(true); initSync();
      upgradeKdf(pw);
      toast(`Cassaforte ripristinata: ${items.length} account`);
    }else{
      if(cleanCode){localStorage.setItem('cloudCode',cleanCode);localStorage.setItem('lastCloudSync',Date.now())}
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

/* Opzioni e cambio password principale */
$('#bSet').onclick=()=>{const c=lockCfg();$('#sIdle').value=c.idle;$('#sAway').value=c.away;updBkInfo();updCloudUI();checkAndRequestPersistence(false);$('#pErr').textContent='';$('#dlgSet').showModal()};
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
    $('#pwForm').reset(); $('#dlgSet').close(); toast('Password principale cambiata: fai un nuovo backup');
  }finally{if(btn)btn.disabled=false}
});

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
  let out=`<header class="pr-head"><h2>Cassaforte · Archivio password</h2><div class="pr-meta">Stampato il ${esc(when)} · ${rows.length} account</div><p class="pr-warn">DOCUMENTO RISERVATO: contiene password in chiaro. Conservalo in un luogo sicuro e distruggi le stampe precedenti.</p></header>`;
  let cur=null;
  for(const i of rows){
    if(i.cat!==cur){cur=i.cat;out+=`<h3 class="pr-cat">${esc(cur)}</h3>`}
    out+=`<section class="pr-item"><div class="pr-name">${i.fav?'★ ':''}${esc(i.name)}</div><table>`
      +`<tr><th>Utente</th><td>${f(i.user)}</td></tr>`
      +`<tr><th>Password</th><td class="pr-pw">${f(i.pass)}</td></tr>`
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
updThemeUI();

/* Versione e novità */
document.querySelectorAll('.appver').forEach(e=>e.textContent=APP_VERSION);
$('#news').innerHTML=CHANGELOG.map(([v,l],i)=>`<div class="news-v"><span class="ver">v${esc(v)}</span>${i===0?'<span class="now">attuale</span>':''}</div><ul>${l.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul>`).join('');

showLock();
resetPwEyes();
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
