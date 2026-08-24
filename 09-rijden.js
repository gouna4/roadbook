/* Roadbook — 09-rijden.js
   De bochtigheidskaart, offroad zoeken en de rijmodus met stem. */

/* ================= bochtigheidslaag =================
   Alle wegen in beeld ophalen en zelf uitrekenen hoe bochtig ze zijn.
   Zo zie je waar de leuke wegen liggen, los van je route. */
let curveOn=false, curveBusy=false;

async function loadCurveLayer(){
  const b=map.getBounds();
  const breed=haversine([b.getWest(),b.getSouth()],[b.getEast(),b.getSouth()]);
  const hoog=haversine([b.getWest(),b.getSouth()],[b.getWest(),b.getNorth()]);
  /* Een telefoon trekt geen duizenden wegen in één keer. 2500 km2 is ruim een
     gebied van 50 bij 50 km, en dat is genoeg om te zien waar de leuke wegen
     liggen. */
  if(breed*hoog>2500){
    /* Op de telefoon staat het paneel dicht, dus setStatus() is onzichtbaar.
       Zeg het over de kaart, anders lijkt de knop stuk. */
    kaartMelding(`Zoom eerst wat in — dit gebied is ${Math.round(breed)}×${Math.round(hoog)} km,`
      +` dat is te veel om door te meten.`,true);
    return false;
  }
  curveBusy=true; el('curveToggle').classList.add('busy');
  kaartMelding('Wegen ophalen en doormeten…');
  try{
    const bbox=`${b.getSouth().toFixed(4)},${b.getWest().toFixed(4)},${b.getNorth().toFixed(4)},${b.getEast().toFixed(4)}`;
    const q=`[out:json][timeout:35][bbox:${bbox}];
      way["highway"~"^(secondary|tertiary|unclassified|primary)$"]["access"!~"^(no|private)$"];
      out geom 700;`;
    const j=await overpass(q);
    const alles=j.elements||[];
    const feats=[];
    let leuk=0;
    /* In hapjes doormeten en tussendoor het scherm laten bijkomen. Alles in één
       keer doen liet de telefoon seconden lang stilstaan, en dan lijkt de app
       vastgelopen. */
    for(let i=0;i<alles.length;i+=120){
      for(const e of alles.slice(i,i+120)){
        const g=e.geometry; if(!g||g.length<4) continue;
        const co=g.map(p=>[p.lon,p.lat]);
        const {km,score}=wegBochtigheid(co);
        if(km<0.4||score<22) continue;
        if(score>=55) leuk++;
        feats.push({type:'Feature',properties:{c:score/100,naam:e.tags?.name||e.tags?.ref||'',s:score,km:+km.toFixed(1)},
          geometry:{type:'LineString',coordinates:co}});
      }
      if(i+120<alles.length){
        kaartMelding(`Wegen doormeten… ${Math.round((i+120)/alles.length*100)}%`);
        await sleep(0);
      }
    }
    map.getSource('curve').setData({type:'FeatureCollection',features:feats});
    kaartMelding(feats.length
      ? `${feats.length} bochtige wegen in beeld, waarvan ${leuk} echt de moeite waard.`
      : 'Geen bochtige wegen gevonden in dit gebied — vlak land.');
    return true;
  }catch(err){ kaartMelding('De plaatsenserver is druk, probeer het zo nog eens.',true); return false; }
  finally{ curveBusy=false; el('curveToggle').classList.remove('busy'); }
}

el('curveToggle').addEventListener('click',async()=>{
  if(curveBusy) return;
  if(curveOn){
    curveOn=false;
    map.setLayoutProperty('curve-line','visibility','none');
    el('curveToggle').classList.remove('on');
    return;
  }
  if(await loadCurveLayer()){
    curveOn=true;
    map.setLayoutProperty('curve-line','visibility','visible');
    el('curveToggle').classList.add('on');
  }
});
map.on('moveend',()=>{ if(curveOn&&!curveBusy) loadCurveLayer(); });

/* ================= offroad zoeken =================
   Onverharde wegen waar motorverkeer niet verboden is. OSM kent de
   ondergrond en het tracktype; verboden paden filteren we eruit. */
const TRACKGRADE={ grade1:'verhard karrenspoor', grade2:'grind, goed berijdbaar',
  grade3:'half verhard', grade4:'zand of aarde', grade5:'nauwelijks pad' };
let offRoads=[], offVisible=false;

function wegLengte(geom){
  let km=0;
  for(let i=1;i<geom.length;i++) km+=haversine([geom[i-1].lon,geom[i-1].lat],[geom[i].lon,geom[i].lat]);
  return km;
}

async function findOffroad(){
  const waar=el('offWhere').value;
  const straal=Math.max(2,Math.min(60,+el('offRadius').value||15))*1000;
  let filter;
  if(waar==='route'){
    if(!state.tourShape?.length) throw new Error('Plan eerst een route.');
    filter=`(around:${Math.min(straal,8000)},${coarse(state.tourShape,Math.max(1,Math.ceil(state.tourShape.length/40)))
      .map(c=>`${c[1].toFixed(5)},${c[0].toFixed(5)}`).join(',')})`;
  }else{
    const p = waar==='start' ? state.startPt : state.destPt;
    if(!p) throw new Error('Plan eerst een route, dan weet ik waar ik moet zoeken.');
    filter=`(around:${straal},${p.lat},${p.lon})`;
  }
  const q=`[out:json][timeout:30];(
    way${filter}["highway"="track"];
    way${filter}["highway"~"^(unclassified|residential|service)$"]["surface"~"^(unpaved|gravel|dirt|ground|earth|sand|compacted|fine_gravel|grass|pebblestone)$"];
  );out geom 500;`;
  const j=await overpass(q);
  const uit=[];
  for(const e of (j.elements||[])){
    const t=e.tags||{}, g=e.geometry;
    if(!g||g.length<2) continue;
    /* verboden of privé eruit */
    const blok=[t.motor_vehicle,t.motorcycle,t.vehicle,t.access]
      .some(v=>v&&/^(no|private|agricultural|forestry|customers|delivery|permit)$/.test(v));
    if(blok) continue;
    const km=wegLengte(g);
    if(km<0.3) continue;
    uit.push({ id:e.id, name:t.name||t.ref||'Naamloze weg', km,
      grade:TRACKGRADE[t.tracktype]||(t.surface?t.surface.replace(/_/g,' '):'onbekende ondergrond'),
      vrij: t.motor_vehicle==='yes'||t.vehicle==='yes'||t.access==='yes',
      geom:g.map(p=>[p.lon,p.lat]),
      mid:[g[Math.floor(g.length/2)].lon, g[Math.floor(g.length/2)].lat] });
  }
  /* stukken met dezelfde naam bij elkaar optellen */
  const per=new Map();
  for(const w of uit){
    const k=w.name+'|'+w.grade;
    if(per.has(k)){ const a=per.get(k); a.km+=w.km; a.delen++; }
    else per.set(k,{...w,delen:1});
  }
  return [...per.values()].sort((a,b)=>b.km-a.km).slice(0,20);
}

