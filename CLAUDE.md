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
`versie 34`), achter **elke** bestandsnaam in `index.html` als `?v=34`, en in
`sw.js` als `roadbook-app-v34` én `const V = '34'`. **Verhoog ze allebei bij
elke wijziging** — anders krijgt de eigenaar een oude versie uit zijn cache
te zien en denkt hij dat er niets veranderd is.

## Versies bewaren

Afspraak sinds 20 augustus 2026: **de projectmap zelf is altijd de nieuwste
versie**, en van de vorige versie blijft een volledige kopie staan in
`versies/versie-<nummer>/`.

```
Roadbook/                    <- hier staat de nieuwste versie, dit is wat je uploadt
  versies/
    versie-28/               <- de vorige, compleet en werkend
    versie-27/
```

Dus: **vóór** je aan een nieuwe versie begint, kopieer je alles naar
`versies/versie-<huidig nummer>/`. De app moet in de hoofdmap blijven staan,
anders werkt GitHub Pages niet meer — daar hoort `index.html` bovenaan.

De map `versies/` hoeft **niet** naar GitHub. Hij is er om terug te kunnen als
een nieuwe versie iets sloopt, en om te kunnen vergelijken. `zelftest.js` hoeft
er ook niet in.

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
`rb.spoor` je eigen gps-spoor van de laatste rit, `rb.stap` welke stap open stond, `rb.thema`
licht/donker/automatisch, `rb.gebieden` welke
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
- **Elk eigen bestand wordt opgevraagd met `?v=<versie>` erachter.** GitHub laat
  de browser bestanden tien minuten bewaren. Zonder dat nummer krijg je bij een
  nieuwe `index.html` een oude `stijl.css` of een oud `.js`-bestand terug: een
  halve nieuwe en een halve oude app. Dat is de naarste fout die er is, want
  alles staat er en er lijkt niets mis — het werkt alleen niet samen. De lijst in
  `sw.js` moet exact dezelfde adressen gebruiken, anders werkt offline niet meer.
  `zelftest.js` controleert dat alle vier de plekken hetzelfde nummer hebben.
- **Zoek knoppen nooit op met een klasse die meer rijen deelt.** De kaartlagen
  (Kleur/Topo/Satelliet) en de overlays (Bochtige wegen/Al gereden) hebben
  allebei `class="layers"`. Een luisteraar op `.layers button` raakte dus ook de
  overlays: die riepen `setBase(undefined)` aan, alle vlakken van de basiskaart
  gingen uit en de kaart werd zwart — en met dezelfde knop kwam hij niet terug.
  De kaartlagen zitten nu in `#bases` en dat is waar de code naar kijkt.
  `setBase()` valt bovendien terug op de kleurenkaart bij een onbekende waarde.
- **Op de telefoon is de onderste 86 pixels niet aan te raken**: daar ligt het
  bodemblad over de kaart. Knoppen op de kaart staan in portret dus op
  `bottom:104px` of hoger. Dit ging eerder mis: het ▤-menu zat achter het blad,
  waardoor de rijmodus in portret helemaal niet te bereiken was.
- **Het paneel is vier stappen**, geen lange sliert (sinds versie 33):

  | Stap | Wat erin staat |
  |---|---|
  | 1 Waar | soort rit, vertrek, tussenstops, bestemming, GPX, tekenen |
  | 2 Wegen | wegtype, vermijden, onverhard, snelwegaanloop |
  | 3 De rit | vertrektijd, tank, wat je onderweg wil zien — **en het resultaat** |
  | 4 ⚙ | bibliotheek, offline kaart, logboek, offroad, uiterlijk, bewaarde ritten |

  Je kunt rechtstreeks op een stap tikken; je hoeft niet door de reeks te lopen.
  Dat is de zwakke plek van stap-voor-stap en die is hiermee gedekt: voor een rit
  die je vaker rijdt staat alles al goed en ga je meteen naar 3. Nieuwe dingen
  horen in de stap waar ze thuis zijn, niet in een nieuw blok onderaan.
- Blokken binnen stap 3 en 4 mogen inklappen (`data-fold`, `data-shut`).
  Verandert de standaardstand, verhoog dan `rb.fold.v` in `07-interface.js` —
  anders zien mensen die de app al gebruikten de nieuwe indeling nooit, want hun
  eigen stand staat opgeslagen.
