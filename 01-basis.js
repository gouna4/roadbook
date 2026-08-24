/* Roadbook — 01-basis.js
   Servers, opslag, wegtypen, de kaart zelf en het rekenwerk dat overal
   gebruikt wordt (bochtigheid, afstanden, Overpass). */

/* ================= servers ================= */
const VALHALLA='https://valhalla1.openstreetmap.de/route';
const NOMINATIM='https://nominatim.openstreetmap.org/search';
const PHOTON='https://photon.komoot.io/api/';
const OVERPASS_MIRRORS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

/* ================= opslag =================
   Werkt op je eigen site. In een afgeschermd voorbeeldvenster mag dit niet,
   daarom faalt alles hier stil in plaats van de app te breken. */
const store={
  get(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch{ return d; } },
  set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch{ return false; } },
  ok(){ try{ localStorage.setItem('rb.t','1'); localStorage.removeItem('rb.t'); return true; }catch{ return false; } }
};

const el=id=>document.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const state={ vias:[], viaPts:[], markers:[], pois:[], stays:[], shape:[], tourShape:[],
              fast:{shape:[],km:0,sec:0}, variants:{}, points:[], mids:[] };

/* ================= wegtypen ================= */
const LEVELS={
  1:{ name:'Kronkel', hw:0,   living:0.6, man:5,
      path:'M2 8C4 1 6 1 8 8s4 7 6 0 4-7 6 0 4 7 6 0 4-7 6 0 4 7 6 0',
      hint:'Maximaal kronkelen. Ook smalle weggetjes en door dorpjes heen.' },
  2:{ name:'Bochtig', hw:0.1, living:0.2, man:12,
      path:'M2 8C5 1 9 1 12 8s7 7 10 0 7-7 10 0c1.3 2.8 3 3.4 6 1',
      hint:'Kleine landweggetjes met veel bochten, dorpen alleen als het moet.' },
  3:{ name:'Vlot',    hw:0.3, living:0,   man:30,
      path:'M2 11c6 0 8-6 14-6s8 6 14 6c4 0 6-2 8-3',
      hint:'Doorgaande landwegen met vloeiende bochten. Dorpen worden zoveel mogelijk gemeden.' },
  4:{ name:'Recht',   hw:0.35, living:0,   man:8,
      path:'M2 8h36',
      hint:'Zo snel mogelijk over gewone wegen. Snelweg alleen als het niet anders kan.' },
  /* Stand 5 doet wat het vinkje "Snelwegen vermijden" deed, maar dan als
     stand: gewoon zo snel mogelijk, snelweg mag. Eén keuze in plaats van een
     stand plus een vinkje dat elkaar tegenspreken. */
  5:{ name:'Snel',    hw:1,   living:0,   man:5,
      path:'M2 12h12l4-8h20',
      hint:'Zo snel mogelijk naar je bestemming, snelweg mag. Voor het stuk dat gewoon weg moet.' }
};
let level=3;
const LV_COLOR={1:'#B879E0',2:'#37BFA0',3:'#E0B354',4:'#6FA8DC'};

/* ================= kaart ================= */
const EMPTY={type:'Feature',geometry:{type:'LineString',coordinates:[]}};
const BASES={
  sat:{ tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        maxzoom:19, attribution:'Beelden © Esri, Maxar, Earthstar Geographics' },
  topo:{ tiles:['https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
                'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
                'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'],
        maxzoom:17, attribution:'© OpenTopoMap (CC-BY-SA)' }
};
const map=new maplibregl.Map({
  container:'map',
  style:'https://tiles.openfreemap.org/styles/liberty',
  center:[6.2,51.3], zoom:7, attributionControl:{compact:true}
});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
map.addControl(new maplibregl.GeolocateControl({trackUserLocation:false}),'top-right');
map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');

