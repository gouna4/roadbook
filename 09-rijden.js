/* Roadbook — 09-rijden.js
   De bochtigheidskaart, offroad zoeken en de rijmodus met stem. */

/* ================= bochtigheidslaag =================
   Alle wegen in beeld ophalen en zelf uitrekenen hoe bochtig ze zijn.
   Zo zie je waar de leuke wegen liggen, los van je route. */
let curveOn=false, curveBusy=false;

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
  el('offShow').classList.toggle('on',offVisible);
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
      el('noDirt').checked=false;
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
el('offShow').addEventListener('click',()=>{ offVisible=!offVisible; drawOffroad(); });
el('offRadius').addEventListener('change',saveSettings);
el('offWhere').addEventListener('change',saveSettings);

/* ================= rijmodus met stem =================
   Grote letters, gesproken afslagen, scherm blijft aan. Alles in de browser,
   niets kost geld. Bedoeld voor in de telefoonhouder. */
const drive={ on:false, watch:null, lock:null, stem:true, gezegd:new Set(), cum:null, man:null, shape:null };

function zeg(tekst){
  if(!drive.stem||!('speechSynthesis' in window)) return;
  try{
    const u=new SpeechSynthesisUtterance(tekst);
    u.lang='nl-NL'; u.rate=1.0; u.volume=1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }catch{}
}

function dichtstbij(shape,lat,lon){
  let best=0,bd=Infinity;
  for(let i=0;i<shape.length;i++){
    const d=haversine(shape[i],[lon,lat]);
    if(d<bd){ bd=d; best=i; }
  }
  return {i:best,off:bd};
}

async function startDrive(){
  const v=state.variants?.[state.shown];
  if(!v?.shape?.length){ setStatus('Plan eerst een route.',true); return; }
  if(!navigator.geolocation){ setStatus('Je browser geeft je locatie niet door.',true); return; }
  drive.shape=v.shape; drive.cum=cumulative(v.shape); drive.man=v.man||[];
  drive.gezegd.clear(); drive.on=true;
  el('drive').hidden=false;
  el('dNext').textContent='Wachten op gps…';
  el('dDist').textContent='—';
  try{ drive.lock=await navigator.wakeLock?.request('screen'); }catch{}
  zeg('Rijmodus aan. Goede rit.');
  drive.watch=navigator.geolocation.watchPosition(driveTick,
    ()=>{ el('dNext').textContent='Geen gps-signaal'; },
    {enableHighAccuracy:true,maximumAge:2000,timeout:15000});
}

function stopDrive(){
  drive.on=false;
  if(drive.watch!=null) navigator.geolocation.clearWatch(drive.watch);
  drive.watch=null;
  try{ drive.lock?.release(); }catch{}
  drive.lock=null;
  try{ speechSynthesis.cancel(); }catch{}
  el('drive').hidden=true;
}

function driveTick(pos){
  if(!drive.on) return;
  const {latitude:la,longitude:lo,speed}=pos.coords;
  const hier=dichtstbij(drive.shape,la,lo);
  const gereden=drive.cum[hier.i];
  const totaal=drive.cum[drive.cum.length-1];
  const over=Math.max(0,totaal-gereden);

  el('dSpeed').textContent=(speed!=null&&speed>=0?Math.round(speed*3.6):'—')+' km/u';
  el('dLeft').textContent=over.toFixed(0)+' km';
  const v=state.variants[state.shown];
  const restSec=v.sec?v.sec*(over/Math.max(1,v.km)):0;
  const eta=new Date(Date.now()+restSec*1000);
  el('dEta').textContent=restSec?eta.toTimeString().slice(0,5):'—';

  if(hier.off>0.25){
    el('dNext').textContent='Van de route af';
    el('dDist').textContent=hier.off<1?Math.round(hier.off*1000)+' m':hier.off.toFixed(1)+' km';
    el('dThen').textContent='Rijd terug naar je route';
    return;
  }

  const volgende=drive.man.find(m=>m.begin_shape_index>hier.i+1);
  if(!volgende){
    el('dNext').textContent=over<0.2?'Je bent er':'Rechtdoor';
    el('dDist').textContent=over.toFixed(1)+' km';
    el('dThen').textContent='';
    return;
  }
  const naar=Math.max(0,drive.cum[volgende.begin_shape_index]-gereden);
  el('dNext').textContent=(volgende.instruction||'Rechtdoor').replace(/\.$/,'');
  el('dDist').textContent=naar<1?Math.round(naar/0.01)*10+' m':naar.toFixed(1)+' km';
  const later=drive.man[drive.man.indexOf(volgende)+1];
  el('dThen').textContent=later?('Daarna: '+(later.instruction||'')):'';

  const id=volgende.begin_shape_index;
  if(naar<0.4 && !drive.gezegd.has(id+'v')){
    drive.gezegd.add(id+'v');
    zeg(`Over ${Math.round(naar*1000/50)*50} meter, ${volgende.instruction||''}`);
  }
  if(naar<0.06 && !drive.gezegd.has(id+'n')){
    drive.gezegd.add(id+'n');
    zeg('Nu ' + (volgende.instruction||''));
  }
}

el('driveBtn').addEventListener('click',startDrive);
el('dStop').addEventListener('click',stopDrive);
el('dMute').addEventListener('click',()=>{
  drive.stem=!drive.stem;
  el('dMute').textContent=drive.stem?'🔊 Stem aan':'🔇 Stem uit';
  if(!drive.stem) try{ speechSynthesis.cancel(); }catch{}
});
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&drive.on) stopDrive(); });