- **Plannen, Starten en Wissen blijven altijd staan** (`.block.actions` met
  `position:sticky`). Op de telefoon staan Plannen en Rijden ook op de greep van
  het bodemblad, want dat is het enige wat je ziet als het blad dicht is.
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
- **Opnieuw berekenen** — meer dan 300 m van de route af en dat acht seconden
  volhouden (en je staat niet stil), dan berekent hij een nieuw stukje van waar
  je bent naar het punt waar je de route weer oppakt, en plakt de rest van je
  rit eraan vast met `plakRoute()`. Eén korte aanvraag in plaats van je hele rit
  opnieuw, en je geplande route blijft staan. Nooit vaker dan één keer per 20
  seconden. Zonder bereik blijft het bij de terugwijzer — routeberekening heeft
  de server nodig en dat is niet gratis op te lossen
- **Broodkruimels** — je gps-spoor wordt bijgehouden, en met één knop wordt dat
  je route terug over de weg die je kwam. Volledig zonder bereik
- **Route in je zak** (`rb.rit`) — elke route die je op het scherm krijgt wordt
  meteen opgeslagen, lijn plus afslagen. Sluit de app af of start je telefoon
  opnieuw op: hij staat er nog en je kunt hem rijden zonder bereik. De afslagen
  worden bewaard op kilometer en niet op vormpunt-nummer, zodat ze blijven
  kloppen als de lijn uitgedund moet worden om te passen. Een rit van 900 km is
  ongeveer 470 KB

**Route tekenen** (`06-plannen.js`) — je trekt met je vinger een vorm over de
kaart en de app maakt er een echte motorroute van. Hoe het werkt:

- de knop staat als **pen** altijd op de kaart, rechtsonder — niet weggestopt
  in het ▤-menu. Als je iets kunt tekenen moet je dat kunnen zien
- tijdens het tekenen staat de uitleg in een balk **over de kaart**, niet in de
  statusregel: op de telefoon staat het paneel dicht en zie je die niet
- er wordt geluisterd naar de aanwijsgebeurtenissen van de browser zelf
  (`pointerdown/move/up` op `getCanvasContainer()`), niet naar die van MapLibre.
  Eén weg voor muis, vinger en pen, en met `setPointerCapture` blijft je vinger
  gevolgd worden ook als hij van de kaart af glijdt
- alle kaartbewegingen gaan uit tijdens het tekenen (slepen, zoomen, draaien,
  kantelen) plus `touch-action:none`, anders vecht de kaart met je vinger
- de veeg wordt bijgehouden per **6 beeldpunten**, niet per aantal meters. Zo
  tekent het even fijn of je ver uitgezoomd zit of dicht op de kaart
- eindig je binnen 12% van de totale lengte bij je beginpunt, dan wordt het een
  rondje en sluit de vorm zichzelf
- `tekenPunten()` legt er punten op gelijke afstand op: één per ~12 km, nooit
  meer dan 17. Dat is de hele truc — te veel punten en hij volgt je bevende
  vinger, te weinig en hij snijdt je vorm af tot een rechte lijn
- die punten gaan als vertrek, tussenstops en bestemming naar `plan()`. Vanaf
  daar is het precies dezelfde berekening als de knop Route plannen, dus je
  wegtype, je vermijden-instellingen en de alternatieven werken gewoon mee
- de punten zijn coördinaten als tekst, geen namen. `resolve()` herkent die
  zonder de plaatsenzoeker, dus het werkt ook nog na een herstart
- je tekening blijft als paarse stippellijn staan, zodat je kunt zien hoe goed
  de route je vorm volgt

**Zelf de wegen aanwijzen** (`06-plannen.js`, punten-modus). Zoom in en tik met
de knop **📍 Punten** de weggetjes aan die je wil rijden.

- elke tik is een tussenstop; slepen en zoomen blijft werken doordat alleen een
  echte tik telt (minder dan 8 beeldpunten bewogen, binnen 600 ms weer los)
- **Hele weg**: tik op een weg en de app vraagt hem op bij Overpass, kiest de
  weg waarvan de lijn het dichtst bij je vinger ligt, en legt er punten op van
  ~1,5 km. Eén tik = één weg vastgelegd. De richting wordt bepaald door welk
  uiteinde het dichtst bij je vorige punt ligt
