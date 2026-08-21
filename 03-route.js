/* Roadbook — 03-route.js
   De route laten berekenen: gewone ritten, hele lange ritten, bos en
   water inpassen, bezienswaardigheden, foto's en alternatieve routes. */

/* ================= routeberekening ================= */
/* De routeserver geeft een foutnummer terug. Vertaal dat naar iets waar je
   wat aan hebt, in plaats van "er ging iets mis". */
function uitleg(code,ruw){
  if(code===171||code===170)
    return 'Een van je punten ligt niet bij een berijdbare weg. Sleep het bolletje dichter naar de weg toe.';
  if(code===154||code===150)
    return 'Te lang voor één berekening. Zet een tussenstop rond het midden, of kies Enkele reis in plaats van Rondje — dat scheelt de helft.';
  if(code===442||code===441)
    return 'Er is geen route mogelijk tussen deze punten. Meestal ligt er water tussen, of staat er een instelling te streng.';
  if(code===143||code===144)
    return 'Een van je punten ligt buiten het kaartgebied.';
  return 'De routeserver kon deze route niet maken'+(ruw?` (${String(ruw).slice(0,70)})`:'')+'.';
}

async function planRoute(points, mode='tour', lv=level){
  const dirt=+el('dirt').value/100;
  const L=LEVELS[lv]||LEVELS[3];
  const towns=el('avoidTowns').checked;
  /* De stand bepaalt hoeveel snelweg mag. Stand 5 laat hem helemaal vrij. */
  const hw=L.hw;
  const opts = mode==='fast'
    ? { use_highways:1, use_tolls:el('noToll').checked?0:1, use_ferry:0.5,
        use_tracks:0, use_trails:0, exclude_unpaved:1, top_speed:130 }
    : { use_highways:hw,
        use_living_streets: towns?0:L.living,
        maneuver_penalty: L.man+(towns?25:0),
        service_penalty: towns?120:15,
        service_factor: towns?1.5:1,
        use_tolls: el('noToll').checked?0:1,
        use_ferry: el('noFerry').checked?0:0.5,
        /* De schuif Onverhard zegt alles: op 0 wil je geen zandwegen. Er was
           ook nog een vinkje "Onverharde wegen" en dat was hetzelfde nog eens. */
        use_tracks: dirt,
        use_trails: dirt,
        exclude_unpaved: dirt<0.05?1:0,
        top_speed:130 };
  /* Een punt dat jij zelf op de kaart hebt aangewezen is geen stop maar een
     vormpunt: daar wil je doorrijden, niet keren, en je wil er geen
     afslag-instructie voor. Dat is in Valhalla het verschil tussen "break"
     en "through", en het scheelt enorm in hoe natuurlijk de route loopt.
     Aangewezen punten heten "50.70111, 6.25306"; een plaatsnaam is een stop. */
  const isCoord=n=>/^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(String(n||''));
  const body={ locations:points.map((p,i)=>({ lat:p.lat, lon:p.lon,
      type:(i>0 && i<points.length-1 && isCoord(p.name)) ? 'through' : 'break' })),
    costing:'motorcycle', costing_options:{motorcycle:opts},
    directions_options:{units:'kilometers'}, language:'nl-NL' };
  const r=await fetch(`${VALHALLA}?json=${encodeURIComponent(JSON.stringify(body))}`);
  let j=null;
  try{ j=await r.json(); }catch{}
  if(!r.ok||!j?.trip){
    const code=j?.error_code;
    const err=new Error(uitleg(code,j?.error));
    err.code=code;
    throw err;
  }
  /* De server nummert de vormpunten per deelstuk opnieuw, maar wij plakken de
     delen aan elkaar. Zonder deze verschuiving wijzen alle afslagen na de
     eerste tussenstop naar het begin van de rit. */
  const shape=[], man=[];
  for(const l of j.trip.legs){
    const off=shape.length;
    for(const m of (l.maneuvers||[])) man.push({...m, begin_shape_index:(m.begin_shape_index||0)+off});
    for(const c of decodePolyline6(l.shape)) shape.push(c);
  }
  return { shape, man, km:j.trip.summary.length, sec:j.trip.summary.time };
}

