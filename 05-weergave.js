/* Roadbook — 05-weergave.js
   De route op de kaart tekenen en de varianten met elkaar vergelijken. */

/* ================= weergave =================
   Alleen jouw eigen tussenstops krijgen een nummer, en dat nummer is precies
   het nummer uit de lijst links. Start en finish krijgen een letter, en wat de
   app zelf toevoegt een klein rondje zonder cijfer. */
const FLAG_START=`<svg viewBox="0 0 28 28" aria-hidden="true">
  <path d="M14 26V3" stroke="#11151A" stroke-width="2.4" stroke-linecap="round" fill="none"/>
  <path d="M15 3.5h11l-2.6 4 2.6 4H15z" fill="#3FB56B" stroke="#11151A"
        stroke-width="1.3" stroke-linejoin="round"/></svg>`;
const FLAG_END=`<svg viewBox="0 0 28 28" aria-hidden="true">
  <path d="M14 26V3" stroke="#11151A" stroke-width="2.4" stroke-linecap="round" fill="none"/>
  <g stroke="#11151A" stroke-width="1.2">
    <rect x="15" y="3.5" width="11.5" height="8" fill="#FFFFFF"/>
  </g>
  <g fill="#11151A">
    <rect x="15" y="3.5" width="2.875" height="2.667"/>
    <rect x="20.75" y="3.5" width="2.875" height="2.667"/>
    <rect x="17.875" y="6.167" width="2.875" height="2.667"/>
    <rect x="23.625" y="6.167" width="2.875" height="2.667"/>
    <rect x="15" y="8.834" width="2.875" height="2.666"/>
    <rect x="20.75" y="8.834" width="2.875" height="2.666"/>
  </g></svg>`;

function viaCount(){ return state.vias.filter(v=>String(v).trim()).length; }

/* Doortellen vanaf je vertrekpunt: 1 = vertrek, dan jouw punten, dan de
   bestemming. Wat de app zelf toevoegt krijgt geen cijfer maar een tekstje,
   zodat de telling blijft kloppen. */
function markerStyle(p,i,arr){
  if(i===0) return {cls:'flag',svg:FLAG_START};
  if(i===arr.length-1||p._isDest) return {cls:'flag',svg:FLAG_END};
  if(p._viaIndex!=null) return {cls:'',label:String(p._viaIndex+1)};
  const tag=p._tag||p._kind||p.name;
  return tag ? {cls:'auto tagged',label:String(tag).slice(0,18)} : {cls:'auto',label:''};
}
function drawPoints(){
  clearMarkers();
  state.points.forEach((p,i,arr)=>{
    const st=markerStyle(p,i,arr);
    const wat = i===0 ? 'Vertrek'
      : p._viaIndex!=null ? `Jouw punt ${p._viaIndex+1}`
      : (i===arr.length-1||p._isDest) ? 'Bestemming'
      : (p._kind||'Door de app toegevoegd');
    marker(p,st.cls,st.label,`<strong>${p.name}</strong><br>${wat}`,st.svg);
  });
}

function clearMarkers(){ state.markers.forEach(m=>m.remove()); state.markers=[]; }
function marker(p,cls,label,html,svg){
  const d=document.createElement('div'); d.className='mk '+cls;
  if(svg) d.innerHTML=svg; else if(label) d.textContent=label;
  /* Je eigen tussenstops kun je op de kaart naar een andere plek slepen. */
  const sleepbaar = p._viaIndex!=null;
  if(sleepbaar){ d.style.cursor='grab'; d.title='Sleep me naar een andere plek'; }
  const m=new maplibregl.Marker({element:d, draggable:sleepbaar,
    offset: cls.includes('flag') ? [0,-2] : [0,0] }).setLngLat([p.lon,p.lat]);
  if(html) m.setPopup(new maplibregl.Popup({offset:14,closeButton:false}).setHTML(html));
  if(sleepbaar){
    m.on('dragend',()=>{
      const l=m.getLngLat();
      state.vias[p._viaIndex]=`${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}`;
      renderVias();
      setStatus(`Punt ${p._viaIndex+1} verplaatst — even opnieuw berekenen…`);
      plan();
    });
  }
  m.addTo(map); state.markers.push(m); return m;
}

