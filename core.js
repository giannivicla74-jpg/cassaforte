const enc=new TextEncoder(), dec=new TextDecoder();
const b64=b=>{let s='';new Uint8Array(b).forEach(c=>s+=String.fromCharCode(c));return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const CATS=['Email','Social','Banca','Lavoro','Shopping','Altro'];
const TYPES=['login','card','wifi','note','doc'];
const EXTRA_FIELDS=['holder','number','exp','cvv','pin','wsec','secret','docType','cf','issuer','issued'];
const typeOf=i=>TYPES.includes(i?.type)?i.type:'login';
const ITER=600000, ITER_OLD=310000;
const DAY_MS=864e5, OLD_DAYS=365, MAX_HISTORY=5, MAX_PHOTOS=3;
const iterOf=v=>Number.isInteger(v?.iter)&&v.iter>=100000&&v.iter<=5000000?v.iter:ITER_OLD;

async function derive(pw,s,it=ITER){
  const k=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:s,iterations:it,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}

async function encryptVault(k,s,it,items){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(JSON.stringify(items)));
  return JSON.stringify({v:1,iter:it,salt:b64(s),iv:b64(iv),data:b64(ct)});
}

async function decryptVault(pw,v){
  const it=iterOf(v), s=unb64(v.salt), k=await derive(pw,s,it);
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv)},k,unb64(v.data));
  return {key:k, salt:s, iter:it, items:parseItems(dec.decode(pt))};
}

/* Normalizzazione dei dati decifrati (difesa da backup corrotti o modificati) */
function clean(i){
  i=i&&typeof i==='object'?i:{};
  const s=v=>typeof v==='string'?v:(v==null?'':String(v));
  const rawCat=s(i.cat).trim();
  const cat=rawCat&&rawCat!=='Tutti'&&rawCat!=='★'&&rawCat!=='!warn'?rawCat.slice(0,32):'Altro';
  const out={...i,id:s(i.id),name:s(i.name).trim()||'Senza nome',user:s(i.user),pass:s(i.pass),url:s(i.url),note:s(i.note),cat,fav:!!i.fav};
  // Tipi di scheda: account (predefinito), carta, Wi-Fi, nota segreta
  if(TYPES.includes(i.type)&&i.type!=='login'){
    out.type=i.type;
    EXTRA_FIELDS.forEach(k=>{out[k]=s(i[k])});
    out.whidden=!!i.whidden;
  }else{
    delete out.type; EXTRA_FIELDS.forEach(k=>delete out[k]); delete out.whidden;
  }
  if(Array.isArray(i.photos)){
    const ph=i.photos.filter(x=>typeof x==='string'&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x)).slice(0,MAX_PHOTOS);
    if(ph.length)out.photos=ph; else delete out.photos;
  }else delete out.photos;
  if(Number.isFinite(i.updatedAt)&&i.updatedAt>0)out.updatedAt=Math.floor(i.updatedAt);
  if(Array.isArray(i.history)){
    const h=i.history
      .filter(x=>x&&typeof x==='object'&&typeof x.pass==='string'&&x.pass)
      .map(x=>({pass:x.pass,at:Number.isFinite(x.at)&&x.at>0?Math.floor(x.at):0}))
      .slice(0,MAX_HISTORY);
    if(h.length)out.history=h; else delete out.history;
  }
  return out;
}

function recordPasswordChange(item,newPass,now=Date.now()){
  const oldPass=typeof item?.pass==='string'?item.pass:'';
  const prevHistory=Array.isArray(item?.history)?[...item.history]:[];
  if(oldPass&&oldPass!==newPass){
    const filtered=prevHistory.filter(h=>h.pass!==oldPass);
    filtered.unshift({pass:oldPass,at:item.updatedAt||now});
    return {updatedAt:now, history:filtered.slice(0,MAX_HISTORY)};
  }
  if(!item?.updatedAt&&newPass){
    return {updatedAt:now, ...(prevHistory.length?{history:prevHistory}:{})};
  }
  return {
    ...(item?.updatedAt?{updatedAt:item.updatedAt}:{}),
    ...(prevHistory.length?{history:prevHistory}:{})
  };
}

