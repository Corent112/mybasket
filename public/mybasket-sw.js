/* Cache only the public offline document. Never cache messages, API responses or authenticated pages. */
const CACHE='mybasket-public-offline-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/hors-ligne.html')).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mybasket-public-offline-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||event.request.mode!=='navigate'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).catch(()=>caches.match('/hors-ligne.html').then(response=>response||new Response('MyBasket est hors connexion.',{headers:{'Content-Type':'text/plain; charset=utf-8'}}))))});