function drawOffroad(){
  const src=map.getSource('off');
  if(!src) return;
  src.setData({ type:'FeatureCollection', features: offVisible
    ? offRoads.map(w=>({type:'Feature',properties:{id:w.id,name:w.name},
        geometry:{type:'LineString',coordinates:w.geom}})) : [] });
}

function renderOffroad(){
  const box=el('offList'); box.innerHTML='';
  if(!offRoads.length){
    box.innerHTML='<p class="empty">Niets gevonden. Probeer een grotere straal, of dit gebied heeft simpelweg geen open onverharde wegen.</p>';
    return;
  }
  offRoads.forEach(w=>{
    const d=document.createElement('div'); d.className='r';
    d.innerHTML=`<div style="min-width:0"><div class="nm">${w.name}</div>
      <div class="ds">${w.km.toFixed(1)} km · ${w.grade}${w.vrij?' · vrij toegankelijk':''}</div></div>`;
    const acts=document.createElement('div'); acts.className='acts';
    const b=document.createElement('button'); b.className='text-btn'; b.textContent='Erlangs';
    b.addEventListener('click',()=>{
      addVia(`${w.mid[1].toFixed(5)}, ${w.mid[0].toFixed(5)}`);
      el('dirt').value=Math.max(60,+el('dirt').value); el('dirtVal').textContent=el('dirt').value;
      setStatus(`${w.name} als tussenstop gezet en Onverhard omhoog gezet. Plan de route opnieuw.`);
    });
    const z=document.createElement('button'); z.className='text-btn';
    z.style.color='#8D9AA4'; z.textContent='Toon';
    z.addEventListener('click',()=>{
      offVisible=true; drawOffroad();
      map.fitBounds(w.geom.reduce((bb,c)=>bb.extend(c),new maplibregl.LngLatBounds(w.geom[0],w.geom[0])),
        {padding:80,duration:700});
    });
    acts.append(z,b); d.appendChild(acts); box.appendChild(d);
  });
}

el('offFind').addEventListener('click',async()=>{
  const btn=el('offFind'); btn.classList.add('busy'); btn.disabled=true;
  try{
    offRoads=await findOffroad();
    renderOffroad();
    offVisible=true; drawOffroad();
    const tot=offRoads.reduce((a,b)=>a+b.km,0);
    setStatus(`${offRoads.length} onverharde wegen gevonden, samen ${tot.toFixed(0)} km.`);
  }catch(err){ setStatus(err.message,true); }
  finally{ btn.classList.remove('busy'); btn.disabled=false; }
});
/* saveSettings() staat in 10-uitvoer.js, dus bij het inladen bestaat de naam
   hier nog niet. Daarom in een pijlfunctie: dan wordt hij pas opgezocht als
   je er echt op klikt, en dat is altijd na het inladen. */
el('offRadius').addEventListener('change',()=>saveSettings());
el('offWhere').addEventListener('change',()=>saveSettings());

/* ================= rijmodus met stem =================
   De kaart vult het scherm en draait met je mee, zoals in een navigatie:
   instructie boven, cijfers onder, je eigen pijl in het midden. Grote
   letters, gesproken afslagen, scherm blijft aan.

   Dit werkt ook zonder bereik: gps komt van de satellieten en de route en de
   afslagen zitten al in het geheugen. Alleen nieuwe kaartstukjes en een
   nieuwe berekening hebben internet nodig. */
const drive={ on:false, watch:null, lock:null, stem:true, gezegd:new Set(),
              shape:null, cum:null, man:null, sec:0,
              volgen:true, noord:false, koers:0, pos:null, idx:0, mij:null,
              spoor:[], spoorRit:false, terugGezegd:0, gedaanIdx:-1,
              afSinds:0, herLaatst:0, herBezig:false, geenNet:false, eerste:true,
              tempo:0, vorigeMelding:0, pad:null, terugAan:false,
              spoorGetekend:0, spoorBewaard:0, laatsteKmu:null, zoomDoel:0 };

/* Op welke afstanden een afslag wordt omgeroepen, van ver naar dichtbij. */
const AF_STAPPEN=[[1.0,'Over 1 kilometer'],[0.4,'Over 400 meter'],[0.15,'Over 150 meter']];
const AF_KM=0.25;   /* meer dan 250 meter naast de lijn heet "van de route af" */

function zeg(tekst){
  if(!drive.stem||!('speechSynthesis' in window)) return;
  try{
    const u=new SpeechSynthesisUtterance(tekst);
    u.lang='nl-NL'; u.rate=1.0; u.volume=1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }catch{}
}

const afst=km=> km<1 ? Math.round(km*100)*10+' m' : km.toFixed(1)+' km';

/* Hoeveel graden draait de weg op dit punt? Zestig meter ervoor en zestig
   meter erna de koers pakken en het verschil nemen. Positief is naar rechts.

   We rekenen dit uit de lijn en niet uit de nummers die de routeserver
   meestuurt. Twee redenen: het werkt ook bij een route die uit je opslag komt,
   en het is na te rekenen — een lijst met nummers uit een handleiding is dat
   niet. */
function bochtHoek(shape,cum,km){
  if(!shape?.length||!cum?.length) return 0;
  const totaal=cum[cum.length-1];
  const punt=d=>{
    const g=Math.max(0,Math.min(totaal,d));
    let i=cum.findIndex(x=>x>=g);
    if(i<0) i=shape.length-1;
    return shape[i];
  };
  const a=punt(km-0.06), b=punt(km), c=punt(km+0.06);
  if(!a||!b||!c) return 0;
  if(haversine(a,b)<0.005||haversine(b,c)<0.005) return 0;
  let d=bearing(b,c)-bearing(a,b);
  while(d>180) d-=360;
  while(d<-180) d+=360;
  return d;
}