function renderRoadbook(points,pois,stays,cum){
  const rb=el('roadbook'); rb.innerHTML=''; const rows=[];
  points.forEach((p,i)=>{
    rows.push({ km:placeAlong(state.shape,cum,p).km, terminus:true, title:p.name,
      kind: p._viaIndex!=null ? `Punt ${p._viaIndex+1}`
          : (p._kind||(i===0?'Vertrek':(i===points.length-1?'Bestemming':'Tussenstop'))) });
  });
  pois.forEach(p=>{
    const a=placeAlong(state.shape,cum,p);
    rows.push({ km:a.km, poi:true, title:p.name, add:p,
      kind:`${p.kind}${p.ele?` · ${Math.round(p.ele)} m`:''} · ${a.off<1?Math.round(a.off*1000)+' m':a.off.toFixed(1)+' km'} van de route` });
  });
  stays.forEach(s=>rows.push({ km:cum[cum.length-1], title:s.name, kind:s.kind+' bij de bestemming' }));
  (state.extraRows||[]).forEach(r=>rows.push(r));
  (state.along||[]).forEach(p=>rows.push({ km:p.atKm, title:p.name, tag:true,
    kind:`${p.kind}${p.brand?' · '+p.brand:''} · ${p.off<1?Math.round(p.off*1000)+' m':p.off.toFixed(1)+' km'} van de route` }));
  rows.sort((a,b)=>a.km-b.km||(b.terminus?1:0)-(a.terminus?1:0));
  rows.forEach((r,i)=>{
    const d=document.createElement('div');
    d.className='stop fade'+(r.terminus?' terminus':'')+(r.poi?' poi':'');
    d.style.animationDelay=(Math.min(i,14)*22)+'ms';
    d.innerHTML=`<div class="km">${r.km.toFixed(0)} km</div><div class="pip"></div>
      <div class="body"><div class="title">${r.title}</div><div class="kind">${r.kind}</div></div>`;
    if(r.add && el('showPhotos').checked){
      const box=document.createElement('div');
      box.className='shot'; box._poi=r.add;
      d.querySelector('.body').appendChild(box);
      shotWatcher.observe(box);
    }
    if(r.add){
      const b=document.createElement('button');
      b.className='text-btn add'; b.textContent='+ Als tussenstop';
      b.addEventListener('click',()=>{
        addVia(`${r.add.lat.toFixed(5)}, ${r.add.lon.toFixed(5)}`);
        setStatus(`${r.add.name} toegevoegd. Plan de route opnieuw.`);
      });
      d.querySelector('.body').appendChild(b);
    }
    rb.appendChild(d);
  });
}

/* ================= routes vergelijken ================= */
function renderAlts(){
  const box=el('alts'); box.innerHTML='';
  const keys=Object.keys(state.variants);
  keys.forEach(k=>{
    const v=state.variants[k];
    const b=document.createElement('button');
    b.className=(k===state.shown?'on':'');
    b.innerHTML=`<svg viewBox="0 0 40 16" aria-hidden="true" style="color:${v.color}">
        <path d="M2 11c6 0 8-6 14-6s8 6 14 6c4 0 6-2 8-3" fill="none"
              stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>
      <span class="nm">${v.label}</span>
      <span class="fig">${(state.fast.km+v.km).toFixed(0)} km · ${v.prof.score} bocht${v.urban?` · ${v.urban.score} stad`:''}${v.oud!=null?` · ${Math.round(v.oud*100)}% bekend`:''}</span>`;
    b.addEventListener('click',()=>applyVariant(k));
    box.appendChild(b);
  });
  if(state.pending){
    const b=document.createElement('button'); b.className='busy';
    b.innerHTML=`<svg viewBox="0 0 40 16"></svg><span class="nm">Zoeken…</span>
      <span class="fig">andere route</span>`;
    box.appendChild(b);
  }
  el('altBlock').hidden = keys.length<2 && !state.pending;
}

function renderAltsMap(){
  const feats=[];
  for(const k of Object.keys(state.variants)){
    if(k===state.shown) continue;
    feats.push({type:'Feature',properties:{k,col:state.variants[k].color},
      geometry:{type:'LineString',coordinates:state.variants[k].shape}});
  }
  const src=map.getSource('alts');
  if(src) src.setData({type:'FeatureCollection',features:feats});
}

function applyVariant(k){
  const v=state.variants[k]; if(!v) return;
  state.shown=k;
  state.tourShape=v.shape;
  state.shape=state.fast.shape.length?state.fast.shape.concat(v.shape):v.shape;
  const cum=cumulative(state.shape); state.cum=cum;
  map.getSource('route').setData(v.prof.fc);
  el('sumKm').textContent=(state.fast.km+v.km).toFixed(0)+' km';
  el('sumTime').textContent = v.imported ? '—' : fmtTime(state.fast.sec+v.sec);
  el('sumEta').textContent = aankomst(state.fast.sec+v.sec, v.imported);
  el('sumCurve').textContent=String(v.prof.score);
  el('sumStops').textContent=String(state.mids.length);
  el('summary').hidden=false; el('legend').hidden=false; el('exports').hidden=false;
  /* Er ligt een route: dan hoort Route starten binnen handbereik te staan,
     op dezelfde plek waar je net op Plannen drukte. */
  el('goDrive').hidden=false; el('sheetDrive').hidden=false;

  /* bochtigste stukken en tankstops als extra regels in het roadbook */
  const base=state.fast.km, extra=[];
  bestBits(v.prof.spans).forEach(b=>extra.push({
    km:base+b.from, title:'Bochtigste stuk', tag:true,
    kind:`tot km ${Math.round(base+b.to)} · bochtigheid ${Math.round(b.c*100)}` }));
  const tank=+el('tankKm').value||0;
  if(tank>60){
    const total=cum[cum.length-1];
    for(let d=tank*0.85; d<total-20; d+=tank*0.85)
      extra.push({ km:d, title:'Tanken', tag:true, kind:'hier ben je aan een tankstop toe' });
  }
  state.extraRows=extra;
  renderRoadbook(state.points,state.pois,state.stays,cum);
  renderAlts(); renderAltsMap();
  if(typeof renderTurns==='function') renderTurns();
  /* Meteen in de opslag, zodat je deze rit ook zonder bereik kunt rijden. */
  if(typeof ritOpslaan==='function') ritOpslaan();
  if(typeof sheetSamenvatting==='function') sheetSamenvatting();
  if(typeof showWeather==='function') showWeather();
  if(typeof showElevation==='function') showElevation();
}

