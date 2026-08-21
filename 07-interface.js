/* Roadbook — 07-interface.js
   Onderweg-knoppen, het bodemblad op de telefoon, uitklapbare blokken,
   ongedaan maken, omkeren en inzoomen, vanaf mijn locatie. */

/* ================= onderweg-knoppen ================= */
let alongMarkers=[];
function clearAlong(){ alongMarkers.forEach(m=>m.remove()); alongMarkers=[]; }

/* Eén knop in plaats van vier. Tanken, eten, koffie en motorzaken worden in
   één keer opgehaald en in één lijst gezet, op kilometer gesorteerd. Bij tanken
   wegen de stations rond je tankmomenten zwaarder als je een actieradius hebt
   ingevuld. */
el('alongAll').addEventListener('click',async()=>{
  const btn=el('alongAll');
  if(btn.classList.contains('busy')) return;
  if(btn.classList.contains('on')){
    btn.classList.remove('on'); clearAlong(); state.along=null;
    el('alongList').innerHTML='';
    if(state.cum) renderRoadbook(state.points,state.pois,state.stays,state.cum);
    return;
  }
  if(!state.tourShape?.length){
    setStatus('Plan eerst een route, dan zoek ik dit langs je rit.'); return;
  }
  clearAlong(); btn.classList.add('busy');
  try{
    let alles=[];
    for(const kind of ['fuel','food','cafe','moto']){
      try{
        const lijst=await findAlong(kind,state.tourShape);
        alles.push(...lijst.map(p=>({...p,_k:kind})));
      }catch{}
      await sleep(400);
    }
    const tank=+el('tankKm').value||0;
    if(tank>60&&state.cum){
      const stops=[]; const total=state.cum[state.cum.length-1];
      for(let d=tank*0.85; d<total-20; d+=tank*0.85) stops.push(d-state.fast.km);
      alles=alles.map(p=>p._k==='fuel'
        ? {...p,_near:Math.min(...stops.map(x=>Math.abs(x-p.atKm)))} : p);
    }
    alles=alles.sort((a,b)=>(a._near??99)-(b._near??99)).slice(0,20)
               .sort((a,b)=>a.atKm-b.atKm);
    state.along=alles.map(p=>({...p,atKm:p.atKm+state.fast.km}));
    state.along.forEach(p=>{
      const d=document.createElement('div');
      d.className='mk poi'; d.style.background=ALONG[p._k]?.color||'#6B8F71';
      alongMarkers.push(new maplibregl.Marker({element:d}).setLngLat([p.lon,p.lat])
        .setPopup(new maplibregl.Popup({offset:14,closeButton:false})
          .setHTML(`<strong>${p.name}</strong><br>${p.kind}${p.open?'<br>'+p.open:''}`))
        .addTo(map));
    });
    const box=el('alongList'); box.innerHTML='';
    if(!state.along.length)
      box.innerHTML='<p class="empty">Niets gevonden binnen 2,5 km van je route.</p>';
    state.along.forEach(p=>{
      const d=document.createElement('div'); d.className='r';
      d.innerHTML=`<div><div class="nm">${p.name}</div>
        <div class="ds">km ${p.atKm.toFixed(0)} · ${p.kind} · ${p.off<1?Math.round(p.off*1000)+' m':p.off.toFixed(1)+' km'} van de route</div></div>`;
      box.appendChild(d);
    });
    if(state.cum) renderRoadbook(state.points,state.pois,state.stays,state.cum);
    btn.classList.add('on');
    setStatus(state.along.length?`${state.along.length} plekken onderweg gevonden.`:'');
  }catch(err){ setStatus('Zoeken lukte niet — de plaatsenserver is druk.',true); }
  finally{ btn.classList.remove('busy'); }
});
el('tankKm').addEventListener('change',()=>{
  saveSettings();
  if(state.shown) applyVariant(state.shown);
});



/* ================= bodemblad op de telefoon =================
   Drie standen: dicht, half en open. Je kunt slepen of op de greep tikken.
   In liggende stand wordt het een lade die van links inschuift. */
const sheet={ stand:'half', y0:0, h0:0, slepen:false };
function mobiel(){ return window.matchMedia('(max-width:860px)').matches; }
function liggend(){ return window.matchMedia('(max-width:1000px) and (orientation:landscape) and (max-height:560px)').matches; }

function zetStand(st){
  sheet.stand=st;
  const p=el('panel');
  p.classList.remove('peek','half','full','dragging');
  p.classList.add(st);
  p.style.removeProperty('--sheet');
  /* Het paneel scrolt niet meer zelf; dat doet het middenstuk. */
  if(st!=='full'){ const w=document.querySelector('.stepwrap'); if(w) w.scrollTop=0; }
  store.set('rb.sheet',st);
}

