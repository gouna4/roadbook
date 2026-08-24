/* Roadbook — 04-bibliotheek.js
   Soort rit, de routebibliotheek, GPX inlezen, steden mijden en
   onderweg zoeken. */

/* ================= soort rit ================= */
let tripMode='one';
const MODE_HINT={
  one:'Van A naar B.',
  back:'Heen naar je bestemming, en over andere wegen weer terug naar huis.',
  loop:'Een rondje vanaf je deur in de richting van het gebied dat je invult — heen langs de ene kant, terug langs de andere.'
};
document.querySelectorAll('#tripMode button').forEach(b=>{
  b.addEventListener('click',()=>{
    tripMode=b.dataset.m;
    document.querySelectorAll('#tripMode button').forEach(x=>x.classList.toggle('on',x===b));
    el('modeHint').textContent=MODE_HINT[tripMode];
    el('loopRow').hidden = tripMode!=='loop';
    updateDestLabel();
    el('terugHint').hidden = tripMode!=='one';
    saveSettings();
  });
});


/* ================= routebibliotheek =================
   Tientallen GPX-bestanden bewaren, gesorteerd op hoe dicht ze bij je
   vertrekpunt liggen. Zo zie je welke rit je zo kunt aanhaken. */
function libAll(){ return store.get('rb.lib',[]); }
function libSave(list){ return store.set('rb.lib',list); }

function nearestOnLib(r,pt){
  let m=Infinity;
  for(const c of r.pts){ const d=haversine(c,[pt.lon,pt.lat]); if(d<m) m=d; }
  return m;
}

function renderLib(){
  const list=libAll();
  const box=el('libList'); box.innerHTML='';
  const thuis=state.startPt;
  const rows=list.map(r=>({...r,_d:thuis?nearestOnLib(r,thuis):null}));
  if(thuis) rows.sort((a,b)=>a._d-b._d);
  if(!rows.length){
    box.innerHTML='<p class="empty">Nog geen routes. Voeg GPX-bestanden toe met de knop hierboven.</p>';
    return;
  }
  el('libHint').textContent=`${rows.length} route${rows.length>1?'s':''} bewaard.`
    +(thuis?' Gesorteerd op afstand vanaf je vertrekpunt.':' Plan een route om ze op afstand te sorteren.');
  rows.forEach(r=>{
    const d=document.createElement('div'); d.className='r';
    d.innerHTML=`<div style="min-width:0"><div class="nm">${r.name}</div>
      <div class="ds">${r.km} km · ${r.score} bocht${r._d!=null?` · ${r._d<1?'op je vertrekpunt':r._d.toFixed(0)+' km van huis'}`:''}</div></div>`;
    const acts=document.createElement('div'); acts.className='acts';
    const open=document.createElement('button'); open.className='text-btn'; open.textContent='Rijden';
    open.addEventListener('click',()=>useImported(r.pts,r.name,r.named));
    const del=document.createElement('button'); del.className='text-btn';
    del.style.color='#8D9AA4'; del.textContent='×'; del.title='Verwijderen';
    del.addEventListener('click',()=>{ libSave(libAll().filter(x=>x.id!==r.id)); renderLib(); drawLib(); });
    acts.append(open,del); d.appendChild(acts); box.appendChild(d);
  });
}

let libVisible=false;
function drawLib(){
  const feats = libVisible ? libAll().map(r=>({type:'Feature',
    properties:{id:r.id,name:r.name}, geometry:{type:'LineString',coordinates:r.pts}})) : [];
  zetBron('lib',{type:'FeatureCollection',features:feats});
  el('libShow').classList.toggle('on',libVisible);
}

el('libShow').addEventListener('click',()=>{
  libVisible=!libVisible; drawLib();
  if(libVisible&&libAll().length){
    const alle=libAll().flatMap(r=>r.pts);
    if(alle.length) map.fitBounds(alle.reduce((bb,c)=>bb.extend(c),
      new maplibregl.LngLatBounds(alle[0],alle[0])),{padding:60,duration:700});
  }
});

