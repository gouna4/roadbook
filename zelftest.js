/* Roadbook — zelftest. Hoort niet bij de app: index.html laadt hem niet en hij
   staat niet in sw.js. Draaien met de node die in VS Code zit, vanuit de
   projectmap:

     $env:ELECTRON_RUN_AS_NODE = "1"
     & "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" zelftest.js

   Er worden vier dingen nagekeken.

   1. De laadvolgorde. De bestanden gaan in dezelfde volgorde door de molen als
      in de browser. Gebruikt een bestand een naam die pas in een later bestand
      staat, dan breekt het daar af — en alles ná die regel doet dan niets meer.
      Een gewone tikfoutcontrole ziet dat niet, want de code is dan wél goed
      geschreven; hij komt alleen te vroeg. Zet zulke verwijzingen in een
      pijlfunctie, dan worden ze pas opgezocht als je erop klikt.

   2. Of alle namen bestaan. Hiervoor wordt de compiler gebruikt die in VS Code
      meegeleverd wordt; die kent de scope-regels precies. Zo vonden we `vast`
      in de rondje-logica: die naam bestond nergens, en daardoor klapte het
      plannen van een rondje er altijd uit.

   3. Het rekenwerk dat zonder server gebeurt: richtingen, afstanden, waar je op
      de route bent, waar je hem weer oppakt als je een afslag hebt gemist, de
      zonnestand, en het aan elkaar plakken van een nieuwe en een oude route.

   4. Of de interface klopt met de code: bestaat elk element dat de code
      opvraagt, staan de kaartlaag-knoppen apart, en is het versienummer overal
      hetzelfde. */

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

/* ================= 1b. bestaan alle namen? =================
   De compiler die in VS Code meegeleverd wordt kent de scope-regels van
   JavaScript precies. Zo vinden we namen die gebruikt worden maar nergens
   gemaakt zijn — zoals `vast` in de rondje-logica, die daar alles liet
   klappen zodra je een rondje plande. */
console.log('');
console.log('=== 1b. bestaan alle namen die gebruikt worden? ===');
(function namenCheck(){
  const os = require('os'), pad = require('path');
  const kandidaten = [];
  const basis = [
    pad.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code'),
    'C:/Program Files/Microsoft VS Code',
    pad.join(os.homedir(), '.vscode-server')
  ];
  for (const b of basis) {
    if (!fs.existsSync(b)) continue;
    /* De map heeft een wisselende naam per versie, dus even rondkijken. */
    const stapels = [b, ...fs.readdirSync(b).map(d => pad.join(b, d))];
    for (const s of stapels) {
      const p = pad.join(s, 'resources/app/extensions/node_modules/typescript/lib/typescript.js');
      if (fs.existsSync(p)) kandidaten.push(p);
    }
  }
  if (!kandidaten.length) {
    console.log('  overgeslagen: de compiler van VS Code niet gevonden');
    return;
  }
  const ts = require(kandidaten[0]);
  const program = ts.createProgram(BESTANDEN, {
    allowJs: true, checkJs: true, noEmit: true, target: ts.ScriptTarget.ES2020,
    lib: ['lib.es2020.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts']
  });
  /* 2304 en 2552: naam bestaat niet. 2448 en 2454: gebruikt voor hij bestaat. */
  const LETOP = new Set([2304, 2552, 2448, 2454]);
  /* maplibregl komt van de kaartbibliotheek en staat dus niet in onze code. */
  const raak = ts.getPreEmitDiagnostics(program)
    .filter(d => LETOP.has(d.code))
    .filter(d => !/maplibregl/.test(ts.flattenDiagnosticMessageText(d.messageText, ' ')));
  if (!raak.length) { console.log('OK   alle namen bestaan'); return; }
  for (const d of raak) {
    fouten++;
    const r = d.file ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : '?';
    console.log('FOUT ' + (d.file ? d.file.fileName.split(/[\/]/).pop() : '?') + ':' + r
      + '  ' + ts.flattenDiagnosticMessageText(d.messageText, ' '));
  }
})();

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