function volgendeStand(){
  zetStand(sheet.stand==='peek'?'half':sheet.stand==='half'?'full':'peek');
}

function initSheet(){
  const p=el('panel'), g=el('grip');
  if(!mobiel()){ p.classList.remove('peek','half','full'); return; }
  zetStand(store.get('rb.sheet','half'));

  g.addEventListener('pointerdown',e=>{
    if(liggend()) return;                     /* liggend: alleen tikken */
    sheet.slepen=true; sheet.y0=e.clientY;
    sheet.h0=p.getBoundingClientRect().top;
    p.classList.add('dragging');
    g.setPointerCapture(e.pointerId);
  });
  g.addEventListener('pointermove',e=>{
    if(!sheet.slepen) return;
    const dy=e.clientY-sheet.y0;
    const top=Math.max(0,sheet.h0+dy);
    const hoogte=window.innerHeight*0.92;
    /* Wat er altijd blijft staan: het resultaatkaartje plus de tabbalk. */
    const dicht=parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--dicht'))||150;
    p.style.setProperty('--sheet',Math.max(0,Math.min(hoogte-dicht,top-(window.innerHeight-hoogte)))+'px');
  });
  const los=e=>{
    if(!sheet.slepen) return;
    sheet.slepen=false; p.classList.remove('dragging');
    const dy=e.clientY-sheet.y0;
    if(Math.abs(dy)<12){ volgendeStand(); return; }
    const top=p.getBoundingClientRect().top, h=window.innerHeight;
    zetStand(top<h*0.25?'full':top<h*0.72?'half':'peek');
  };
  g.addEventListener('pointerup',los);
  g.addEventListener('pointercancel',los);
  g.addEventListener('click',e=>{ if(liggend()) volgendeStand(); });
}

/* Kaartknoppen achter één menuknop op de telefoon */

/* Snelle plannen-knop op de greep */
el('sheetGo').addEventListener('click',()=>{
  if(!el('start').value.trim()||!el('dest').value.trim()){ zetStand('full'); return; }
  zetStand('peek'); plan();
});

/* Samenvatting in de balk van het blad */
/* Het kaartje dat je altijd ziet als het blad dichtgeschoven is: drie grote
   cijfers met een woordje eronder, zoals in elke motornavigatie. Vaste vakjes,
   zodat ze niet verspringen als het getal een cijfer langer wordt. */
function sheetSamenvatting(){
  const v=state.variants?.[state.shown];
  const box=el('sheetInfo');
  /* Ligt er een route? Dan is rijden wat je wil, niet plannen. De grote knop
     wisselt dus van rol in plaats van dat er twee naast elkaar staan. */
  el('grip').classList.toggle('klaar',!!v);
  el('sheetGo').hidden=!!v;
  if(!v){ box.innerHTML='<span class="leeg">Plan je rit</span>'; return; }
  const km=(state.fast.km+v.km).toFixed(0);
  const tijd=v.imported?'—':fmtTime(state.fast.sec+v.sec);
  box.innerHTML=`<span class="cij"><b>${km}</b><i>km</i></span>`
    +`<span class="cij"><b>${tijd}</b><i>rijtijd</i></span>`
    +`<span class="cij"><b>${v.prof.score}</b><i>bochtig</i></span>`;
}

let draaiTimer=null;
function opnieuwMeten(){
  clearTimeout(draaiTimer);
  draaiTimer=setTimeout(()=>{
    initSheet();
    try{ map.resize(); }catch{}
  },220);
}
window.addEventListener('resize',opnieuwMeten);
window.addEventListener('orientationchange',opnieuwMeten);
initSheet();

/* ================= uitklapbare blokken ================= */
function setupFolds(){
  /* Bijna alles stond open en dat werd een lange sliert. Sinds versie 31 staat
     alleen het bovenste stuk open. Wie de app al gebruikte heeft zijn eigen
     stand bewaard, dus die maken we één keer schoon — anders ziet hij de
     nieuwe indeling nooit. */
  if(store.get('rb.fold.v')!==2){
    try{
      Object.keys(localStorage).filter(k=>k.indexOf('rb.fold.')===0)
        .forEach(k=>localStorage.removeItem(k));
    }catch{}
    store.set('rb.fold.v',2);
  }
  document.querySelectorAll('.block[data-fold]').forEach((blk,n)=>{
    const eb=blk.querySelector('.eyebrow');
    if(!eb||eb.classList.contains('fold')) return;
    const key='rb.fold.'+(blk.id||('b'+n));
    const body=document.createElement('div');
    body.className='foldbody';
    while(eb.nextSibling) body.appendChild(eb.nextSibling);
    blk.appendChild(body);
    const btn=document.createElement('button');
    btn.className='eyebrow fold';
    btn.innerHTML=`<span>${eb.textContent}</span><span class="chev">▼</span>`;
    eb.replaceWith(btn);
    const dicht = store.get(key, blk.hasAttribute('data-shut'));
    const zet=v=>{ body.hidden=v; btn.classList.toggle('shut',v);
      btn.setAttribute('aria-expanded',String(!v)); };
    zet(!!dicht);
    btn.addEventListener('click',()=>{ const v=!body.hidden; zet(v); store.set(key,v); });
  });
}
setupFolds();

