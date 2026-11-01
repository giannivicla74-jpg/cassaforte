const $=s=>document.querySelector(s), enc=new TextEncoder(), dec=new TextDecoder();
const b64=b=>{let s='';new Uint8Array(b).forEach(c=>s+=String.fromCharCode(c));return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let key=null, salt=null, iter=0, items=[], editId=null, qId=null, shown=new Set(), lockT, clipT, clipAt=0;
let syncHandle=null, pendingHandle=null, pendingImport=null;
let sess=0;            // cresce a ogni blocco: invalida le operazioni asincrone iniziate prima
let saveQ=Promise.resolve(); // serializza i salvataggi
let extUntil=0;        // finestra in cui la pagina può andare in background (condivisione, selettore file) senza bloccarsi
/* Versione dell'app: a ogni modifica pubblicata aumenta il numero e aggiungi una voce in CHANGELOG */
const APP_VERSION='1.6.0';
const CHANGELOG=[
  ['1.6.0',['Tema chiaro, scuro o automatico a scelta in Opzioni']],
  ['1.5.0',['Numero di versione visibile e sezione Novità nel manuale']],
  ['1.4.0',['Nuova grafica dell’avviso di backup','Intestazione adatta agli schermi del telefono']],
  ['1.3.0',['Blocco automatico regolabile in Opzioni (inattività e cambio app)']],
  ['1.2.0',['Protezione più forte: 600.000 iterazioni PBKDF2 (backup vecchi ancora validi)','Content-Security-Policy contro codice malevolo']],
  ['1.1.0',['Import sicuro con scelta Unisci / Sostituisci','Correzioni di bug che potevano far perdere dati','Auto-sync su file ricordato dopo il riavvio']],
  ['1.0.0',['Prima versione: cassaforte cifrata, generatore, backup']]
];
const CATS=['Email','Social','Banca','Lavoro','Shopping','Altro'];

const getVault=()=>{try{return JSON.parse(localStorage.getItem('vault'))}catch{return null}};
/* Iterazioni PBKDF2: il numero viene salvato nel file (campo "iter").
   I file creati prima non lo contengono e usano il vecchio valore, quindi restano apribili. */
const ITER=600000, ITER_OLD=310000;
const iterOf=v=>Number.isInteger(v?.iter)&&v.iter>=100000&&v.iter<=5000000?v.iter:ITER_OLD;
async function derive(pw,s,it=ITER){
  const k=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:s,iterations:it,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
/* Porta in background la cassaforte al numero di iterazioni attuale (nuova chiave e nuovo salt) */
async function upgradeKdf(pw){
  if(iter>=ITER)return;
  const s=sess, ns=crypto.getRandomValues(new Uint8Array(16)), nk=await derive(pw,ns,ITER);
  if(s!==sess||!key)return;
  const os=salt, ok=key, oi=iter; salt=ns; key=nk; iter=ITER;
  try{await persist()}catch(e){console.warn('Aggiornamento protezione non riuscito',e);if(s===sess){salt=os;key=ok;iter=oi}}
}

/* Normalizzazione dei dati decifrati (difesa da backup corrotti o modificati) */
function clean(i){
  i=i&&typeof i==='object'?i:{};
  const s=v=>typeof v==='string'?v:(v==null?'':String(v));
  return{...i,id:s(i.id),name:s(i.name).trim()||'Senza nome',user:s(i.user),pass:s(i.pass),url:s(i.url),note:s(i.note),cat:CATS.includes(i.cat)?i.cat:'Altro',fav:!!i.fav};
}
function parseItems(txt){
  const a=JSON.parse(txt); if(!Array.isArray(a))throw new Error('Formato non valido');
  const seen=new Set();
  return a.map(clean).map(i=>{if(!i.id||seen.has(i.id))i.id=crypto.randomUUID();seen.add(i.id);return i});
}
function normUrl(u){u=u.trim();if(!u)return'';if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)&&!/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(u))u='https://'+u;return u}
function safeUrl(u){try{const x=new URL(u);return x.protocol==='https:'||x.protocol==='http:'?x.href:''}catch{return''}}

/* Salvataggio: cifra e scrive in coda, così due salvataggi non si sovrappongono */
function persist(){
  const k=key, s=salt, it=iter, data=JSON.stringify(items);
  const job=saveQ.then(async()=>{
    if(!k||!s||!it)throw new Error('Cassaforte bloccata');
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(data));
    const vStr=JSON.stringify({v:1,iter:it,salt:b64(s),iv:b64(iv),data:b64(ct)});
    localStorage.setItem('vault',vStr);
    await syncWrite(vStr);
  });
  saveQ=job.catch(()=>{});
  return job;
}
/* Applica una modifica e la salva; se il salvataggio fallisce la annulla */
async function commit(fn,msg){
  const prev=structuredClone(items), s=sess;
  fn();
  try{await persist();render();if(msg)toast(msg);return true}
  catch(e){
    console.error(e);
    if(s===sess){items=prev;render();toast('Salvataggio non riuscito: modifica annullata')}
    else toast('Cassaforte bloccata: modifica non salvata');
    return false;
  }
}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),2200)}