async function handoverPoint(start,dest,km){
  const fast=await planRoute([start,dest],'fast');
  const cum=cumulative(fast.shape), total=cum[cum.length-1];
  if(total<=km+5) return null;
  let i=cum.findIndex(d=>d>=km); if(i<0) i=fast.shape.length-1;
  const c=fast.shape[i];
  return { point:{name:'Einde snelweg',_kind:`Afslag na ${Math.round(cum[i])} km`,lat:c[1],lon:c[0]},
           shape:fast.shape.slice(0,i+1), km:cum[i], sec:fast.sec*(cum[i]/total) };
}


/* ================= hele lange ritten =================
   De gratis routeserver weigert afstanden boven een paar duizend kilometer.
   Dan knippen we de rit zelf op: om de ~700 km een tussenpunt, dat we via
   de plaatsenzoeker een naam geven, en elk deel apart laten berekenen. */
async function planLangeRit(points,lv,notes){
  const alles=[points[0]];
  const namen=[];
  for(let i=1;i<points.length;i++){
    const a=alles[alles.length-1], b=points[i];
    const d=haversine([a.lon,a.lat],[b.lon,b.lat]);
    const stukken=Math.max(1,Math.ceil(d/700));
    for(let k=1;k<stukken;k++){
      const t=k/stukken;
      const lat=a.lat+(b.lat-a.lat)*t, lon=a.lon+(b.lon-a.lon)*t;
      let naam='';
      try{ naam=await placeName([lon,lat]); }catch{}
      if(naam) namen.push(naam);
      alles.push({ name:naam||`Tussenpunt ${k}`, lat, lon, _tag:naam||'tussenpunt' });
    }
    alles.push(b);
  }
  if(alles.length===points.length) throw new Error('Deze rit is te lang voor de gratis routeserver, ook opgeknipt.');

  let shape=[], man=[], km=0, sec=0;
  for(let i=1;i<alles.length;i++){
    setStatus(`Te lang in één keer — deel ${i} van ${alles.length-1} berekenen…`);
    const r=await planRoute([alles[i-1],alles[i]],'tour',lv);
    const off=shape.length;
    shape=shape.concat(r.shape);
    (r.man||[]).forEach(m=>man.push({...m,begin_shape_index:(m.begin_shape_index||0)+off}));
    km+=r.km; sec+=r.sec;
    if(i<alles.length-1) await sleep(1100);
  }
  notes.push(namen.length
    ? `Te lang voor één berekening — opgeknipt via ${namen.slice(0,3).join(', ')}${namen.length>3?' en verder':''}.`
    : 'Te lang voor één berekening — automatisch in stukken berekend.');
  return { shape, man, km, sec };
}

/* ================= dubbel rijden en doodlopende omwegen =================
   Welk deel van de route rijd je twee keer? Punten die ver uit elkaar liggen in
   de rit maar vlak bij elkaar op de kaart, dat is dubbel rijden. */
function doubleShare(shape){
  const step=Math.max(1,Math.ceil(shape.length/500));
  const s=coarse(shape,step);
  let dubbel=0;
  for(let i=0;i<s.length;i++){
    for(let j=i+25;j<s.length;j++){
      if(haversine(s[i],s[j])<0.05){ dubbel++; break; }
    }
  }
  return s.length?dubbel/s.length:0;
}

/* Een uitstapje dat doodloopt: je komt kort na elkaar op bijna dezelfde plek. */
function hasSpur(shape){
  const step=Math.max(1,Math.ceil(shape.length/600));
  const s=coarse(shape,step);
  for(let i=0;i<s.length;i++)
    for(let j=i+12;j<Math.min(s.length,i+70);j++)
      if(haversine(s[i],s[j])<0.04) return true;
  return false;
}

