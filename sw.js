/* Roadbook — offline-ondersteuning.
   Houdt de app zelf en de kaartonderdelen vast, zodat hij ook zonder
   bereik opstart. Kaarttegels worden bewaard van de gebieden waar je
   al hebt gekeken. */
const APP = 'roadbook-app-v29';
const TILES = 'roadbook-tiles-v1';
/* Wat de gebruiker zelf heeft binnengehaald. Deze kast wordt nooit
   opgeruimd — daar heeft hij bewust op gewacht. */
const OFFLINE = 'roadbook-offline-v1';
const MAX_TILES = 1200;

/* Alles wat nodig is om zonder bereik te kunnen opstarten. Sinds de app in
   losse bestanden is opgeknipt moeten die er allemaal bij staan. */
const BESTANDEN = [
  './', './index.html', './stijl.css',
  './01-basis.js', './02-invoer.js', './03-route.js', './04-bibliotheek.js',
  './05-weergave.js', './06-plannen.js', './07-interface.js', './08-onderweg.js',
  './09-rijden.js', './10-uitvoer.js', './11-offline.js', './12-opstarten.js',
  './manifest.webmanifest',
  './icoon-180.png', './icoon-192.png', './icoon-512.png'
];

/* Bestanden van de app zelf: eerst het netwerk, anders de kopie.
   Elk bestand apart, want addAll() laat bij één misser de hele lijst vallen
   en op een wankele telefoonverbinding gebeurt dat zomaar. */
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(APP).then(c =>
    Promise.all(BESTANDEN.map(b => c.add(b).catch(() => {})))
  ));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(n => n !== APP && n !== TILES && n !== OFFLINE)
                             .map(n => caches.delete(n))))
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
    e.respondWith((async () => {
      /* Eerst kijken bij de gebieden die de gebruiker zelf heeft binnengehaald.
         Die gaan voor: daar heeft hij bewust op staan wachten. */
      const vast = await caches.open(OFFLINE)
        .then(c => c.match(req, {ignoreVary:true})).catch(() => null);
      if (vast) return vast;

      const c = await caches.open(TILES);
      const hit = await c.match(req, {ignoreVary:true});
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
          c.put(req, res.clone());
          trimTiles();
        }
        return res;
      } catch (err) {
        return Response.error();
      }
    })());
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
