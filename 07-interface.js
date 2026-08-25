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

/* bewaren=false: wel schuiven, niet onthouden. Dat gebruiken we als de app
   zelf het blad dichtschuift na het plannen — jouw eigen voorkeur voor de
   volgende keer hoort daar niet door te veranderen. */
function zetStand(st,bewaren){
  sheet.stand=st;
  const p=el('panel');
  p.classList.remove('peek','half','full','dragging');
  p.classList.add(st);
  p.style.removeProperty('--sheet');
  /* Het paneel scrolt niet meer zelf; dat doet het middenstuk. */
  if(st!=='full'){ const w=document.querySelector('.stepwrap'); if(w) w.scrollTop=0; }
  if(bewaren!==false) store.set('rb.sheet',st);
  metenDicht();
}

function volgendeStand(){
  zetStand(sheet.stand==='peek'?'half':sheet.stand==='half'?'full':'peek');
}

/* De luisteraars mogen maar één keer worden aangemeld. initSheet() wordt ook
   aangeroepen als je je telefoon draait — en op een iPhone bovendien elke keer
   dat de adresbalk in- of uitschuift, want dat is ook een resize. Werd dan
   opnieuw de bewaarde stand gezet, dan klapte het blad midden in je werk weer
   open. Nu blijft de stand staan waar hij stond. */
let sheetAan=false;
function initSheet(){
  const p=el('panel'), g=el('grip');
  if(!mobiel()){ p.classList.remove('peek','half','full'); metenDicht(); return; }
  zetStand(sheetAan?sheet.stand:store.get('rb.sheet','half'),false);
  if(sheetAan) return;
  sheetAan=true;

  g.addEventListener('pointerdown',e=>{
    if(liggend()) return;                     /* liggend: alleen tikken */
    /* Op het resultaatkaartje staan knoppen. Daar mag je niet mee gaan
       slepen, anders start je nooit een route maar schuif je alleen. */
    if(e.target.closest('.gripkaart')) return;
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
  g.addEventListener('click',e=>{
    if(e.target.closest('.gripkaart')) return;
    if(liggend()) volgendeStand();
  });
}

/* Kaartknoppen achter één menuknop op de telefoon */

/* Snelle plannen-knop op de greep */

/* Samenvatting in de balk van het blad */
/* Het kaartje dat je altijd ziet als het blad dichtgeschoven is: drie grote
   cijfers met een woordje eronder, zoals in elke motornavigatie. Vaste vakjes,
   zodat ze niet verspringen als het getal een cijfer langer wordt. */
/* Wordt aangeroepen zodra er een route op het scherm komt. */
function sheetSamenvatting(){ klaarBij(); }


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
  renderVias(); saveSettings();
  el('btnUndo').disabled=!undoStack.length;
  setStatus('Teruggedraaid. Plan de route opnieuw.');
}
el('btnUndo').addEventListener('click',doUndo);
el('btnUndo').disabled=true;

/* ================= vanaf mijn locatie =================
   Je vertrekt bijna altijd waar je staat. Daarom pakt de app bij het opstarten
   zelf je gps en zet die in het vertrekveld — je hoeft nergens op te drukken.

   Tik je zelf iets in dat veld, dan is dat een keuze en blijft die staan: vanaf
   dat moment laat de app je vertrekpunt met rust (`rb.startZelf`). Met het
   kruisje leegmaken of op ◎ drukken zet hem weer op automatisch.

   stil=true bij het opstarten: dan geen meldingen en niet naar je toe vliegen
   als er al een route op het scherm staat. */
function pakMijnLocatie(stil){
  if(!navigator.geolocation){
    if(!stil) setStatus('Je browser geeft je locatie niet door.',true);
    return;
  }
  if(!stil) setStatus('Locatie ophalen…');
  navigator.geolocation.getCurrentPosition(pos=>{
    if(!stil) pushUndo();
    /* Ondertussen zelf iets ingetypt? Dan wint dat. */
    if(stil && store.get('rb.startZelf',false)) return;
    const {latitude:la,longitude:lo}=pos.coords;
    const label=`${la.toFixed(5)}, ${lo.toFixed(5)}`;
    PICKED.set(label,{name:'Mijn locatie',lat:la,lon:lo});
    el('start').value=label;
    if(typeof saveSettings==='function') saveSettings();
    wisKnopBij('start','startWis');
    /* En vraag erbij hoe die plek heet. Cijfers in je vertrekveld zeggen je
       niets; "Baarlo" wel. De coördinaten blijven eronder liggen, dus er wordt
       nog steeds vanaf je exacte plek gerekend en niet vanaf het dorpsplein. */
    if(typeof placeName==='function') placeName([lo,la]).then(naam=>{
      if(!naam) return;
      if(el('start').value!==label) return;      /* je hebt ondertussen zelf iets ingetikt */
      PICKED.set(naam,{name:naam,lat:la,lon:lo});
      el('start').value=naam;
      if(typeof saveSettings==='function') saveSettings();
      wisKnopBij('start','startWis');
    }).catch(()=>{});
    if(!stil){
      map.flyTo({center:[lo,la],zoom:11});
      setStatus('Vertrekpunt op je huidige locatie gezet.');
    }
  },err=>{ if(!stil) setStatus('Locatie niet gelukt — sta het toe in je browser.',true); },
   {enableHighAccuracy:true,timeout:10000});
}
el('hereBtn').addEventListener('click',()=>{
  store.set('rb.startZelf',false);   /* weer automatisch */
  pakMijnLocatie(false);
});
/* Typ je zelf een vertrekpunt, dan houdt de app zijn handen eraf. */
el('start').addEventListener('input',()=>{
  store.set('rb.startZelf',!!el('start').value.trim());
});


/* ================= drie tabbladen =================
   Plannen, Onderweg, Ritten — en het tandwiel voor alles wat je één keer
   instelt. Geen genummerde stappen meer: de naam zegt waar je bent, en je
   springt er rechtstreeks naartoe.

   De zoekbalk over de kaart is de ingang: tikken brengt je naar Plannen met de
   cursor in het vak "Waar naartoe?". */
let tab='plan';
function zetTab(n){
  tab=n;
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===n));
  document.querySelectorAll('.tab').forEach(s=>s.classList.toggle('on',s.dataset.tab===n));
  const w=document.querySelector('.tabwrap');
  if(w) w.scrollTop=0;
  if(mobiel()&&sheet.stand==='peek') zetStand('half');
  store.set('rb.tab',n);
}
document.querySelectorAll('#tabs button').forEach(b=>
  b.addEventListener('click',()=>zetTab(b.dataset.tab)));