/* De bocht in gewone taal. Ook de pijl draait hierop mee. */
function richtingWoord(hoek){
  const a=Math.abs(hoek);
  if(a>150) return 'Keer om';
  if(a<12) return 'Rechtdoor';
  const kant=hoek>0?'rechts':'links';
  if(a<35) return 'Licht '+kant;
  if(a<105) return kant.charAt(0).toUpperCase()+kant.slice(1);
  return 'Scherp '+kant;
}

/* Afslagen op één noemer: hoeveel kilometer vanaf het begin, wat je moet doen,
   en hoe scherp de bocht is. Zo werkt het zowel met een verse route van de
   server als met een route die uit je eigen opslag komt. */
function afslagen(v,cum,shape){
  const m=v.man||[];
  if(!m.length) return [];
  const lijn=shape||v.shape;
  const metHoek=x=>({...x, hoek:x.hoek!=null?x.hoek:bochtHoek(lijn,cum,x.km)});
  if(m[0].km!=null) return m.filter(x=>x.tekst).map(metHoek);
  return m.map(x=>({ km:cum[Math.min(cum.length-1,Math.max(0,x.begin_shape_index||0))],
                     tekst:(x.instruction||'').trim() }))
          .filter(x=>x.tekst)
          .map(metHoek);
}

/* Waar op de route ben je? Eerst kijken we vlak bij waar je net was — dat is
   zuinig voor de accu bij een route van duizenden punten. Levert dat niets
   op, dan zoeken we de hele route af, want dan ben je echt kwijt. */
function dichtstbij(shape,lat,lon,rond){
  const zoek=(van,tot)=>{
    let bi=van,bd=Infinity;
    for(let i=van;i<tot;i++){ const d=haversine(shape[i],[lon,lat]); if(d<bd){bd=d;bi=i;} }
    return {i:bi,off:bd};
  };
  if(rond!=null){
    const r=zoek(Math.max(0,rond-250),Math.min(shape.length,rond+450));
    if(r.off<0.4) return r;
  }
  return zoek(0,shape.length);
}

/* Welke kant op, in gewone taal — met handschoenen aan lees je geen graden. */
function kant(g){
  g=(g%360+360)%360;
  if(g<20||g>=340) return 'rechtdoor';
  if(g<70) return 'rechts voor je';
  if(g<110) return 'rechts';
  if(g<160) return 'rechts achter je';
  if(g<200) return 'achter je';
  if(g<250) return 'links achter je';
  if(g<290) return 'links';
  return 'links voor je';
}

/* Acht vormen voor acht soorten afslag, zoals op een Garmin: een steel die
   afbuigt in de richting die je op moet. Een vorm herken je door een vizier
   sneller dan een woord, en veel sneller dan een gedraaide pijl — die leest
   verkeerd zodra hij verder dan een kwartslag om staat.

   Getekend in een vak van 48 bij 48, steel begint onderaan in het midden. */
const PIJLEN={
  keer:        'M31 44 V26 A7 7 0 0 1 17 26 V33 M11 27 L17 34 L23 27',
  scherplinks: 'M24 44 V26 L13 33 M18 26 L12 34 L20 37',
  links:       'M24 44 V23 H13 M19 17 L12 23 L19 29',
  lichtlinks:  'M24 44 V27 L13 16 M20 15 L12 15 L12 23',
  rechtdoor:   'M24 44 V14 M16 21 L24 13 L32 21',
  lichtrechts: 'M24 44 V27 L35 16 M28 15 L36 15 L36 23',
  rechts:      'M24 44 V23 H35 M29 17 L36 23 L29 29',
  scherprechts:'M24 44 V26 L35 33 M30 26 L36 34 L28 37'
};

/* Welke vorm hoort bij deze hoek? Dezelfde grenzen als richtingWoord(), zodat
   de vorm en het woord elkaar nooit tegenspreken. */
function pijlSoort(hoek){
  const a=Math.abs(hoek);
  if(a>150) return 'keer';
  if(a<12) return 'rechtdoor';
  const kant=hoek>0?'rechts':'links';
  if(a<35) return 'licht'+kant;
  if(a<105) return kant;
  return 'scherp'+kant;
}

function pijlZet(hoek){
  const p=el('dArrowPath');
  if(!p) return;
  p.setAttribute('d', PIJLEN[pijlSoort(hoek)]||PIJLEN.rechtdoor);
}

/* De straatnaam uit de instructie halen voor de zwarte balk. De routeserver
   zegt "Sla linksaf naar de Höfener Straße"; jij wil alleen die straat zien. */
function straatUit(tekst){
  const s=String(tekst||'').replace(/\.$/,'').trim();
  const m=s.match(/(?:^|[ ])(?:naar|op|richting)[ ]+(?:de[ ]+|het[ ]+)?(.+)$/i);
  return (m?m[1]:s).trim();
}

function mijMarker(){
  if(drive.mij) return drive.mij;
  const d=document.createElement('div');
  d.className='mk mij';
  /* Een chevron, geen stip: aan de vorm zie je meteen welke kant je op staat.
     Hij draait en kantelt mee met de kaart. */
  d.innerHTML='<svg viewBox="0 0 40 40" aria-hidden="true">'
    +'<path d="M20 3 L34 34 L20 26.5 L6 34 Z" fill="#4FC8F5"'
    +' stroke="#07131A" stroke-width="2.6" stroke-linejoin="round"/></svg>';
  drive.mij=new maplibregl.Marker({element:d,rotationAlignment:'map',pitchAlignment:'map'});
  /* Eén keer aan de kaart hangen. addTo() doet intern eerst remove(), dus elke
     melding opnieuw aanroepen sloopt de pijl uit het scherm en plakt hem
     terug — midden in een lopende beweging. */
  drive.mij.setLngLat(drive.pos||[6.2,51.3]).addTo(map);
  return drive.mij;
}

/* ================= de camera, beeldje voor beeldje =================
   Eerst startte elke gps-melding een animatie van bijna een seconde. De
   volgende melding onderbrak die, en dat zag je als een schok — elke seconde
   opnieuw.

   Nu doen we het zoals een navigatie: we onthouden waar je was en waar je nu
   bent, en rekenen **elk beeldje** uit waar je daartussenin zou moeten zitten.
   De kaart wordt met jumpTo direct op die plek gezet. Zestig keer per seconde,
   zonder animatie die onderbroken kan worden. */
const NAVI={ zoom:15.6, pitch:55, laag:0.72 };