/* ================= bochten opzoeken =================
   Dit is het verschil tussen bochten *meten* en bochten *zoeken*.

   De gratis routeserver kent geen bochten. Hij weet alleen: dit is een kleine
   weg, dit is een grote weg. Dus doen we het zelf: we kijken waar onze route
   saai is, halen dáár alle wegen op, meten ze door met `wegBochtigheid()`, en
   bieden de bochtigste aan als tussenstop. Daarna laat de app de route opnieuw
   berekenen en houdt hem alleen als hij écht bochtiger geworden is.

   Bergpassen krijgen voorrang. Een pas is per definitie de weg waar een
   motorrijder voor komt, en OpenStreetMap markeert die met `mountain_pass=yes`.
   Verzonnen lijstjes met "mooie wegen" gebruiken we niet — dat wordt gemeten
   uit de kaart zelf. */

/* Waar is de route saai? Aaneengesloten vlakke stukken van minstens 8 km.
   Korter dan dat is een rechte stuk tussen twee bochten en geen probleem. */
function saaieStukken(prof, minKm=8){
  const uit=[];
  let van=null, tot=0;
  for(const s of prof.spans){
    if(s.c<0.22){ if(van===null) van=s.from; tot=s.to; }
    else{ if(van!==null && tot-van>=minKm) uit.push({van,tot}); van=null; }
  }
  if(van!==null && tot-van>=minKm) uit.push({van,tot});
  /* Het langste saaie stuk eerst: daar valt het meeste te winnen. */
  return uit.sort((a,b)=>(b.tot-b.van)-(a.tot-a.van));
}

async function bochtCandidates(shape,max=3){
  const line=coarse(shape), lcum=cumulative(line), totaal=lcum[lcum.length-1];
  const saai=saaieStukken(curveProfile(shape)).slice(0,3);
  if(!saai.length) return [];

  const uit=[];
  for(const stuk of saai){
    if(uit.length>=max) break;
    /* Midden van het saaie stuk, en daar een vak van ruim 20 bij 20 km om. */
    const doel=(stuk.van+stuk.tot)/2;
    let i=lcum.findIndex(d=>d>=doel);
    if(i<0) i=line.length-1;
    const mid=line[i];
    /* Een vak van ruim 15 bij 15 km. Groter hoeft niet — kandidaten verder dan
       10 km van de route vallen toch af — en het scheelt de helft van de data.
       Bij 0,09 bij 0,14 graad kwamen er 900 elementen terug, precies de grens,
       en dan zijn er dus wegen afgekapt die we niet gezien hebben. */
    const vak=`${(mid[1]-0.07).toFixed(4)},${(mid[0]-0.11).toFixed(4)},`
             +`${(mid[1]+0.07).toFixed(4)},${(mid[0]+0.11).toFixed(4)}`;
    let j=null;
    try{
      j=await overpass(`[out:json][timeout:30][bbox:${vak}];(
        way["highway"~"^(secondary|tertiary|unclassified)$"]["access"!~"^(no|private)$"];
        node["mountain_pass"="yes"];
      );out geom 900;`,22000);
    }catch{ continue; }

    let best=null;
    for(const e of (j.elements||[])){
      let kand=null;
      if(e.type==='node' && e.tags?.mountain_pass==='yes'){
        const a=placeAlong(line,lcum,{lat:e.lat,lon:e.lon});
        if(a.off>12) continue;
        /* Een pas vlak langs je route wint altijd. Een pas ver weg moet het
           afleggen tegen een prachtige weg die er wél naast ligt: een weg komt
           hooguit aan 300 (bochtigheid 100 over 3 km of meer). */
        kand={ naam:e.tags.name||'Bergpas', lat:e.lat, lon:e.lon,
               score:100, km:0, off:a.off, atKm:a.km, pas:true,
               waarde:420-a.off*25 };
      }else{
        const g=e.geometry;
        if(!g||g.length<5) continue;
        const co=g.map(p=>[p.lon,p.lat]);
        const {km,score}=wegBochtigheid(co);
        /* Minstens 1,5 km en echt bochtig; anders is het een slinger in een dorp. */
        if(km<1.5||score<45) continue;
        const m=co[Math.floor(co.length/2)];
        const a=placeAlong(line,lcum,{lat:m[1],lon:m[0]});
        /* Niet de weg waar je al op zit, en niet zo ver dat het een uitstapje wordt. */
        if(a.off<0.4||a.off>10) continue;
        kand={ naam:e.tags?.name||e.tags?.ref||'Bochtige weg', lat:m[1], lon:m[0],
               score, km, off:a.off, atKm:a.km,
               /* lang én bochtig weegt zwaarder dan kort en bochtig */
               waarde:score*Math.min(3,km) };
      }
      if(!kand) continue;
      /* Niet vlak bij begin of eind: daar wil je gewoon weg of aankomen. */
      if(kand.atKm<totaal*0.06||kand.atKm>totaal*0.94) continue;
      if(!best||kand.waarde>best.waarde) best=kand;
    }
    if(best && !uit.some(u=>Math.abs(u.atKm-best.atKm)<20)) uit.push(best);
    await sleep(400);
  }
  return uit;
}