/* Blocco / sblocco */
function showLock(){
  const v=getVault(), nuovo=!v;
  $('#lockMsg').textContent=nuovo?'Crea una password principale. Non si può recuperare: se la dimentichi, i dati restano illeggibili.':'Inserisci la password principale per aprire i tuoi account.';
  $('#mp2w').classList.toggle('hide',!nuovo); $('#mp2').required=nuovo;
  $('#lockBtn').textContent=nuovo?'Crea cassaforte':'Sblocca';
  $('#mp').value=$('#mp2').value=''; $('#err').textContent='';
  $('#lock').classList.remove('hide'); $('#app').classList.add('hide');
}
function lock(){
  sess++; key=null; salt=null; iter=0; items=[]; shown.clear(); clearTimeout(lockT); clearTimeout(awayT);
  editId=qId=null; pendingImport=null; cat='Tutti'; extUntil=0; hiddenAt=0;
  clearClip(true);
  ['dlg','dlgSet','dlgQ','dlgHelp','dlgImp'].forEach(i=>{if($('#'+i).open)$('#'+i).close()});
  ['#pwForm','#fQ','#form','#impForm'].forEach(f=>$(f).reset());
  $('#pErr').textContent=''; $('#impErr').textContent='';
  // Nessun dato in chiaro deve restare nella pagina mentre è bloccata
  $('#list').innerHTML=''; $('#chips').innerHTML=''; $('#count').textContent=''; $('#q').value='';
  $('#bk').classList.add('hide');
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
let hiddenAt=0, awayT;
function bump(){clearTimeout(lockT);if(key)lockT=setTimeout(lock,lockCfg().idle*60*1000)}
['click','keydown','touchstart'].forEach(e=>addEventListener(e,bump,{passive:true}));
const allowExternal=(ms=120000)=>{extUntil=Date.now()+ms};
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    if(!key)return;
    hiddenAt=Date.now();
    // tolleranza: la maggiore tra quella scelta dall'utente e quella di un'operazione in corso (condivisione, file)
    const grace=Math.max(lockCfg().away*1000, extUntil-hiddenAt);
    if(grace<=0)return lock();
    clearTimeout(awayT); awayT=setTimeout(()=>{if(document.hidden&&key)lock()},grace);
  }else{
    clearTimeout(awayT);
    // i timer in background possono essere sospesi: ricontrolla al ritorno
    if(key&&hiddenAt&&Date.now()-hiddenAt>Math.max(lockCfg().away*1000, extUntil-hiddenAt))lock();
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
      let s,k,list; const it=iterOf(v);
      try{
        s=unb64(v.salt); k=await derive(pw,s,it);
        const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv)},k,unb64(v.data));
        list=parseItems(dec.decode(pt));
      }catch{$('#err').textContent='Password errata.';return}
      salt=s; key=k; iter=it; items=list;
    }
    $('#lock').classList.add('hide'); $('#app').classList.remove('hide'); render(); bump(); checkAndRequestPersistence(true); initSync();
    upgradeKdf(pw);
  }finally{btn.disabled=false}
});
$('#bLock').onclick=lock;

