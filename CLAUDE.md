# Roadbook — motortour planner

Webapp voor het plannen van motorroutes. Draait als één statisch bestand op
GitHub Pages, zonder eigen server, zonder account, zonder betaalde diensten.

**Live:** https://gouna4.github.io/roadbook/
**Taal van de interface:** Nederlands. De eigenaar is geen programmeur — leg
wijzigingen uit in gewone taal, niet in jargon.

## Harde randvoorwaarden

1. **Alles moet gratis blijven.** Geen API-sleutels, geen abonnementen, geen
   eigen server. Als een functie alleen met een betaalde dienst kan, zeg dat
   eerlijk en stel een gratis alternatief voor.
2. **Geen bouwstap.** Het moet blijven werken door bestanden naar GitHub te
   uploaden. Geen npm-build, geen bundler, geen framework dat gecompileerd
   moet worden.
3. **Gratis servers zijn wisselvallig.** Elke externe aanroep moet netjes
   kunnen mislukken zonder de app te breken. De route zelf gaat altijd voor;
   bijzaken (foto's, bezienswaardigheden) mogen stilletjes wegvallen.
4. **De telefoon gaat voor.** De app wordt vooral onderweg op een telefoon
   gebruikt (Android en iPhone, staand en liggend). Desktop moet werken, maar
   als een keuze goed is voor desktop en slechter voor de telefoon, kiest de
   telefoon. Denk aan grote raakvlakken (handschoenen), leesbaar in fel licht,
   en zuinig met data en accu.

## Bestanden

```
index.html          alleen de interface: de HTML
stijl.css           alle opmaak; kleuren en lettertypes staan bovenaan
01-basis.js         servers, opslag, wegtypen, de kaart, rekenhulp, Overpass
02-invoer.js        adressen zoeken, tussenstops, wegtype-knoppen
03-route.js         routeberekening, lange ritten, bos en water, bezienswaardigheden
04-bibliotheek.js   soort rit, bewaarde routes, GPX inlezen, steden mijden
05-weergave.js      de route tekenen en varianten vergelijken
06-plannen.js       plan() — de hoofdknop — en de route slepen
07-interface.js     onderweg-knoppen, bodemblad, uitklapbare blokken
08-onderweg.js      weer, afslagen, hoogteprofiel, delen, rittenlogboek
09-rijden.js        bochtigheidskaart, offroad zoeken, rijmodus met stem
10-uitvoer.js       afdrukken, GPX uitvoeren, bewaren, route in je zak
11-offline.js       een gebied binnenhalen zodat de kaart zonder bereik werkt
12-opstarten.js     de app opstarten — moet als laatste ingeladen worden
sw.js               service worker voor offline opstarten en kaarttegels
manifest.webmanifest    de app installeerbaar maken
icoon-180/192/512.png   de pictogrammen (180 voor iPhone, 512 maskable)
zelftest.js         controleert laadvolgorde en rekenwerk; hoort niet bij de app
CLAUDE.md           dit bestand
```

**De volgorde van de `<script>`-regels onderaan `index.html` is niet vrij.**
De nummers geven die volgorde. Verwissel ze niet en laat `12-opstarten.js`
onderaan staan; daar wordt alles voor het eerst gebruikt.

Het versienummer staat zichtbaar in de kop van `index.html` (zoek op
`versie 28`) én in `sw.js` als `roadbook-app-v28`. **Verhoog ze allebei bij
elke wijziging** — anders krijgt de eigenaar een oude versie uit zijn cache
te zien en denkt hij dat er niets veranderd is.

## Externe diensten (allemaal gratis, geen sleutel)

| Waarvoor | Dienst | Let op |
|---|---|---|
| Routes | Valhalla via FOSSGIS, `valhalla1.openstreetmap.de` | 1 aanroep per seconde. `motorcycle` costing. Weigert ritten boven ~2000 km, daarom `planLangeRit()` |
| Kaarttegels | OpenFreeMap (`liberty`-stijl) | geen limiet, geen registratie; vooruit binnenhalen mag hier wél |
| Luchtfoto's | Esri World Imagery | niet vooruit binnenhalen |
| Hoogtekaart | OpenTopoMap | tot zoomniveau 17; niet vooruit binnenhalen |
| Plaatsen zoeken | Overpass API, drie servers als reserve | vaak druk, altijd via `overpass()` |
| Adres zoeken | Photon (Komoot) voor meetypen, Nominatim voor de rest | Nominatim: hooguit 1 aanroep per seconde |
| Hoogteprofiel | Valhalla `/height` | |
| Weer | Open-Meteo | meerdere locaties in één aanroep |
| Foto's | Wikimedia Commons, geosearch | `origin=*` voor CORS |

## Hoe de app in elkaar zit

De code staat in genummerde `.js`-bestanden die met gewone `<script>`-tags
worden ingeladen — geen modules, geen `import`. Alles staat dus in één
gedeelde ruimte: een functie in het ene bestand kan die in het andere gewoon
aanroepen. Binnen elk bestand scheiden commentaarblokken de onderdelen
(`/* ================= naam ================= */`).

Nieuwe code hoort in het bestand waar hij thuis is. Een nieuw bestand erbij
betekent: een `<script>`-regel in `index.html` én de naam in de lijst
`BESTANDEN` bovenin `sw.js`, anders werkt offline opstarten niet meer.

**Kern van het plannen** — `plan()` doet dit op volgorde:

1. Vertrek, tussenstops en bestemming omzetten naar coördinaten (`resolve()`)
2. Eventuele snelwegaanloop (`handoverPoint()`) — apart stuk vooraan
3. Route berekenen naar gelang het soort rit (enkele reis / heen en terug / rondje)
4. **Route meteen tonen**, knop weer vrijgeven
5. Daarna op de achtergrond: bos en water inpassen, alternatieve routes,
   bezienswaardigheden, overnachtingen

Alles na stap 4 draait met een `run`-nummer (`runSeq`) zodat een nieuwe
berekening de oude stilzet.

**Belangrijke gegevens in `state`:**

- `state.variants` — de berekende routes, met sleutel `base`, `alt1`, `alt2` of
  `imp` (geïmporteerde GPX). Elke variant: `{shape, man, km, sec, prof, color,
  label, urban, oud}`
- `state.shown` — welke variant nu getekend is
- `state.shape` — snelwegaanloop + gekozen route, aan elkaar geplakt
- `state.points` — de bolletjes op de kaart; alleen punten met `_viaIndex`
  krijgen een nummer, dat nummer komt overeen met de lijst in het paneel
- `state.vias` — de tussenstops als tekst; volgorde = wat de gebruiker ziet

**Eigen rekenwerk, geen server nodig:**

- `curveProfile()` — bochtigheid uit de geometrie (graden per kilometer,
  0–100). Wordt overal gebruikt: kleur van de lijn, cijfer in de balk, de
  bochtigheidskaartlaag, en het beoordelen van geïmporteerde routes
- `urbanScore()` — hoeveel stad je doorrijdt; kiest automatisch de rustigste route
- `doubleShare()` — welk deel van de rit je twee keer rijdt
- `riddenShare()` — welk deel je volgens je logboek al kent
- `hasSpur()` — herkent doodlopende omwegen
- `simplify()` — Douglas-Peucker, om routes klein genoeg te maken voor opslag

**Opslag** loopt altijd via `store` (localStorage in een try/catch, faalt
stil). Sleutels: `rb.set` instellingen, `rb.last` laatste rit, `rb.routes`
bewaarde routes, `rb.lib` GPX-bibliotheek, `rb.log` rittenlogboek,
`rb.fold.*` open/dicht van de blokken, `rb.sheet` stand van het bodemblad,
`rb.rit` de route in je zak (lijn plus afslagen, om zonder bereik te rijden),
`rb.spoor` je eigen gps-spoor van de laatste rit, `rb.gebieden` welke
kaartgebieden je hebt binnengehaald (de kaartstukjes zelf zitten in de Cache
`roadbook-offline-v1`, niet in localStorage).

## Afspraken

- **Nederlands** in alles wat de gebruiker ziet, inclusief foutmeldingen.
  Meldingen zeggen wat er aan de hand is én wat je eraan kunt doen.
- **Commentaar in de code ook in het Nederlands**, en alleen waar het
  waarom uitlegt, niet het wat.
- Geen `localStorage` zonder `try/catch` (werkt niet in afgeschermde vensters).
- Geen framework, geen build. Gewone DOM-code.
- Kleuren en lettertypes komen uit de CSS-variabelen bovenin. Niet zomaar
  nieuwe kleuren verzinnen.
- Elementen worden opgehaald met `el('id')`.
- **Een naam uit een later bestand mag je niet meteen gebruiken.** De bestanden
  worden na elkaar ingeladen, dus bij `08` bestaat een functie uit `10` nog
  niet. Schrijf dus `addEventListener('change',()=>saveSettings())` en niet
  `addEventListener('change',saveSettings)` — dan wordt de naam pas opgezocht
  als je erop klikt. Gaat dit mis, dan breekt het bestand af en doet alles ná
  die regel niets meer, zonder zichtbare foutmelding. `zelftest.js` vindt dit.
- Nieuwe functies die geld kosten: niet doen, eerst overleggen.

## Wat er nu in zit

Wegtypes met symbolen · vermijden-menu · snelwegaanloop · rondrit en heen-en-terug
· tussenstops slepen en herordenen · alternatieve routes in kleur · steden
mijden · bochtigheid meten en kleuren · bezienswaardigheden met foto's ·
tankstations, eten, koffie, motorzaken · tankbereik · overnachtingen · weer
en aankomsttijd · hoogteprofiel · offroad zoeken · GPX importeren en
exporteren met begrensde vormpunten · routebibliotheek · rittenlogboek ·
delen via link · afdrukken · bodemblad op de telefoon · installeerbaar met
offline opstarten

**Rijmodus** (`09-rijden.js`) werkt als een navigatie: de kaart vult het scherm,
draait met je koers mee en staat gekanteld, met je eigen pijl erin. Instructie
boven, snelheid en aankomst onder. Zelf de kaart verschuiven zet het meevolgen
uit, met een knop pak je het weer op. Verder:

- **Van de route af** — pijl, afstand en gewone taal ("400 m, links achter je"),
  met een stippellijn naar het punt waar je weer instapt. `herintrede()` kiest
  liever een punt verderop dan terugrijden, zolang dat niet veel verder is
- **Broodkruimels** — je gps-spoor wordt bijgehouden, en met één knop wordt dat
  je route terug over de weg die je kwam. Volledig zonder bereik
- **Route in je zak** (`rb.rit`) — elke route die je op het scherm krijgt wordt
  meteen opgeslagen, lijn plus afslagen. Sluit de app af of start je telefoon
  opnieuw op: hij staat er nog en je kunt hem rijden zonder bereik. De afslagen
  worden bewaard op kilometer en niet op vormpunt-nummer, zodat ze blijven
  kloppen als de lijn uitgedund moet worden om te passen. Een rit van 900 km is
  ongeveer 470 KB

**Kaart offline** (`11-offline.js`) haalt de kaartstukjes van een gebied binnen
en zet ze in een eigen Cache, `roadbook-offline-v1`. Die kast wordt door `sw.js`
als eerste bevraagd en nooit opgeruimd — anders gooit de opruiming van de
gewone tegelkast (`MAX_TILES`) weg waar de gebruiker op heeft staan wachten.

- **Alleen van OpenFreeMap.** Daar mag dit uitdrukkelijk. OpenTopoMap en de
  luchtfoto's van Esri verbieden bulk-ophalen; die blijven dus alleen bekijken
- Het diepste niveau is zoom 14, dieper heeft OpenFreeMap niet. Geen probleem:
  MapLibre rekt z14 zelf uit naar 15–18, dus inzoomen blijft werken
- De stijl, de drie lettertypes en de symbolen gaan mee. Zonder die vier
  bestanden blijft de kaart leeg, ook al heb je alle stukjes
- Het adressenlijstje (`/planet`) gaat óók mee. Daar staat een datum in, dus
  zonder dat lijstje vraagt de kaart offline naar stukjes die je niet hebt
- **Niet schatten maar meten.** Een stukje is 2 KB boven de Ardennen en ruim
  500 KB boven Keulen; een vast gemiddelde is dus waardeloos. Er worden eerst
  een paar stukjes per zoomniveau opgehaald, en daarmee wordt de rest
  doorgerekend. Die stukjes zijn geen verloren werk, ze staan meteen in de kast
- Ordegrootte: een dagrit van 250 km met een strook van 5 km weerszijden is
  ongeveer 2200 stukjes en 46 MB. Een weekend van 600 km ongeveer 105 MB
- Weggooien laat stukjes staan die ook bij een ander bewaard gebied horen
- Er is een **Opnieuw**-knop per gebied, want iPhones ruimen soms zelf op

## Wat er nu op de rol staat

### 1. Nog te doen: met je vinger een vorm tekenen

Een rondje op de kaart tekenen en daar een echte motorroute van laten maken.
Dat kan gratis: de getekende lijn opdelen in een handvol punten, die als
tussenstops naar Valhalla sturen, en de bestaande bochtigheidsmeting eroverheen.
Zie het gesprek van 20 augustus 2026 voor de aanpak.

### 2. Later, als het ter sprake komt

- Eigen GraphHopper met bochtigheidsmodel, zodat de router bochten *zoekt*
  in plaats van ze achteraf te meten (kost een server — eerst overleggen)
- Foto's bij je eigen ritten vanaf de telefoon
- Wegafsluitingen en seizoensluitingen van bergpassen

## Testen

Er is geen testopstelling. Controleer wijzigingen zo:

1. **`zelftest.js`.** Doe dit altijd. Hij kijkt of de bestanden in de goede
   volgorde laden en rekent het eigen rekenwerk na. In PowerShell, in de
   projectmap:

   ```powershell
   $env:ELECTRON_RUN_AS_NODE = "1"
   & "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" zelftest.js
   ```

   Nieuw rekenwerk hoort er als controle bij te komen.

2. **Tikfouten.** Node staat niet op de computer van de eigenaar, maar in
   VS Code zit er een ingebouwde. Dit werkt in PowerShell:

   ```powershell
   $env:ELECTRON_RUN_AS_NODE = "1"
   $node = "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe"
   Get-ChildItem *.js | ForEach-Object {
     & $node -e "new Function(require('fs').readFileSync('$($_.Name)','utf8'))"
     if ($?) { "OK   $($_.Name)" } else { "FOUT $($_.Name)" }
   }
   ```

3. Controleer dat elke `el('id')` ook echt bestaat in `index.html`
4. Reken nieuwe berekeningen na voordat je ze in de app zet
5. Test met een lege opslag (privévenster) én met gevulde opslag
6. **Op de telefoon testen zonder te uploaden.** Start in de projectmap
   `python -m http.server 8000`, kijk met `ipconfig` wat je IP-adres is en
   ga op de telefoon naar `http://dat-adres:8000`. Telefoon en computer
   moeten op dezelfde wifi zitten.