/* Waar je op het scherm staat. Niet halverwege: dan is de helft van je scherm
   de weg die je al gehad hebt. Je hoort onderin te staan, met de weg die komt
   voor je.

   Het gaat om je plek in de **vrije strook kaart** — dus tussen het groene blok
   bovenaan en het paneel onderaan, niet in het hele scherm. Dat wordt gemeten
   en niet geschat: op een iPhone is het groene blok hoger dan op een kleine
   Android, en met een vast getal zou je pijl achter het paneel verdwijnen.

   MapLibre centreert in wat er overblijft ná de padding, dus het middelpunt
   ligt op pad.top + (hoogte - pad.top - pad.bottom) / 2. Dat gelijkstellen aan
   de plek waar je wil staan geeft de formule hieronder. */
function vlakHoogte(kies){
  try{ return document.querySelector(kies)?.offsetHeight||0; }catch{ return 0; }
}
function naviPadding(hoogte,boven,onder){
  const h=hoogte||map.getContainer().clientHeight||600;
  const b=boven!=null?boven:vlakHoogte('.dtop')+vlakHoogte('.dstraat');
  const o=onder!=null?onder:vlakHoogte('.dbottom');
  const band=Math.max(80,h-b-o);
  const doel=b+band*NAVI.laag;
  const top=Math.max(0,Math.min(h-60,Math.round(2*doel-h+o)));
  return { top, bottom:Math.round(o), left:0, right:0 };
}

/* Automatisch zoomen, zoals een navigatie het doet: niet drie vaste standen
   maar meeschuivend met je snelheid. Hard rijden vraagt overzicht — je wil de
   bocht die komt al kunnen zien, niet pas als je erin zit. Langzaam rijden
   vraagt detail.

   Er zit geen marge meer op de grenzen, want dat is niet meer nodig: de camera
   schuift naar deze zoom toe in plaats van er op te springen. Zie naviBeeld().

   De getallen: bij 60 km/u zie je ongeveer een kilometer weg vóór je, bij
   120 ongeveer twee. Dat is de afstand waarop je een bocht wil aanzien komen. */
const ZOOM=[[0,16.2],[30,16.0],[60,15.6],[90,15.1],[120,14.7],[160,14.4]];
function naviZoom(kmu,naarAfslag){
  const v=Math.max(0,Math.min(160,(kmu!=null&&!isNaN(kmu))?kmu:40));
  let z=ZOOM[ZOOM.length-1][1];
  for(let i=1;i<ZOOM.length;i++){
    if(v<=ZOOM[i][0]){
      const v0=ZOOM[i-1][0], z0=ZOOM[i-1][1], v1=ZOOM[i][0], z1=ZOOM[i][1];
      z=z0+(z1-z0)*(v-v0)/(v1-v0);
      break;
    }
  }
  /* Vlak voor een afslag toch dichterbij: welke van die twee straten is het? */
  if(naarAfslag!=null && naarAfslag<0.35) z=Math.max(z,16.2);
  return Math.round(z*100)/100;
}

/* Vier standen, door te tikken met de knop rechtsboven. Automatisch is goed
   zolang je op je snelheid kunt varen, maar niet altijd: in een dorp met veel
   kruispunten wil je dichterbij, en op een onbekende bergweg wil je juist ver
   uitgezoomd om de bochten te zien aankomen. Dat is een keuze van de rijder en
   geen som die de app moet raden.

   Kies je een vaste stand, dan is die ook echt vast — dan zoomt hij ook niet
   meer in bij een afslag. Dat is de bedoeling van zelf kiezen. */
const Z_STANDEN=[
  {kort:'AUTO', zoom:null, uitleg:'Automatisch — schuift mee met je snelheid',
   stem:'Zoom automatisch'},
  {kort:'DICHT',zoom:16.6, uitleg:'Dichtbij — voor kruispunten en door dorpen',
   stem:'Dichtbij'},
  {kort:'RUIM', zoom:15.6, uitleg:'Ruim — de gewone stand',
   stem:'Ruim'},
  {kort:'VER',  zoom:14.6, uitleg:'Ver — overzicht, je ziet de bochten aankomen',
   stem:'Ver'}
];
function zoomStandZet(i){
  drive.stand=(((i|0)%Z_STANDEN.length)+Z_STANDEN.length)%Z_STANDEN.length;
  const s=Z_STANDEN[drive.stand];
  const b=el('dZoom');
  if(b){
    b.textContent=s.kort;
    b.title='Zoom: '+s.uitleg.toLowerCase()+' — tik voor de volgende stand';
    b.classList.toggle('on',drive.stand>0);
  }
  store.set('rb.zoom',drive.stand);
  /* De beeldjeslus mag zichzelf overslaan als er niets beweegt; nu is er weer
     iets te doen, dus wakker maken. */
  drive.stil=false;
  return s;
}

/* Hoe vaak meldt je telefoon zich echt? Dat verschilt per toestel, dus we
   meten het. De beeldjeslus schuift je in precies die tijd van je vorige naar
   je huidige plek: meet hij te kort, dan staat de kaart tussen twee meldingen
   stil; te lang, en hij loopt achter. Beide zie je als een schok. */
function meldTempo(){
  const nu=Date.now();
  if(drive.vorigeMelding){
    const dt=nu-drive.vorigeMelding;
    /* Rustig bijstellen en rare uitschieters negeren. */
    if(dt>200&&dt<5000)
      drive.tempo=drive.tempo?drive.tempo*0.7+dt*0.3:dt;
  }
  drive.vorigeMelding=nu;
  return Math.max(350,Math.min(1400,Math.round((drive.tempo||1000)*0.9)));
}

/* De koers dempen. De richting van je telefoon springt zomaar tien graden heen
   en weer; ongedempt draait de hele kaart daarmee mee. Kleine verschillen
   negeren we, grote volgen we snel — anders loopt hij in een bocht achter. */
function koersDemp(huidig,nieuw){
  let d=nieuw-huidig;
  while(d>180) d-=360;
  while(d<-180) d+=360;
  if(Math.abs(d)<2) return huidig;
  const factor=Math.abs(d)>25?0.7:0.35;
  return (huidig+d*factor+360)%360;
}

/* Tussen twee hoeken door draaien langs de korte kant. */
function koersTussen(van,naar,f){
  let d=naar-van;
  while(d>180) d-=360;
  while(d<-180) d+=360;
  return (van+d*f+360)%360;
}

