/* Roadbook — 08-onderweg.js
   Weer en aankomsttijd, afslagen, hoogteprofiel, delen via link, het
   rittenlogboek en al gereden wegen. */

/* ================= weer onderweg =================
   Open-Meteo is gratis en heeft geen sleutel nodig. In één aanvraag halen we
   het weer op voor vertrek, halverwege en aankomst, op het juiste tijdstip. */
const WMO={0:['helder','☀'],1:['bijna helder','🌤'],2:['half bewolkt','⛅'],3:['bewolkt','☁'],
  45:['mist','🌫'],48:['ijzel-mist','🌫'],51:['motregen','🌦'],53:['motregen','🌦'],55:['motregen','🌦'],
  56:['ijzelregen','🌧'],57:['ijzelregen','🌧'],61:['lichte regen','🌧'],63:['regen','🌧'],65:['zware regen','🌧'],
  66:['ijzelregen','🌧'],67:['ijzelregen','🌧'],71:['lichte sneeuw','🌨'],73:['sneeuw','🌨'],75:['zware sneeuw','🌨'],
  77:['korrelsneeuw','🌨'],80:['buien','🌦'],81:['buien','🌦'],82:['zware buien','⛈'],
  85:['sneeuwbuien','🌨'],86:['sneeuwbuien','🌨'],95:['onweer','⛈'],96:['onweer met hagel','⛈'],99:['onweer met hagel','⛈']};

function klok(d){ return d.toTimeString().slice(0,5); }
function uurSleutel(d){
  const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}

async function showWeather(){
  const box=el('wx');
  const v=state.variants?.[state.shown];
  if(!v||!state.shape?.length||v.imported){ box.hidden=true; return; }
  const sh=state.shape;
  const punten=[sh[0], sh[Math.floor(sh.length/2)], sh[sh.length-1]];
  const totaal=state.fast.sec+v.sec;
  const [uu,mm]=(el('depTime').value||'09:00').split(':').map(Number);
  const vertrek=new Date(); vertrek.setHours(uu,mm,0,0);
  if(vertrek<new Date()-3600000) vertrek.setDate(vertrek.getDate()+1);
  const tijden=[vertrek, new Date(+vertrek+totaal*500), new Date(+vertrek+totaal*1000)];
  try{
    const u=`https://api.open-meteo.com/v1/forecast`
      +`?latitude=${punten.map(p=>p[1].toFixed(3)).join(',')}`
      +`&longitude=${punten.map(p=>p[0].toFixed(3)).join(',')}`
      +`&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m`
      +`&forecast_days=3&timezone=auto`;
    const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),9000);
    const r=await fetch(u,{signal:ctl.signal}); clearTimeout(t);
    if(!r.ok) throw 0;
    let j=await r.json();
    if(!Array.isArray(j)) j=[j];
    const namen=['Vertrek','Halverwege','Aankomst'];
    box.innerHTML='';
    j.slice(0,3).forEach((loc,i)=>{
      const h=loc.hourly; if(!h) return;
      let k=h.time.indexOf(uurSleutel(tijden[i]));
      if(k<0) k=0;
      const code=h.weather_code[k], w=WMO[code]||['',''];
      const d=document.createElement('div');
      d.innerHTML=`<span>${namen[i]} ${klok(tijden[i])}</span>
        <strong>${Math.round(h.temperature_2m[k])}° ${w[1]}</strong>
        <em>${w[0]}${h.precipitation_probability?.[k]!=null?` · ${h.precipitation_probability[k]}% regen`:''}`
        +`${h.wind_speed_10m?.[k]!=null?` · ${Math.round(h.wind_speed_10m[k])} km/u wind`:''}</em>`;
      box.appendChild(d);
    });
    box.hidden=!box.children.length;
  }catch{ box.hidden=true; }
}
el('depTime').addEventListener('change',()=>{
  saveSettings(); showWeather();
  const v=state.variants?.[state.shown];
  if(v) el('sumEta').textContent=aankomst(state.fast.sec+v.sec,v.imported);
});
el('checkDist').addEventListener('change',saveSettings);
function loopVeld(){
  const aan=el('loopOn').checked;
  el('loopKm').disabled=!aan;
  el('loopHint').textContent = aan
    ? 'Hij past de lus net zo lang aan tot hij ongeveer op die afstand uitkomt.'
    : 'Zonder vinkje maakt hij gewoon een mooie lus naar dat gebied en terug, zo lang als het uitkomt.';
}
el('loopOn').addEventListener('change',()=>{ loopVeld(); saveSettings(); });
loopVeld();