- **Punten die je zelf aanwijst zijn `through` en geen `break`** in Valhalla:
  doorrijden, niet keren, geen afslag-instructie. Dat is het verschil tussen een
  route die jouw weg volgt en een route die bij elk punt een stop maakt. De app
  ziet het verschil aan de naam: `"50.70111, 6.25306"` is een aangewezen punt,
  `"Adenau"` is een stop. Dit geldt dus ook voor slepen en tekenen
- de routeserver neemt ongeveer 45 punten; daarboven zegt de app het in plaats
  van stil te falen
- hoe dichter de punten bij elkaar, hoe strakker hij jouw weg volgt: één per
  20 km is een suggestie, één per 2 km is een opdracht

**Bochten zoeken** (`03-route.js` + stap 3b in `plan()`). Dit is het verschil
tussen bochten *meten* en bochten *zoeken*. De gratis routeserver kent geen
bochten — hij weet alleen groot of klein. Dus:

1. `saaieStukken()` zoekt in de route de aaneengesloten vlakke stukken van
   minstens 8 km. Korter is een recht stuk tussen twee bochten en geen probleem
2. per saai stuk één Overpass-vraag in een vak van ~20 bij 20 km eromheen
3. elke weg wordt doorgemeten met `wegBochtigheid()` (staat in `01-basis.js`,
   samen met het andere rekenwerk). Minstens 1,5 km lang en bochtigheid 45+,
   anders is het een slinger in een dorp
4. **bergpassen krijgen voorrang** — `mountain_pass=yes` in OpenStreetMap. Een
   pas is per definitie de weg waar een motorrijder voor komt
5. de beste wordt als tussenstop ingezet, de route opnieuw berekend, en alleen
   gehouden als de bochtigheid écht stijgt (meer dan 2 punten, want minder is
   ruis), er niet meer dan 22% omgereden wordt, en de route nergens omkeert

Geen verzonnen lijstjes met "mooie wegen": alles wordt uit de kaart gemeten.
Werkt alleen bij **enkele reis** — bij een rondje en heen-en-terug zijn de
keerpunten al ingepast en zou een extra punt die opzet omgooien.

**Licht of donker volgens de zon** (`07-interface.js`). `zonTijden(lat,lon,datum)`
rekent zonsopkomst en -ondergang uit met de standaardformule — geen server, dus
het werkt ook zonder bereik en het klopt in december net zo goed als in juni.
Nagerekend in `zelftest.js` tegen dingen die vaststaan: de langste dag in
Amsterdam is 16u46, de kortste 7u44, op de evenaar is het altijd 12 uur, en
boven de poolcirkel geeft de functie in de winter `null`.

- twee kleurensets als CSS-variabelen: donker op `:root`, licht op
  `html[data-thema="licht"]`. **Verzin geen kleuren buiten die twee sets** —
  een vaste kleur in een regel breekt het andere thema
- de kaart van OpenFreeMap is een dagkaart en 's avonds te fel. Daarom ligt er
  in het donker een sluier over (`#mapDim`, met `--kaartdim`). Een tweede
  kaartstijl inladen zou alle eigen lagen wegvagen, dus dat doen we niet
- de gebruiker kan het vastzetten op licht of donker: knop in de kop, of de
  drie knoppen bij Uiterlijk in stap 4

**Route starten waar je plant.** Zodra er een route ligt komt er een knop
**▶ Route starten** onder Route plannen tevoorschijn, en op de telefoon
**▶ Rijden** op de greep van het bodemblad. De rijmodus zat alleen in het
▤-menu op de kaart en dat is drie handelingen te veel als je op het punt staat
weg te rijden. Alle drie de knoppen roepen `startDrive()` aan.

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

## Automatisch zoomen, versie 45

| Wanneer | Zoom | Waarom |
|---|---|---|
| boven 100 km/u | 15,5 | hard rijden vraagt overzicht: verder vooruit kijken |
| gewoon | 16,5 | de stand waarin je rijdt |
| binnen 300 m van een afslag | 17,5 | welke van die twee straten is het? |

**Met marge op de grenzen**, en dat is het enige wat ik heb toegevoegd aan de
opdracht: hij zoomt uit boven 103 km/u en pas weer in onder 97. Bij de afslag
zoomt hij in op 300 m en pas weer uit na 380 m. Zonder die marge staat de zoom
heen en weer te springen als je net rond de grens rijdt, en dat is erger dan
niet automatisch zoomen.