el('libAdd').addEventListener('click',()=>el('libFiles').click());
el('libFiles').addEventListener('change',async e=>{
  const files=[...(e.target.files||[])];
  if(!files.length) return;
  if(!store.ok()){
    setStatus('Bewaren werkt alleen op je eigen site, niet in dit voorbeeldvenster.',true);
    e.target.value=''; return;
  }
  const btn=el('libAdd'); btn.classList.add('busy');
  let ok=0, mis=0;
  const list=libAll();
  for(const f of files){
    try{
      const {pts,name,named}=parseGpx(await f.text());
      const kort=simplify(pts,0.03);
      const titel=(name==='Geopende route'?f.name.replace(/\.gpx$/i,''):name).slice(0,60);
      const item={ id:Date.now()+'-'+ok, name:titel, at:Date.now(),
        km:Math.round(cumulative(kort).slice(-1)[0]),
        score:curveProfile(kort).score,
        named:(named||[]).slice(0,40), pts:kort };
      const zonder=list.filter(x=>x.name!==titel);
      zonder.unshift(item);
      if(!libSave(zonder.slice(0,60))){
        setStatus('De opslag zit vol. Verwijder een paar routes en probeer opnieuw.',true);
        break;
      }
      list.length=0; list.push(...zonder.slice(0,60));
      ok++;
    }catch(err){ mis++; }
  }
  btn.classList.remove('busy');
  e.target.value='';
  renderLib(); drawLib();
  setStatus(`${ok} route${ok===1?'':'s'} toegevoegd${mis?`, ${mis} bestand${mis===1?'':'en'} lukte niet`:''}.`);
});

/* ================= GPX inlezen =================
   MyRoute-app, Kurviger, Komoot en Wikiloc laten je routes als GPX
   downloaden. Zo kun je andermans rit gewoon hier openen. */
function parseGpx(text){
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length) throw new Error('Dit lijkt geen geldig GPX-bestand.');
  const pick=tag=>[...doc.getElementsByTagName(tag)]
    .map(n=>[parseFloat(n.getAttribute('lon')),parseFloat(n.getAttribute('lat'))])
    .filter(c=>isFinite(c[0])&&isFinite(c[1]));
  let pts=pick('trkpt');
  if(pts.length<2) pts=pick('rtept');
  if(pts.length<2) pts=pick('wpt');
  if(pts.length<2) throw new Error('Geen routepunten in dit bestand gevonden.');
  /* MyRoute-app en Garmin zetten hun genoemde tussenpunten in <rtept>/<wpt>.
     Die zijn goud waard: dat is precies het roadbook van degene die hem maakte. */
  const named=[];
  for(const tag of ['rtept','wpt'])
    for(const n of doc.getElementsByTagName(tag)){
      const lat=parseFloat(n.getAttribute('lat')), lon=parseFloat(n.getAttribute('lon'));
      const nm=(n.getElementsByTagName('name')[0]?.textContent||'').trim();
      if(isFinite(lat)&&isFinite(lon)&&nm) named.push({name:nm,lat,lon});
    }
  const name=(doc.getElementsByTagName('name')[0]?.textContent||'').trim()||'Geopende route';
  return {pts,name,named};
}

/* Route inkorten zonder de vorm te verliezen, zodat er tientallen in je
   bibliotheek passen. 6600 punten wordt er zo ongeveer 700. */
function perpKm(p,a,b){
  const cs=Math.cos(a[1]*Math.PI/180);
  const px=(p[0]-a[0])*111*cs, py=(p[1]-a[1])*111;
  const bx=(b[0]-a[0])*111*cs, by=(b[1]-a[1])*111;
  const L=bx*bx+by*by;
  if(!L) return Math.hypot(px,py);
  let t=(px*bx+py*by)/L; t=Math.max(0,Math.min(1,t));
  return Math.hypot(px-t*bx,py-t*by);
}
function simplify(pts,tol=0.03){
  if(pts.length<3) return pts;
  const keep=new Array(pts.length).fill(false);
  keep[0]=keep[pts.length-1]=true;
  const stack=[[0,pts.length-1]];
  while(stack.length){
    const [a,b]=stack.pop();
    let idx=-1,max=0;
    for(let i=a+1;i<b;i++){ const d=perpKm(pts[i],pts[a],pts[b]); if(d>max){max=d;idx=i;} }
    if(max>tol&&idx>0){ keep[idx]=true; stack.push([a,idx],[idx,b]); }
  }
  return pts.filter((_,i)=>keep[i]).map(c=>[+c[0].toFixed(5),+c[1].toFixed(5)]);
}