/* Elenco */
const ic=p=>`<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC={user:ic('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),key:ic('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>'),eye:ic('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),eyeoff:ic('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6A16 16 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),link:ic('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),edit:ic('<path d="M4 20h4L19 9l-4-4L4 16z"/>')};
const hue=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))%360;return h};
let cat='Tutti';
const star=f=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="${f?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>`;
function strength(p){
  if(!p)return{p:0,t:'',c:'transparent'};
  let k=0;[/[a-z]/,/[A-Z]/,/\d/,/[^A-Za-z0-9]/].forEach(r=>{if(r.test(p))k++});
  const n=Math.min(100,Math.min(p.length,16)*4+k*9);
  return n<40?{p:n,t:'Debole',c:'var(--bad)'}:n<70?{p:n,t:'Discreta',c:'#d99a1a'}:{p:n,t:'Forte',c:'#2f9e6b'};
}
function updMeter(){const r=strength($('#fPass').value);$('#mBar').style.width=r.p+'%';$('#mBar').style.background=r.c;$('#mTxt').textContent=r.t?'Robustezza: '+r.t:''}
$('#fPass').addEventListener('input',updMeter);
$('#chips').addEventListener('click',e=>{const b=e.target.closest('[data-c]');if(!b)return;cat=b.dataset.c;render()});
function render(){
  if(!key)return;
  const inCat=i=>cat==='Tutti'||(cat==='★'?i.fav:(i.cat||'Altro')===cat);
  if(!items.some(inCat))cat='Tutti';
  updBackup();
  const q=$('#q').value.trim().toLowerCase();
  $('#count').textContent=items.length===1?'1 account':items.length+' account';
  const chips=['Tutti',...(items.some(i=>i.fav)?['★']:[]),...CATS.filter(c=>items.some(i=>(i.cat||'Altro')===c))];
  $('#chips').innerHTML=items.length?chips.map(c=>`<button class="chip${c===cat?' on':''}" data-c="${c}">${c==='★'?'★ Preferiti':c}</button>`).join(''):'';
  const rows=items.filter(i=>inCat(i)&&(!q||[i.name,i.user,i.url].join(' ').toLowerCase().includes(q))).sort((a,b)=>(b.fav?1:0)-(a.fav?1:0)||a.name.localeCompare(b.name,'it'));
  $('#list').innerHTML=rows.length?rows.map(i=>{const href=safeUrl(i.url);return`
    <li class="it" data-id="${esc(i.id)}">
      <div class="top">
        <div class="av" style="--h:${hue(i.name)}">${esc(i.name.trim().charAt(0).toUpperCase())}</div>
        <div class="meta"><h2>${esc(i.name)}<span class="tag">${esc(i.cat||'Altro')}</span>${i.pass&&strength(i.pass).t==='Debole'?'<span class="tag w">Password debole</span>':''}</h2><div class="u">${esc(i.user)}</div></div>
        <button class="star${i.fav?' on':''}" data-a="fv" aria-label="${i.fav?'Rimuovi dai preferiti':'Aggiungi ai preferiti'}">${star(i.fav)}</button>
      </div>
      ${i.pass?`<div class="pwbox"><span>${shown.has(i.id)?esc(i.pass):'••••••••••'}</span><button class="btn s" data-a="qp">Cambia</button></div>`:`<div class="pwbox none"><span>Nessuna password salvata</span><button class="btn s" data-a="qp">Imposta</button></div>`}
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
  try{await navigator.clipboard.writeText(t);toast(m);clipAt=Date.now();clearTimeout(clipT);clipT=setTimeout(()=>clearClip(),30000)}
  catch{toast('Copia non riuscita')}
}
function clearClip(force){
  if(!clipAt||(!force&&Date.now()-clipAt<30000)||!document.hasFocus())return;
  navigator.clipboard.writeText('').then(()=>{clipAt=0;clearTimeout(clipT)}).catch(()=>{});
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
function openForm(it){
  editId=it?it.id:null;
  $('#dlgT').textContent=it?'Modifica account':'Nuovo account';
  $('#fName').value=it?.name||'';$('#fUser').value=it?.user||'';$('#fPass').value=it?.pass||'';
  $('#fUrl').value=it?.url||'';$('#fNote').value=it?.note||'';$('#fCat').value=it?.cat||'Altro';$('#fFav').checked=!!it?.fav;
  $('#bDel').classList.toggle('hide',!it);
  updMeter();$('#dlg').showModal();
}
$('#bAdd').onclick=()=>openForm(null);
$('#bCancel').onclick=()=>$('#dlg').close();
$('#bGen').onclick=()=>{const g=gen();if(g){$('#fPass').value=g;updMeter()}};
$('#form').addEventListener('submit',async e=>{
  e.preventDefault();
  const d={name:$('#fName').value.trim(),user:$('#fUser').value.trim(),pass:$('#fPass').value,url:normUrl($('#fUrl').value),note:$('#fNote').value.trim(),cat:$('#fCat').value,fav:$('#fFav').checked};
  if(!d.name)return;
  if(d.url&&!safeUrl(d.url)){toast('Indirizzo del sito non valido (usa http:// o https://)');$('#fUrl').focus();return}
  const id=editId, btn=$('#bSave'); btn.disabled=true;
  try{
    const ok=await commit(()=>{
      if(id){const it=items.find(x=>x.id===id);if(it)Object.assign(it,d)}
      else items.push({id:crypto.randomUUID(),...d});
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
const sameItem=(a,b)=>['name','user','pass','url','note','cat'].every(k=>a[k]===b[k]);
$('#impForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const v=pendingImport, s=sess, err=$('#impErr'), btn=$('#impOk'); if(!v)return;
  err.textContent=''; btn.disabled=true;
  try{
    let imp;
    try{
      const k=await derive($('#impPw').value,unb64(v.salt),iterOf(v));
      const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv)},k,unb64(v.data));
      imp=parseItems(dec.decode(pt));
    }catch{err.textContent='Password errata o file danneggiato. I tuoi dati attuali non sono stati toccati.';return}
    if(s!==sess||!key)return;
    const mode=$('#impForm').elements.impMode.value;
    if(mode==='replace'&&items.length&&!confirm(`Eliminare i ${items.length} account attuali e sostituirli con i ${imp.length} del backup?`))return;
    let added=0, same=0;
    const ok=await commit(()=>{
      if(mode==='replace'){items=imp;added=imp.length;return}
      const byId=new Map(items.map(i=>[i.id,i]));
      for(const i of imp){
        const cur=byId.get(i.id);
        if(!cur){items.push(i);added++}
        else if(sameItem(cur,i))same++;
        else{items.push({...i,id:crypto.randomUUID()});added++} // versione diversa: la teniamo come copia
      }
    });
    if(ok){
      pendingImport=null;$('#dlgImp').close();
      toast(mode==='replace'?`Backup importato: ${added} account`:`Unione completata: ${added} aggiunti${same?`, ${same} già presenti`:''}`);
    }
  }finally{btn.disabled=false}
});

/* Generatore */
const SETS={lower:'abcdefghijkmnopqrstuvwxyz',upper:'ABCDEFGHJKLMNPQRSTUVWXYZ',num:'23456789',sym:'!@#$%^&*-_+=?'};
function rnd(n){const r=new Uint32Array(1),lim=Math.floor(2**32/n)*n;do{crypto.getRandomValues(r)}while(r[0]>=lim);return r[0]%n}
function gen(){
  const len=+$('#gLen').value, sel=Object.keys(SETS).filter(k=>$('#g_'+k).checked);
  if(!sel.length){toast('Scegli almeno un tipo di carattere');return''}
  const all=sel.map(k=>SETS[k]).join(''), out=sel.map(k=>SETS[k][rnd(SETS[k].length)]);
  while(out.length<len)out.push(all[rnd(all.length)]);
  for(let i=out.length-1;i>0;i--){const j=rnd(i+1);[out[i],out[j]]=[out[j],out[i]]}
  return out.slice(0,len).join('');
}
function saveG(){localStorage.setItem('gopts',JSON.stringify({len:+$('#gLen').value,lower:$('#g_lower').checked,upper:$('#g_upper').checked,num:$('#g_num').checked,sym:$('#g_sym').checked}))}
try{const o=JSON.parse(localStorage.getItem('gopts'));if(o){$('#gLen').value=o.len;['lower','upper','num','sym'].forEach(k=>$('#g_'+k).checked=!!o[k])}}catch{}
$('#gLenV').textContent=$('#gLen').value;
$('#gOpts').addEventListener('input',()=>{$('#gLenV').textContent=$('#gLen').value;saveG()});

/* Modifica rapida password */
function updQ(){const r=strength($('#qPass').value);$('#qBar').style.width=r.p+'%';$('#qBar').style.background=r.c;$('#qTxt').textContent=r.t?'Robustezza: '+r.t:''}
function openQuick(it){qId=it.id;$('#qS').textContent=it.name+(it.user?' · '+it.user:'');$('#qPass').value='';updQ();$('#dlgQ').showModal()}
$('#qPass').addEventListener('input',updQ);
$('#qGen').onclick=()=>{const g=gen();if(g){$('#qPass').value=g;updQ()}};
$('#qCancel').onclick=()=>$('#dlgQ').close();
$('#fQ').addEventListener('submit',async e=>{
  e.preventDefault();
  const id=qId, p=$('#qPass').value, it=items.find(x=>x.id===id); if(!it||!p)return;
  if(await commit(()=>{it.pass=p},'Password aggiornata'))$('#dlgQ').close();
});

/* Avviso di backup proattivo */
const DAY=864e5;
function updBackup(){
  const now=Date.now(), last=+localStorage.getItem('lastBackup')||0, snooze=+localStorage.getItem('bkSnooze')||0;
  if(items.length>0&&!last){
    const due=now>snooze;
    $('#bk').classList.toggle('hide',!due);
    $('#bk').classList.add('warn');
    $('#bkHead').textContent='Non hai ancora fatto un backup';
    $('#bkTxt').textContent='Le tue password sono salvate solo in questo browser. Inviati una copia cifrata (WhatsApp, email o Drive): se pulisci la cronologia o cambi dispositivo, senza backup le perdi.';
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

/* Opzioni e cambio password principale */
$('#bSet').onclick=()=>{const c=lockCfg();$('#sIdle').value=c.idle;$('#sAway').value=c.away;updBkInfo();checkAndRequestPersistence(false);$('#pErr').textContent='';$('#dlgSet').showModal()};
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

/* Tema: automatico (segue il sistema), chiaro o scuro. Applicato in anticipo da theme.js */
const curTheme=()=>document.documentElement.getAttribute('data-theme')||'auto';
function updThemeUI(){document.querySelectorAll('#themeSel [data-t]').forEach(b=>{const on=b.dataset.t===curTheme();b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)})}
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
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