const BASE_ORDE=['kleur','topo','sat'];
const BASE_NAAM={kleur:'Kleur',topo:'Topo',sat:'Satelliet'};
let baseGround=[], baseLabels=[], origVis={};
function setBase(kind){
  /* Onbekende waarde? Dan de kleurenkaart. Anders zetten we alle vlakken van de
     basiskaart uit zonder er iets voor terug te geven, en is de kaart zwart. */
  if(kind!=='kleur' && !BASES[kind]) kind='kleur';
  const raster = kind!=='kleur';
  /* Alle vlakken en lijnen van de basiskaart uit als er een foto onder ligt.
     Anders schijnen groene bossen en blauw water door de luchtfoto heen. */
  baseGround.forEach(id=>{ if(map.getLayer(id))
    map.setLayoutProperty(id,'visibility', raster?'none':origVis[id]); });
  baseLabels.forEach(id=>{ if(map.getLayer(id))
    map.setLayoutProperty(id,'visibility', kind==='topo'?'none':origVis[id]); });
  for(const k of Object.keys(BASES)) if(map.getLayer('base-'+k))
    map.setLayoutProperty('base-'+k,'visibility', k===kind?'visible':'none');
  /* Eén knop die doorklikt. Hij laat zien welke kaart je nú hebt. */
  /* De knop is een icoon, dus even in de statusregel zeggen wat je nu hebt. */
  el('baseCycle').title='Kaart: '+(BASE_NAAM[kind]||'Kleur')+' — tik voor de volgende';
  if(typeof setStatus==='function' && baseGround.length) setStatus('Kaart: '+(BASE_NAAM[kind]||'Kleur'));
  store.set('rb.base',kind);
}

map.on('load',()=>{
  (map.getStyle().layers||[]).forEach(l=>{
    origVis[l.id]=l.layout?.visibility||'visible';
    (l.type==='symbol'?baseLabels:baseGround).push(l.id);
  });
  const firstLabel=baseLabels[0];
  for(const [k,cfg] of Object.entries(BASES)){
    map.addSource('base-'+k,{type:'raster',tiles:cfg.tiles,tileSize:256,
      maxzoom:cfg.maxzoom,attribution:cfg.attribution});
    map.addLayer({id:'base-'+k,type:'raster',source:'base-'+k,layout:{visibility:'none'}},firstLabel);
  }
  /* Doorklikken: kleur -> topo -> satelliet -> kleur. Eén knop in plaats van
     drie, en geen rij knoppen meer die per ongeluk elkaars werk doet. */
  el('baseCycle').addEventListener('click',()=>{
    const nu=store.get('rb.base','kleur');
    setBase(BASE_ORDE[(BASE_ORDE.indexOf(nu)+1)%BASE_ORDE.length]);
  });

  map.addSource('fast',{type:'geojson',data:EMPTY});
  map.addLayer({id:'fast-case',type:'line',source:'fast',
    paint:{'line-color':'#06202F','line-width':9,'line-opacity':.7},
    layout:{'line-cap':'round','line-join':'round'}});
  map.addLayer({id:'fast-line',type:'line',source:'fast',
    paint:{'line-color':'#3FC4F0','line-width':5,'line-dasharray':[2,1.3]},
    layout:{'line-cap':'butt','line-join':'round'}});

  map.addSource('curve',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'curve-line',type:'line',source:'curve',
    layout:{visibility:'none','line-cap':'round','line-join':'round'},
    paint:{'line-width':['interpolate',['linear'],['zoom'],9,1.6,14,4.5],
      'line-opacity':.9,
      'line-color':['interpolate',['linear'],['get','c'],
        0.22,'#8FA0AC', 0.4,'#C9973F', 0.6,'#FF5A1F', 0.85,'#E02D00']}});

  map.addSource('off',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'off-line',type:'line',source:'off',
    paint:{'line-color':'#C98A4B','line-width':3.5,'line-opacity':.95,'line-dasharray':[1.4,1]},
    layout:{'line-cap':'butt','line-join':'round'}});

  map.addSource('lib',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'lib-line',type:'line',source:'lib',
    paint:{'line-color':'#B879E0','line-width':2.5,'line-opacity':.75},
    layout:{'line-cap':'round','line-join':'round'}});

  map.addSource('route',{type:'geojson',data:EMPTY});
  map.addLayer({id:'route-case',type:'line',source:'route',
    paint:{'line-color':'#07090B','line-width':9,'line-opacity':.7},
    layout:{'line-cap':'round','line-join':'round'}});
  map.addLayer({id:'route-line',type:'line',source:'route',
    paint:{'line-width':4.5,
      'line-color':['interpolate',['linear'],['coalesce',['get','c'],0],
        0,'#8FA0AC', 0.25,'#C9973F', 0.6,'#FF5A1F', 1,'#E02D00']},
    layout:{'line-cap':'round','line-join':'round'}});
  /* Onzichtbare brede lijn: hierdoor is de route makkelijk te pakken met de muis. */
  map.addLayer({id:'route-hit',type:'line',source:'route',
    paint:{'line-color':'#000','line-width':20,'line-opacity':0.01},
    layout:{'line-cap':'round','line-join':'round'}});

  /* De punten die je zelf aanwijst, met een lijn ertussen zodat je ziet welke
     weg je aan het vastleggen bent. */
  map.addSource('punten',{type:'geojson',data:EMPTY});
  map.addLayer({id:'punten-line',type:'line',source:'punten',
    paint:{'line-color':'#C9973F','line-width':2.5,'line-opacity':.9,'line-dasharray':[1.5,1.2]},
    layout:{'line-cap':'butt','line-join':'round'}});

  /* Je eigen tekening: blijft als stippellijn staan zodat je kunt zien hoe goed
     de route je vorm volgt. */
  map.addSource('teken',{type:'geojson',data:EMPTY});
  map.addLayer({id:'teken-line',type:'line',source:'teken',
    paint:{'line-color':'#B879E0','line-width':3,'line-opacity':.85,'line-dasharray':[2,1.5]},
    layout:{'line-cap':'round','line-join':'round'}});

  /* Lagen voor de rijmodus: je eigen spoor, het stuk dat je al gehad hebt,
     en de stippellijn terug naar de route als je een afslag mist. */
  map.addSource('spoor',{type:'geojson',data:EMPTY});
  map.addLayer({id:'spoor-line',type:'line',source:'spoor',
    paint:{'line-color':'#3FC4F0','line-width':3,'line-opacity':.85},
    layout:{'line-cap':'round','line-join':'round'}});

  map.addSource('gedaan',{type:'geojson',data:EMPTY});
  map.addLayer({id:'gedaan-line',type:'line',source:'gedaan',
    paint:{'line-color':'#5A646C','line-width':5,'line-opacity':.95},
    layout:{'line-cap':'round','line-join':'round'}});

  map.addSource('terug',{type:'geojson',data:EMPTY});
  map.addLayer({id:'terug-line',type:'line',source:'terug',
    paint:{'line-color':'#FF5A1F','line-width':4,'line-dasharray':[1.2,1]},
    layout:{'line-cap':'butt','line-join':'round'}});

  setBase(store.get('rb.base','kleur'));
  enableDragShaping();
});