/* ================= plaatsen ================= */
const POI_KINDS=[['tourism','viewpoint','Uitzichtpunt'],['natural','peak','Top'],
  ['historic','castle','Kasteel'],['historic','ruins','Ruïne'],
  ['natural','waterfall','Waterval'],['tourism','attraction','Bezienswaardigheid']];

async function findPois(shape,corridor=3){
  const q=`[out:json][timeout:25][bbox:${bboxOf(shape,0.02)}];(
    node["tourism"="viewpoint"]["name"];
    node["natural"="peak"]["name"];
    node["natural"="waterfall"]["name"];
    nwr["historic"="castle"]["name"];
    nwr["historic"="ruins"]["name"];
    nwr["tourism"="attraction"]["name"];
  );out center 500;`;
  const j=await overpass(q);
  const line=coarse(shape), lcum=cumulative(line), out=[];
  for(const e of (j.elements||[])){
    const lat=e.lat??e.center?.lat, lon=e.lon??e.center?.lon;
    if(lat==null) continue;
    if(placeAlong(line,lcum,{lat,lon}).off>corridor) continue;
    const k=POI_KINDS.find(([a,b])=>e.tags?.[a]===b);
    out.push({ name:e.tags.name, lat, lon, kind:k?k[2]:'Plek', ele:e.tags.ele,
      image:e.tags.image, wikidata:e.tags.wikidata });
  }
  return out;
}

async function findStays(dest,radius=6000){
  const q=`[out:json][timeout:25];(
    nwr(around:${radius},${dest.lat},${dest.lon})["tourism"~"^(hotel|guest_house|hostel|camp_site)$"]["name"];
  );out center 60;`;
  const j=await overpass(q);
  const label={hotel:'Hotel',guest_house:'Pension',hostel:'Hostel',camp_site:'Camping'};
  return (j.elements||[]).map(e=>{
    const lat=e.lat??e.center?.lat, lon=e.lon??e.center?.lon;
    if(lat==null) return null;
    return { name:e.tags.name, lat, lon, kind:label[e.tags.tourism]||'Overnachting' };
  }).filter(Boolean).slice(0,8);
}

/* ================= hulpjes voor de route =================
   sideWaypoint verzint een punt naast de rechte lijn tussen begin en eind; dat
   is hoe een rondje en heen-en-terug hun lus krijgen. placeName vraagt hoe een
   plek heet, voor het label bij je route. */
function sideWaypoint(from,to,offKm){
  const cs=Math.cos((from.lat+to.lat)/2*Math.PI/180)||1;
  const ex=(to.lon-from.lon)*111*cs, ey=(to.lat-from.lat)*111;
  const L=Math.hypot(ex,ey)||1;
  return { lat:(from.lat+to.lat)/2 + (ex/L*offKm)/111,
           lon:(from.lon+to.lon)/2 + (-ey/L*offKm)/(111*cs) };
}
async function placeName(pt){
  try{
    const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),8000);
    const r=await fetch(`${PHOTON}reverse?lat=${pt[1].toFixed(5)}&lon=${pt[0].toFixed(5)}&limit=1`,
      {signal:ctl.signal});
    clearTimeout(t);
    if(!r.ok) return '';
    const j=await r.json(); const p=j.features?.[0]?.properties||{};
    return p.city||p.town||p.village||p.county||p.name||'';
  }catch{ return ''; }
}

/* De kleur van de route op de kaart. */
const ALT_COLORS=['#E0B354','#37BFA0','#B879E0','#6FA8DC'];