console.log('');
console.log('--- tekenPunten(): jouw vorm opdelen in tussenstops ---');
/* Een rechte lijn van ongeveer 120 km op 51 graden. */
function rechteLijn(km, stukken) {
  const stapLon = km / (111.32 * Math.cos(51 * Math.PI / 180)) / stukken;
  const uit = [];
  for (let i = 0; i <= stukken; i++) uit.push([6.0 + i * stapLon, 51.0]);
  return uit;
}
const l120 = rechteLijn(120, 800);
const punten120 = tekenPunten(l120);
check('120 km geeft 11 punten', punten120.length, 11);
check('begint bij je eerste veeg', punten120[0][0].toFixed(5), l120[0][0].toFixed(5));
check('eindigt bij je laatste veeg', punten120[10][0].toFixed(5), l120[l120.length-1][0].toFixed(5));
/* De stukken tussen de punten moeten ongeveer gelijk zijn: 120/10 = 12 km. */
let kleinste = Infinity, grootste = 0;
for (let i = 1; i < punten120.length; i++) {
  const d = haversine(punten120[i-1], punten120[i]);
  if (d < kleinste) kleinste = d;
  if (d > grootste) grootste = d;
}
console.log('     stukken van ' + kleinste.toFixed(2) + ' tot ' + grootste.toFixed(2) + ' km');
check('stukken zijn ongeveer 12 km', grootste - kleinste < 0.5, true);

/* Heel lang: de rem moet erop, anders overvragen we de routeserver. */
check('600 km blijft op 17 punten', tekenPunten(rechteLijn(600, 2000)).length, 17);
check('1500 km ook 17 punten', tekenPunten(rechteLijn(1500, 2000)).length, 17);
/* Heel kort: minstens twee stukken, dus drie punten. */
check('8 km geeft 3 punten', tekenPunten(rechteLijn(8, 60)).length, 3);
check('25 km geeft 3 punten', tekenPunten(rechteLijn(25, 200)).length, 3);
check('36 km geeft 4 punten', tekenPunten(rechteLijn(36, 200)).length, 4);
check('60 km geeft 6 punten', tekenPunten(rechteLijn(60, 400)).length, 6);

/* Een rondje: eerste en laatste punt moeten op dezelfde plek liggen, anders
   maakt de routeserver er geen rondje van. */
const rondje = [];
for (let g = 0; g < 360; g += 5) {
  const r = g * Math.PI / 180;
  rondje.push([6.0 + 0.5 * Math.cos(r), 50.5 + 0.32 * Math.sin(r)]);
}
rondje.push(rondje[0]);
const puntenRond = tekenPunten(rondje);
check('rondje: eind is gelijk aan begin',
      puntenRond[0].join(',') === puntenRond[puntenRond.length-1].join(','), true);
console.log('     rondje van ' + cumulative(rondje).slice(-1)[0].toFixed(0)
            + ' km wordt ' + puntenRond.length + ' punten');


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

console.log('');
console.log('--- bochten zoeken: wegen meten en saaie stukken vinden ---');
/* Bouwstenen om routes te verzinnen: een kaarsrecht stuk en een zigzag.
   Punten van ongeveer 100 meter, zoals de routeserver ze ook geeft. */
function recht(lon0, lat0, km) {
  const stap = 0.1 / (111.32 * Math.cos(lat0 * Math.PI / 180));
  const uit = [];
  for (let i = 0; i * 0.1 <= km; i++) uit.push([lon0 + i * stap, lat0]);
  return uit;
}
function zigzag(lon0, lat0, km, uitslag) {
  const stap = 0.1 / (111.32 * Math.cos(lat0 * Math.PI / 180));
  const uit = [];
  for (let i = 0; i * 0.1 <= km; i++)
    uit.push([lon0 + i * stap, lat0 + (i % 4 < 2 ? uitslag : -uitslag)]);
  return uit;
}