/* De knop bij de wegtypes brengt je naar de rest van de wegkeuzes. */
el('wegMeer').addEventListener('click',()=>zetTab('set'));
/* ================= waar naartoe, boven op de kaart =================
   Dit was een knop die je naar het paneel stuurde. Dat is een omweg: je weet
   waar je heen wil, dus je wil het intikken en weg. Nu is het een echt veld met
   dezelfde plaatsenzoeker als in het paneel, en Enter start de berekening.

   Het paneel en dit veld houden elkaar bij, zodat er nooit twee verschillende
   bestemmingen kunnen staan. */
attachAC(el('zoekVeld'));

function zoekVeldStart(){
  const q=el('zoekVeld').value.trim();
  if(!q){ setStatus('Vul in waar je heen wil.',true); return; }
  el('dest').value=q;
  if(typeof saveSettings==='function') saveSettings();
  wisKnopBij('dest','destWis');
  klaarBij();
  el('zoekVeld').blur();
  if(typeof plan==='function') plan();
}

el('zoekVeld').addEventListener('keydown',e=>{
  if(e.key!=='Enter') return;
  /* Stond er een suggestie aangewezen, dan heeft de plaatsenzoeker deze Enter
     al gebruikt om die te kiezen. Die vult het veld en meldt zich hieronder. */
  if(e.defaultPrevented) return;
  e.preventDefault();
  zoekVeldStart();
});
/* Een gekozen suggestie stuurt een change-melding die de app zelf maakt; die is
   niet "trusted". Zo weten we het verschil met het gewone verlaten van het veld
   — anders zou hij gaan rekenen zodra je ergens anders tikt. */
el('zoekVeld').addEventListener('change',e=>{ if(!e.isTrusted) zoekVeldStart(); });
el('zoekVeld').addEventListener('input',()=>{
  el('zoekWis').hidden=!el('zoekVeld').value;
});
el('zoekWis').addEventListener('click',()=>{
  el('zoekVeld').value=''; el('zoekWis').hidden=true; el('zoekVeld').focus();
});

/* Zuinig met data: één schakelaar in plaats van drie vinkjes waar je over moet
   nadenken. De vinkjes blijven staan zoals jij ze had, maar ze doen even niets
   en je ziet dat ook. */
function zuinigBij(){
  const aan=el('zuinig').checked;
  ['findCurvy','findPois','findStays'].forEach(id=>{
    el(id).disabled=aan;
    el(id).closest('label')?.classList.toggle('kleed',aan);
  });
  el('zuinigHint').textContent=aan
    ? 'Zuinig staat aan: bochten opzoeken en bezienswaardigheden liggen stil. '
      +'De route zelf en de kaart werken gewoon.'
    : "Eén schakelaar voor als je in het buitenland zit: hij zet het opzoeken van "
      +"bochten en bezienswaardigheden uit. Dat is samen zo'n 2 MB per rit.";
}
el('zuinig').addEventListener('change',()=>{ zuinigBij(); saveSettings(); });
zuinigBij();

/* Vegen om van tabblad te wisselen. Op een iPhone ligt de tabbalk in de
   volledig-open stand vlak onder het camera-eilandje, en dan is hij lastig te
   raken. Met een veeg naar links of rechts kom je er altijd.

   We kijken pas als je je vinger optilt: duidelijk zijwaarts en minstens 60
   beeldpunten, anders was je gewoon aan het scrollen. Een veeg die aan de
   linkerrand begint laten we staan — dat is de terug-veeg van de telefoon zelf. */