function useImported(pts,name,named){
  runSeq++;
  state.fast={shape:[],km:0,sec:0}; state.mids=[];
  state.pois=[]; state.stays=[]; state.along=null; state.extraRows=[];
  clearAlong();
  const km=cumulative(pts).slice(-1)[0];
  state.variants={ imp:{ shape:pts, km, sec:0, prof:curveProfile(pts),
    color:'#E0B354', label:name.slice(0,32), imported:true } };

  const rond = haversine(pts[0],pts[pts.length-1])<2;
  /* Routebouwers zetten veel vormpunten met een straatadres als naam in het
     bestand. Die horen niet in je roadbook — alleen de plekken die iemand
     bewust heeft aangewezen. */
  const isAdres=n=>/\d{4,5}\s|\bstr\.|straße|strasse|\bstraat\b|^[A-Z]{1,2}\s?\d+\b|\d+\s*,|,\s*(Duitsland|Deutschland|Nederland|België|Belgien|France)$/i.test(n);
  const echt=(named||[]).filter(p=>!isAdres(p.name));
  const weg=(named||[]).length-echt.length;

  /* Vul de lijst links met de punten uit het bestand, zodat je de route van
     iemand anders kunt aanpassen: volgorde wisselen, punten weghalen,
     en dan zelf opnieuw laten berekenen. */
  let lijst=echt.slice(1,-1);
  if(lijst.length<2){
    /* Geen genoemde punten? Dan pakken we zelf een handvol punten van de lijn. */
    const stap=Math.max(1,Math.floor(pts.length/7));
    lijst=[];
    for(let i=stap;i<pts.length-stap;i+=stap)
      lijst.push({name:`${pts[i][1].toFixed(5)}, ${pts[i][0].toFixed(5)}`,lat:pts[i][1],lon:pts[i][0]});
  }
  lijst=lijst.slice(0,14);

  const eersteNaam=echt[0]?.name || `${pts[0][1].toFixed(5)}, ${pts[0][0].toFixed(5)}`;
  const laatsteNaam=rond ? eersteNaam
    : (echt[echt.length-1]?.name || `${pts[pts.length-1][1].toFixed(5)}, ${pts[pts.length-1][0].toFixed(5)}`);
  PICKED.set(eersteNaam,{name:eersteNaam,lat:pts[0][1],lon:pts[0][0]});
  PICKED.set(laatsteNaam,{name:laatsteNaam,lat:pts[pts.length-1][1],lon:pts[pts.length-1][0]});
  el('start').value=eersteNaam;
  el('dest').value=laatsteNaam;
  state.vias=lijst.map(p=>{ PICKED.set(p.name,{name:p.name,lat:p.lat,lon:p.lon}); return p.name; });
  manualOrder=true;   /* punten die jij aanwijst houden hun volgorde */
  renderVias();

  state.points=[
    { name:eersteNaam, lat:pts[0][1], lon:pts[0][0] },
    ...lijst.map((p,i)=>({...p,_viaIndex:i,_kind:'uit het bestand'})),
    { name:rond?'Weer thuis':laatsteNaam, lat:pts[pts.length-1][1], lon:pts[pts.length-1][0], _isDest:true }
  ];
  drawPoints();
  zetBron('fast',EMPTY);
  applyVariant('imp');
  map.fitBounds(pts.reduce((bb,c)=>bb.extend(c),new maplibregl.LngLatBounds(pts[0],pts[0])),
    {padding:60,duration:800});
  setStatus(`"${name}" geopend: ${km.toFixed(0)} km, bochtigheid ${state.variants.imp.prof.score}`
    +(weg>0?`, ${weg} straatadressen weggelaten`:'')
    +`. ${state.vias.length} punten staan in de lijst — pas ze aan en druk op Route plannen om er je eigen rit van te maken.`);
}