/* Waar zou je nu moeten zijn? We schuiven van de vorige naar de huidige plek in
   de tijd die je telefoon er gemiddeld over doet. Is die tijd voorbij en is er
   nog geen nieuwe melding, dan blijven we staan waar we zijn — doorschieten op
   een gok is erger dan even stil. */
function naviBeeld(){
  if(!drive.on) return;
  /* Zijn we er en staat de zoom stil, dan hoeft er niets meer getekend te
     worden tot de volgende gps-melding. Bij een stoplicht scheelt dat zestig
     hertekeningen per seconde, en dus accu. */
  if(drive.van && drive.naar && !drive.stil){
    const dt=drive.tempo||1000;
    const f=Math.max(0,Math.min(1,(Date.now()-drive.naarTijd)/dt));
    const lon=drive.van[0]+(drive.naar[0]-drive.van[0])*f;
    const lat=drive.van[1]+(drive.naar[1]-drive.van[1])*f;
    const koers=koersTussen(drive.koersVan,drive.koers,f);
    /* De chevron wijst altijd in je rijrichting, of de kaart nu meedraait of
       op noorden staat: hij draait mee met de kaart, dus de hoek is in beide
       gevallen simpelweg je koers. Hij loopt ook door als je zelf de kaart
       hebt verschoven — dan wil je juist zien waar je bent. */
    if(drive.mij) drive.mij.setLngLat([lon,lat]).setRotation(koers);
    if(drive.volgen){
      /* De zoom schuift er naartoe in plaats van te springen: ongeveer een
         halve seconde om er te zijn. Daarom heeft naviZoom() geen marges op
         zijn grenzen nodig — er kan niets heen en weer springen. */
      if(drive.zoomDoel){
        const dz=drive.zoomDoel-drive.zoomNu;
        drive.zoomNu += Math.abs(dz)<0.004 ? dz : dz*0.08;
      }
      map.jumpTo({
        center:[lon,lat],
        zoom:drive.zoomNu||NAVI.zoom,
        bearing:drive.noord?0:koers,
        pitch:drive.noord?0:NAVI.pitch,
        padding:drive.pad||naviPadding()
      });
    }
    if(f>=1 && (!drive.volgen || Math.abs((drive.zoomNu||0)-(drive.zoomDoel||0))<0.004))
      drive.stil=true;
  }
  drive.beeld=requestAnimationFrame(naviBeeld);
}

/* Bij het starten en na een handmatige ingreep: in één keer goed gaan staan. */
function naviZet(zoom){
  if(!drive.pos) return;
  map.jumpTo({
    center:drive.pos,
    zoom:zoom||NAVI.zoom,
    bearing:drive.noord?0:drive.koers,
    pitch:drive.noord?0:NAVI.pitch,
    padding:drive.pad||naviPadding()
  });
}

/* Het stuk dat je al gehad hebt grijs maken. We tekenen alleen de laatste paar
   kilometer achter je, niet de hele afgelegde route: verder terug zie je toch
   niet, en de hele lijn opnieuw opbouwen was halverwege een dagrit ruim 100 KB
   per keer. Nu is het altijd even klein. */
const GEDAAN_KM=3;
function tekenGedaan(i){
  if(drive.gedaanIdx>=0 && i-drive.gedaanIdx<8) return;
  drive.gedaanIdx=i;
  const tot=drive.cum[i];
  let van=i;
  while(van>0 && tot-drive.cum[van]<GEDAAN_KM) van--;
  const deel=drive.shape.slice(van,Math.max(van+2,i+1));
  map.getSource('gedaan')?.setData({type:'Feature',properties:{},
    geometry:{type:'LineString',coordinates:deel}});
}

/* Broodkruimels: elke ~40 meter een punt van waar je gereden hebt. Zo kun je
   altijd terug over de weg die je kwam, ook als de route je niet meer helpt.
   Wordt tussentijds opgeslagen, want een telefoon die opnieuw opstart mag je
   spoor niet wegvagen. */
function spoorBij(lon,lat){
  const p=[+lon.toFixed(5),+lat.toFixed(5)];
  const vorig=drive.spoor[drive.spoor.length-1];
  if(vorig && haversine(vorig,p)<0.04) return;
  drive.spoor.push(p);
  if(drive.spoor.length>8000) drive.spoor.splice(0,2000);

  const nu=Date.now();
  /* De lijn van je spoor groeit de hele rit door. Elke paar seconden die hele
     lijn opnieuw naar de kaart sturen is na een uur 70 KB per keer — dat voelt
     je als een hapering. Eens per 15 seconden is ruim genoeg; je kijkt naar de
     weg vóór je, niet naar waar je al was. */
  if(nu-(drive.spoorGetekend||0)>15000){
    drive.spoorGetekend=nu;
    map.getSource('spoor')?.setData({type:'Feature',properties:{},
      geometry:{type:'LineString',coordinates:drive.spoor.length>1?drive.spoor:[]}});
  }
  /* Naar de opslag schrijven blokkeert alles zolang het duurt. Dus alleen als je
     bijna stilstaat, en nooit vaker dan één keer per minuut. */
  const traag=drive.laatsteKmu!=null&&drive.laatsteKmu<8;
  if(traag && nu-(drive.spoorBewaard||0)>60000){
    drive.spoorBewaard=nu;
    store.set('rb.spoor',drive.spoor);
  }
}

/* Waar pak je de route weer op? Het dichtstbijzijnde punt is niet altijd het
   handigste: mis je een afslag, dan ligt het stuk waar je vandaan komt vaak
   dichterbij dan het stuk waar je heen wilde. Daarom zoeken we ook vooruit,
   en kiezen we dat zolang het niet veel verder is. */
function herintrede(lat,lon){
  const dicht=dichtstbij(drive.shape,lat,lon,drive.idx);
  let bi=-1,bd=Infinity;
  for(let i=drive.idx;i<drive.shape.length;i++){
    const d=haversine(drive.shape[i],[lon,lat]);
    if(d<bd){ bd=d; bi=i; }
  }
  if(bi>drive.idx && bd<dicht.off*1.7+0.4) return {i:bi,af:bd,vooruit:true};
  return {i:dicht.i,af:dicht.off,vooruit:false};
}

