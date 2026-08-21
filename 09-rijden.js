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
  if(breed*hoog>4500){
    setStatus(`Zoom eerst wat in — dit gebied is ${Math.round(breed)}×${Math.round(hoog)} km, dat wordt te veel.`,true);
    return false;
  }
  curveBusy=true; el('curveToggle').classList.add('busy');
  setStatus('Wegen ophalen en doormeten…');
  try{
    const bbox=`${b.getSouth().toFixed(4)},${b.getWest().toFixed(4)},${b.getNorth().toFixed(4)},${b.getEast().toFixed(4)}`;
    const q=`[out:json][timeout:35][bbox:${bbox}];
      way["highway"~"^(secondary|tertiary|unclassified|primary)$"]["access"!~"^(no|private)$"];
      out geom 2500;`;
    const j=await overpass(q);
    const feats=[];
    let leuk=0;
    for(const e of (j.elements||[])){
      const g=e.geometry; if(!g||g.length<4) continue;
      const co=g.map(p=>[p.lon,p.lat]);
      const {km,score}=wegBochtigheid(co);
      if(km<0.4||score<22) continue;
      if(score>=55) leuk++;
      feats.push({type:'Feature',properties:{c:score/100,naam:e.tags?.name||e.tags?.ref||'',s:score,km:+km.toFixed(1)},
        geometry:{type:'LineString',coordinates:co}});
    }
    map.getSource('curve').setData({type:'FeatureCollection',features:feats});
    setStatus(feats.length
      ? `${feats.length} bochtige wegen in beeld, waarvan ${leuk} echt de moeite waard.`
      : 'Geen bochtige wegen gevonden in dit gebied — vlak land.');
    return true;
  }catch(err){ setStatus('De plaatsenserver is druk, probeer het zo nog eens.',true); return false; }
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
              afSinds:0, herLaatst:0, herBezig:false, geenNet:false };

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

/* De pijl draait mee met de bocht: vier graden naar rechts is ook echt een
   klein beetje naar rechts. Bij omkeren wordt het een aparte vorm, want een
   omgedraaide pijl leest niemand goed. */
const PIJL_RECHT='M24 4 L38 26 L28 26 L28 44 L20 44 L20 26 L10 26 Z';
const PIJL_KEER='M14 44 L14 20 A10 10 0 0 1 34 20 L34 30 L42 30 L30 44 L18 30 L26 30 L26 20 A2 2 0 0 0 22 20 L22 44 Z';
function pijlZet(hoek){
  const p=el('dArrowPath');
  if(!p) return;
  const keer=Math.abs(hoek)>150;
  p.setAttribute('d', keer?PIJL_KEER:PIJL_RECHT);
  /* Niet verder dan 135 graden draaien; daarboven wordt het onleesbaar. */
  const draai=keer?0:Math.max(-135,Math.min(135,hoek));
  el('dArrow').style.transform=`rotate(${Math.round(draai)}deg)`;
}

function mijMarker(){
  if(drive.mij) return drive.mij;
  const d=document.createElement('div');
  d.className='mk mij';
  d.innerHTML='<svg viewBox="0 0 24 24"><path d="M12 2 L20 21 L12 16.5 L4 21 Z"'
    +' fill="#FF5A1F" stroke="#0B0E11" stroke-width="1.4"/></svg>';
  drive.mij=new maplibregl.Marker({element:d,rotationAlignment:'map',pitchAlignment:'map'});
  return drive.mij;
}

function naviCam(){
  if(!drive.volgen||!drive.pos) return;
  map.easeTo({ center:drive.pos, bearing:drive.koers, pitch:52, duration:900, easing:t=>t });
}

/* Het stuk dat je al gehad hebt grijs maken, zodat je in één oogopslag ziet
   welke kant je op moet. Alleen bijwerken als je echt opgeschoten bent: elke
   seconde een lijn van duizenden punten hertekenen kost accu voor niets. */
