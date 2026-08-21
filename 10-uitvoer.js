/* Roadbook — 10-uitvoer.js
   Roadbook afdrukken, GPX uitvoeren en routes bewaren. */

/* ================= roadbook afdrukken ================= */
function printRoadbook(){
  const v=state.variants?.[state.shown];
  if(!v){ setStatus('Plan eerst een route.',true); return; }
  const rijen=[...el('roadbook').querySelectorAll('.stop')].map(d=>({
    km:d.querySelector('.km')?.textContent||'',
    t:d.querySelector('.title')?.textContent||'',
    k:d.querySelector('.kind')?.textContent||''
  }));
  const afslagen=(v.man||[]).map((m,i)=>({i,t:m.instruction||'',l:m.length||0}));
  let km=state.fast.km;
  const afsRijen=afslagen.map(a=>{ const r=`${km.toFixed(0)} km|${a.t}`; km+=a.l; return r; });
  const naam=`${state.points[0]?.name||''} → ${state.points[state.points.length-1]?.name||''}`;
  const w=window.open('','_blank');
  if(!w){ setStatus('Sta pop-ups toe om af te drukken.',true); return; }
  w.document.write(`<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">
  <title>${naam}</title><style>
    @page{margin:14mm}
    body{font:12px/1.45 -apple-system,system-ui,sans-serif;color:#111}
    h1{font-size:19px;margin:0 0 3px}
    .sub{color:#666;margin-bottom:14px;font-size:12px}
    h2{font-size:13px;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.08em;color:#444}
    table{width:100%;border-collapse:collapse}
    td{padding:4px 6px;border-bottom:1px solid #e5e5e5;vertical-align:top}
    td.km{width:62px;color:#a06b12;font-variant-numeric:tabular-nums;white-space:nowrap}
    td.sm{color:#666;font-size:11px}
    tr{break-inside:avoid}
  </style></head><body>
  <h1>${naam}</h1>
  <div class="sub">${(state.fast.km+v.km).toFixed(0)} km · bochtigheid ${v.prof.score}/100${v.sec?` · ${fmtTime(state.fast.sec+v.sec)}`:''}</div>
  <h2>Roadbook</h2><table>${rijen.map(r=>
    `<tr><td class="km">${r.km}</td><td><b>${r.t}</b><div class="sm">${r.k}</div></td></tr>`).join('')}</table>
  ${afsRijen.length?`<h2>Afslagen</h2><table>${afsRijen.map(r=>{
    const [a,b]=r.split('|');
    return `<tr><td class="km">${a}</td><td>${b}</td></tr>`;}).join('')}</table>`:''}
  </body></html>`);
  w.document.close();
  setTimeout(()=>{ w.focus(); w.print(); },400);
}
el('printBtn').addEventListener('click',printRoadbook);