/* ================= afslagen tonen ================= */
function renderTurns(){
  const v=state.variants?.[state.shown];
  const box=el('turnList');
  if(!v?.man?.length){ el('turnBlock').hidden=true; return; }
  el('turnBlock').hidden=false;
  box.className='rows turns'; box.innerHTML='';
  let km=state.fast.km;
  v.man.forEach(m=>{
    const d=document.createElement('div'); d.className='r';
    d.innerHTML=`<div class="km">${km.toFixed(0)} km</div>
      <div class="tx">${(m.instruction||'').replace(/</g,'&lt;')}</div>`;
    d.addEventListener('click',()=>{
      const i=m.begin_shape_index;
      if(i!=null&&v.shape[i]) map.flyTo({center:v.shape[i],zoom:14});
    });
    d.style.cursor='pointer';
    box.appendChild(d);
    km+=m.length||0;
  });
}


/* ================= hoogteprofiel =================
   Valhalla kan de hoogte van punten teruggeven. Gratis, zelfde server. */
async function showElevation(){
  const box=el('elevBox');
  const v=state.variants?.[state.shown];
  if(!v||!state.shape?.length){ box.hidden=true; return; }
  const sh=state.shape;
  const step=Math.max(1,Math.ceil(sh.length/180));
  const punten=sh.filter((_,i)=>i%step===0);
  if(punten[punten.length-1]!==sh[sh.length-1]) punten.push(sh[sh.length-1]);
  if(punten.length<5){ box.hidden=true; return; }
  try{
    const body={ range:true, shape:punten.map(c=>({lat:+c[1].toFixed(5),lon:+c[0].toFixed(5)})) };
    const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),12000);
    const r=await fetch(`https://valhalla1.openstreetmap.de/height?json=${encodeURIComponent(JSON.stringify(body))}`,
      {signal:ctl.signal});
    clearTimeout(t);
    if(!r.ok) throw 0;
    const j=await r.json();
    const rh=j.range_height;
    if(!Array.isArray(rh)||rh.length<5) throw 0;
    const hs=rh.map(x=>x[1]).filter(h=>h!=null&&h>-500);
    if(hs.length<5) throw 0;
    const lo=Math.min(...hs), hi=Math.max(...hs), span=Math.max(30,hi-lo);
    let klim=0, daal=0;
    for(let i=1;i<rh.length;i++){
      const d=(rh[i][1]??0)-(rh[i-1][1]??0);
      if(d>0) klim+=d; else daal-=d;
    }
    const W=360,H=72,n=rh.length;
    const x=i=>i/(n-1)*W;
    const y=h=>H-4-((h-lo)/span)*(H-12);
    let pad=`M0 ${H} L${rh.map((p,i)=>`${x(i).toFixed(1)} ${y(p[1]??lo).toFixed(1)}`).join(' L')} L${W} ${H} Z`;
    let lijn=`M${rh.map((p,i)=>`${x(i).toFixed(1)} ${y(p[1]??lo).toFixed(1)}`).join(' L')}`;
    el('elevSvg').innerHTML=
      `<defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0" stop-color="#C9973F" stop-opacity=".45"/>
         <stop offset="1" stop-color="#C9973F" stop-opacity="0"/></linearGradient></defs>
       <path d="${pad}" fill="url(#eg)"/>
       <path d="${lijn}" fill="none" stroke="#C9973F" stroke-width="1.6"
             vector-effect="non-scaling-stroke"/>`;
    el('elevInfo').textContent=`↑ ${Math.round(klim)} m · ↓ ${Math.round(daal)} m · hoogste ${Math.round(hi)} m`;
    box.hidden=false;
  }catch{ box.hidden=true; }
}

