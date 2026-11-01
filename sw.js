// Rete prima, cache come riserva offline: gli aggiornamenti dell'app arrivano subito
// senza dover cambiare a mano il nome della cache a ogni modifica.
const C='cassaforte-v10', FILES=['./','index.html','app.js','theme.js','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==C).map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  e.respondWith(
    fetch(r).then(res=>{
      if(res.ok){const copy=res.clone();e.waitUntil(caches.open(C).then(c=>c.put(r,copy)))}
      return res;
    }).catch(()=>caches.match(r,{ignoreSearch:true}).then(c=>c||(r.mode==='navigate'?caches.match('index.html'):Response.error())))
  );
});
