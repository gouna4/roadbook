/* Roadbook — 10-uitvoer.js
   GPX uitvoeren, routes bewaren en de route in je zak. */

/* ================= GPX opslaan =================
   Voor je TomTom, je Garmin of een vriend. Deze knop was in versie 37 per
   ongeluk meegesleept toen Afdrukken en Bewaren eruit gingen: de knop stond er
   nog, maar er luisterde niemand meer. Gevonden door te controleren of elke
   knop in de interface ook een luisteraar heeft. */
el('gpx').addEventListener('click',()=>{
  if(!state.shape.length) return;
  const esc=s=>String(s).replace(/[<>&'"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
  const naam=`${state.points[0].name} – ${state.points[state.points.length-1].name}`;
  /* TomTom en Garmin slikken een beperkt aantal vormpunten; 30 is een veilig
     getal dat overal werkt. Stond eerst als instelling in de interface, maar
     daar draaide niemand aan. */
  const max=30;

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
    avoidTowns:el('avoidTowns').checked,
    noRepeat:el('noRepeat').checked,
    noToll:el('noToll').checked, noFerry:el('noFerry').checked,
    findPois:el('findPois').checked, findStays:el('findStays').checked,
    tankKm:el('tankKm').value, tripMode, loopKm:el('loopKm').value,
    depTime:el('depTime').value,
    findCurvy:el('findCurvy').checked, zuinig:el('zuinig').checked,
    offRadius:el('offRadius').value, offWhere:el('offWhere').value };
}
function applySettings(s){
  if(!s) return;
  level=s.level||3;
  document.querySelectorAll('#levels button').forEach(b=>b.classList.toggle('on',+b.dataset.v===level));
  el('levelHint').textContent=LEVELS[level].hint;
  if(s.dirt!=null){ el('dirt').value=s.dirt; el('dirtVal').textContent=s.dirt; }
  if(s.sprint!=null) el('sprintKm').value=s.sprint;
  if(s.tankKm!=null) el('tankKm').value=s.tankKm;
  /* Het kilometervakje. Tot versie 53 stond er een vinkje naast dat bepaalde of
     dit getal meetelde; stond dat vinkje uit, dan was het getal er wel maar deed
     het niets. Zulke opslag staat nog in telefoons die de app al gebruikten, en
     die moeten we niet ineens een rondje van 300 km opdringen. Dus: alleen
     terugzetten als het getal destijds ook echt meetelde. */
  if(s.loopKm!=null && s.loopOn!==false) el('loopKm').value=s.loopKm;
  if(s.offRadius!=null) el('offRadius').value=s.offRadius;
  if(s.offWhere!=null) el('offWhere').value=s.offWhere;
  if(s.tripMode) tripMode=s.tripMode;
  /* Altijd bijwerken, ook zonder bewaarde stand: dan klopt in elk geval het
     kruisje bij het kilometervakje met wat er in staat. */
  if(typeof soortRitBij==='function') soortRitBij();
  ['avoidTowns','noRepeat','noToll','noFerry','findPois','findStays','findCurvy','zuinig']
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


/* Wissen zit op twee knoppen: in de balk onderaan en op de greep van het
   bodemblad. Op de telefoon is die greep het enige wat je ziet als het blad
   dicht is, dus daar hoort hij ook te staan. */
function alsWissen(){
  clearMarkers(); runSeq++;
  /* runSeq++ zet een lopende berekening stil, dus die geeft de knop niet meer
     vrij. Dat doen we hier. */
  el('go').disabled=false; el('go').textContent='Route plannen';
  if(typeof tekenWis==='function') tekenWis();
  if(typeof klaarBij==='function') klaarBij();
  state.shape=[]; state.tourShape=[]; state.pois=[]; state.stays=[];
  state.vias=[]; state.variants={}; state.mids=[]; state.fast={shape:[],km:0,sec:0};
  renderVias();
  zetBron('route',EMPTY); zetBron('fast',EMPTY);
  el('summary').hidden=true; el('exports').hidden=true; el('legend').hidden=true;
  el('alongList').innerHTML='';
  clearAlong(); state.along=null; state.extraRows=[]; state.variants={}; state.shown=null;
  el('roadbook').innerHTML='<p class="empty">Vul vertrek en bestemming in en plan je route. Tik op de kaart om ergens een tussenstop neer te zetten, of sleep de route zelf een andere kant op.</p>';
  setStatus('');
}
el('clear').addEventListener('click',alsWissen);


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
    man:afslagen(v,cum,v.shape).map(m=>({km:+m.km.toFixed(3),tekst:m.tekst,
                                         hoek:Math.round(m.hoek||0)})),
    /* De wegnamen en snelheidslimieten gaan mee: ongeveer 1 KB voor een
       dagrit, en daarmee weet je onderweg zonder bereik nog hoe hard je mag. */
    wegen:v.wegen||null };

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
    /* De wegnamen en limieten komen mee uit de opslag; zonder bereik worden ze
       niet opnieuw opgehaald, en dat hoeft ook niet. */
    wegen:r.wegen||null,
    prof:curveProfile(r.shape), color:'#E0B354', label:'Uit je telefoon' } };
  zetBron('fast',EMPTY);
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
