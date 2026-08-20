/* Roadbook — 07-interface.js
   Onderweg-knoppen, het bodemblad op de telefoon, uitklapbare blokken,
   ongedaan maken, omkeren en inzoomen, vanaf mijn locatie. */

/* ================= onderweg-knoppen ================= */
let alongMarkers=[];
function clearAlong(){ alongMarkers.forEach(m=>m.remove()); alongMarkers=[]; }

document.querySelectorAll('#alongChips button').forEach(btn=>{
  btn.addEventListener('click',async()=>{
    const kind=btn.dataset.k;
    if(btn.classList.contains('on')){
      btn.classList.remove('on'); clearAlong(); state.along=null;
      el('alongList').innerHTML='';
      if(state.cum) renderRoadbook(state.points,state.pois,state.stays,state.cum);
      return;
    }
    if(!state.tourShape?.length){
      setStatus('Plan eerst een route, dan zoek ik dit langs je rit.'); return;
    }
    document.querySelectorAll('#alongChips button').forEach(b=>b.classList.remove('on'));
    clearAlong(); btn.classList.add('busy');
    try{
      let list=await findAlong(kind,state.tourShape);
      const cfg=ALONG[kind];
      /* Bij tanken: als je een actieradius hebt ingevuld, de stations
         rond je tankmomenten vooraan zetten. */
      const tank=+el('tankKm').value||0;
      if(kind==='fuel'&&tank>60){
        const stops=[]; const total=state.cum[state.cum.length-1];
        for(let d=tank*0.85; d<total-20; d+=tank*0.85) stops.push(d-state.fast.km);
        list=list.map(p=>({...p,_near:Math.min(...stops.map(x=>Math.abs(x-p.atKm)))}))
                 .sort((a,b)=>a._near-b._near);
      }
      list=list.slice(0,14).sort((a,b)=>a.atKm-b.atKm);
      state.along=list.map(p=>({...p,atKm:p.atKm+state.fast.km}));
      state.along.forEach(p=>{
        const d=document.createElement('div');
        d.className='mk poi'; d.style.background=cfg.color;
        const m=new maplibregl.Marker({element:d}).setLngLat([p.lon,p.lat])
          .setPopup(new maplibregl.Popup({offset:14,closeButton:false})
            .setHTML(`<strong>${p.name}</strong><br>${p.kind}${p.open?'<br>'+p.open:''}`))
          .addTo(map);
        alongMarkers.push(m);
      });
      const box=el('alongList'); box.innerHTML='';
      if(!state.along.length) box.innerHTML=`<p class="empty">Niets gevonden binnen 2,5 km van je route.</p>`;
      state.along.forEach(p=>{
        const d=document.createElement('div'); d.className='r';
        d.innerHTML=`<div><div class="nm">${p.name}</div>
          <div class="ds">km ${p.atKm.toFixed(0)} · ${p.off<1?Math.round(p.off*1000)+' m':p.off.toFixed(1)+' km'} van de route</div></div>`;
        box.appendChild(d);
      });
      if(state.cum) renderRoadbook(state.points,state.pois,state.stays,state.cum);
      btn.classList.add('on');
    }catch(err){ setStatus('Zoeken lukte niet — de plaatsenserver is druk.',true); }
    finally{ btn.classList.remove('busy'); }
  });
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
  if(st!=='full') p.scrollTop=0;
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
    p.style.setProperty('--sheet',Math.max(0,Math.min(hoogte-86,top-(window.innerHeight-hoogte)))+'px');
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
el('toolsBtn').addEventListener('click',()=>{
  const t=el('mapTools');
  const open=t.classList.toggle('open');
  el('toolsBtn').classList.toggle('on',open);
});
map.on('click',()=>{
  if(mobiel()&&el('mapTools').classList.contains('open')){
    el('mapTools').classList.remove('open'); el('toolsBtn').classList.remove('on');
  }
});

/* Snelle plannen-knop op de greep */
el('sheetGo').addEventListener('click',()=>{
  if(!el('start').value.trim()||!el('dest').value.trim()){ zetStand('full'); return; }
  zetStand('peek'); plan();
});

/* Samenvatting in de balk van het blad */
function sheetSamenvatting(){
  const v=state.variants?.[state.shown];
  el('sheetInfo').textContent = v
    ? `${(state.fast.km+v.km).toFixed(0)} km · ${v.imported?'—':fmtTime(state.fast.sec+v.sec)} · ${v.prof.score} bocht`
    : 'Plan je rit';
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
  manualOrder=s.manual; el('manualOrder').checked=s.manual;
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

/* ================= omkeren en inzoomen ================= */
el('btnReverse').addEventListener('click',()=>{
  pushUndo();
  const a=el('start').value, b=el('dest').value;
  el('start').value=b; el('dest').value=a;
  state.vias.reverse();
  renderVias(); saveSettings();
  setStatus('Route omgedraaid. Plan hem opnieuw.');
});
el('btnFit').addEventListener('click',()=>{
  const sh=state.shape;
  if(!sh?.length) return;
  map.fitBounds(sh.reduce((bb,c)=>bb.extend(c),new maplibregl.LngLatBounds(sh[0],sh[0])),
    {padding:60,duration:700});
});

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