Een afslag gaat vóór snelheid: rijd je 130 en er komt een afslag, dan zoomt hij
in. De zoom wordt alleen meegestuurd als hij écht verandert (`drive.zoomDoel`),
anders zit de camera elke melding aan hetzelfde getal te trekken.

Hiervoor is het opzoeken van de volgende afslag in `driveTick()` naar vóór de
camera verhuisd — de camera moet weten hoe ver de afslag is voordat hij zijn
zoom kiest.

## Vloeiend rijden, versie 44

De rijmodus voelde schokkig. Negen oorzaken gevonden en aangepakt, in volgorde
van hoe zwaar ze wogen:

1. **`essential:true` ontbrak.** Staat op je telefoon "Verminder beweging" aan,
   dan zet MapLibre `duration` op nul en springt de kaart bij élke gps-melding.
   Dit is één woord en kan de hele klacht verklaren
2. **De animatie duurde precies zo lang als het meldinterval** (1000 ms tegen
   ~1 s). Komt de melding iets te vroeg, dan wordt de beweging afgebroken; iets
   te laat en de kaart staat even stil. `meldTempo()` **meet** nu hoe vaak je
   telefoon zich meldt en neemt daar 90% van, tussen 350 en 1400 ms
3. **De pijl werd elke seconde uit de kaart gesloopt.** `Marker.addTo()` doet
   intern eerst `remove()`, dus elke melding opnieuw aanroepen haalde het
   element uit het scherm en plakte het terug — midden in een beweging. Nu één
   keer, daarna alleen `setLngLat` en `setRotation`
4. **De koers wiebelde.** `koersDemp()` negeert verschillen onder 2° en volgt een
   echte bocht met 70% en ruis met 35%. Een bocht van 90° is na vijf meldingen
   binnen 3° gevolgd — snel genoeg om niet achter te lopen, rustig genoeg om niet
   te tollen
5. **De "terug naar de route"-laag werd elke seconde leeggemaakt**, ook als hij
   al leeg was. Nu alleen als er iets stond (`drive.terugAan`)
6. **Je gps-spoor werd elke 1-3 seconden helemaal opnieuw getekend** — na een uur
   70 KB per keer. Nu eens per 15 seconden
7. **Het grijze "al gehad"-stuk** werd als hele afgelegde route opnieuw
   opgebouwd, halverwege een dagrit ruim 100 KB. Nu alleen de laatste
   `GEDAAN_KM` (3 km) achter je: verder terug zie je toch niet, en het blijft
   altijd even klein
8. **Naar de opslag schrijven** blokkeert alles zolang het duurt. Het spoor gaat
   nu alleen naar de opslag als je bijna stilstaat (onder 8 km/u), hooguit één
   keer per minuut, en altijd bij het stoppen
9. **De padding werd elke melding uit de schermhoogte gerekend.** Op een iPhone
   verandert die hoogte als de adresbalk in- of uitschuift, dus dat gaf
   minisprongetjes. Nu één keer bij het starten en opnieuw bij draaien

Plus: de schaduw onder de pijl is weg. Die werd bij elk beeldje opnieuw berekend
terwijl de pijl beweegt; de donkere rand in de vorm doet hetzelfde werk gratis.

**Het tabblad waar je bent heeft nu een vakje om de tekst** in plaats van een
streepje eronder.

## De tabbalk bereikbaar, versie 43

Op een iPhone schoof het bodemblad in de volledig-open stand tot **onder het
camera-eilandje**: de tabbalk lag achter de statusbalk en was niet meer aan te
tikken. Twee dingen daaraan gedaan:

1. **Het blad blijft onder de veilige zone.** De hoogte staat nu in `--blad`
   (`94dvh - env(safe-area-inset-top)`) en dat getal wordt ook gebruikt in de
   schuifstanden, zodat ze niet uit elkaar kunnen lopen.
2. **Vegen om van tabblad te wisselen.** Naar links is verder, naar rechts is
   terug. Hij kijkt pas als je je vinger optilt en eist minstens 60 beeldpunten
   duidelijk zijwaarts — anders was je aan het scrollen. Een veeg die aan de
   linkerrand begint blijft van de telefoon zelf; dat is diens terug-veeg.