function tekenGedaan(i){
  if(drive.gedaanIdx>=0 && i-drive.gedaanIdx<8) return;
  drive.gedaanIdx=i;
  map.getSource('gedaan')?.setData({type:'Feature',properties:{},
    geometry:{type:'LineString',coordinates:drive.shape.slice(0,Math.max(2,i+1))}});
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
  map.getSource('spoor')?.setData({type:'Feature',properties:{},
    geometry:{type:'LineString',coordinates:drive.spoor.length>1?drive.spoor:[]}});
  if(drive.spoor.length%15===0) store.set('rb.spoor',drive.spoor);
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

  el('dNext').textContent='Terug naar de route';
  el('dDist').textContent=afst(her.af);
  el('dThen').textContent = her.vooruit && verder>0.3
    ? `De route pakt je ${afst(verder)} verderop weer op — ${kant(rel)}`
    : `Het dichtstbijzijnde punt ligt ${kant(rel)}`;

  pijlZet(((rel+180)%360+360)%360-180);
  map.getSource('terug')?.setData({type:'Feature',properties:{},
    geometry:{type:'LineString',coordinates:[[lon,lat],doel]}});

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
    drive.idx=0; drive.gedaanIdx=-1; drive.gezegd.clear();
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

  /* Koers: van de telefoon als hij die weet, anders zelf uitrekenen uit je
     vorige plek. Stilstaand weet niemand welke kant je op kijkt, dan houden
     we de laatste koers vast. */
  if(heading!=null && !isNaN(heading) && (speed==null||speed>1.5)) drive.koers=heading;
  else if(drive.pos && haversine(drive.pos,[lo,la])>0.012) drive.koers=bearing(drive.pos,[lo,la]);
  drive.pos=[lo,la];

  mijMarker().setLngLat(drive.pos).setRotation(drive.koers).addTo(map);
  naviCam();
  spoorBij(lo,la);
  el('dSpeed').textContent=(speed!=null&&speed>=0?Math.round(speed*3.6):'—');

  const hier=dichtstbij(drive.shape,la,lo,drive.idx);
  if(hier.off>AF_KM){
    vanDeRouteAf(la,lo);
    herberekenMisschien(la,lo,hier.off,speed);
    return;
  }

  /* Weer op de route: de teller voor herberekenen gaat op nul. */
  drive.afSinds=0; drive.geenNet=false;
  drive.idx=hier.i;
  map.getSource('terug')?.setData(EMPTY);
  tekenGedaan(hier.i);

  const gereden=drive.cum[hier.i];
  const totaal=drive.cum[drive.cum.length-1];
  const over=Math.max(0,totaal-gereden);
  el('dLeft').textContent=over.toFixed(0);
  const restSec=drive.sec?drive.sec*(over/Math.max(0.1,totaal)):0;
  el('dEta').textContent=restSec?new Date(Date.now()+restSec*1000).toTimeString().slice(0,5):'—';

  const volg=drive.man.find(m=>m.km>gereden+0.02);
  if(!volg){
    pijlZet(0);
    el('dNext').textContent=over<0.2?'Je bent er':'Rechtdoor';
    el('dDist').textContent=afst(over);
    el('dThen').hidden=true;
    if(over<0.2 && !drive.gezegd.has('eind')){ drive.gezegd.add('eind'); zeg('Je bent er. Goede rit gehad.'); }
    return;
  }
  const naar=volg.km-gereden;
  pijlZet(volg.hoek||0);
  el('dNext').textContent=volg.tekst.replace(/\.$/,'');
  el('dDist').textContent=afst(naar);
  const later=drive.man[drive.man.indexOf(volg)+1];
  el('dThen').hidden=!later;
  if(later) el('dThen').textContent='daarna '+richtingWoord(later.hoek||0).toLowerCase();

  const id='m'+volg.km.toFixed(3);
  if(naar<0.4 && !drive.gezegd.has(id+'v')){
    drive.gezegd.add(id+'v');
    zeg(`Over ${Math.round(naar*1000/50)*50} meter, ${volg.tekst}`);
  }
  if(naar<0.06 && !drive.gezegd.has(id+'n')){
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
}

async function startDrive(){
  const v=state.variants?.[state.shown];
  if(!v?.shape?.length){ setStatus('Plan eerst een route.',true); return; }
  if(!navigator.geolocation){ setStatus('Je browser geeft je locatie niet door.',true); return; }
  rijRouteUit(v);
  drive.on=true; drive.pos=null; drive.volgen=true; drive.spoorRit=false;
  drive.spoor=[]; drive.terugGezegd=0;
  drive.afSinds=0; drive.herLaatst=0; drive.herBezig=false; drive.geenNet=false;

  document.body.classList.add('rijden');
  el('drive').hidden=false;
  el('dRecenter').hidden=true;
  el('dNext').textContent='Wachten op gps…';
  el('dDist').textContent='—';
  el('dThen').hidden=true;
  el('dTrack').classList.remove('on');
  el('dTrack').textContent='↩';
  map.resize();
  map.easeTo({zoom:15,pitch:52,duration:600});

  try{ drive.lock=await navigator.wakeLock?.request('screen'); }catch{}
  zeg('Rijmodus aan. Goede rit.');
  drive.watch=navigator.geolocation.watchPosition(driveTick,
    ()=>{ el('dNext').textContent='Geen gps-signaal';
          el('dThen').textContent='Even wachten — onder een dak vindt hij de satellieten niet'; },
    {enableHighAccuracy:true,maximumAge:2000,timeout:15000});
}

function stopDrive(){
  drive.on=false;
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
  map.easeTo({pitch:0,bearing:0,duration:500});
  if(drive.spoor.length>1) store.set('rb.spoor',drive.spoor);
}

el('goDrive').addEventListener('click',startDrive);
el('sheetDrive').addEventListener('click',startDrive);
el('dStop').addEventListener('click',stopDrive);
el('dMute').addEventListener('click',()=>{
  drive.stem=!drive.stem;
  el('dMute').textContent=drive.stem?'🔊':'🔇';
  if(!drive.stem) try{ speechSynthesis.cancel(); }catch{}
});


el('dRecenter').addEventListener('click',()=>{
  drive.volgen=true; el('dRecenter').hidden=true; naviCam();
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
    el('dTrack').textContent='↩';
    zeg('Weer op de geplande route.');
    return;
  }
  const s=drive.spoor.length>2?drive.spoor:store.get('rb.spoor',[]);
  if(s.length<3){
    el('dThen').hidden=false; el('dThen').textContent='geen spoor om over terug te rijden';
    zeg('Er is nog geen spoor om over terug te rijden.');
    return;
  }
  rijRouteUit({shape:[...s].reverse(), sec:0, man:[]});
  drive.spoorRit=true;
  el('dTrack').classList.add('on');
  el('dTrack').textContent='⤿';
  zeg('Je rijdt nu terug over je eigen spoor.');
});

/* Het verzoek om het scherm aan te houden vervalt als de telefoon op slot
   gaat. Bij terugkomen opnieuw vragen, anders valt het scherm alsnog uit. */
document.addEventListener('visibilitychange',async()=>{
  if(!drive.on || document.visibilityState!=='visible') return;
  try{ drive.lock=await navigator.wakeLock?.request('screen'); }catch{}
});

document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&drive.on) stopDrive(); });