const rechteWeg = recht(6.0, 50.4, 4);
/* Uitslag 0,0004 graad: het pad wordt ongeveer 1,2x zo lang als de
   rechte lijn. Dat is een echte bergweg; 0,004 zou een trap zijn. */
const kronkelWeg = zigzag(6.0, 50.4, 4, 0.0004);
console.log('     recht:   ' + JSON.stringify(wegBochtigheid(rechteWeg)));
console.log('     kronkel: ' + JSON.stringify(wegBochtigheid(kronkelWeg)));
check('een rechte weg heeft bochtigheid 0', wegBochtigheid(rechteWeg).score, 0);
check('een kronkelweg komt door de zeef (>=45)', wegBochtigheid(kronkelWeg).score >= 45, true);
check('lengte van 4 km klopt', wegBochtigheid(rechteWeg).km.toFixed(1), '4.0');
check('een kort stukje telt niet mee', wegBochtigheid(recht(6.0, 50.4, 0.2)).score, 0);

/* Een route van 15 km recht, 10 km kronkel, 15 km recht. Daar moet hij twee
   saaie stukken in zien: het begin en het eind. */
const gemengd = [...recht(6.0, 50.4, 15)];
const na1 = gemengd[gemengd.length - 1];
gemengd.push(...zigzag(na1[0], na1[1], 10, 0.0004));
const na2 = gemengd[gemengd.length - 1];
gemengd.push(...recht(na2[0], na2[1], 15));
const stukken = saaieStukken(curveProfile(gemengd));
console.log('     saaie stukken: ' + stukken.map(s =>
  Math.round(s.van) + '-' + Math.round(s.tot) + ' km').join('  ') || '(geen)');
check('twee saaie stukken gevonden', stukken.length, 2);
check('het langste staat vooraan', stukken[0].tot - stukken[0].van >= stukken[1].tot - stukken[1].van, true);
check('beide minstens 8 km', stukken.every(s => s.tot - s.van >= 8), true);

/* Een route die van begin tot eind kronkelt heeft niets saais. */
check('kronkelroute heeft geen saai stuk',
      saaieStukken(curveProfile(zigzag(6.0, 50.4, 40, 0.0004))).length, 0);
/* En een korte rechte rit is te kort om iets aan te doen. */
check('5 km recht is te kort om op te knappen',
      saaieStukken(curveProfile(recht(6.0, 50.4, 5))).length, 0);

console.log('');
console.log('--- bochtHoek(): hoe scherp is de afslag ---');
/* Een route die 1 km pal noord gaat en dan 1 km pal oost: bij de hoek is dat
   een bocht van 90 graden naar rechts. Punten van 20 meter, want bochtHoek
   kijkt 60 meter voor en na de afslag. */
const noord = [], stapN = 0.02 / 111.32;
for (let i = 0; i <= 50; i++) noord.push([6.0, 51.0 + i * stapN]);
const hoek = noord[noord.length - 1];
const stapO = 0.02 / (111.32 * Math.cos(51 * Math.PI / 180));
for (let i = 1; i <= 50; i++) noord.push([hoek[0] + i * stapO, hoek[1]]);
const cumH = cumulative(noord);
const opDeHoek = cumH[50];
console.log('     hoek op km ' + opDeHoek.toFixed(2) + ': '
  + bochtHoek(noord, cumH, opDeHoek).toFixed(0) + ' graden');
check('bocht naar rechts is +90', Math.round(bochtHoek(noord, cumH, opDeHoek) / 5) * 5, 90);
check('halverwege het rechte stuk is 0', Math.round(bochtHoek(noord, cumH, 0.5)), 0);

/* Dezelfde route gespiegeld: dan is het een bocht naar links, dus negatief. */
const west = [];
for (let i = 0; i <= 50; i++) west.push([6.0, 51.0 + i * stapN]);
for (let i = 1; i <= 50; i++) west.push([6.0 - i * stapO, hoek[1]]);
check('bocht naar links is -90', Math.round(bochtHoek(west, cumulative(west), opDeHoek) / 5) * 5, -90);
/* Buiten de route vragen mag niet ontploffen. */
check('voorbij het eind', bochtHoek(noord, cumH, 999).toFixed(0), '0');
check('lege lijn', bochtHoek([], [], 1), 0);