/* ================= route delen ================= */
function shareData(){
  const co={};
  [el('start').value,el('dest').value,...state.vias].forEach(t=>{
    const p=PICKED.get(t); if(p) co[t]=[+p.lat.toFixed(5),+p.lon.toFixed(5)];
  });
  return { s:el('start').value, d:el('dest').value, v:state.vias, m:tripMode,
           l:level, t:el('depTime').value, k:el('loopKm').value, c:co,
           o:{ nh:el('noHighway').checked, at:el('avoidTowns').checked,
               nr:el('noRepeat').checked, nd:el('noDirt').checked,
               tl:el('noToll').checked, fy:el('noFerry').checked },
           dt:el('dirt').value, sp:el('sprintKm').value, mo:manualOrder };
}
function makeShareLink(){
  const raw=JSON.stringify(shareData());
  const b64=btoa(unescape(encodeURIComponent(raw))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return location.origin+location.pathname+'#r='+b64;
}
function applyShared(b64){
  try{
    const raw=decodeURIComponent(escape(atob(b64.replace(/-/g,'+').replace(/_/g,'/'))));
    const j=JSON.parse(raw);
    Object.entries(j.c||{}).forEach(([k,v])=>PICKED.set(k,{name:k.split(',')[0],lat:v[0],lon:v[1]}));
    el('start').value=j.s||''; el('dest').value=j.d||'';
    state.vias=Array.isArray(j.v)?j.v:[];
    level=j.l||3;
    document.querySelectorAll('#levels button').forEach(b=>b.classList.toggle('on',+b.dataset.v===level));
    el('levelHint').textContent=LEVELS[level].hint;
    tripMode=j.m||'one';
    document.querySelectorAll('#tripMode button').forEach(b=>b.classList.toggle('on',b.dataset.m===tripMode));
    el('loopRow').hidden=tripMode!=='loop';
    el('terugHint').hidden=tripMode!=='one';
    if(j.t) el('depTime').value=j.t;
    if(j.k) el('loopKm').value=j.k;
    if(j.dt!=null){ el('dirt').value=j.dt; el('dirtVal').textContent=j.dt; }
    if(j.sp!=null) el('sprintKm').value=j.sp;
    const o=j.o||{};
    el('noHighway').checked=!!o.nh; el('avoidTowns').checked=!!o.at;
    el('noRepeat').checked=!!o.nr; el('noDirt').checked=!!o.nd;
    el('noToll').checked=!!o.tl; el('noFerry').checked=!!o.fy;
    manualOrder=!!j.mo; el('manualOrder').checked=manualOrder;
    renderVias();
    setStatus('Gedeelde route geopend — even berekenen…');
    plan();
    return true;
  }catch{ return false; }
}
el('share').addEventListener('click',async()=>{
  if(!state.startPt){ setStatus('Plan eerst een route.',true); return; }
  const link=makeShareLink();
  try{
    if(navigator.share){ await navigator.share({title:'Mijn motorroute',url:link}); return; }
    await navigator.clipboard.writeText(link);
    setStatus('Link gekopieerd — plak hem in WhatsApp en je maat opent precies jouw route.');
  }catch{
    prompt('Kopieer deze link:',link);
  }
});





/* ================= rittenlogboek =================
   Wat je gereden hebt onthouden, met de lijn erbij. Daarmee kan de app
   later zien of een nieuwe route over oud terrein gaat. */
function logAll(){ return store.get('rb.log',[]); }
function logSave(l){ return store.set('rb.log',l); }

function logRide(naam,shape,km,score){
  if(!store.ok()){ setStatus('Bewaren werkt alleen op je eigen site.',true); return false; }
  const kort=simplify(shape,0.05);
  const item={ id:Date.now(), at:Date.now(), naam:naam.slice(0,60),
    km:Math.round(km), score, pts:kort };
  const l=logAll(); l.unshift(item);
  if(!logSave(l.slice(0,80))){ setStatus('De opslag zit vol. Verwijder een paar ritten.',true); return false; }
  renderLog(); drawRidden();
  return true;
}

function renderLog(){
  const l=logAll();
  const box=el('logList'); box.innerHTML='';
  const perJaar={};
  l.forEach(r=>{ const j=new Date(r.at).getFullYear(); perJaar[j]=(perJaar[j]||0)+r.km; });
  const tot=l.reduce((a,b)=>a+b.km,0);
  el('logTotals').textContent = l.length
    ? `${l.length} ritten · ${tot} km in totaal · ` +
      Object.entries(perJaar).sort((a,b)=>b[0]-a[0]).map(([j,k])=>`${j}: ${k} km`).join(' · ')
    : 'Nog niets gereden. Plan een route en druk op "Deze rit is gereden".';
  l.forEach(r=>{
    const d=document.createElement('div'); d.className='r';
    const wanneer=new Date(r.at).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'});
    d.innerHTML=`<div style="min-width:0"><div class="nm">${r.naam}</div>
      <div class="ds">${wanneer} · ${r.km} km · ${r.score} bocht</div></div>`;
    const acts=document.createElement('div'); acts.className='acts';
    const open=document.createElement('button'); open.className='text-btn'; open.textContent='Openen';
    open.addEventListener('click',()=>useImported(r.pts,r.naam,null));
    const del=document.createElement('button'); del.className='text-btn';
    del.style.color='#8D9AA4'; del.textContent='×';
    del.addEventListener('click',()=>{ logSave(logAll().filter(x=>x.id!==r.id)); renderLog(); drawRidden(); });
    acts.append(open,del); d.appendChild(acts); box.appendChild(d);
  });
}

el('logAdd').addEventListener('click',()=>{
  const v=state.variants?.[state.shown];
  if(!v||!state.shape?.length){ setStatus('Plan of open eerst een route.',true); return; }
  const naam=`${state.points[0]?.name||'?'} → ${state.points[state.points.length-1]?.name||'?'}`;
  if(logRide(naam,state.shape,state.fast.km+v.km,v.prof.score))
    setStatus(`"${naam}" in je logboek gezet. Vanaf nu telt hij mee bij "wegen die ik al reed".`);
});

/* ================= al gereden wegen ================= */
let riddenOn=false;
function riddenShapes(){ return logAll().map(r=>r.pts).filter(p=>p&&p.length>3); }

/* Welk deel van deze route heb je al eens gereden? */
function riddenShare(shape){
  const oud=riddenShapes();
  if(!oud.length) return 0;
  const punten=coarse(shape,Math.max(1,Math.ceil(shape.length/220)));
  let raak=0;
  for(const p of punten){
    let dicht=false;
    for(const r of oud){
      for(let i=0;i<r.length;i+=2){ if(haversine(r[i],p)<0.08){ dicht=true; break; } }
      if(dicht) break;
    }
    if(dicht) raak++;
  }
  return punten.length?raak/punten.length:0;
}

function drawRidden(){
  const src=map.getSource('ridden');
  if(!src) return;
  src.setData({ type:'FeatureCollection', features: riddenOn
    ? riddenShapes().map(p=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:p}})) : [] });
  el('riddenToggle').classList.toggle('on',riddenOn);
}
el('riddenToggle').addEventListener('click',()=>{
  riddenOn=!riddenOn; drawRidden();
  if(riddenOn && !riddenShapes().length)
    setStatus('Je logboek is nog leeg — zet eerst een rit op "gereden".');
});