function vanDeRouteAf(lat,lon){
  const her=herintrede(lat,lon);
  const doel=drive.shape[her.i];
  const rel=bearing([lon,lat],doel)-drive.koers;
  const verder=Math.max(0,drive.cum[her.i]-drive.cum[drive.idx]);

  el('dDist').textContent=afst(her.af);
  el('dNext').textContent='Terug naar de route — '+kant(rel);
  el('dThen').textContent = her.vooruit && verder>0.3
    ? `De route pakt je ${afst(verder)} verderop weer op`
    : 'Rijd terug naar het dichtstbijzijnde punt';

  pijlZet(((rel+180)%360+360)%360-180);
  map.getSource('terug')?.setData({type:'Feature',properties:{},
    geometry:{type:'LineString',coordinates:[[lon,lat],doel]}});
  drive.terugAan=true;

  const nu=Date.now();
  if(nu-drive.terugGezegd>45000){
    drive.terugGezegd=nu;
    zeg(`Je bent van de route af. Terug naar de route: ${afst(her.af)}, ${kant(rel)}.`);
  }
}

/* ================= opnieuw berekenen onderweg =================
   Neem je een andere afslag, dan wijst de app je terug naar de route. Dat werkt
   zonder bereik, maar met bereik kan het beter: dan berekenen we een echt
   nieuw stukje weg van waar je nu bent naar het punt waar je de route weer
   oppakt, en plakken de rest van je route eraan vast.

   Dat is precies wat je wil: je geplande rit blijft staan, alleen het gat
   wordt gedicht. En het is één korte aanvraag in plaats van je hele rit
   opnieuw laten uitrekenen.

   Niet bij elk gps-hikje: eerst 300 meter eraf, dan acht seconden zo blijven,
   en daarna nooit vaker dan één keer per twintig seconden. */
const HER_KM=0.30;        /* zo ver van de route af mag hij herberekenen */
const HER_WACHT=8000;     /* en dan pas na acht seconden aaneengesloten */
const HER_PAUZE=20000;    /* nooit vaker dan elke twintig seconden */

/* Het nieuwe stukje en de rest van je oude route aan elkaar plakken.
   Los gezet zodat het na te rekenen is met de zelftest, want dit is precies het
   soort rekenwerk dat stil misgaat: één punt dubbel, of afslagen die op de
   verkeerde kilometer komen te staan.

   Het laatste punt van het nieuwe stukje ís het instappunt, dus bij de staart
   slaan we dat punt over. De oude afslagen die nog moeten komen schuiven mee
   met de lengte van het nieuwe stukje. */
function plakRoute(nieuwe,oudShape,oudCum,oudMan,i){
  const kopCum=cumulative(nieuwe.shape);
  const kopKm=kopCum[kopCum.length-1];
  const shape=nieuwe.shape.concat(oudShape.slice(i+1));
  const vanaf=oudCum[i];
  const man=afslagen({man:nieuwe.man},kopCum,nieuwe.shape).concat(
    (oudMan||[]).filter(m=>m.km>vanaf+0.05)
                .map(m=>({ km:kopKm+(m.km-vanaf), tekst:m.tekst })));
  return { shape, cum:cumulative(shape), man, kopKm, vanaf,
           oudTotaal:oudCum[oudCum.length-1] };
}

async function herbereken(lat,lon){
  if(drive.herBezig) return;
  /* Rijd je terug over je eigen spoor, dan is dat je route. Daar hoort geen
     nieuwe berekening bij. */
  if(drive.spoorRit) return;
  const nu=Date.now();
  if(nu-drive.herLaatst<HER_PAUZE) return;

  drive.herBezig=true;
  try{
    const her=herintrede(lat,lon);
    const doel=drive.shape[her.i];
    if(!doel){ return; }

    const r=await planRoute([{lat,lon},{lat:doel[1],lon:doel[0]}],'tour',level);
    if(!drive.on||drive.spoorRit) return;

    const plak=plakRoute(r,drive.shape,drive.cum,drive.man,her.i);
    drive.shape=plak.shape;
    drive.cum=plak.cum;
    drive.man=plak.man;
    drive.sec=(r.sec||0)+drive.sec*Math.max(0,1-plak.vanaf/Math.max(0.1,plak.oudTotaal));
    drive.idx=0; drive.gedaanIdx=-1; drive.gezegd.clear(); drive.km=null;
    drive.herLaatst=Date.now(); drive.afSinds=0; drive.geenNet=false;
    map.getSource('terug')?.setData(EMPTY);

    zeg('Nieuwe route.');
    el('dThen').textContent=`Nieuwe route: ${afst(plak.kopKm)} tot je weer op je rit zit`;
    /* Ook de route in je zak bijwerken, zodat een herstart je de nieuwe geeft. */
    if(typeof ritBijwerken==='function')
      ritBijwerken(drive.shape,drive.man,drive.cum[drive.cum.length-1],drive.sec);
  }catch(e){
    /* Geen bereik of de server is druk. Dan blijft de terugwijzer het werk
       doen; dat is waar hij voor is. Eén keer zeggen is genoeg. */
    drive.herLaatst=Date.now();
    if(!drive.geenNet){
      drive.geenNet=true;
      el('dThen').textContent='Geen nieuwe route mogelijk — ik wijs je terug naar je rit';
      zeg('Ik kan geen nieuwe route berekenen. Volg de pijl terug naar je route.');
    }
  }finally{
    drive.herBezig=false;
  }
}

/* Ben je lang genoeg en ver genoeg van de route af? Dan opnieuw berekenen.
   Stilstaan telt niet: dan sta je misschien naast de weg te kijken. */
function herberekenMisschien(lat,lon,off,snelheid){
  if(off<HER_KM){ drive.afSinds=0; return; }
  if(snelheid!=null && snelheid>=0 && snelheid*3.6<5){ return; }
  const nu=Date.now();
  if(!drive.afSinds){ drive.afSinds=nu; return; }
  if(nu-drive.afSinds<HER_WACHT) return;
  herbereken(lat,lon);
}

