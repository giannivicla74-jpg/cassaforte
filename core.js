const enc=new TextEncoder(), dec=new TextDecoder();
const b64=b=>{let s='';new Uint8Array(b).forEach(c=>s+=String.fromCharCode(c));return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const CATS=['Email','Social','Banca','Lavoro','Shopping','Altro'];
const ITER=600000, ITER_OLD=310000;
const DAY_MS=864e5, OLD_DAYS=365, MAX_HISTORY=5;
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

const sameItem=(a,b)=>['name','user','pass','url','note','cat'].every(k=>a[k]===b[k]);

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
    .filter(i=>inCat(i)&&(!query||[i.name,i.user,i.url,i.note,i.cat].join(' ').toLowerCase().includes(query)))
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

if(typeof module!=='undefined'&&module.exports){
  module.exports={
    CATS,ITER,ITER_OLD,DAY_MS,OLD_DAYS,MAX_HISTORY,iterOf,b64,unb64,esc,derive,encryptVault,decryptVault,
    clean,recordPasswordChange,parseItems,normUrl,safeUrl,sameItem,mergeItems,auditItems,filterItems,
    strength,SETS,WORDS_IT,rnd,generatePassword,parseCsvRows,parseCsvItems,
    generateCloudCode,normalizeCloudCode,cloudDocId
  };
}
