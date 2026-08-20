/* Roadbook — zelftest. Hoort niet bij de app: index.html laadt hem niet en hij
   staat niet in sw.js. Draaien met de node die in VS Code zit, vanuit de
   projectmap:

     $env:ELECTRON_RUN_AS_NODE = "1"
     & "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" zelftest.js

   Er worden twee dingen nagekeken.

   1. De laadvolgorde. De bestanden gaan in dezelfde volgorde door de molen als
      in de browser. Gebruikt een bestand een naam die pas in een later bestand
      staat, dan breekt het daar af — en alles ná die regel doet dan niets meer.
      Een gewone tikfoutcontrole ziet dat niet, want de code is dan wél goed
      geschreven; hij komt alleen te vroeg. Zet zulke verwijzingen in een
      pijlfunctie, dan worden ze pas opgezocht als je erop klikt.

   2. Het rekenwerk dat zonder server gebeurt: richtingen, afstanden, waar je op
      de route bent en waar je hem weer oppakt als je een afslag hebt gemist. */

const fs = require('fs');
const BESTANDEN = ['01-basis.js','02-invoer.js','03-route.js','04-bibliotheek.js',
  '05-weergave.js','06-plannen.js','07-interface.js','08-onderweg.js',
  '09-rijden.js','10-uitvoer.js','11-offline.js','12-opstarten.js'];

/* ---------- nep-omgeving: net genoeg browser om de bestanden te laten laden ---------- */
const nep = () => new Proxy(function(){}, {
  get: (t,k) => (k === 'then' || k === Symbol.toPrimitive ? undefined : nep()),
  apply: () => nep(), construct: () => nep(), has: () => true
});
function Nep(){ return nep(); }
const element = () => ({ addEventListener(){}, removeEventListener(){},
  classList:{toggle(){},add(){},remove(){},contains:()=>false}, style:{},
  textContent:'', innerHTML:'', hidden:false, value:'', checked:false,
  dataset:{}, children:[], firstElementChild:{style:{}}, appendChild(){},
  querySelectorAll:()=>[], querySelector:()=>null, append(){}, insertBefore(){},
  setAttribute(){}, getAttribute:()=>null, focus(){}, click(){}, remove(){},
  getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
  get parentNode(){ return element(); }, get parentElement(){ return element(); },
  get nextSibling(){ return null; }, get firstChild(){ return null; },
  scrollIntoView(){}, closest:()=>null, contains:()=>false, replaceChildren(){} });

const g = globalThis;
g.window = g;
g.addEventListener = () => {};
g.removeEventListener = () => {};
g.document = { getElementById: element, createElement: element, createElementNS: element,
  querySelectorAll: () => [], querySelector: () => null, addEventListener(){},
  body: element(), documentElement: element(), head: element(), visibilityState:'visible' };
g.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
g.caches = { open:()=>Promise.resolve({ put(){}, match:()=>Promise.resolve(null),
                                        delete:()=>Promise.resolve(false) }) };
g.maplibregl = { Map:Nep, NavigationControl:Nep, GeolocateControl:Nep, ScaleControl:Nep,
  Marker:Nep, Popup:Nep, LngLatBounds:Nep, AttributionControl:Nep };
g.speechSynthesis = { cancel(){}, speak(){}, getVoices:()=>[] };
g.SpeechSynthesisUtterance = function(){};
g.navigator = { geolocation:{ watchPosition:()=>1, clearWatch(){} }, wakeLock:null,
  userAgent:'test', serviceWorker:null, share:null, clipboard:null };
g.location = { hash:'', href:'http://x/', search:'', origin:'http://x' };
g.fetch = () => Promise.resolve({ ok:false, json:()=>Promise.resolve({}) });
g.matchMedia = () => ({ matches:false, addEventListener(){} });
g.AbortController = function(){ this.signal={}; this.abort=()=>{}; };
g.requestAnimationFrame = () => 0;
g.ResizeObserver = function(){ this.observe=()=>{}; this.disconnect=()=>{}; };
g.IntersectionObserver = function(){ this.observe=()=>{}; this.unobserve=()=>{}; this.disconnect=()=>{}; };
g.MutationObserver = function(){ this.observe=()=>{}; this.disconnect=()=>{}; };
g.Blob = function(){}; g.URL = { createObjectURL:()=>'blob:x', revokeObjectURL(){} };
g.alert = () => {}; g.confirm = () => false; g.print = () => {};