function parseItems(txt){
  const a=JSON.parse(txt); if(!Array.isArray(a))throw new Error('Formato non valido');
  const seen=new Set();
  return a.map(clean).map(i=>{if(!i.id||seen.has(i.id))i.id=crypto.randomUUID();seen.add(i.id);return i});
}
function normUrl(u){u=u.trim();if(!u)return'';if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)&&!/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(u))u='https://'+u;return u}
function safeUrl(u){try{const x=new URL(u);return x.protocol==='https:'||x.protocol==='http:'?x.href:''}catch{return''}}

const sameItem=(a,b)=>typeOf(a)===typeOf(b)&&!!a.whidden===!!b.whidden
  &&['name','user','pass','url','note','cat',...EXTRA_FIELDS].every(k=>(a[k]||'')===(b[k]||''))
  &&(a.photos||[]).join('|')===(b.photos||[]).join('|');

/* Carte: circuito, formattazione, controllo del numero (algoritmo di Luhn) */
const digits=s=>String(s??'').replace(/\D/g,'');
function cardBrand(n){
  const d=digits(n);
  if(/^4/.test(d))return 'VISA';
  if(/^(5[1-5]|2[2-7])/.test(d))return 'MASTERCARD';
  if(/^3[47]/.test(d))return 'AMEX';
  if(/^(5018|5020|5038|56|57|58|6304|67)/.test(d))return 'MAESTRO';
  return '';
}
function fmtCard(n){const d=digits(n);return cardBrand(d)==='AMEX'?d.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*/,(m,a,b,c)=>[a,b,c].filter(Boolean).join(' ')):d.replace(/(\d{4})(?=\d)/g,'$1 ')}
function luhnOk(n){
  const d=digits(n); if(d.length<12)return false;
  let sum=0;for(let i=0;i<d.length;i++){let x=+d[d.length-1-i];if(i%2){x*=2;if(x>9)x-=9}sum+=x}
  return sum%10===0;
}
/* Wi-Fi: testo del codice QR standard (lo leggono le fotocamere di Android e iPhone) */
function wifiQr(ssid,pass,sec,hidden){
  const e=v=>String(v??'').replace(/([\\;,:"])/g,'\\$1');
  const t=sec==='WEP'?'WEP':sec==='nopass'?'nopass':'WPA';
  return `WIFI:T:${t};S:${e(ssid)};${t==='nopass'?'':`P:${e(pass)};`}${hidden?'H:true;':''};`;
}

/* Riconoscimento automatico dei servizi più usati in Italia: categoria e sito */
const SERVICES=[
  ['Shopping',[['amazon','amazon.it'],['ebay','ebay.it'],['zalando','zalando.it'],['shein','shein.com'],['aliexpress','aliexpress.com'],['temu','temu.com'],['subito','subito.it'],['vinted','vinted.it'],['ikea','ikea.com'],['mediaworld','mediaworld.it'],['unieuro','unieuro.it'],['decathlon','decathlon.it'],['esselunga','esselunga.it'],['coop','e-coop.it'],['conad','conad.it'],['carrefour','carrefour.it'],['lidl','lidl.it'],['leroy merlin','leroymerlin.it'],['euronics','euronics.it'],['just eat','justeat.it'],['glovo','glovoapp.com'],['deliveroo','deliveroo.it']]],
  ['Email',[['gmail','mail.google.com'],['google','accounts.google.com'],['outlook','outlook.com'],['hotmail','outlook.com'],['libero','libero.it'],['virgilio','virgilio.it'],['yahoo','mail.yahoo.com'],['icloud','icloud.com'],['apple','appleid.apple.com'],['tiscali','tiscali.it'],['aruba','webmail.aruba.it'],['pec','webmail.pec.it'],['proton','proton.me']]],
  ['Social',[['facebook','facebook.com'],['instagram','instagram.com'],['tiktok','tiktok.com'],['twitter','x.com'],['whatsapp','web.whatsapp.com'],['telegram','web.telegram.org'],['snapchat','snapchat.com'],['pinterest','pinterest.it'],['reddit','reddit.com'],['threads','threads.net'],['discord','discord.com'],['x.com','x.com']]],
  ['Banca',[['intesa','intesasanpaolo.com'],['sanpaolo','intesasanpaolo.com'],['unicredit','unicredit.it'],['bancoposta','poste.it'],['postepay','postepay.it'],['poste','poste.it'],['bper','bper.it'],['banco bpm','bancobpm.it'],['bpm','bancobpm.it'],['fineco','finecobank.com'],['mediolanum','bancamediolanum.it'],['bnl','bnl.it'],['credit agricole','credit-agricole.it'],['crédit agricole','credit-agricole.it'],['monte dei paschi','mps.it'],['mps','mps.it'],['hype','hype.it'],['n26','n26.com'],['revolut','revolut.com'],['paypal','paypal.com'],['satispay','satispay.com'],['nexi','nexi.it'],['ing','ing.it'],['widiba','widiba.it'],['banca sella','sella.it'],['bcc','bcc.it'],['che banca','chebanca.it'],['chebanca','chebanca.it'],['isybank','isybank.com'],['buddybank','buddybank.com'],['american express','americanexpress.com'],['amex','americanexpress.com']]],
  ['Svago',[['netflix','netflix.com'],['spotify','spotify.com'],['disney','disneyplus.com'],['prime video','primevideo.com'],['dazn','dazn.com'],['sky','sky.it'],['now tv','nowtv.it'],['youtube','youtube.com'],['twitch','twitch.tv'],['playstation','playstation.com'],['psn','playstation.com'],['xbox','xbox.com'],['steam','store.steampowered.com'],['nintendo','nintendo.com'],['paramount','paramountplus.com'],['infinity','infinitytv.it'],['raiplay','raiplay.it'],['mediaset','mediasetinfinity.mediaset.it'],['audible','audible.it'],['apple music','music.apple.com'],['tidal','tidal.com'],['deezer','deezer.com']]],
  ['Lavoro',[['linkedin','linkedin.com'],['microsoft','login.microsoftonline.com'],['office','office.com'],['teams','teams.microsoft.com'],['zoom','zoom.us'],['slack','slack.com'],['fatture in cloud','fattureincloud.it'],['dropbox','dropbox.com'],['onedrive','onedrive.live.com'],['github','github.com'],['canva','canva.com'],['indeed','indeed.com'],['notion','notion.so'],['trello','trello.com']]],
  ['Utenze',[['enel','enel.it'],['eni','eniplenitude.com'],['plenitude','eniplenitude.com'],['a2a','a2a.it'],['hera','gruppohera.it'],['iren','irenlucegas.it'],['edison','edisonenergia.it'],['acea','acea.it'],['tim','tim.it'],['vodafone','vodafone.it'],['windtre','windtre.it'],['wind','windtre.it'],['iliad','iliad.it'],['fastweb','fastweb.it'],['ho mobile','ho-mobile.it'],['kena','kenamobile.it'],['very mobile','verymobile.it'],['tiscali','tiscali.it'],['sorgenia','sorgenia.it']]],
  ['Viaggi',[['trenitalia','trenitalia.com'],['italo','italotreno.it'],['ryanair','ryanair.com'],['easyjet','easyjet.com'],['ita airways','ita-airways.com'],['booking','booking.com'],['airbnb','airbnb.it'],['expedia','expedia.it'],['flixbus','flixbus.it'],['uber','uber.com'],['telepass','telepass.com'],['autostrade','autostrade.it'],['vueling','vueling.com'],['wizz','wizzair.com']]],
  ['Pubblica Amm.',[['spid','spid.gov.it'],['inps','inps.it'],['agenzia entrate','agenziaentrate.gov.it'],['agenzia delle entrate','agenziaentrate.gov.it'],['cie','idserver.servizicie.interno.gov.it'],['fascicolo sanitario','fascicolosanitario.gov.it'],['inail','inail.it'],['app io','io.italia.it'],['pagopa','pagopa.gov.it']]]
];
function recognize(name){
  const q=' '+String(name??'').toLowerCase().replace(/[^a-z0-9àèéìòù.+ ]/g,' ').replace(/\s+/g,' ').trim()+' ';
  if(q.trim().length<2)return null;
  let best=null;
  for(const [cat,list] of SERVICES)for(const [key,url] of list){
    // parola intera (evita che "ing" riconosca "booking"); vince la parola che compare prima nel nome
    // (es. "SPID Poste" = SPID), a parità la più lunga ("PostePay" batte "Poste")
    let at=q.indexOf(' '+key+' ');
    if(at<0&&key.length>=4&&q.startsWith(' '+key))at=0;
    if(at<0)continue;
    if(!best||at<best.at||(at===best.at&&key.length>best.key.length))best={key,cat,url,at};
  }
  return best?{cat:best.cat,url:best.url,key:best.key}:null;
}

function mergeItems(current,imported){
  const next=[...current], byId=new Map(next.map(i=>[i.id,i]));
  let added=0, same=0;
  for(const i of imported){
    const cur=byId.get(i.id);
    if(!cur){
      if(next.some(x=>sameItem(x,i))){same++}
      else{next.push(i);byId.set(i.id,i);added++}
    }else if(sameItem(cur,i)){
      same++;
    }else{
      const copy={...i,id:crypto.randomUUID()};
      next.push(copy);byId.set(copy.id,copy);added++;
    }
  }
  return {items:next, added, same};
}

function strength(p){
  if(!p)return{p:0,t:'',c:'transparent'};
  let k=0;[/[a-z]/,/[A-Z]/,/\d/,/[^A-Za-z0-9]/].forEach(r=>{if(r.test(p))k++});
  const words=p.trim().split(/[-_.\s]+/).filter(w=>w.length>=3);
  const bonus=words.length>=4&&p.length>=18?25:0;
  const n=Math.min(100,Math.min(p.length,16)*4+k*9+bonus);
  return n<40?{p:n,t:'Debole',c:'var(--bad)'}:n<70?{p:n,t:'Discreta',c:'#d99a1a'}:{p:n,t:'Forte',c:'#2f9e6b'};
}

/* Audit di sicurezza: individua password duplicate, deboli, vecchie (>1 anno) o mancanti */
function auditItems(list,now=Date.now()){
  const byPass=new Map();
  for(const i of list){
    if(!i.pass)continue;
    const arr=byPass.get(i.pass)||[];
    arr.push(i.id);
    byPass.set(i.pass,arr);
  }
  const dupIds=new Set(), weakIds=new Set(), oldIds=new Set(), emptyIds=new Set(), warnIds=new Set();
  for(const ids of byPass.values()){
    if(ids.length>1)ids.forEach(id=>{dupIds.add(id);warnIds.add(id)});
  }
  for(const i of list){
    if(!i.pass){emptyIds.add(i.id);continue}
    if(strength(i.pass).t==='Debole'){weakIds.add(i.id);warnIds.add(i.id)}
    if(i.updatedAt&&now-i.updatedAt>OLD_DAYS*DAY_MS){oldIds.add(i.id);warnIds.add(i.id)}
  }
  return {dupIds, weakIds, oldIds, emptyIds, warnIds};
}

function filterItems(list,cat,q,sortBy='az',warnIds=null){
  const query=(q||'').trim().toLowerCase();
  const warnings=warnIds||(cat==='!warn'?auditItems(list).warnIds:null);
  const inCat=i=>{
    if(cat==='Tutti')return true;
    if(cat==='★')return !!i.fav;
    if(cat==='!warn')return warnings?warnings.has(i.id):false;
    return (i.cat||'Altro')===cat;
  };
  const byName=(a,b)=>a.name.localeCompare(b.name,'it',{numeric:true});
  const ordCat=c=>{const k=CATS.indexOf(c);return k<0?50:k};
  return list
    .filter(i=>inCat(i)&&(!query||[i.name,i.user,i.url,i.note,i.cat,i.holder||''].join(' ').toLowerCase().includes(query)))
    .sort((a,b)=>{
      if(sortBy==='recent')return (b.updatedAt||0)-(a.updatedAt||0)||(b.fav?1:0)-(a.fav?1:0)||byName(a,b);
      if(sortBy==='cat'){
        const cDiff=ordCat(a.cat)-ordCat(b.cat)||(a.cat||'').localeCompare(b.cat||'','it');
        return cDiff||(b.fav?1:0)-(a.fav?1:0)||byName(a,b);
      }
      return (b.fav?1:0)-(a.fav?1:0)||byName(a,b);
    });
}

const SETS={lower:'abcdefghijkmnopqrstuvwxyz',upper:'ABCDEFGHJKLMNPQRSTUVWXYZ',num:'23456789',sym:'!@#$%^&*-_+=?'};
const CLOUD_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateCloudCode(){
  const parts=[];
  for(let g=0;g<4;g++){
    let s='';
    for(let i=0;i<4;i++)s+=CLOUD_CHARS[rnd(CLOUD_CHARS.length)];
    parts.push(s);
  }
  return parts.join('-');
}
function normalizeCloudCode(code){
  return String(code??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}
async function cloudDocId(code){
  const norm=normalizeCloudCode(code);
  if(norm.length<12)throw new Error('Codice Cloud troppo corto');
  const buf=await crypto.subtle.digest('SHA-256',enc.encode('cassaforte-cloud-v1:'+norm));
  return Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');
}
const WORDS_IT=[
  'albero','ancora','aquila','arancia','argento','armadio','aurora','balena','barca','bussola',
  'camino','campana','candela','castello','cavallo','cerchio','chiave','collina','cometa','corallo',
  'cristallo','cupola','delfino','diamante','drago','elica','falco','farfalla','faro','felce',
  'fiaccola','fiordo','fiume','foglia','fontana','foresta','fornace','fragola','fulmine','galassia',
  'gabbiano','gelato','girasole','ghiaccio','giardino','granito','grotta','isola','laguna','lampada',
  'lanterna','lavanda','leone','limone','loto','luna','magneto','mandorla','mantello','marmo',
  'mattino','melodia','meridiana','meteora','mimosa','miniera','miraggio','molino','montagna','mosaico',
  'nettare','nuvola','oasi','oceano','olivo','onda','orbita','orchidea','orizzonte','orologio',
  'palazzo','palma','pantera','papavero','parco','perla','pianeta','pietra','pineta','piramide',
  'piuma','platano','ponte','portale','prato','prisma','quarzo','quercia','radice','raggio',
  'ruscello','sabbia','salice','sentiero','scoglio','scudo','sigillo','smeraldo','sorgente','specchio',
  'stella','tamburo','tempio','tesoro','tigre','torrente','tramonto','tulipano','valle','veliero',
  'vulcano','zaffiro','zenit'
];
function rnd(n){const r=new Uint32Array(1),lim=Math.floor(2**32/n)*n;do{crypto.getRandomValues(r)}while(r[0]>=lim);return r[0]%n}
function generatePassword({len=20,lower=true,upper=true,num=true,sym=true,mode='chars',words=4,sep='-'}={}){
  if(mode==='words'){
    const count=Math.max(3,Math.min(8,+words||4));
    const picked=[];
    for(let i=0;i<count;i++)picked.push(WORDS_IT[rnd(WORDS_IT.length)]);
    if(upper)picked[0]=picked[0].charAt(0).toUpperCase()+picked[0].slice(1);
    if(num)picked.push(String(10+rnd(90)));
    return picked.join(sep||'-');
  }
  const flags={lower,upper,num,sym};
  const sel=Object.keys(SETS).filter(k=>flags[k]);
  if(!sel.length)return'';
  const all=sel.map(k=>SETS[k]).join(''), out=sel.map(k=>SETS[k][rnd(SETS[k].length)]);
  while(out.length<len)out.push(all[rnd(all.length)]);
  for(let i=out.length-1;i>0;i--){const j=rnd(i+1);[out[i],out[j]]=[out[j],out[i]]}
  return out.slice(0,len).join('');
}

/* Parser CSV (compatibile con export Chrome, Edge, Firefox, Bitwarden, Safari) */
function parseCsvRows(text){
  const src=String(text??'').replace(/^\uFEFF/,'');
  const firstLine=src.split(/\r?\n/)[0]||'';
  const delim=firstLine.split(';').length>firstLine.split(',').length?';':',';
  const rows=[]; let row=[], cur='', inQ=false;
  for(let i=0;i<src.length;i++){
    const c=src[i];
    if(inQ){
      if(c==='"'&&src[i+1]==='"'){cur+='"';i++}
      else if(c==='"')inQ=false;
      else cur+=c;
    }else{
      if(c==='"')inQ=true;
      else if(c===delim){row.push(cur);cur=''}
      else if(c==='\n'||c==='\r'){
        if(c==='\r'&&src[i+1]==='\n')i++;
        row.push(cur);cur='';
        if(row.some(x=>x.trim()!==''))rows.push(row);
        row=[];
      }else cur+=c;
    }
  }
  row.push(cur);
  if(row.some(x=>x.trim()!==''))rows.push(row);
  return rows;
}

function parseCsvItems(csvText,now=Date.now()){
  const rows=parseCsvRows(csvText);
  if(rows.length<2)throw new Error('CSV vuoto o senza intestazione');
  const hdr=rows[0].map(h=>h.trim().toLowerCase());
  const idx=(...names)=>hdr.findIndex(h=>names.includes(h));
  const iName=idx('name','title','servizio','service','account');
  const iUrl=idx('url','login_uri','sito','website','origin','formactionorigin');
  const iUser=idx('username','login_username','user','utente','email','login');
  const iPass=idx('password','login_password','pass');
  const iNote=idx('note','notes','comment','extra');
  const iCat=idx('category','categoria','folder','group');
  const iFav=idx('favorite','fav','preferito');
  if(iName<0&&iUrl<0&&iUser<0&&iPass<0)throw new Error('Intestazioni CSV non riconosciute');
  const out=[];
  for(let r=1;r<rows.length;r++){
    const cols=rows[r];
    const get=i=>i>=0&&i<cols.length?cols[i].trim():'';
    const rawUrl=get(iUrl), url=normUrl(rawUrl);
    let name=get(iName);
    if(!name&&url){try{name=new URL(url).hostname.replace(/^www\./,'')}catch{name=rawUrl}}
    const user=get(iUser), pass=get(iPass), note=get(iNote), cat=get(iCat)||'Altro';
    const favVal=get(iFav).toLowerCase();
    const fav=favVal==='1'||favVal==='true'||favVal==='yes'||favVal==='si';
    if(!name&&!user&&!pass&&!url)continue;
    out.push(clean({id:crypto.randomUUID(),name:name||user||'Account',user,pass,url:safeUrl(url)?url:'',note,cat,fav,updatedAt:now}));
  }
  return out;
}

/* Codice a barre Code 39 (standard della Tessera Sanitaria per il Codice Fiscale) */
const C39={
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn',
  '6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn','A':'wnnnnwnnw','B':'nnwnnwnnw',
  'C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn',
  'I':'nnwnnwwnn','J':'nnnnwwwnn','K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww',
  'O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn',
  '-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn',
  '%':'nnnwnwnwn','*':'nwnnwnwnn'
};
function code39Svg(text){
  const cleanTxt=String(text??'').toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g,'');
  if(!cleanTxt)return '';
  const full='*'+cleanTxt+'*';
  let x=12, rects='';
  for(const ch of full){
    const pat=C39[ch]; if(!pat)continue;
    for(let i=0;i<9;i++){
      const w=pat[i]==='w'?3:1;
      if(i%2===0)rects+=`<rect x="${x}" y="4" width="${w}" height="56" fill="#000"/>`;
      x+=w;
    }
    x+=1; // spazio tra caratteri
  }
  const totalW=x+11;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} 64" width="100%" height="64" preserveAspectRatio="none" role="img" aria-label="Codice a barre ${esc(cleanTxt)}"><rect width="${totalW}" height="64" fill="#fff"/>${rects}</svg>`;
}

/* Radar Scadenze: calcola giorni rimanenti per Carte (MM/AA) e Documenti (YYYY-MM-DD) */
function expiryInfo(item,now=Date.now()){
  const t=typeOf(item), raw=String(item?.exp||'').trim();
  if(!raw)return null;
  let endMs=0;
  if(t==='card'){
    const m=/^(0[1-9]|1[0-2])\/(\d{2})$/.exec(raw);
    if(!m)return null;
    const yr=2000+(+m[2]), mo=+m[1];
    endMs=new Date(yr,mo,0,23,59,59,999).getTime(); // ultimo giorno del mese
  }else if(t==='doc'){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if(!m)return null;
    endMs=new Date(+m[1],+m[2]-1,+m[3],23,59,59,999).getTime();
  }else return null;
  // giorni di calendario tra oggi e il giorno di scadenza (0 = scade oggi, -1 = scaduto ieri);
  // si confrontano le mezzanotti e si arrotonda, così l'ora del giorno e l'ora legale non spostano il conto
  const day0=t=>{const d=new Date(t);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()};
  const days=Math.round((day0(endMs)-day0(now))/DAY_MS);
  const expired=days<0;
  const label=expired
    ?(days===-1?'scaduto ieri':`scaduto da ${Math.abs(days)} gg`)
    :(days===0?'scade oggi':days===1?'scade domani':`scade tra ${days} gg`);
  return {days, expired, label, endMs};
}
function expiringItems(list,now=Date.now(),withinDays=60){
  const out=[];
  for(const item of list){
    const info=expiryInfo(item,now);
    if(info&&info.days<=withinDays)out.push({item,...info});
  }
  return out.sort((a,b)=>a.days-b.days);
}

/* Controllo Data Breach (Have I Been Pwned k-Anonymity: invia solo i primi 5 caratteri dell'hash SHA-1) */
async function sha1Hex(text){
  const buf=await crypto.subtle.digest('SHA-1',enc.encode(String(text??'')));
  return Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
}
function parsePwnedCount(rangeText,suffix){
  const target=String(suffix??'').toUpperCase();
  for(const line of String(rangeText??'').split(/\r?\n/)){
    const [s,c]=line.split(':');
    if(s&&s.trim().toUpperCase()===target)return parseInt(c,10)||0;
  }
  return 0;
}
async function checkPwnedPassword(pw,cache){
  if(!pw)return 0;
  const h=await sha1Hex(pw), prefix=h.slice(0,5), suffix=h.slice(5);
  let txt=cache?.get(prefix);
  if(txt===undefined){
    const res=await fetch('https://api.pwnedpasswords.com/range/'+prefix,{headers:{'Add-Padding':'true'}});
    if(!res.ok)throw new Error('HTTP '+res.status);
    txt=await res.text();
    cache?.set(prefix,txt);
  }
  return parsePwnedCount(txt,suffix);
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={
    CATS,ITER,ITER_OLD,DAY_MS,OLD_DAYS,MAX_HISTORY,MAX_PHOTOS,iterOf,b64,unb64,esc,derive,encryptVault,decryptVault,
    clean,recordPasswordChange,parseItems,normUrl,safeUrl,sameItem,mergeItems,auditItems,filterItems,
    strength,SETS,WORDS_IT,rnd,generatePassword,parseCsvRows,parseCsvItems,
    generateCloudCode,normalizeCloudCode,cloudDocId,
    TYPES,EXTRA_FIELDS,typeOf,cardBrand,fmtCard,luhnOk,wifiQr,SERVICES,recognize,
    code39Svg,expiryInfo,expiringItems,sha1Hex,parsePwnedCount,checkPwnedPassword
  };
}