el('gpxOpen').addEventListener('click',()=>el('gpxFile').click());
el('gpxFile').addEventListener('change',async e=>{
  const f=e.target.files?.[0]; if(!f) return;
  try{
    const {pts,name,named}=parseGpx(await f.text());
    useImported(pts, name==='Geopende route'?f.name.replace(/\.gpx$/i,''):name, named);
  }catch(err){ setStatus(err.message,true); }
  finally{ e.target.value=''; }
});

/* ================= steden mijden =================
   Het Ruhrgebied is voor een motorrijder waardeloos: stoplichten, 50-borden,
   geen bocht te bekennen. We zoeken de grote plaatsen op en tellen per route
   hoeveel je er doorheen rijdt. De rustigste route komt vanzelf bovenaan. */
async function bigPlaces(shape){
  try{
    const q=`[out:json][timeout:25][bbox:${bboxOf(shape,0.25)}];(
      node["place"="city"]["name"];
      node["place"="town"]["name"]["population"];
    );out tags 500;`;
    const j=await overpass(q);
    return (j.elements||[]).map(e=>{
      const pop=parseInt(String(e.tags.population||'').replace(/\D/g,''),10)||0;
      if(e.tags.place==='town'&&pop<30000) return null;
      return { name:e.tags.name, lat:e.lat, lon:e.lon,
               weight:e.tags.place==='city'?2:1 };
    }).filter(Boolean);
  }catch{ return []; }
}

function urbanScore(shape,places){
  if(!places.length) return null;
  const line=coarse(shape,Math.max(1,Math.ceil(shape.length/400)));
  let score=0, hit=[];
  for(const p of places){
    let m=Infinity;
    for(const q of line){ const d=haversine(q,[p.lon,p.lat]); if(d<m) m=d; }
    if(m<4){ score+=p.weight; hit.push(p.name); }
  }
  return { score, hit };
}

/* ================= onderweg zoeken ================= */
const ALONG={
  fuel:{ label:'Tanken',    color:'#F2C14E', tag:'["amenity"="fuel"]', naam:'Tankstation' },
  food:{ label:'Eten',      color:'#E8705A', tag:'["amenity"~"^(restaurant|fast_food|biergarten)$"]', naam:'Eten' },
  cafe:{ label:'Koffie',    color:'#C58F6A', tag:'["amenity"~"^(cafe|ice_cream)$"]', naam:'Koffie' },
  moto:{ label:'Motorzaak', color:'#7FA0C4', tag:'["shop"~"^(motorcycle|motorcycle_repair|motorcycle_parts)$"]', naam:'Motorzaak' }
};

async function findAlong(kind,shape,corridor=2.5){
  const c=ALONG[kind];
  /* Geen ["name"] eisen: veel tankstations staan alleen met hun merk in OSM. */
  const q=`[out:json][timeout:25][bbox:${bboxOf(shape,0.02)}];(
    nwr${c.tag};
  );out center 600;`;
  const j=await overpass(q);
  const line=coarse(shape), lcum=cumulative(line), out=[];
  for(const e of (j.elements||[])){
    const lat=e.lat??e.center?.lat, lon=e.lon??e.center?.lon;
    if(lat==null||!e.tags) continue;
    const a=placeAlong(line,lcum,{lat,lon});
    if(a.off>corridor) continue;
    out.push({ name:e.tags.name||e.tags.brand||e.tags.operator||c.naam,
      lat, lon, kind:c.naam, atKm:a.km, off:a.off,
      brand:(e.tags.brand&&e.tags.brand!==e.tags.name)?e.tags.brand:'',
      open:e.tags.opening_hours||'' });
  }
  return out.sort((a,b)=>a.atKm-b.atKm);
}