let fouten = 0;
const check = (naam, gekregen, verwacht) => {
  const ok = String(gekregen) === String(verwacht);
  if (!ok) fouten++;
  console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}: ${gekregen}${ok ? '' : '   (verwacht ' + verwacht + ')'}`);
};

/* ================= 1. laadvolgorde ================= */
console.log('=== 1. laden de bestanden in de goede volgorde? ===\n');
for (const f of BESTANDEN) {
  /* Declaraties op regelbegin naar var, zodat ze — net als in de browser — in
     de gedeelde ruimte komen te staan. Wat binnen een functie staat blijft. */
  const code = fs.readFileSync(f, 'utf8').replace(/^(const|let) /gm, 'var ');
  try {
    (0, eval)(code);
    console.log('OK   ' + f);
  } catch (e) {
    fouten++;
    console.log('FOUT ' + f + ': ' + e.message);
    const r = /<anonymous>:(\d+)/.exec(e.stack || '');
    if (r) console.log('     regel ' + r[1] + ':  ' + (code.split('\n')[+r[1] - 1] || '').trim());
  }
}

/* ================= 2. het rekenwerk ================= */
console.log('\n=== 2. rekent het goed? ===');

console.log('\n--- kant(): richting in gewone taal ---');
check('0 graden', kant(0), 'rechtdoor');
check('45 graden', kant(45), 'rechts voor je');
check('90 graden', kant(90), 'rechts');
check('180 graden', kant(180), 'achter je');
check('225 graden', kant(225), 'links achter je');
check('270 graden', kant(270), 'links');
check('-90 graden', kant(-90), 'links');
check('359 graden', kant(359), 'rechtdoor');

console.log('\n--- afst(): afstand leesbaar ---');
check('0,04 km', afst(0.04), '40 m');
check('0,123 km', afst(0.123), '120 m');
check('0,999 km', afst(0.999), '1000 m');
check('2,34 km', afst(2.34), '2.3 km');

console.log('\n--- afslagen(): vormpunt-nummer wordt kilometer ---');
/* Een rechte lijn pal noord, punten van elk ~1,11 km. */
const lijn = [];
for (let i = 0; i < 11; i++) lijn.push([6.0, 51.0 + i * 0.01]);
const cum = cumulative(lijn);
const uitServer = afslagen({ man: [
  { begin_shape_index: 0,  instruction: 'Rijd weg.' },
  { begin_shape_index: 5,  instruction: 'Ga rechts.' },
  { begin_shape_index: 10, instruction: 'Je bent er.' } ] }, cum);
check('aantal afslagen', uitServer.length, 3);
check('eerste op km', uitServer[0].km.toFixed(2), '0.00');
check('tweede op km', uitServer[1].km.toFixed(2), cum[5].toFixed(2));
check('derde op km', uitServer[2].km.toFixed(2), cum[10].toFixed(2));
check('totale lengte ~11,1 km', cum[10].toFixed(1), '11.1');
check('uit opslag blijft staan', afslagen({ man:[{km:3.5,tekst:'Ga links.'}] }, cum)[0].km, 3.5);
check('nummer buiten de lijn', afslagen({ man:[{begin_shape_index:9999,instruction:'X'}] }, cum)[0].km.toFixed(1),
      cum[10].toFixed(1));

console.log('\n--- dichtstbij(): venster eerst, anders alles afzoeken ---');
check('punt 5 gevonden', dichtstbij(lijn, 51.05, 6.0, null).i, 5);
check('afstand ~0', dichtstbij(lijn, 51.05, 6.0, null).off.toFixed(3), '0.000');
check('met venster erom', dichtstbij(lijn, 51.05, 6.0, 5).i, 5);
check('venster mist, toch goed', dichtstbij(lijn, 51.10, 6.0, 0).i, 10);

console.log('\n--- herintrede(): liever vooruit dan terug, maar niet altijd ---');
drive.shape = lijn; drive.cum = cum;
/* Je zat op punt 3 en staat 280 m naast punt 2, dus achter je. Vooruit
   instappen zou 1,15 km rijden zijn — vier keer zo ver. Dan is teruggaan beter. */
drive.idx = 3;
let h = herintrede(51.02, 6.004);
check('pakt het punt achter je', h.i, 2);
check('meldt geen vooruit', h.vooruit, false);
check('280 m terug', (h.af * 1000).toFixed(0), '280');
/* Je zat op punt 3 en staat naast punt 6: dan verderop weer instappen. */
drive.idx = 3;
h = herintrede(51.06, 6.004);
check('pakt punt 6 vooruit', h.i, 6);
check('vooruit gemeld', h.vooruit, true);
check('afstand ~280 m', (h.af * 1000).toFixed(0), '280');
/* Vlak naast punt 4 terwijl je van punt 3 komt: vooruit is nauwelijks verder. */
drive.idx = 3;
h = herintrede(51.0401, 6.0005);
check('vlak bij punt 4 vooruit', h.i, 4);
check('vooruit gekozen', h.vooruit, true);

console.log('');
console.log('--- tegelrekenwerk voor de offline kaart ---');
/* Heen en terug: reken van een punt naar een stukje, en van dat stukje weer
   terug naar zijn hoeken. Het punt moet er dan binnen vallen. Dit is de enige
   eerlijke controle, want een formule kun je niet met zichzelf nakijken. */
function hoekVanTegel(x, y, z) {
  const n = Math.pow(2, z);
  const lon = x / n * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  return [lon, lat];                       /* de noordwesthoek */
}
let mis = 0;
for (const [lon, lat] of [[6.65,50.35],[4.90,52.37],[-3.2,55.9],[13.4,52.5],[2.35,48.86]])
  for (const z of [6, 10, 14]) {
    const x = tegelX(lon, z), y = tegelY(lat, z);
    const [w, n] = hoekVanTegel(x, y, z);
    const [o, s] = hoekVanTegel(x + 1, y + 1, z);
    if (!(lon >= w && lon < o && lat <= n && lat > s)) mis++;
  }
check('15 keer heen en terug', mis, 0);
check('zoom 0 is één stukje', tegelX(6.65, 0) + '/' + tegelY(50.35, 0), '0/0');
check('west van de wereld', tegelX(-180, 14), 0);
check('oost van de wereld', tegelX(179.999, 14), Math.pow(2, 14) - 1);
check('evenaar op de helft', tegelY(0, 14), Math.pow(2, 14) / 2);
check('stukje op 51 graden is ~1,5 km', tegelKm(51, 14).toFixed(2), '1.54');

/* Een strook van 5 km weerszijden langs een rechte lijn van ~55 km. */
const route = [];
for (let i = 0; i <= 500; i++) route.push([6.0 + i * 0.0016, 51.0]);
const strook = tegelsLangsLijn(route, 5);
check('alles op zoom 14', [...strook].every(s => s.startsWith('14/')), true);
const kolommen = new Set([...strook].map(s => s.split('/')[1]));
check('strook is 9 stukjes hoog', strook.size / kolommen.size, 9);
console.log('     ' + strook.size + ' stukjes voor 55 km route, 5 km weerszijden');

/* Eén stukje op z14 hoort bij precies één grover stukje per niveau. */
const een = new Set(['14/8465/5461']);
check('acht grovere niveaus erbij', metOuders(een).size, 9);
check('grofste is zoom 6', [...metOuders(een)].some(s => s.startsWith('6/')), true);
const alles = metOuders(strook);
console.log('     met alle grovere niveaus erbij: ' + alles.size + ' stukjes');
/* Een dunne strook is de ongunstigste vorm: de grovere stukjes eronder liggen
   maar half vol. Toch blijft het bij ongeveer 40% extra, en nooit het dubbele. */
check('grovere niveaus zijn erbij', alles.size > strook.size * 1.25, true);
check('en kosten niet het dubbele', alles.size < strook.size * 1.6, true);

/* Een vak van 4 bij 3 stukjes moet 12 stukjes opleveren. */
const nz = Math.pow(2, 14);
const [, vakN] = hoekVanTegel(8465, 5461, 14);
const [, vakZ] = hoekVanTegel(8465, 5464, 14);
check('vak van 4 bij 3', tegelsInVak(-180 + 8465 / nz * 360 + 0.001, vakZ + 0.0001,
                                    -180 + 8468 / nz * 360 + 0.001, vakN - 0.0001).size, 12);

console.log('\n--- terugwijzer: welke kant moet je op ---');
drive.koers = 0;                                    /* je kijkt naar het noorden */
const richting = bearing([6.0, 51.0], [6.01, 51.0]); /* route ligt pal oost */
check('peiling naar oost', Math.round(richting), 90);
check('dus rechts', kant(richting - drive.koers), 'rechts');
drive.koers = 180;                                  /* nu kijk je naar het zuiden */
check('zuid kijkend is oost links', kant(richting - drive.koers), 'links');

console.log('\n--- past de rit in de opslag van de telefoon? ---');
for (const [km, punten, aantal] of [[200, 5000, 150], [400, 11000, 320], [900, 25000, 700]]) {
  const shape = [];
  for (let i = 0; i < punten; i++)
    shape.push([+(6 + i * 0.0004).toFixed(5), +(51 + i * 0.0003).toFixed(5)]);
  const man = [];
  for (let i = 0; i < aantal; i++)
    man.push({ km: +(i * km / aantal).toFixed(3), tekst: 'Ga rechts op de Bundesstraße 258 richting Monschau.' });
  const kb = JSON.stringify({ at:1, naam:'Vaals → Nürburg', km, sec:km*60, shape, man }).length / 1024;
  console.log(`     ${String(km).padStart(3)} km, ${punten} vormpunten -> ${kb.toFixed(0)} KB`);
  check(`${km} km past ruim binnen 5 MB`, kb < 1500, true);
}

console.log(fouten ? `\n${fouten} FOUT(EN) — eerst oplossen.` : '\nAlles goed.');
process.exit(fouten ? 1 : 0);