console.log('');
console.log('--- richtingWoord(): de bocht in gewone taal ---');
check('0 graden', richtingWoord(0), 'Rechtdoor');
check('8 graden', richtingWoord(8), 'Rechtdoor');
check('20 graden', richtingWoord(20), 'Licht rechts');
check('-20 graden', richtingWoord(-20), 'Licht links');
check('60 graden', richtingWoord(60), 'Rechts');
check('-60 graden', richtingWoord(-60), 'Links');
check('120 graden', richtingWoord(120), 'Scherp rechts');
check('-120 graden', richtingWoord(-120), 'Scherp links');
check('170 graden', richtingWoord(170), 'Keer om');
check('-170 graden', richtingWoord(-170), 'Keer om');

console.log('');
console.log('--- vijf standen wegtype ---');
check('er zijn vijf standen', Object.keys(LEVELS).length, 5);
check('stand 1 mijdt snelweg helemaal', LEVELS[1].hw, 0);
check('stand 5 laat snelweg vrij', LEVELS[5].hw, 1);
check('elke stand heeft een symbool', Object.values(LEVELS).every(l => !!l.path), true);
check('elke stand heeft uitleg', Object.values(LEVELS).every(l => !!l.hint), true);
check('snelweg loopt op per stand',
      [1,2,3,4,5].every((n,i,a) => i===0 || LEVELS[n].hw >= LEVELS[a[i-1]].hw), true);

console.log('');
console.log('--- plakRoute(): nieuwe route aan de oude vastmaken ---');
/* Oude route: 20 km pal noord, met afslagen op 5, 10 en 15 km. Je bent bij km
   10 van de route af geraakt en er komt een nieuw stukje van 3 km dat je daar
   weer op zet. */
const oudR = [];
for (let i = 0; i <= 200; i++) oudR.push([6.0, 51.0 + i * 0.0009]);
const oudC = cumulative(oudR);
const oudM = [5, 10, 15].map(km => {
  let i = oudC.findIndex(d => d >= km);
  return { km: oudC[i], tekst: 'afslag op ' + km + ' km' };
});
let instap = oudC.findIndex(d => d >= 10);
const nieuwStuk = { shape: [], man: [] };
for (let i = 0; i <= 30; i++) nieuwStuk.shape.push([6.02 - i * 0.0003, oudR[instap][1]]);
nieuwStuk.shape.push(oudR[instap]);
nieuwStuk.man = [{ begin_shape_index: 0, instruction: 'Rijd weg.' },
                 { begin_shape_index: 20, instruction: 'Ga links.' }];

const plak = plakRoute(nieuwStuk, oudR, oudC, oudM, instap);
const nieuwTotaal = plak.cum[plak.cum.length - 1];
console.log('     nieuw stukje ' + plak.kopKm.toFixed(2) + ' km, instap op '
  + plak.vanaf.toFixed(2) + ' km van de oude route van ' + plak.oudTotaal.toFixed(1) + ' km');
console.log('     samen ' + nieuwTotaal.toFixed(2) + ' km, ' + plak.man.length + ' afslagen');

/* Geen punt dubbel: de lengte is het nieuwe stukje plus wat er van de oude
   route nog over was. */
check('lengte klopt', nieuwTotaal.toFixed(2),
      (plak.kopKm + (plak.oudTotaal - plak.vanaf)).toFixed(2));
check('geen dubbel punt op de naad',
      haversine(plak.shape[nieuwStuk.shape.length - 1], plak.shape[nieuwStuk.shape.length]) > 0, true);
/* De afslag op 5 km lag achter je en moet weg zijn; die op 10 valt op de naad
   en gaat ook weg; die op 15 komt terug, 5 km ná het instappunt. */