Het versienummer in de tabbalk is `v43` in plaats van `versie 43`, want die
lange vorm werd op een smal scherm afgekapt. `zelftest.js` leest het nummer nu
uit het element zelf in plaats van uit een los stukje tekst.

## De adresvelden, versie 42

- **◎ in het vertrekveld** pakt je huidige locatie. Stond eerst als tekstregel
  onder de velden; nu een knopje in het veld zelf, waar je het zoekt
- **✕ aan het eind van een veld** maakt het leeg. Uitgummen met de terugtoets is
  met handschoenen aan geen werk voor een mens. Het kruisje komt alleen als er
  iets staat
- **De suggestielijst was stuk** en dat was mijn fout in versie 40. `attachAC()`
  hangt de lijst met `position:absolute` op aan het vak om het invoerveld. Het
  oude vak (`.field`) had `position:relative`, het nieuwe (`.plek`) niet — dus
  kwam de lijst ergens buiten beeld en leek het alsof de app geen adressen meer
  vond. Bovendien was `.plek` een `<label>`, en een aanklikbare lijst in een
  label is vragen om moeilijkheden; het is nu een `<div>`.

`zelftest.js` controleert dit nu: hij zoekt het vak om het adresveld op en kijkt
of het `position:relative` heeft. Nagerekend door de fout er tijdelijk weer in te
zetten — dan slaat hij aan.

## De camera in de rijmodus, versie 41

Gebouwd naar een opdracht van de eigenaar, met zijn cijfers.

- **Bij Start**: `easeTo` naar je positie, zoom 16,5, kanteling 55°, kaart
  gedraaid op je rijrichting. Alleen die eerste keer zet hij zoom en kanteling;
  daarna blijft het bij meeglijden
- **Elke gps-melding**: `easeTo` met `duration:1000` en lineaire beweging, zodat
  het glijdt in plaats van springt
- **Je staat op 70% naar beneden, via map padding** en niet via een verschoven
  middelpunt. De kaart centreert in wat er overblijft ná de padding, dus het
  middelpunt schuift de helft van de padding naar beneden: voor 70% moet er
  bovenaan 40% van de hoogte bij. `naviPadding(hoogte)` staat apart zodat het
  na te rekenen is, en wordt opnieuw gezet als je je telefoon draait
- **Richting**: eerst `coords.heading`, anders de hoek tussen je vorige en je
  huidige plek. **Onder 5 km/u draait de kaart niet mee** — dan sta je te
  wachten en zou hij van elke gps-hik in de rondte tollen
- **Jij bent een chevron** (lichtblauw met donkere rand), meedraaiend en
  meegekanteld met de kaart
- **Twee ronde knoppen rechtsboven**: opnieuw aanhaken als je zelf de kaart hebt
  verschoven, en wisselen tussen meedraaien en noorden boven

**Nog te doen:** de automatische zoom (15,5 boven 100 km/u, 16,5 normaal, 17,5
binnen 300 m van een afslag).

Het versienummer staat in de **tabbalk** en dus altijd in beeld. Het stond in
versie 40 alleen onderaan bij ⚙ en was daar niet te vinden.

## Uiterlijk sinds versie 40

Gebouwd naar een schets van de eigenaar. Drie tabbladen met een woord en een
streep eronder — **Plannen · Onderweg · Ritten** — en een tandwiel voor alles wat
je één keer instelt. Geen genummerde stappen meer: de naam zegt waar je bent.

- **De zoekbalk over de kaart** is de ingang. Hij laat zien waar je heen gaat, en
  tikken brengt je naar Plannen met de cursor in het juiste vak
- **Vertrek en bestemming zijn regels met een vlaggetje**, geen invulvakken. Het
  invoerveld zit er wel in, maar zonder kader: het leest als tekst en je kunt er
  toch in typen
- **De wegtypes zijn vijf vierkantjes met een symbool**, plus een zesde knop die
  je naar de rest van de wegkeuzes brengt
- **Eén grote knop.** Oranje is plannen, en zodra er een route ligt komt daar een
  groene **Route starten** boven. Groen betekent gaan, en niets anders
- **Vier cijfers onder de knop**: afstand, rijtijd, aankomst, bochtigheid