/* ================= rekenhulp ================= */
function setStatus(msg,isErr){ const s=el('status'); s.textContent=msg||''; s.classList.toggle('err',!!isErr); }

/* Een melding over de kaart. Nodig omdat op de telefoon het paneel dichtstaat:
   wat in de statusregel komt zie je daar niet, en dan lijkt een knop stuk. */
let toastTimer=null;
function kaartMelding(tekst,fout){
  setStatus(tekst,fout);
  const t=el('toast');
  if(!t) return;
  t.textContent=tekst;
  t.classList.toggle('err',!!fout);
  t.hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ t.hidden=true; }, 5000);
}
function haversine(a,b){
  const R=6371, dLat=(b[1]-a[1])*Math.PI/180, dLon=(b[0]-a[0])*Math.PI/180;
  const la1=a[1]*Math.PI/180, la2=b[1]*Math.PI/180;
  const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function decodePolyline6(str){
  let idx=0,lat=0,lon=0; const out=[];
  while(idx<str.length){
    let shift=0,result=0,b;
    do{ b=str.charCodeAt(idx++)-63; result|=(b&0x1f)<<shift; shift+=5; }while(b>=0x20);
    lat+=(result&1)?~(result>>1):(result>>1);
    shift=0;result=0;
    do{ b=str.charCodeAt(idx++)-63; result|=(b&0x1f)<<shift; shift+=5; }while(b>=0x20);
    lon+=(result&1)?~(result>>1):(result>>1);
    out.push([lon/1e6,lat/1e6]);
  }
  return out;
}
function cumulative(shape){
  const c=[0]; for(let i=1;i<shape.length;i++) c.push(c[i-1]+haversine(shape[i-1],shape[i]));
  return c;
}
function placeAlong(shape,cum,p){
  let best=0,bd=Infinity;
  for(let i=0;i<shape.length;i++){
    const d=haversine(shape[i],[p.lon,p.lat]);
    if(d<bd){bd=d;best=i;}
  }
  return { km:cum[best], off:bd, i:best };
}
function progressAlong(a,b,p){
  const dx=b.lon-a.lon, dy=b.lat-a.lat, L=dx*dx+dy*dy;
  if(!L) return {t:0,off:haversine([a.lon,a.lat],[p.lon,p.lat])};
  const t=((p.lon-a.lon)*dx+(p.lat-a.lat)*dy)/L;
  return { t, off:haversine([a.lon+t*dx,a.lat+t*dy],[p.lon,p.lat]) };
}
function bboxOf(coords,pad){
  let s=90,w=180,n=-90,e=-180;
  for(const c of coords){ if(c[1]<s)s=c[1]; if(c[1]>n)n=c[1]; if(c[0]<w)w=c[0]; if(c[0]>e)e=c[0]; }
  return `${(s-pad).toFixed(4)},${(w-pad).toFixed(4)},${(n+pad).toFixed(4)},${(e+pad).toFixed(4)}`;
}
function coarse(shape,every=6){
  const out=shape.filter((_,i)=>i%every===0);
  if(out[out.length-1]!==shape[shape.length-1]) out.push(shape[shape.length-1]);
  return out;
}
/* Hoe laat ben je er? Vertrektijd plus rijtijd, plus een kwartier per stop
   want je stapt heus wel een keer af. */
function aankomst(sec,imported){
  if(imported||!sec) return '—';
  const [uu,mm]=(el('depTime').value||'09:00').split(':').map(Number);
  const d=new Date(); d.setHours(uu,mm,0,0);
  const pauze=(state.mids?.filter(p=>p._viaIndex!=null).length||0)*15*60;
  const eind=new Date(+d+(sec+pauze)*1000);
  const dag=eind.getDate()!==d.getDate()?' (+1)':'';
  return eind.toTimeString().slice(0,5)+dag;
}

function fmtTime(sec){
  const h=Math.floor(sec/3600), m=Math.round(sec%3600/60);
  return h?`${h}u ${m}m`:`${m}m`;
}
function bearing(a,b){
  const y=Math.sin((b[0]-a[0])*Math.PI/180)*Math.cos(b[1]*Math.PI/180);
  const x=Math.cos(a[1]*Math.PI/180)*Math.sin(b[1]*Math.PI/180)
        -Math.sin(a[1]*Math.PI/180)*Math.cos(b[1]*Math.PI/180)*Math.cos((b[0]-a[0])*Math.PI/180);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
/* ================= je plek op de route =================
   Een telefoon weet je positie tot op vijf à twintig meter. Dat is naast de
   weg. Elke navigatie plakt je daarom op de route, en dat doen wij nu ook:
   niet op het dichtstbijzijnde vormpunt, maar op het dichtstbijzijnde *stukje
   lijn* — de projectie. Dat is nauwkeurig tot op de meter.

   Dat lost twee dingen in één keer op. De pijl komt op de weg te staan. En je
   kilometerstand op de route wordt kloppend, waardoor de afstand tot de afslag
   klopt. Dat laatste ging op bochtige wegen mis: het dichtstbijzijnde vormpunt
   kan bij een haarspeld één van vóór de bocht zijn, en dan denkt de app dat je
   nog niet zo ver bent en meldt hij de afslag te laat. */
function opDeRoute(shape,cum,lat,lon,vanaf){
  if(!shape||shape.length<2) return null;
  /* Een venster rond waar je net was: goedkoop, en het voorkomt dat een stuk
     route dat later weer langs hier komt je positie wegkaapt. */
  const van=Math.max(0,(vanaf|0)-40);
  const tot=Math.min(shape.length-1,(vanaf|0)+400);
  let best=null;
  for(let i=van;i<tot;i++){
    const a={lon:shape[i][0],lat:shape[i][1]};
    const b={lon:shape[i+1][0],lat:shape[i+1][1]};
    const r=progressAlong(a,b,{lat,lon});
    const t=Math.max(0,Math.min(1,r.t));
    const px=a.lon+(b.lon-a.lon)*t, py=a.lat+(b.lat-a.lat)*t;
    const off=haversine([px,py],[lon,lat]);
    if(!best||off<best.off)
      best={ i, off, punt:[px,py], km:cum[i]+(cum[i+1]-cum[i])*t };
  }
  /* Niets gevonden in het venster? Dan de hele route afzoeken — je bent kwijt. */
  if(!best||best.off>0.5){
    for(let i=0;i<shape.length-1;i++){
      const a={lon:shape[i][0],lat:shape[i][1]};
      const b={lon:shape[i+1][0],lat:shape[i+1][1]};
      const r=progressAlong(a,b,{lat,lon});
      const t=Math.max(0,Math.min(1,r.t));
      const px=a.lon+(b.lon-a.lon)*t, py=a.lat+(b.lat-a.lat)*t;
      const off=haversine([px,py],[lon,lat]);
      if(!best||off<best.off)
        best={ i, off, punt:[px,py], km:cum[i]+(cum[i+1]-cum[i])*t };
    }
  }
  return best;
}

/* Je kilometerstand mag alleen vooruit. Zonder dit kan een haarspeld of een weg
   die terugkomt je stand laten terugvallen, en dan komt de afslagmelding te
   laat. Een flinke terugval betekent dat je echt van de route af bent; dan
   accepteren we hem wel. */
function kmVooruit(nieuw,oud){
  if(oud==null) return nieuw;
  if(nieuw>=oud) return nieuw;
  return (oud-nieuw)>1.0 ? nieuw : oud;
}

/* Hoe bochtig is één weg? Graden draaiing per kilometer, omgerekend naar een
   cijfer van 0 tot 100. Wordt gebruikt voor de bochtigheidskaart én om bij het
   plannen bochtige wegen op te zoeken. */
function wegBochtigheid(geom){
  let deg=0, km=0;
  for(let i=1;i<geom.length;i++){
    km+=haversine(geom[i-1],geom[i]);
    if(i>1){
      let t=Math.abs(bearing(geom[i-1],geom[i])-bearing(geom[i-2],geom[i-1]));
      if(t>180) t=360-t;
      deg+=t;
    }
  }
  return { km, score: km>0.4 ? Math.min(100,Math.round((deg/km)/1.7)) : 0 };
}

/* Hoeveel graden draait de weg per kilometer? Geen server nodig. */
function curveProfile(shape,seg=14){
  const features=[], spans=[]; let deg=0,km=0;
  for(let i=0;i<shape.length-2;i+=seg){
    const part=shape.slice(i,Math.min(i+seg+1,shape.length));
    if(part.length<3) continue;
    let a=0,d=0;
    for(let k=1;k<part.length;k++){
      d+=haversine(part[k-1],part[k]);
      if(k>1){ let t=Math.abs(bearing(part[k-1],part[k])-bearing(part[k-2],part[k-1]));
        if(t>180) t=360-t; a+=t; }
    }
    const c=+Math.min(1,(d>0.05?a/d:0)/170).toFixed(3);
    spans.push({from:km,to:km+d,c});
    deg+=a; km+=d;
    features.push({type:'Feature',properties:{c},geometry:{type:'LineString',coordinates:part}});
  }
  return { fc:{type:'FeatureCollection',features}, spans,
           score: km>0.5?Math.min(100,Math.round((deg/km)/1.7)):0 };
}

/* De bochtigste stukken uit de route halen, in vensters van ~12 km. */
function bestBits(spans,win=12,top=2){
  if(!spans.length) return [];
  const total=spans[spans.length-1].to;
  if(total<win*2) return [];
  const out=[];
  for(let s=0;s+win<=total;s+=win/2){
    const inside=spans.filter(x=>x.from>=s&&x.to<=s+win);
    if(inside.length<3) continue;
    const avg=inside.reduce((a,b)=>a+b.c,0)/inside.length;
    out.push({from:s,to:s+win,c:avg});
  }
  out.sort((a,b)=>b.c-a.c);
  const picked=[];
  for(const o of out){
    if(picked.length>=top) break;
    if(o.c<0.28) break;
    if(picked.some(p=>Math.abs(p.from-o.from)<win)) continue;
    picked.push(o);
  }
  return picked;
}

/* ================= Overpass ================= */
async function overpass(q,timeoutMs=16000){
  for(const url of OVERPASS_MIRRORS){
    try{
      const ctl=new AbortController();
      const t=setTimeout(()=>ctl.abort(),timeoutMs);
      const r=await fetch(url,{method:'POST',signal:ctl.signal,
        body:'data='+encodeURIComponent(q),
        headers:{'Content-Type':'application/x-www-form-urlencoded'}});
      clearTimeout(t);
      if(!r.ok) continue;
      return await r.json();
    }catch(e){}
  }
  throw new Error('De plaatsenserver is even niet bereikbaar.');
}