/* ================= GPX ================= */
el('gpx').addEventListener('click',()=>{
  if(!state.shape.length) return;
  const esc=s=>String(s).replace(/[<>&'"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
  const naam=`${state.points[0].name} – ${state.points[state.points.length-1].name}`;
  const max=Math.max(3,Math.min(80,+el('gpxPts').value||30));

  /* TomTom en Garmin slikken maar een beperkt aantal vormpunten. Jouw eigen
     stops houden we altijd; de rest vullen we aan met punten van de lijn,
     netjes verdeeld, zodat het toestel je route niet herberekent naar de snelweg. */
  const cum=cumulative(state.shape), totaal=cum[cum.length-1];
  const vast=state.points.map(p=>({lat:p.lat,lon:p.lon,name:p.name,
    km:placeAlong(coarse(state.shape),cumulative(coarse(state.shape)),p).km}));
  const extra=Math.max(0,max-vast.length);
  const vul=[];
  for(let i=1;i<=extra;i++){
    const doel=totaal*i/(extra+1);
    let k=cum.findIndex(d=>d>=doel); if(k<0) k=state.shape.length-1;
    if(vast.some(p=>Math.abs(p.km-doel)<totaal/(max*2))) continue;
    vul.push({lat:state.shape[k][1],lon:state.shape[k][0],name:'',km:doel});
  }
  const punten=[...vast,...vul].sort((a,b)=>a.km-b.km);

  const step=Math.max(1,Math.ceil(state.shape.length/2000));
  const trk=state.shape.filter((_,i)=>i%step===0||i===state.shape.length-1)
    .map(c=>`<trkpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}"/>`).join('');
  const rte=punten.map((p,i)=>
    `<rtept lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><name>${esc(p.name||('Punt '+(i+1)))}</name></rtept>`).join('');
  const wpt=[...state.pois,...state.stays,...(state.along||[])].map(p=>
    `<wpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><name>${esc(p.name)}</name><desc>${esc(p.kind||'')}</desc></wpt>`).join('');
  const gpx=`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Roadbook" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${esc(naam)}</name></metadata>
${wpt}
<rte><name>${esc(naam)}</name>${rte}</rte>
<trk><name>${esc(naam)}</name><trkseg>${trk}</trkseg></trk>
</gpx>`;
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([gpx],{type:'application/gpx+xml'}));
  a.download=naam.replace(/[^\w\s–-]/g,'').replace(/\s+/g,'_')+'.gpx';
  a.click(); URL.revokeObjectURL(a.href);
  setStatus(`GPX opgeslagen met ${punten.length} vormpunten en ${(state.pois.length+state.stays.length)} plaatsen.`);
});

/* ================= bewaren ================= */
function settings(){
  return { level, dirt:el('dirt').value, sprint:el('sprintKm').value,
    noHighway:el('noHighway').checked, avoidTowns:el('avoidTowns').checked,
    noRepeat:el('noRepeat').checked, noDirt:el('noDirt').checked, noRidden:el('noRidden').checked,
    noToll:el('noToll').checked, noFerry:el('noFerry').checked,
    findScenic:el('findScenic').checked, findPois:el('findPois').checked,
    findStays:el('findStays').checked, showPhotos:el('showPhotos').checked,
    tankKm:el('tankKm').value, tripMode, loopKm:el('loopKm').value,
    manualOrder:el('manualOrder').checked, depTime:el('depTime').value,
    checkDist:el('checkDist').checked, loopOn:el('loopOn').checked,
    findCurvy:el('findCurvy').checked, offRadius:el('offRadius').value, offWhere:el('offWhere').value,
    gpxPts:el('gpxPts').value };
}
function applySettings(s){
  if(!s) return;
  level=s.level||3;
  document.querySelectorAll('#levels button').forEach(b=>b.classList.toggle('on',+b.dataset.v===level));
  el('levelHint').textContent=LEVELS[level].hint;
  if(s.dirt!=null){ el('dirt').value=s.dirt; el('dirtVal').textContent=s.dirt; }
  if(s.sprint!=null) el('sprintKm').value=s.sprint;
  if(s.tankKm!=null) el('tankKm').value=s.tankKm;
  if(s.loopKm!=null) el('loopKm').value=s.loopKm;
  if(s.loopOn!=null){ el('loopOn').checked=!!s.loopOn; if(typeof loopVeld==='function') loopVeld(); }
  if(s.gpxPts!=null) el('gpxPts').value=s.gpxPts;
  if(s.offRadius!=null) el('offRadius').value=s.offRadius;
  if(s.offWhere!=null) el('offWhere').value=s.offWhere;
  if(s.manualOrder!=null){ el('manualOrder').checked=!!s.manualOrder; manualOrder=!!s.manualOrder; }
  if(s.tripMode){
    tripMode=s.tripMode;
    document.querySelectorAll('#tripMode button').forEach(b=>b.classList.toggle('on',b.dataset.m===tripMode));
    el('modeHint').textContent=MODE_HINT[tripMode];
    el('loopRow').hidden = tripMode!=='loop';
    updateDestLabel();
    el('terugHint').hidden = tripMode!=='one';
  }
  ['noHighway','avoidTowns','noRepeat','noDirt','noRidden','noToll','noFerry','findScenic','findPois','findStays','showPhotos','checkDist','findCurvy']
    .forEach(k=>{ if(s[k]!=null) el(k).checked=!!s[k]; });
}
function saveSettings(){ store.set('rb.set',{...settings(),start:el('start').value,dest:el('dest').value,vias:state.vias}); }
function saveLast(){
  store.set('rb.last',{ start:el('start').value, dest:el('dest').value, vias:[...state.vias],
    pts:{start:state.startPt,dest:state.destPt,vias:state.viaPts}, set:settings() });
  saveSettings();
}

function renderSaved(){
  const list=store.get('rb.routes',[]);
  const box=el('savedList'); box.innerHTML='';
  el('savedBlock').hidden=!list.length;
  list.forEach(s=>{
    const d=document.createElement('div'); d.className='r';
    const when=new Date(s.at).toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
    d.innerHTML=`<div><div class="nm">${s.name}</div>
      <div class="ds">${s.km?s.km+' km · ':''}${LEVELS[s.set?.level||3].name} · ${when}</div></div>`;
    const acts=document.createElement('div'); acts.className='acts';
    const open=document.createElement('button'); open.className='text-btn'; open.textContent='Openen';
    open.addEventListener('click',()=>loadSaved(s));
    const del=document.createElement('button'); del.className='text-btn';
    del.style.color='#8D9AA4'; del.textContent='×'; del.title='Verwijderen';
    del.addEventListener('click',()=>{
      store.set('rb.routes',store.get('rb.routes',[]).filter(x=>x.id!==s.id)); renderSaved();
    });
    acts.append(open,del); d.appendChild(acts); box.appendChild(d);
  });
}

function loadSaved(s){
  if(s.pts?.start) PICKED.set(s.start,s.pts.start);
  if(s.pts?.dest) PICKED.set(s.dest,s.pts.dest);
  (s.vias||[]).forEach((v,i)=>{ if(s.pts?.vias?.[i]) PICKED.set(v,s.pts.vias[i]); });
  el('start').value=s.start||''; el('dest').value=s.dest||'';
  state.vias=[...(s.vias||[])]; renderVias();
  applySettings(s.set);
  plan();
}

el('save').addEventListener('click',()=>{
  if(!state.startPt||!state.destPt) return;
  if(!store.ok()){
    setStatus('Bewaren werkt alleen op je eigen site, niet in dit voorbeeldvenster.',true);
    return;
  }
  const v=state.variants[state.shown];
  const item={ id:Date.now(), at:Date.now(),
    name:`${state.startPt.name} → ${state.destPt.name}`,
    km: v?Math.round(state.fast.km+v.km):null,
    start:el('start').value, dest:el('dest').value, vias:[...state.vias],
    pts:{start:state.startPt,dest:state.destPt,vias:state.viaPts}, set:settings() };
  const list=store.get('rb.routes',[]).filter(x=>x.name!==item.name);
  list.unshift(item);
  store.set('rb.routes',list.slice(0,15));
  renderSaved();
  setStatus(`"${item.name}" bewaard.`);
});

/* Wissen zit op twee knoppen: in de balk onderaan en op de greep van het
   bodemblad. Op de telefoon is die greep het enige wat je ziet als het blad
   dicht is, dus daar hoort hij ook te staan. */
function alsWissen(){
  clearMarkers(); runSeq++;
  if(typeof tekenWis==='function') tekenWis();
  el('goDrive').hidden=true; el('sheetDrive').hidden=true;
  if(typeof stapKlaarTekens==='function') stapKlaarTekens();
  state.shape=[]; state.tourShape=[]; state.pois=[]; state.stays=[];
  state.vias=[]; state.variants={}; state.mids=[]; state.fast={shape:[],km:0,sec:0};
  renderVias();
  map.getSource('route').setData(EMPTY); map.getSource('fast').setData(EMPTY);
  el('summary').hidden=true; el('exports').hidden=true; el('legend').hidden=true;
  el('altBlock').hidden=true; el('tourBlock').hidden=true; el('routeList').innerHTML='';
  el('alongList').innerHTML='';
  clearAlong(); state.along=null; state.extraRows=[]; state.variants={}; state.shown=null;
  document.querySelectorAll('#alongChips button').forEach(b=>b.classList.remove('on'));
  el('roadbook').innerHTML='<p class="empty">Vul vertrek en bestemming in en plan je route. Tik op de kaart om ergens een tussenstop neer te zetten, of sleep de route zelf een andere kant op.</p>';
  setStatus('');
  el('sheetInfo').textContent='Plan je rit';
}
el('clear').addEventListener('click',alsWissen);
el('sheetClear').addEventListener('click',alsWissen);


/* ================= route in je zak =================
   De lijn en de afslagen los opslaan, zodat je onderweg de app kunt afsluiten
   — of je telefoon opnieuw kan opstarten — en tóch verder kunt rijden. Een
   route berekenen heeft internet nodig; hem rijden niet meer.

   De afslagen worden opgeslagen als "hoeveel kilometer vanaf het begin" en
   niet als vormpunt-nummer. Daardoor blijven ze kloppen, ook als de lijn
   uitgedund moet worden om in de opslag te passen. */
function ritOpslaan(){
  const v=state.variants?.[state.shown];
  if(!v?.shape?.length || typeof afslagen!=='function') return;
  const cum=cumulative(v.shape);
  const rit={ at:Date.now(),
    naam:((el('start').value||'Vertrek')+' → '+(el('dest').value||'Bestemming')).slice(0,70),
    km:+cum[cum.length-1].toFixed(1), sec:v.sec||0,
    shape:v.shape.map(c=>[+c[0].toFixed(5),+c[1].toFixed(5)]),
    man:afslagen(v,cum).map(m=>({km:+m.km.toFixed(3),tekst:m.tekst})) };

  if(!store.set('rb.rit',rit)){
    rit.shape=simplify(v.shape,0.02);
    rit.uitgedund=true;
    if(!store.set('rb.rit',rit)) return;
  }
  ritBlokBij();
}

/* Na een herberekening onderweg staat er een andere route op je scherm dan de
   route die je bewaard hebt. Die halen we bij, zodat je na een herstart verder
   kunt met de route die je nu rijdt. */
function ritBijwerken(shape,man,km,sec){
  const oud=store.get('rb.rit');
  if(!oud||!shape?.length) return;
  const rit={ ...oud, at:Date.now(), km:+km.toFixed(1), sec:sec||oud.sec,
    shape:shape.map(c=>[+c[0].toFixed(5),+c[1].toFixed(5)]),
    man:(man||[]).map(m=>({km:+m.km.toFixed(3),tekst:m.tekst})) };
  if(!store.set('rb.rit',rit)){
    rit.shape=simplify(shape,0.02);
    store.set('rb.rit',rit);
  }
  ritBlokBij();
}

function ritBlokBij(){
  const r=store.get('rb.rit');
  const blok=el('ritBlock');
  if(!blok) return;
  if(!r?.shape?.length){ blok.hidden=true; return; }
  blok.hidden=false;
  const dag=new Date(r.at).toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
  el('ritInfo').innerHTML=`<b>${r.naam}</b><br>`
    +`${Math.round(r.km)} km · ${r.man.length} afslagen · bewaard ${dag}<br>`
    +`Deze rit staat in je telefoon. Rijden kan zonder bereik — alleen nieuwe `
    +`kaartstukjes heb je internet voor nodig.`;
}

function ritHerstellen(){
  const r=store.get('rb.rit');
  if(!r?.shape?.length){ setStatus('Er staat geen rit in je telefoon.',true); return false; }
  runSeq++;
  state.fast={shape:[],km:0,sec:0};
  state.mids=[]; state.pois=[]; state.stays=[]; state.points=[];
  state.along=null; state.extraRows=[];
  clearAlong(); clearMarkers();
  state.variants={ rit:{ shape:r.shape, man:r.man, km:r.km, sec:r.sec,
    prof:curveProfile(r.shape), color:'#E0B354', label:'Uit je telefoon' } };
  map.getSource('fast').setData(EMPTY);
  applyVariant('rit');
  map.fitBounds(r.shape.reduce((bb,c)=>bb.extend(c),
    new maplibregl.LngLatBounds(r.shape[0],r.shape[0])),{padding:60,duration:800});
  setStatus(`"${r.naam}" staat op de kaart: ${Math.round(r.km)} km. `
    +`Druk op Rijmodus — hier heb je geen internet voor nodig.`);
  return true;
}

el('ritGo').addEventListener('click',()=>{
  if(ritHerstellen() && typeof startDrive==='function') startDrive();
});
el('ritDrop').addEventListener('click',()=>{
  store.set('rb.rit',null);
  el('ritBlock').hidden=true;
  setStatus('De bewaarde rit is weg. De volgende route die je plant komt er weer in.');
});