**De rijmodus is een cockpit van gevulde blokken**, geen doorzichtige kaartjes —
dat was in de zon niet te lezen:

| Blok | Wat erin staat |
|---|---|
| groen | de afslag als vorm, de afstand groot, en wat je moet doen |
| zwart | de straatnaam, plus "daarna links" |
| kaart | draait met je mee |
| paneel | snelheid, nog te gaan, aankomst — en drie brede knoppen |

- **acht vormen voor acht afslagen** (`PIJLEN`), zoals op een Garmin: een steel
  die afbuigt. Geen gedraaide pijl meer — die leest verkeerd zodra hij verder dan
  een kwartslag om staat. `pijlSoort()` en `richtingWoord()` gebruiken dezelfde
  grenzen, zodat vorm en woord elkaar nooit tegenspreken
- `straatUit()` haalt de straatnaam uit de instructie: de server zegt "Sla
  linksaf naar de Höfener Straße", jij wil alleen die straat zien
- brede knoppen in plaats van ronde iconen: een breed vlak raak je met
  handschoenen altijd

## Drie fouten in de opmaak, gevonden in versie 39

Deze drie zaten er samen in en verklaarden alles wat er op de telefoon mis leek:

1. **Zeven kleuren verwezen naar zichzelf**: `--glas:var(--glas)`,
   `--glas-diep`, `--opknop`, `--schaduw`, `--zacht`, `--link`, `--fout`. Voor
   een browser is dat geen kleur, dus die declaratie valt stil weg. Gevolg: elk
   kaartje en elke knop op de kaart was in het donkere thema **doorzichtig**, en
   de tekst op oranje knoppen erfde de verkeerde kleur. Ontstaan in versie 33
   toen de vaste kleuren naar variabelen gingen: de zoek-en-vervang ving zijn
   eigen definitieregel ook.
2. **`body.rijden  body.rijden .penbtn`** — een selector die per ongeluk twee
   keer hetzelfde stukje bevatte en dus niets raakt. Daardoor bleven in de
   rijmodus de plus- en minknop van de kaart over de afslag heen staan.
3. Twee keer dezelfde `.addmode`-regel, waarvan de verkeerde overbleef.

`zelftest.js` controleert deze drie nu automatisch: een kleur die naar zichzelf
verwijst, een `var(--x)` die nergens gemaakt wordt, en een selector die zichzelf
herhaalt. Dit soort fout is met code lezen niet te vinden — de regel is goed
geschreven, hij doet alleen niets.

**Verder in versie 39:** alle kaartknoppen zitten in één kolom rechtsonder
(`.mapleft`), met de pen onderaan waar je duim zit; verborgen knoppen nemen geen
ruimte in. Meldingen die op de telefoon in de onzichtbare statusregel
verdwenen gaan nu via `kaartMelding()` over de kaart — daarom leek de knop
"bochtige wegen" stuk als je te ver uitgezoomd stond. En zodra er een route ligt
wordt **Rijden** de grootste knop op het scherm in plaats van Plannen.

## Uiterlijk sinds versie 38

Afgekeken bij Calimoto, Rever, Kurviger, Garmin Zumo en TomTom Rider. Overal
hetzelfde patroon, en dat is nu ook het onze.

**De kaart is de app — op de telefoon.** De stappenbalk staat onderaan als
tabbalk waar je duim zit (`.steps{order:9}`), met daarboven een kaartje dat het
resultaat toont: drie grote cijfers met een woordje eronder, en de startknop.
Dichtgeschoven zie je die 150 pixels (`--dicht`) en verder alleen kaart. Op de
laptop blijft het paneel aan de zijkant — daar is ruimte over en dan is een
paneel juist beter. Zelfde HTML, alleen andere `order` en positie.

Voor een bekende rit plannen en wegrijden: **drie tikken, nul keer slepen.**
Eerst waren dat vijf tikken en twee keer slepen, waarbij je je kaart kwijt was.

**Ronde icoonknoppen op de kaart**, 54 pixels, rechts onder elkaar: ✎ zelf
bepalen, ▤ andere kaart, ∿ bochtige wegen, en ↶ en ✕ als er iets te wissen is.
De kaartknop zegt in de statusregel welke laag je nu hebt, want een icoon kan
dat niet.

**De rijmodus is een cockpit** (Garmin en TomTom):

