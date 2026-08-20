/* Roadbook — offline-ondersteuning.
   Houdt de app zelf en de kaartonderdelen vast, zodat hij ook zonder
   bereik opstart. Kaarttegels worden bewaard van de gebieden waar je
   al hebt gekeken. */
const APP = 'roadbook-app-v16';
const TILES = 'roadbook-tiles-v1';
const MAX_TILES = 1200;

/* Bestanden van de app zelf: eerst het netwerk, anders de kopie. */
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(APP).then(c => c.addAll(['./', './index.html']).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(n => n !== APP && n !== TILES).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/* Oudste tegels weggooien als het er te veel worden. */
async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  if (keys.length > MAX_TILES) {
    for (const k of keys.slice(0, keys.length - MAX_TILES)) await c.delete(k);
  }
}

const isTile = url =>
  /tiles\.openfreemap\.org|tile\.opentopomap\.org|server\.arcgisonline\.com|unpkg\.com|fonts\.(googleapis|gstatic)\.com/
    .test(url);

/* Routes, plaatsen en weer nooit uit de kast halen: die moeten vers zijn. */
const isLive = url =>
  /valhalla1\.openstreetmap\.de|overpass|nominatim|photon\.komoot\.io|api\.open-meteo\.com|commons\.wikimedia\.org/
    .test(url);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  if (isLive(url)) return;                    // altijd rechtstreeks

  if (isTile(url)) {                          // kaart: eerst uit de kast
    e.respondWith(
      caches.open(TILES).then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === 'opaque')) {
            c.put(req, res.clone());
            trimTiles();
          }
          return res;
        } catch (err) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  /* De app zelf: eerst het netwerk zodat je nieuwe versies krijgt,
     valt dat weg dan de bewaarde kopie. */
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(APP).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