const TABORDE=['plan','weg','rit','set'];
(function tabVegen(){
  const vak=document.querySelector('.tabwrap');
  if(!vak) return;
  let x0=0, y0=0, bezig=false;
  vak.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse') return;
    if(e.clientX<26) return;              /* laat de terug-veeg met rust */
    bezig=true; x0=e.clientX; y0=e.clientY;
  });
  vak.addEventListener('pointerup',e=>{
    if(!bezig) return;
    bezig=false;
    const dx=e.clientX-x0, dy=e.clientY-y0;
    if(Math.abs(dx)<60 || Math.abs(dx)<Math.abs(dy)*1.6) return;
    const i=TABORDE.indexOf(tab);
    const naar=TABORDE[Math.max(0,Math.min(TABORDE.length-1, i+(dx<0?1:-1)))];
    if(naar!==tab) zetTab(naar);
  });
  vak.addEventListener('pointercancel',()=>{ bezig=false; });
})();

/* Ligt er een route? Dan komt de groene startknop tevoorschijn en zegt de
   zoekbalk waar je heen gaat. */
function klaarBij(){
  const v=state.variants?.[state.shown];
  const erIsEr=!!v?.shape?.length;
  /* Groen betekent gaan, en dat kan altijd: met een route rijd je die, zonder
     route rijd je gewoon. In beide gevallen gaat de kaart met je mee en wordt
     je spoor bijgehouden. Eén knop, en het woord erop zegt wat er gebeurt. */
  const gaan = erIsEr ? '▶ Route starten' : '▶ Vrij rijden';
  el('sheetDrive').hidden=false;
  el('sheetDrive').textContent=gaan;
  el('gripStart').textContent=gaan;
  const naar=(el('dest').value||'').trim();
  /* Niet overschrijven terwijl je erin aan het typen bent. */
  if(document.activeElement!==el('zoekVeld')) el('zoekVeld').value=naar;
  el('zoekWis').hidden=!el('zoekVeld').value;

  /* Hetzelfde resultaat nog een keer, maar dan op de greep — daar zie je het
     ook als het blad dichtgeschoven is. De cijfers worden overgenomen van het
     paneel, zodat er nooit twee verschillende getallen kunnen staan. */
  el('gripKaart').hidden=false;
  el('gripCijfers').hidden=!erIsEr;

  /* Onderweg zonder route: het weer, het hoogteprofiel en "wat is er onderweg"
     hebben dan niets om over te gaan. Dat zeggen we, en het blok dat een route
     nodig heeft gaat grijs. De instellingen erboven blijven gewoon te
     gebruiken — die zet je juist vóór je plant. */
  el('wegLeeg').hidden=erIsEr;
  el('alongBlock').classList.toggle('kleed',!erIsEr);
  if(erIsEr){
    el('gKm').textContent=el('sumKm').textContent;
    el('gTijd').textContent=el('sumTime').textContent;
    el('gEta').textContent=el('sumEta').textContent;
    el('gCurve').textContent=el('sumCurve').textContent;
  }
  metenDicht();
}

/* Hoeveel er van het blad blijft staan als het dichtgeschoven is: de greep plus
   de tabbalk. Niet schatten maar meten — met het resultaatkaartje erbij is dat
   ruim twee keer zo hoog, en een vast getal zou de startknop half afsnijden. */
function metenDicht(){
  const wortel=document.documentElement;
  if(!mobiel()||liggend()){ wortel.style.removeProperty('--dicht'); return; }
  const h=(el('grip')?.offsetHeight||0)+(el('tabs')?.offsetHeight||0);
  if(h>40) wortel.style.setProperty('--dicht',Math.round(h)+'px');
}

/* Er ligt een route: het blad gaat opzij zodat je hem ziet, met de cijfers en
   de startknop binnen handbereik. Zo doet elke navigatie het — je hebt net
   gezegd wat je wil, dus nu wil je de route zien en niet je instellingen. */
function naarKaart(){
  /* Liggend is het paneel een lade naast de kaart: je ziet de route al, en
     dichtschuiven zou juist de startknop wegnemen. Dus alleen staand. */
  if(mobiel()&&!liggend()) zetStand('peek',false);
}

/* Ruimte vrijhouden bij het inpassen van de route: onderaan het blad, bovenaan
   de zoekbalk. Anders ligt de helft van je rit achter het paneel. */
function kaartRuimte(){
  if(!mobiel()) return {top:60,bottom:60,left:60,right:60};
  if(liggend()) return {top:60,bottom:60,left:40,right:40};
  const dicht=parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--dicht'))||96;
  return {top:96,bottom:dicht+24,left:34,right:34};
}
['start','dest'].forEach(id=>el(id).addEventListener('input',klaarBij));

/* Starten vanaf de greep. Dezelfde knop als in het paneel, maar dan waar je
   hem nodig hebt: op het scherm dat je ziet als de kaart openligt. */
el('gripStart').addEventListener('click',()=>startDrive());
/* Op de cijfers tikken opent het paneel weer. Tikken is minder werk dan
   slepen, zeker met handschoenen aan. */
el('gripCijfers').addEventListener('click',()=>zetStand('half'));

zetTab(store.get('rb.tab','plan'));
klaarBij();

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
