/* Roadbook — offline-ondersteuning.
   Houdt de app zelf en de kaartonderdelen vast, zodat hij ook zonder
   bereik opstart. Kaarttegels worden bewaard van de gebieden waar je
   al hebt gekeken. */
const APP = 'roadbook-app-v54';
const TILES = 'roadbook-tiles-v1';
/* Wat de gebruiker zelf heeft binnengehaald. Deze kast wordt nooit
   opgeruimd — daar heeft hij bewust op gewacht. */
const OFFLINE = 'roadbook-offline-v1';
const MAX_TILES = 1200;

/* Alles wat nodig is om zonder bereik te kunnen opstarten. Sinds de app in
   losse bestanden is opgeknipt moeten die er allemaal bij staan. */
/* Achter elk bestand hangt het versienummer, precies zoals index.html het
   opvraagt. Zonder dat mag de browser tot tien minuten lang de oude stijl.css
   of een oud .js-bestand teruggeven bij een nieuwe index.html — en dan heb je
   een halve nieuwe en een halve oude app. Dat is de naarste soort fout: alles
   staat er, maar het werkt niet samen. */
const V = '54';
const BESTANDEN = [
  './', './index.html',
  './stijl.css?v=' + V,
  ...['01-basis','02-invoer','03-route','04-bibliotheek','05-weergave','06-plannen',
      '07-interface','08-onderweg','09-rijden','10-uitvoer','11-offline','12-opstarten']
     .map(n => './' + n + '.js?v=' + V),
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

/* Bij een nieuwe versie de bewaarde stijl en het adressenlijstje weggooien.
   Een stukgelopen kopie daarvan is niet te overleven: de kaart blijft zwart en
   opnieuw laden helpt niet, want hij komt uit de kast. Ze worden meteen weer
   opgehaald — je bent immers online als je een nieuwe versie krijgt. */
async function stijlOpruimen() {
  for (const naam of [TILES, OFFLINE]) {
    const c = await caches.open(naam);
    for (const k of await c.keys()) if (isStijl(k.url)) await c.delete(k);
  }
}

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(n => n !== APP && n !== TILES && n !== OFFLINE)
                             .map(n => caches.delete(n))))
      .then(() => stijlOpruimen().catch(() => {}))
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

/* De stijl (`/styles/liberty`) en het adressenlijstje (`/planet`) zijn twee
   kleine bestanden die de kaart bij elkaar houden. Alle tegels staan onder
   `/planet/<datum>/...` en die vallen hier dus buiten: alleen `/planet` zelf.

   Waarom apart? Omdat een stukgelopen of verouderde kopie hiervan de hele kaart
   zwart maakt — en dat bleef zo, want de kast werd eerst bevraagd. In het
   adressenlijstje staat een datum die OpenFreeMap elke paar weken vervangt; een
   oude kopie wijst naar tegels die niet meer bestaan. Deze twee gaan daarom
   eerst naar het netwerk. */
const isStijl = url =>
  /tiles\.openfreemap\.org\/(styles\/[^\/?]+|planet)(\?|$)/.test(url);

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

  if (isStijl(url)) {                         // stijl: eerst het netwerk
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (!res || !res.ok) throw new Error('niet ok');
        /* In de kast die nooit wordt opgeruimd, zodat de kaart ook zonder
           bereik nog opstart. Het zijn twee kleine bestanden. */
        caches.open(OFFLINE).then(c => c.put(req, res.clone())).catch(() => {});
        return res;
      } catch (err) {
        for (const naam of [OFFLINE, TILES]) {
          const hit = await caches.open(naam)
            .then(c => c.match(req, {ignoreVary:true})).catch(() => null);
          if (hit) return hit;
        }
        return Response.error();
      }
    })());
    return;
  }

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
