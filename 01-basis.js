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
  4:{ name:'Recht',   hw:0.6, living:0,   man:8,
      path:'M2 8h36',
      hint:'Zo snel mogelijk over gewone wegen.' }
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

let baseGround=[], baseLabels=[], origVis={};
function setBase(kind){
  const raster = kind!=='kleur';
  /* Alle vlakken en lijnen van de basiskaart uit als er een foto onder ligt.
     Anders schijnen groene bossen en blauw water door de luchtfoto heen. */
  baseGround.forEach(id=>{ if(map.getLayer(id))
    map.setLayoutProperty(id,'visibility', raster?'none':origVis[id]); });
  baseLabels.forEach(id=>{ if(map.getLayer(id))
    map.setLayoutProperty(id,'visibility', kind==='topo'?'none':origVis[id]); });
  for(const k of Object.keys(BASES)) if(map.getLayer('base-'+k))
    map.setLayoutProperty('base-'+k,'visibility', k===kind?'visible':'none');
  document.querySelectorAll('.layers button').forEach(b=>b.classList.toggle('on',b.dataset.base===kind));
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
  document.querySelectorAll('.layers button').forEach(b=>
    b.addEventListener('click',()=>setBase(b.dataset.base)));

  map.addSource('fast',{type:'geojson',data:EMPTY});
  map.addLayer({id:'fast-case',type:'line',source:'fast',
    paint:{'line-color':'#06202F','line-width':9,'line-opacity':.7},
    layout:{'line-cap':'round','line-join':'round'}});
  map.addLayer({id:'fast-line',type:'line',source:'fast',
    paint:{'line-color':'#3FC4F0','line-width':5,'line-dasharray':[2,1.3]},
    layout:{'line-cap':'butt','line-join':'round'}});

  map.addSource('ridden',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'ridden-line',type:'line',source:'ridden',
    paint:{'line-color':'#6B8F71','line-width':5,'line-opacity':.5},
    layout:{'line-cap':'round','line-join':'round'}});

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

  map.addSource('alts',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'alts-line',type:'line',source:'alts',
    paint:{'line-width':3,'line-opacity':.9,
      'line-color':['match',['get','lv'],1,'#B879E0',2,'#37BFA0',3,'#E0B354',4,'#6FA8DC','#888']},
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