function driveTick(pos){
  if(!drive.on) return;
  const {latitude:la,longitude:lo,speed,heading}=pos.coords;

  /* Welke kant kijk je op? Eerst wat je telefoon zelf zegt; weet hij het niet,
     dan de hoek tussen je vorige en je huidige plek.

     Onder 5 km/u draaien we niet meer: dan sta je te wachten, en zou de kaart
     van elke gps-hik in de rondte gaan tollen. */
  const kmu=(speed!=null&&speed>=0)?speed*3.6:null;
  drive.koersVan=drive.koers;
  if(kmu===null||kmu>=5){
    let ruw=null;
    if(heading!=null&&!isNaN(heading)) ruw=heading;
    else if(drive.ruw&&haversine(drive.ruw,[lo,la])>0.008) ruw=bearing(drive.ruw,[lo,la]);
    if(ruw!=null) drive.koers=koersDemp(drive.koers,ruw);
  }
  drive.ruw=[lo,la];
  meldTempo();

  /* Je positie op de route plakken. Je telefoon zit altijd een paar meter
     naast de weg; zonder dit staat de pijl naast de weg én is de afstand tot
     de afslag verkeerd. */
  const op=opDeRoute(drive.shape,drive.cum,la,lo,drive.idx);
  const opRoute = op && op.off<=AF_KM;
  drive.pos = opRoute ? op.punt : [lo,la];

  /* Waar de kaart naartoe glijdt: van waar we net waren naar waar je nu bent.
     De lus per beeldje rekent daartussen uit waar je op dit moment zit. */
  drive.van = drive.naar || drive.pos;
  drive.naar = drive.pos;
  drive.naarTijd = Date.now();
  drive.stil = false;   /* er is weer iets te bewegen */
  mijMarker();   /* n keer aangemaakt; daarna beweegt naviBeeld() hem */

  spoorBij(lo,la);
  drive.laatsteKmu=kmu;
  el('dSpeed').textContent=(kmu!=null?Math.round(kmu):'—');

  if(!opRoute){
    vanDeRouteAf(la,lo);
    herberekenMisschien(la,lo,op?op.off:9,speed);
    /* Van de route af is er geen afslag om op te zoomen; dan geldt je snelheid. */
    drive.zoomDoel=Z_STANDEN[drive.stand||0].zoom||naviZoom(kmu,null);
    if(drive.eerste){ naviZet(drive.zoomDoel); drive.zoomNu=drive.zoomDoel; drive.eerste=false; }
    return;
  }

  /* Weer op de route: de teller voor herberekenen gaat op nul. */
  drive.afSinds=0; drive.geenNet=false;
  drive.idx=op.i;
  /* Alleen leegmaken als er iets stond. Elke seconde een lege laag verversen is
     een volledige hertekening voor niets. */
  if(drive.terugAan){ map.getSource('terug')?.setData(EMPTY); drive.terugAan=false; }
  tekenGedaan(op.i);

  /* Je kilometerstand mag alleen vooruit. Zonder dat kan een haarspeld je stand
     laten terugvallen, en dan komt de afslagmelding te laat. */
  drive.km=kmVooruit(op.km,drive.km);
  const gereden=drive.km;
  const totaal=drive.cum[drive.cum.length-1];
  const over=Math.max(0,totaal-gereden);
  const volg=drive.man.find(m=>m.km>gereden+0.02);
  const naar=volg?volg.km-gereden:null;

  /* Nu we weten hoe ver de afslag is, kan de camera zijn zoom kiezen. Daarom
     staat dit hier en niet bovenaan: dichtbij een afslag wil je inzoomen.
     Het bewegen zelf doet naviBeeld(), zestig keer per seconde. */
  drive.zoomDoel=Z_STANDEN[drive.stand||0].zoom||naviZoom(kmu,naar);
  if(drive.eerste){ drive.zoomNu=drive.zoomDoel; naviZet(drive.zoomDoel); drive.eerste=false; }

  el('dLeft').textContent=over.toFixed(0);
  const restSec=drive.sec?drive.sec*(over/Math.max(0.1,totaal)):0;
  el('dEta').textContent=restSec?new Date(Date.now()+restSec*1000).toTimeString().slice(0,5):'—';

  if(!volg){
    pijlZet(0);
    el('dDist').textContent=afst(over);
    el('dNext').textContent=over<0.2?'Je bent er':'Rechtdoor';
    el('dThen').textContent=over<0.2?'':'tot het eind van je rit';
    if(over<0.2 && !drive.gezegd.has('eind')){ drive.gezegd.add('eind'); zeg('Je bent er. Goede rit gehad.'); }
    return;
  }
  pijlZet(volg.hoek||0);
  el('dDist').textContent=afst(naar);
  el('dNext').textContent=richtingWoord(volg.hoek||0);
  const later=drive.man[drive.man.indexOf(volg)+1];
  el('dThen').textContent=straatUit(volg.tekst)
    +(later?' · daarna '+richtingWoord(later.hoek||0).toLowerCase():'');

  /* De afslag in stappen aankondigen. Eerst was er n melding op 400 meter, en
     die kwam op een provinciale weg te laat: bij 100 km/u ben je er in veertien
     seconden, en dan moet je nog van rijstrook wisselen. Nu op een kilometer,
     op 400, op 150 en als je erbij bent.

     Duikt een afslag pas dichtbij op omdat er net herberekend is, dan slaan we
     de gemiste stappen stil over: drie meldingen achter elkaar is geschreeuw. */
  const id='m'+volg.km.toFixed(3);
  let stap=-1;
  for(let q=0;q<AF_STAPPEN.length;q++) if(naar<AF_STAPPEN[q][0]) stap=q;
  if(stap>=0 && !drive.gezegd.has(id+'s'+stap)){
    for(let q=0;q<=stap;q++) drive.gezegd.add(id+'s'+q);
    zeg(AF_STAPPEN[stap][1]+', '+volg.tekst);
  }
  if(naar<0.05 && !drive.gezegd.has(id+'n')){
    drive.gezegd.add(id+'n');
    zeg('Nu '+volg.tekst);
  }
}

/* Welke lijn volgen we? Een geplande route, een route uit de opslag, of je
   eigen spoor terug — allemaal via dezelfde weg naar binnen. */
function rijRouteUit(v){
  drive.shape=v.shape;
  drive.cum=cumulative(v.shape);
  drive.sec=v.sec||0;
  drive.man=afslagen(v,drive.cum,v.shape);
  drive.idx=0; drive.gedaanIdx=-1; drive.gezegd.clear();
  /* Een andere route betekent een andere kilometerstand; de rem op teruglopen
     moet dus opnieuw beginnen, anders blijft hij op de oude stand hangen. */
  drive.km=null;
}