/* ================= ongedaan maken ================= */
const undoStack=[];
function snapshotNow(){
  return { start:el('start').value, dest:el('dest').value, vias:[...state.vias],
           mode:tripMode, level, manual:manualOrder };
}
function pushUndo(){
  undoStack.push(snapshotNow());
  if(undoStack.length>25) undoStack.shift();
  el('btnUndo').disabled=false;
}
function doUndo(){
  const s=undoStack.pop();
  if(!s) return;
  el('start').value=s.start; el('dest').value=s.dest;
  state.vias=[...s.vias];
  manualOrder=s.manual;
  level=s.level;
  document.querySelectorAll('#levels button').forEach(b=>b.classList.toggle('on',+b.dataset.v===level));
  el('levelHint').textContent=LEVELS[level].hint;
  tripMode=s.mode;
  document.querySelectorAll('#tripMode button').forEach(b=>b.classList.toggle('on',b.dataset.m===tripMode));
  el('loopRow').hidden=tripMode!=='loop';
  el('terugHint').hidden=tripMode!=='one';
  renderVias(); saveSettings();
  el('btnUndo').disabled=!undoStack.length;
  setStatus('Teruggedraaid. Plan de route opnieuw.');
}
el('btnUndo').addEventListener('click',doUndo);
el('btnUndo').disabled=true;

/* ================= vanaf mijn locatie ================= */
el('hereBtn').addEventListener('click',()=>{
  if(!navigator.geolocation){ setStatus('Je browser geeft je locatie niet door.',true); return; }
  setStatus('Locatie ophalen…');
  navigator.geolocation.getCurrentPosition(pos=>{
    pushUndo();
    const {latitude:la,longitude:lo}=pos.coords;
    const label=`${la.toFixed(5)}, ${lo.toFixed(5)}`;
    PICKED.set(label,{name:'Mijn locatie',lat:la,lon:lo});
    el('start').value=label; saveSettings();
    map.flyTo({center:[lo,la],zoom:11});
    setStatus('Vertrekpunt op je huidige locatie gezet.');
  },err=>setStatus('Locatie niet gelukt — sta het toe in je browser.',true),
   {enableHighAccuracy:true,timeout:10000});
});


/* ================= stap voor stap =================
   Vier schermen in plaats van één lange sliert: waar ga je heen, wat voor
   wegen, de rit zelf, en alles wat je maar af en toe nodig hebt.

   Je hoeft niet netjes door de stappen te lopen: tik gewoon op de stap die je
   wil. Dat is belangrijk voor een rit die je vaker rijdt — dan staat alles al
   goed en wil je meteen naar stap 3. */
let stap=1;

function stapKlaarTekens(){
  const waar = !!el('start').value.trim() && !!el('dest').value.trim();
  const rit = !!state.variants?.[state.shown]?.shape?.length;
  const zet=(n,ok)=>document.querySelector(`#steps button[data-step="${n}"]`)
    ?.classList.toggle('klaar',ok);
  zet(1,waar);
  zet(3,rit);
}

function zetStap(n){
  stap=Math.max(1,Math.min(4,n));
  document.querySelectorAll('#steps button').forEach(b=>
    b.classList.toggle('on',+b.dataset.step===stap));
  document.querySelectorAll('.step').forEach(s=>
    s.classList.toggle('on',+s.dataset.step===stap));
  const wrap=document.querySelector('.stepwrap');
  if(wrap) wrap.scrollTop=0;
  /* Vanaf stap 3 is plannen de hoofdactie; daarvoor is "verder" dat. */
  const eind = stap>=3;
  el('stepNext').hidden = eind;
  el('go').hidden = !eind;
  store.set('rb.stap',stap);
  stapKlaarTekens();
}

document.querySelectorAll('#steps button').forEach(b=>
  b.addEventListener('click',()=>zetStap(+b.dataset.step)));
el('stepNext').addEventListener('click',()=>zetStap(stap+1));
['start','dest'].forEach(id=>el(id).addEventListener('input',stapKlaarTekens));

/* Op Plannen drukken brengt je naar stap 3, want daar komt het antwoord. */
el('go').addEventListener('click',()=>zetStap(3));