check('oude afslagen achter je zijn weg', plak.man.filter(m => /op 5 km/.test(m.tekst)).length, 0);
const later = plak.man.find(m => /op 15 km/.test(m.tekst));
check('de afslag verderop staat er nog', !!later, true);
check('en op de goede kilometer', (later.km - plak.kopKm).toFixed(2),
      (oudC[oudC.findIndex(d => d >= 15)] - plak.vanaf).toFixed(2));
check('afslagen lopen op', plak.man.every((m, i, a) => i === 0 || m.km >= a[i-1].km), true);
check('het nieuwe stukje heeft zijn eigen afslagen',
      plak.man.filter(m => /Rijd weg|Ga links/.test(m.tekst)).length, 2);

console.log('');
console.log('--- aangewezen punten herkennen ---');
check('coordinaat is een aangewezen punt', isCoordNaam('50.70111, 6.25306'), true);
check('ook zonder decimalen', isCoordNaam('50, 6'), true);
check('negatief mag ook', isCoordNaam('-3.20000, 55.90000'), true);
check('een plaatsnaam niet', isCoordNaam('Adenau'), false);
check('een adres niet', isCoordNaam('Eifel, Adenau · Ahrweiler'), false);
check('leeg niet', isCoordNaam(''), false);
/* En uit de lijst met tussenstops komen alleen de aangewezen punten, op orde. */
state.vias = ['Adenau', '50.70111, 6.25306', 'Nurburg', '50.60000, 6.10000'];
const uitLijst = pinPunten();
check('twee punten uit vier tussenstops', uitLijst.length, 2);
check('eerste punt goed', uitLijst[0].join(','), '6.25306,50.70111');
check('volgorde blijft', uitLijst[1].join(','), '6.1,50.6');
state.vias = [];

console.log('');
console.log('--- zonTijden(): wanneer gaat de zon op en onder ---');
/* Niet natrekken met cijfers uit mijn hoofd, maar met dingen die vaststaan:
   de langste dag in Amsterdam is 16 uur 46, de kortste 7 uur 44, en de zon
   staat midden tussen op en onder in — op de lengte van Amsterdam rond
   11:40 UTC. */
const AMS = [52.3676, 4.9041];
const uren = t => (t.onder - t.op) / 3600000;
const midden = t => new Date((+t.op + +t.onder) / 2);

const juni = zonTijden(AMS[0], AMS[1], new Date(Date.UTC(2026, 5, 21, 12)));
const dec  = zonTijden(AMS[0], AMS[1], new Date(Date.UTC(2026, 11, 21, 12)));
console.log('     21 juni:      op ' + juni.op.toISOString().slice(11,16)
  + ' onder ' + juni.onder.toISOString().slice(11,16) + ' UTC, ' + uren(juni).toFixed(2) + ' uur licht');
console.log('     21 december:  op ' + dec.op.toISOString().slice(11,16)
  + ' onder ' + dec.onder.toISOString().slice(11,16) + ' UTC, ' + uren(dec).toFixed(2) + ' uur licht');
check('langste dag is 16u46 (+/- 10 min)', Math.abs(uren(juni) - 16.77) < 0.17, true);
check('kortste dag is 7u44 (+/- 10 min)', Math.abs(uren(dec) - 7.73) < 0.17, true);
check('zon op voor zon onder', juni.op < juni.onder, true);
check('juni gaat eerder op dan december',
      juni.op.getUTCHours() < dec.op.getUTCHours(), true);
/* Zonnemiddag: 12:00 UTC minus de lengtegraad gedeeld door 15, plus maximaal
   een kwartier voor de scheve baan van de aarde. */
const middagJuni = midden(juni).getUTCHours() + midden(juni).getUTCMinutes()/60;
check('zonnemiddag rond 11:40 UTC', Math.abs(middagJuni - 11.67) < 0.3, true);

/* Op de evenaar is het het hele jaar ongeveer twaalf uur licht. */
const evenaar = zonTijden(0, 0, new Date(Date.UTC(2026, 11, 21, 12)));
check('evenaar: 12 uur licht', Math.abs(uren(evenaar) - 12.12) < 0.15, true);