async function startDrive(){
  const v=state.variants?.[state.shown];
  if(!v?.shape?.length){ setStatus('Plan eerst een route.',true); return; }
  if(!navigator.geolocation){ setStatus('Je browser geeft je locatie niet door.',true); return; }
  rijRouteUit(v);
  drive.on=true; drive.pos=null; drive.volgen=true; drive.spoorRit=false;
  drive.spoor=[]; drive.terugGezegd=0;
  drive.afSinds=0; drive.herLaatst=0; drive.herBezig=false; drive.geenNet=false;
  drive.eerste=true; drive.noord=false;
  drive.tempo=0; drive.vorigeMelding=0; drive.terugAan=false;
  drive.spoorGetekend=0; drive.spoorBewaard=0; drive.laatsteKmu=null;
  const beginStand=zoomStandZet(store.get('rb.zoom',0));
  drive.zoomDoel=beginStand.zoom||NAVI.zoom; drive.zoomNu=drive.zoomDoel;
  drive.van=null; drive.naar=null; drive.naarTijd=0; drive.ruw=null; drive.stil=false;
  drive.koersVan=drive.koers||0; drive.km=null;
  /* De lus die de kaart beweegt. En laat de gps zich niet met een oud antwoord
     afmaken: op 100 km/u is twee seconden oud al 55 meter mis. */
  if(!drive.beeld) drive.beeld=requestAnimationFrame(naviBeeld);

  document.body.classList.add('rijden');
  el('drive').hidden=false;
  el('dRecenter').hidden=true;
  el('dNext').textContent='Wachten op gps…';
  el('dDist').textContent='—';
  el('dThen').hidden=true;
  el('dTrack').classList.remove('on');
  el('dTrack').textContent='↩ Spoor';
  map.resize();
  /* Pas hier de padding rekenen: het groene blok en het paneel worden gemeten,
     en zolang de cockpit nog verborgen is zijn ze nul hoog. */
  drive.pad=naviPadding();


  try{ drive.lock=await navigator.wakeLock?.request('screen'); }catch{}
  zeg('Rijmodus aan. Goede rit.');
  drive.watch=navigator.geolocation.watchPosition(driveTick,
    ()=>{ el('dNext').textContent='Geen gps-signaal';
          el('dThen').textContent='Even wachten — onder een dak vindt hij de satellieten niet'; },
    {enableHighAccuracy:true,maximumAge:0,timeout:15000});
}

function stopDrive(){
  drive.on=false;
  if(drive.beeld){ cancelAnimationFrame(drive.beeld); drive.beeld=0; }
  if(drive.watch!=null) navigator.geolocation.clearWatch(drive.watch);
  drive.watch=null;
  try{ drive.lock?.release(); }catch{}
  drive.lock=null;
  try{ speechSynthesis.cancel(); }catch{}
  try{ drive.mij?.remove(); }catch{}
  map.getSource('terug')?.setData(EMPTY);
  map.getSource('gedaan')?.setData(EMPTY);
  document.body.classList.remove('rijden');
  el('drive').hidden=true;
  map.resize();
  /* Netjes rechtop en zonder padding achterlaten. */
  map.easeTo({pitch:0,bearing:0,padding:{top:0,bottom:0,left:0,right:0},duration:500});
  /* Nu je stilstaat mag het schrijven wel: het spoor is te kostbaar om te
     verliezen als je onderweg terug wil. */
  if(drive.spoor.length>1) store.set('rb.spoor',drive.spoor);
}

el('sheetDrive').addEventListener('click',startDrive);
el('dStop').addEventListener('click',stopDrive);
el('dMute').addEventListener('click',()=>{
  drive.stem=!drive.stem;
  el('dMute').textContent=drive.stem?'🔊 Stem':'🔇 Stil';
  if(!drive.stem) try{ speechSynthesis.cancel(); }catch{}
});


el('dRecenter').addEventListener('click',()=>{
  drive.volgen=true; el('dRecenter').hidden=true; naviZet(drive.zoomNu);
});

/* Meedraaien of noorden boven. Meedraaien is de stand waarin je rijdt; noorden
   boven is handig als je even wil zien hoe de rit in het landschap ligt. */
el('dNorth').addEventListener('click',()=>{
  drive.noord=!drive.noord;
  el('dNorth').classList.toggle('on',drive.noord);
  el('dNorth').textContent=drive.noord?'N':'◈';
  el('dNorth').title=drive.noord?'Noorden boven — tik om mee te draaien'
                                :'Draait met je mee — tik voor noorden boven';
  drive.volgen=true; el('dRecenter').hidden=true;
  naviZet(drive.zoomNu);
});

/* Doortikken door de vier zoomstanden. Er wordt ook gezegd welke het is: met
   een helm op en handschoenen aan wil je niet naar een knopje hoeven kijken. */
el('dZoom').addEventListener('click',()=>{
  const s=zoomStandZet((drive.stand||0)+1);
  zeg(s.stem);
});

/* Draai je je telefoon, dan verandert de hoogte en dus de padding. */
map.on('resize',()=>{
  if(!drive.on) return;
  drive.pad=naviPadding();      /* de hoogte is veranderd, dus opnieuw rekenen */
});

/* Zelf de kaart verschuiven zet het meevolgen uit — anders vecht je met de
   app. Met de knop pak je het weer op. */
['dragstart','rotatestart','pitchstart','zoomstart'].forEach(ev=>map.on(ev,e=>{
  if(drive.on && drive.volgen && e.originalEvent){
    drive.volgen=false; el('dRecenter').hidden=false;
  }
}));

/* Verdwaald? Dan wordt je eigen spoor de route: precies terug over de weg die
   je kwam. Werkt zonder bereik, want het spoor komt van je eigen gps. */
el('dTrack').addEventListener('click',()=>{
  if(drive.spoorRit){
    const v=state.variants?.[state.shown];
    if(!v?.shape?.length) return;
    rijRouteUit(v);
    drive.spoorRit=false;
    el('dTrack').classList.remove('on');
    el('dTrack').textContent='↩ Spoor';
    zeg('Weer op de geplande route.');
    return;
  }
  const s=drive.spoor.length>2?drive.spoor:store.get('rb.spoor',[]);
  if(s.length<3){
    el('dThen').textContent='geen spoor om over terug te rijden';
    zeg('Er is nog geen spoor om over terug te rijden.');
    return;
  }
  rijRouteUit({shape:[...s].reverse(), sec:0, man:[]});
  drive.spoorRit=true;
  el('dTrack').classList.add('on');
  el('dTrack').textContent='⤿ Route';
  zeg('Je rijdt nu terug over je eigen spoor.');
});

/* Het verzoek om het scherm aan te houden vervalt als de telefoon op slot
   gaat. Bij terugkomen opnieuw vragen, anders valt het scherm alsnog uit. */
document.addEventListener('visibilitychange',async()=>{
  if(!drive.on || document.visibilityState!=='visible') return;
  try{ drive.lock=await navigator.wakeLock?.request('screen'); }catch{}
});

document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&drive.on) stopDrive(); });
