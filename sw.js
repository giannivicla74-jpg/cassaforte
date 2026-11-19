// Rete prima, cache come riserva offline: gli aggiornamenti dell'app arrivano subito
// senza dover cambiare a mano il nome della cache a ogni modifica.
// Con segnale debole la rete può restare "appesa" a lungo: dopo TIMEOUT ms si usa
// subito la copia in cache, mentre il download continua in sottofondo e aggiorna la cache.
const C='cassaforte-v12', TIMEOUT=3000, FILES=['./','index.html','core.js','app.js','theme.js','music.js','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==C).map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  const fromCache=()=>caches.match(r,{ignoreSearch:true}).then(c=>c||(r.mode==='navigate'?caches.match('index.html'):undefined));
  const net=fetch(r).then(res=>{
    if(res.ok){const copy=res.clone();caches.open(C).then(c=>c.put(r,copy))}
    return res;
  });
  e.waitUntil(net.catch(()=>{})); // lascia finire il download in sottofondo
  e.respondWith(new Promise(resolve=>{
    let done=false;
    const fallback=()=>fromCache().then(c=>{if(c&&!done){done=true;resolve(c)}return c});
    const t=setTimeout(fallback,TIMEOUT);
    net.then(res=>{clearTimeout(t);if(!done){done=true;resolve(res)}})
       .catch(()=>{clearTimeout(t);fallback().then(c=>{if(!c&&!done){done=true;resolve(Response.error())}})});
  }));
});