/* En boven de poolcirkel: midzomer geen nacht, midwinter geen dag. */
const poolZomer = zonTijden(78, 15, new Date(Date.UTC(2026, 5, 21, 12)));
const poolWinter = zonTijden(78, 15, new Date(Date.UTC(2026, 11, 21, 12)));
check('poolzomer: de zon gaat niet onder', poolZomer !== null && uren(poolZomer) > 0, true);
check('poolnacht: geen zonsopkomst', poolWinter, null);

console.log('');
console.log('=== 4. klopt de interface met de code? ===');
(function interfaceCheck(){
  const html = fs.readFileSync('index.html', 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

  /* Elke el('id') moet een element hebben, anders klapt de app eruit zodra je
     die knop nodig hebt. */
  let ontbreekt = 0;
  for (const f of BESTANDEN) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/el\('([^']+)'\)/g)) {
      if (!ids.has(m[1])) { console.log('FOUT ' + f + ': el(' + m[1] + ') bestaat niet'); ontbreekt++; fouten++; }
    }
  }
  if (!ontbreekt) console.log("OK   elke el('id') vindt zijn element");

  /* De kaartlagen zaten in een rij die een klasse deelde met andere knoppen.
     Een luisteraar op '.layers button' raakte die andere ook: dan werd de kaart
     zwart en kwam hij niet meer terug. Sinds versie 37 is het één knop die
     doorklikt, en mag die selector nergens meer voorkomen. */
  if(!ids.has('baseCycle')){
    console.log('FOUT de knop om van kaart te wisselen (baseCycle) bestaat niet');
    fouten++;
  } else {
    let mis = 0;
    for (const f of BESTANDEN)
      if (/querySelectorAll\('\.layers button'\)/.test(fs.readFileSync(f, 'utf8'))) {
        console.log('FOUT ' + f + " luistert naar '.layers button' — dat raakt ook andere knoppen");
        fouten++; mis++;
      }
    if (!mis) console.log('OK   van kaart wisselen gaat via een eigen knop');
  }

  /* Versienummers die uit elkaar lopen geven een halve oude app. Ze staan op
     vier plekken en moeten alle vier gelijk zijn: de kop van index.html, achter
     elke bestandsnaam die index.html opvraagt, de cachenaam in sw.js, en de V
     in sw.js waarmee die zijn offline-lijst opbouwt. */
  const sw = fs.readFileSync('sw.js', 'utf8');
  const kop = /versie (\d+)/.exec(html);
  const kast = /roadbook-app-v(\d+)/.exec(sw);
  const swV = /const V = '(\d+)'/.exec(sw);
  const achter = [...new Set([...html.matchAll(/\?v=(\d+)/g)].map(m => m[1]))];
  const alle = [kop && kop[1], kast && kast[1], swV && swV[1], ...achter];
  if (alle.some(x => !x) || new Set(alle).size !== 1) {
    console.log('FOUT versienummers lopen uit elkaar: kop=' + (kop && kop[1])
      + ' cache=' + (kast && kast[1]) + ' swV=' + (swV && swV[1])
      + ' achter bestandsnamen=' + achter.join('/'));
    fouten++;
  } else {
    console.log('OK   versie ' + kop[1] + ' staat overal hetzelfde ('
      + achter.length + ' bestandsnaam + kop + sw.js)');
  }
  /* En elk eigen bestand moet dat nummer ook echt meekrijgen. */
  const zonder = [...html.matchAll(/(?:src|href)="((?:\d\d-[a-z]+\.js|stijl\.css))"/g)];
  if (zonder.length) {
    console.log('FOUT zonder versienummer opgevraagd: '
      + zonder.map(m => m[1]).join(', ') + ' — de browser mag dan een oude teruggeven');
    fouten++;
  } else console.log('OK   alle eigen bestanden worden met versienummer opgevraagd');
})();

console.log('');
console.log(fouten ? `\n${fouten} FOUT(EN) — eerst oplossen.` : '\nAlles goed.');
process.exit(fouten ? 1 : 0);