- de afslag is een **pijlvorm** die meedraait met de bocht, niet een woord. Een
  vorm herken je door een vizier sneller dan tekst
- de hoek komt uit `bochtHoek()`: de koers 60 m vóór en 60 m ná de afslag, en
  het verschil. **Zelf gerekend uit de lijn**, niet uit de nummers die de
  routeserver meestuurt — dat werkt ook bij een route uit je opslag en is na te
  rekenen. Boven 150 graden wordt het een aparte omkeer-vorm; een omgedraaide
  pijl leest niemand
- drie vakjes onderaan, altijd even groot en altijd op dezelfde plek: aankomst,
  km te gaan, snelheid. Je kijkt niet, je pikt eruit — dan mag niets verspringen
- de knoppen staan rechts onder elkaar als ronde iconen

**Vijf standen wegtype** (Kurviger): Kronkel · Bochtig · Vlot · Recht · **Snel**.
Die vijfde is het oude vinkje "Snelwegen vermijden" geworden. Een stand plus een
vinkje die elkaar tegenspreken is één ding te veel; nu bepaalt de stand alles
(`LEVELS[lv].hw`).

## Grote opruiming in versie 37

De app was gegroeid tot 69 knoppen, 15 vinkjes en **elf manieren om een route te
maken**. Dat is niet rijk, dat is verdwaald. Weggehaald omdat het dubbel was of
niet gebruikt werd:

| Weg | Waarom |
|---|---|
| + Tussenstop plaatsen | ging samen met tekenen in één handmodus |
| Bos en water erbij zoeken | bochten opzoeken doet hetzelfde, maar gemeten |
| vinkje Onverharde wegen | de schuif op 0 zegt hetzelfde |
| Bekende routes in de buurt | overlapte met bochten opzoeken |
| het ▤-menu met de kaartlagen | één knop die doorklikt: Kleur → Topo → Satelliet |
| Tanken/Eten/Koffie/Motorzaak | één knop, één Overpass-vraag in plaats van vier |
| drie thema-knoppen | de ☀ in de kop klikt al door |
| ← Terug, ⤢ Hele route, ⇄ Omkeren, 🧭 Meedraaien, Bewaren | schroefjes waar niemand aan draait |
| Zelf de volgorde bepalen | regelt zichzelf: aangewezen punten houden hun orde, plaatsnamen worden gesorteerd |
| GPX-vormpunten, afstandswaarschuwing | vast ingesteld |
| Rittenlogboek + "Wegen die ik al reed" + laag "Al gereden" | één feature in drie delen, werd niet gebruikt |
| Afdrukken | werd niet gebruikt |
| Foto's bij bezienswaardigheden | de grootste dataslurper; de plekken zelf blijven |
| **Andere routes** | werden alleen bij enkele reis gezocht, dus bij een rondje kreeg je ze nooit. Scheelt twee routeaanvragen per rit |

Resultaat: **44 knoppen, 9 vinkjes, 18 blokken, 122 id's** — en drie
routeaanvragen per rit in plaats van vijf.

**Eén handmodus** (`✎ Zelf bepalen`): tikken zet een punt, vegen maakt een vorm,
en met "Hele weg" aan legt één tik een compleet weggetje vast. Dat was eerst
Tekenen én Punten, twee knoppen voor hetzelfde doel.

**Nog te doen uit deze opruiming:** de drie lijsten (Bewaarde routes,
Routebibliotheek, Route in je zak) samenvoegen tot één **Mijn ritten**, één
schakelaar **Zuinig met data**, en de deel-link die de *uitkomst* meestuurt met
een QR-code voor je telefoon.

## Wat er nu op de rol staat

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

   Hij kijkt vier dingen na: de laadvolgorde, of alle **namen bestaan**, het
   eigen rekenwerk, en of de **interface klopt met de code** (elke `el('id')`
   bestaat, de kaartlaag-knoppen staan apart, en de twee versienummers zijn
   gelijk). Die tweede gebruikt de compiler die in VS Code meegeleverd
   wordt. Zo vonden we dat `vast` en `pogingen` in de rondje-logica nergens
   gemaakt werden — een rondje plannen klapte er dus altijd uit, met
   "vast is not defined". Zulke fouten zie je niet met een tikfoutcontrole,
   want de code is goed geschreven; de naam bestaat alleen niet.

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