zetStap(store.get('rb.stap',1));

/* ================= licht of donker =================
   Bij daglicht een licht paneel en de gewone kaart, na zonsondergang donker
   met een gedempte kaart. Zonsopkomst en -ondergang rekenen we zelf uit uit de
   datum en de plek waar je op de kaart kijkt. Geen server, dus dit werkt ook
   zonder bereik — en het klopt in juni net zo goed als in december. */
function zonTijden(lat,lon,datum){
  const rad=Math.PI/180, graad=180/Math.PI;
  const jd = datum.getTime()/86400000 + 2440587.5;          /* Juliaanse dag */
  const n = Math.round(jd - 2451545.0 + 0.0008);
  const ster = n - lon/360;                                  /* zonnetijd op deze lengte */
  const M = (357.5291 + 0.98560028*ster) % 360;              /* middelbare anomalie */
  const C = 1.9148*Math.sin(M*rad) + 0.02*Math.sin(2*M*rad) + 0.0003*Math.sin(3*M*rad);
  const L = (M + C + 180 + 102.9372) % 360;                  /* ecliptische lengte */
  const door = 2451545.0 + ster + 0.0053*Math.sin(M*rad) - 0.0069*Math.sin(2*L*rad);
  const sinD = Math.sin(L*rad)*Math.sin(23.4397*rad);        /* declinatie van de zon */
  const cosD = Math.cos(Math.asin(sinD));
  /* -0,833 graad: de zon staat net onder de horizon als je hem ziet opkomen,
     door de kromming van het licht in de lucht en de grootte van de schijf. */
  const cosU = (Math.sin(-0.833*rad) - Math.sin(lat*rad)*sinD) / (Math.cos(lat*rad)*cosD);
  if(cosU > 1) return null;                                  /* poolnacht */
  if(cosU < -1) return { op:new Date(datum.getTime()-6e7), onder:new Date(datum.getTime()+6e7) };
  const u = Math.acos(cosU)*graad;
  const terug = j => new Date((j - 2440587.5)*86400000);
  return { op:terug(door - u/360), onder:terug(door + u/360) };
}

const THEMA_UITLEG={
  auto:'Licht bij daglicht, donker na zonsondergang. De app rekent zelf uit wanneer '
      +'de zon op- en ondergaat waar jij op de kaart kijkt — daar is geen internet voor nodig.',
  licht:'Altijd het lichte thema. Het beste leesbaar in fel zonlicht.',
  donker:'Altijd het donkere thema, met een gedempte kaart. Rustig voor je ogen in het donker.'
};

function themaBijwerken(){
  const modus=store.get('rb.thema','auto');
  let licht;
  if(modus==='licht') licht=true;
  else if(modus==='donker') licht=false;
  else{
    /* Waar kijk je? Levert de kaart iets onbruikbaars, dan rekenen we met
       midden-Nederland: liever een half uur naast de schemering dan een app
       die in het donker blijft hangen. */
    let lat=51.3, lon=6.2;
    try{
      const c=map.getCenter();
      if(Number.isFinite(+c.lat) && Number.isFinite(+c.lng)){ lat=+c.lat; lon=+c.lng; }
    }catch{}
    const t=zonTijden(lat,lon,new Date());
    /* Een half uur rek aan beide kanten: in de schemering is licht nog prima. */
    licht = t ? (Date.now() > +t.op - 18e5 && Date.now() < +t.onder + 18e5) : false;
  }
  document.documentElement.setAttribute('data-thema', licht?'licht':'donker');
  el('themeBtn').textContent = modus==='auto' ? (licht?'☀':'☾') : (licht?'☀':'☾');
  el('themeBtn').title = modus==='auto' ? 'Volgt de zon — tik om vast te zetten'
    : modus==='licht' ? 'Altijd licht — tik voor donker' : 'Altijd donker — tik voor automatisch';
  const m=document.querySelector('meta[name="theme-color"]');
  if(m) m.setAttribute('content', licht?'#EDEAE3':'#14181C');
    if(el('themeHint')) el('themeHint').textContent=THEMA_UITLEG[modus]||THEMA_UITLEG.auto;
}

el('themeBtn').addEventListener('click',()=>{
  const nu=store.get('rb.thema','auto');
  store.set('rb.thema', nu==='auto' ? 'licht' : nu==='licht' ? 'donker' : 'auto');
  themaBijwerken();
});

themaBijwerken();
/* Elke tien minuten kijken of het al schemert. Ook bij terugkomen in de app,
   want dan is er misschien een half uur voorbij met het scherm uit. */
setInterval(themaBijwerken, 6e5);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible') themaBijwerken();
});
map.on('moveend',()=>{ if(store.get('rb.thema','auto')==='auto') themaBijwerken(); });
