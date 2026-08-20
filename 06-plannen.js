/* Roadbook — 06-plannen.js
   plan(): de hoofdknop die alles aan elkaar knoopt. Plus de route met
   de muis ergens anders langs slepen. */

/* ================= hoofdactie ================= */
let runSeq=0;
async function plan(){
  const btn=el('go'); btn.disabled=true; btn.textContent='Bezig…';
  const notes=[]; const run=++runSeq;
  const alive=()=>run===runSeq;
  try{
    if(!el('start').value.trim()||!el('dest').value.trim())
      throw new Error('Vul in elk geval een vertrekpunt en een bestemming in.');
    setStatus('Plaatsen opzoeken…');
    const start=await resolve(el('start').value);
    const viaPts=[];
    for(let i=0;i<state.vias.length;i++){
      if(!String(state.vias[i]).trim()) continue;
      const p=await resolve(state.vias[i]);
      if(p) viaPts.push({...p,_viaIndex:i});
    }
    const dest=await resolve(el('dest').value);
    dest._isDest=true;
    state.startPt=start; state.destPt=dest; state.viaPts=viaPts;

    /* snelweg-aanloop */
    state.fast={shape:[],km:0,sec:0}; let handover=null;
    const sprint=+el('sprintKm').value||0;
    if(sprint>0){
      setStatus(`Snelweg-aanloop van ${sprint} km uitzetten…`);
      try{
        const h=await handoverPoint(start,dest,sprint);
        if(h){ handover=h.point; state.fast={shape:h.shape,km:h.km,sec:h.sec}; }
        else notes.push('De rit is korter dan je aanloop, dus het wordt toeren vanaf de deur.');
      }catch{ notes.push('De snelwegaanloop lukte niet; we toeren vanaf de deur.'); }
    }
    const tourStart=handover||start;
    /* Zonder route sorteren we op de rechte lijn; zodra er een route ligt
       sorteren we op de kilometerstand lángs die route. Dat voorkomt het
       heen-en-weer geslinger tussen tussenstops. */
    const order=(list,ref)=>{
      /* Heb jij de volgorde zelf bepaald? Dan blijven jouw punten staan zoals
         ze staan; alleen wat de app zelf toevoegt wordt ingepast. */
      if(manualOrder){
        const eigen=list.filter(p=>p._viaIndex!=null).sort((a,b)=>a._viaIndex-b._viaIndex);
        const rest=list.filter(p=>p._viaIndex==null);
        return [...eigen,...rest];
      }
      if(!ref||!ref.length)
        return list.map(p=>({...p,_t:progressAlong(tourStart,dest,p).t})).sort((a,b)=>a._t-b._t);
      const line=coarse(ref), lcum=cumulative(line);
      return list.map(p=>({...p,_t:placeAlong(line,lcum,p).km})).sort((a,b)=>a._t-b._t);
    };

    /* Even meedenken voordat we de server lastigvallen */
    const luchtCheck=haversine([start.lon,start.lat],[dest.lon,dest.lat]);
    const letOp=el('checkDist').checked;
    /* Nooit blokkeren — alleen even zeggen wat je kunt verwachten. */
    if(letOp){
      if(luchtCheck>1200)
        notes.push(`${dest.name} ligt ${Math.round(luchtCheck)} km hiervandaan — reken op veerboten en een lange berekening.`);
      if((+el('sprintKm').value||0) > luchtCheck*1.5)
        notes.push('Je snelwegaanloop is langer dan de hele rit.');
    }

    /* 1 — route opbouwen naar gelang het soort rit */
    setStatus('Route berekenen…');
    /* Lukt het niet, dan proberen we het nog eens met soepelere instellingen
       in plaats van je met een foutmelding te laten zitten. */
    const probeer=async(punten,lv)=>{
      try{ return await planRoute(punten,'tour',lv); }
      catch(err){
        if(err.code===154||err.code===150) return await planLangeRit(punten,lv,notes);
        if(err.code!==442&&err.code!==441) throw err;
        const was={h:el('noHighway').checked,f:el('noFerry').checked,d:el('noDirt').checked};
        el('noHighway').checked=false; el('noFerry').checked=false; el('noDirt').checked=false;
        setStatus('Lukte niet — opnieuw met snelwegen en veerboten toegestaan…');
        try{
          let r;
          try{ r=await planRoute(punten,'tour',lv); }
          catch(e2){
            if(e2.code===154||e2.code===150) r=await planLangeRit(punten,lv,notes);
            else throw e2;
          }
          notes.push('Snelwegen en veerboten waren nodig om deze route mogelijk te maken.');
          return r;
        } finally {
          el('noHighway').checked=was.h; el('noFerry').checked=was.f; el('noDirt').checked=was.d;
        }
      }
    };
    let mids=order(viaPts);
    if(manualOrder&&viaPts.length>1) notes.push('Jouw volgorde is aangehouden.');
    const luchtlijn0=haversine([tourStart.lon,tourStart.lat],[dest.lon,dest.lat]);
    let terugPunt=null, main;

    if(tripMode==='loop'){
      /* Rondje: heen langs de ene kant van de lijn, terug langs de andere. */
      const doel=+el('loopKm').value||300;
      /* Heb je "rondje op een vaste afstand" aangevinkt, dan proberen we die
         lengte echt te halen. Staat het uit, dan kijken we alleen of je niet
         te veel dubbel rijdt en is de eerste route die goed is meteen goed. */
      const vast=el('loopOn').checked;
      const pogingen=3;
      let off=Math.max(12,luchtlijn0*0.30);
      const eigen=manualOrder?viaPts:order(viaPts);
      for(let poging=0; poging<pogingen; poging++){
        const heen={...sideWaypoint(tourStart,dest,off),name:'Heenweg',_kind:'lus',_tag:'Heenweg'};
        const terug={...sideWaypoint(tourStart,dest,-off),name:'Terugweg',_kind:'lus',_tag:'Terugweg'};
        /* Jouw eigen tussenstops horen gewoon in de lus, niet weggegooid. */
        main=await planRoute([tourStart,heen,...eigen,dest,terug,start],'tour',level);
        if(!alive()) return;
        mids=[heen,...eigen,{...dest,_isDest:true,_kind:'Keerpunt'},terug];
        terugPunt=start;
        const dub=el('noRepeat').checked?doubleShare(main.shape):0;
        if(!vast){ if(dub<0.14||poging>=pogingen-1) break; }
        if(main.km>=doel*0.8 && main.km<=doel*1.25 && dub<0.14) break;
        if(dub>=0.14 && poging<pogingen-1){ off*=1.6; await sleep(1100); continue; }
        if(vast && poging===pogingen-1 && letOp){
          const verschil=Math.round(main.km-doel);
          if(Math.abs(verschil)>doel*0.2)
            notes.push(verschil>0
              ? `Dit rondje wordt ${verschil} km langer dan de ${doel} km die je opgaf — ${dest.name} ligt daar te ver voor.`
              : `Dit rondje wordt ${-verschil} km korter dan de ${doel} km die je opgaf.`);
        }
        off *= main.km<doel ? 1.6 : 0.6;
        if(poging<pogingen-1){ setStatus(`Rondje bijstellen (${main.km.toFixed(0)} van ${doel} km)…`); await sleep(1100); }
      }
    } else if(tripMode==='back'){
      /* Heen en terug: de terugweg via een punt aan de andere kant. Rijd je
         toch te veel dubbel, dan duwen we dat punt verder naar buiten. */
      let off=Math.max(12,luchtlijn0*0.28), terug=null;
      for(let poging=0;poging<3;poging++){
        terug={...sideWaypoint(tourStart,dest,off),name:'Terugweg',_kind:'lus',_tag:'Terugweg'};
        main=await planRoute([tourStart,...mids,dest,terug,start],'tour',level);
        if(!alive()) return;
        if(!el('noRepeat').checked) break;
        const dub=doubleShare(main.shape);
        if(dub<0.14) break;
        if(poging<2){
          off*=1.7;
          setStatus(`Je reed ${Math.round(dub*100)}% dubbel — andere terugweg zoeken…`);
          await sleep(1100);
        } else notes.push(`Ongeveer ${Math.round(dub*100)}% van de rit is dezelfde weg heen en terug; korter kon niet anders.`);
      }
      mids=[...mids,{...dest,_isDest:true,_kind:'Keerpunt'},terug];
      terugPunt=start;
    } else {
      main=await probeer([tourStart,...mids,dest],level);
      if(!alive()) return;
    }

    const show=()=>{
      state.mids=mids;
      state.points = terugPunt
        ? [start,...(handover?[handover]:[]),...mids,
           {...terugPunt,name:terugPunt.name,_kind:'Weer thuis',_tag:'Weer thuis'}]
        : [start,...(handover?[handover]:[]),...mids,dest];
      state.variants={ base:{...main, prof:curveProfile(main.shape),
        color:ALT_COLORS[0], label:state.baseLabel||'Hoofdroute'} };
      state.pois=[]; state.stays=[]; state.along=null; state.extraRows=[];
      document.querySelectorAll('#alongChips button').forEach(b=>b.classList.remove('on'));
      el('alongList').innerHTML='';
      map.getSource('fast').setData(state.fast.shape.length
        ?{type:'Feature',geometry:{type:'LineString',coordinates:state.fast.shape}}:EMPTY);
      drawPoints();
      applyVariant('base');
    };
    show();
    const all0=state.fast.shape.concat(main.shape);
    map.fitBounds(all0.reduce((bb,c)=>bb.extend(c),new maplibregl.LngLatBounds(all0[0],all0[0])),
      {padding:60,duration:800});
    el('tourBlock').hidden=false;
    btn.disabled=false; btn.textContent='Route plannen';
    saveLast(); renderLib(); showWeather();

    /* 2 — grote plaatsen in kaart brengen */
    setStatus('Steden langs de route bekijken…');
    const places=await bigPlaces(main.shape);
    const dichtbijStad=p=>places.some(c=>haversine([c.lon,c.lat],[p.lon,p.lat])<6);
    if(state.variants.base){
      state.variants.base.urban=urbanScore(main.shape,places);
      if(el('noRidden').checked) state.variants.base.oud=riddenShare(main.shape);
      renderAlts();
    }

    /* 3 — bos en water, alleen als het echt nauwelijks omrijden is */
    if(el('findScenic').checked && tripMode==='one'){
      setStatus('Bos en water langs de route zoeken…');
      let added=0;
      try{
        const cands=(await scenicCandidates(main.shape)).filter(c=>!dichtbijStad(c));
        for(const c of cands){
          if(!alive()) return;
          if(added>=2) break;
          const test=order([...mids,c],main.shape);
          await sleep(1100);
          const r=await planRoute([tourStart,...test,dest],'tour',level);
          if(!alive()) return;
          /* streng: hooguit 8% omrijden, nergens omkeren, en niet meer stad */
          const u=urbanScore(r.shape,places);
          const erger=u&&state.variants.base?.urban && u.score>state.variants.base.urban.score;
          if(r.km<=main.km*1.08 && !hasSpur(r.shape) && !erger){
            mids=test; main=r; added++; show();
            if(state.variants.base) state.variants.base.urban=urbanScore(main.shape,places);
          }
        }
        if(!added) notes.push('Geen bos of water gevonden dat zonder omkeren in je route past.');
      }catch{ notes.push('Bos en water lukten niet.'); }
    }

    /* 3b — bochten zoeken: het saaie stuk inruilen voor iets kronkeligs.
       Alleen bij een enkele reis: bij een rondje en heen-en-terug zijn de
       keerpunten al ingepast en zou een extra punt die opzet omgooien. */
    if(el('findCurvy').checked && tripMode==='one'){
      setStatus('Bochtige wegen zoeken bij de saaie stukken…');
      let beter=0;
      try{
        const kand=await bochtCandidates(main.shape);
        if(!alive()) return;
        for(const c of kand){
          if(!alive()) return;
          if(beter>=2) break;
          const punt={ name:c.naam, lat:c.lat, lon:c.lon,
            _kind:c.pas?'Bergpas':`bochtigheid ${c.score} over ${c.km.toFixed(1)} km`,
            _tag:c.pas?'Pas':'Bochtig' };
          const test=order([...mids,punt],main.shape);
          await sleep(1100);
          let r=null;
          try{ r=await planRoute([tourStart,...test,dest],'tour',level); }catch{ continue; }
          if(!alive()) return;
          const was=curveProfile(main.shape).score, wasKm=main.km;
          const na=curveProfile(r.shape).score;
          /* Alleen houden als hij echt bochtiger wordt, niet veel langer, en
             nergens omkeert. Twee punten winst is ruis, dus dat telt niet. */
          if(na>was+2 && r.km<=wasKm*1.22 && !hasSpur(r.shape)){
            mids=test; main=r; beter++;
            const extra=Math.round(r.km-wasKm);
            notes.push(`Via ${c.naam}: bochtigheid ${was} → ${na}`
              +(extra>0?`, ${extra} km omrijden`:''));
            show();
          }
        }
        if(!beter) notes.push('Geen bochtiger weg gevonden die zonder omrijden in je route past.');
      }catch{ notes.push('Bochtige wegen zoeken lukte niet — de plaatsenserver is druk.'); }
    }

    /* 3 — echt andere routes zoeken en in kleur op de kaart zetten */
    const tourPoints=[tourStart,...mids,dest];
    placeName(main.shape[Math.floor(main.shape.length/2)]).then(n=>{
      if(!alive()||!n) return;
      state.baseLabel='via '+n;
      if(state.variants.base){ state.variants.base.label=state.baseLabel; renderAlts(); }
    });

    setStatus('Andere routes zoeken…');
    const zoekAlternatief = tripMode==='one';
    const luchtlijn=haversine([tourStart.lon,tourStart.lat],[dest.lon,dest.lat]);
    const zij=Math.max(10,Math.min(50,luchtlijn*0.2));
    let found=0;
    for(const kant of (zoekAlternatief?[zij,-zij]:[])){
      if(!alive()) return;
      if(found>=2) break;
      state.pending=true; renderAlts();
      try{
        const wp=sideWaypoint(tourStart,dest,kant);
        await sleep(1100);
        const r=await planRoute([tourStart,...order([...mids,wp],main.shape),dest],'tour',level);
        if(!alive()) return;
        const lijkt=overlap(main.shape,r.shape);
        const anders=Object.values(state.variants)
          .every(v=>overlap(v.shape,r.shape)<0.72);
        if(lijkt<0.72 && anders && r.km<=main.km*1.55){
          found++;
          const key='alt'+found;
          state.variants[key]={...r, prof:curveProfile(r.shape),
            color:ALT_COLORS[found], label:'alternatief', urban:urbanScore(r.shape,places),
            oud: el('noRidden').checked ? riddenShare(r.shape) : undefined};
          renderAlts(); renderAltsMap();
          placeName(divergePoint(main.shape,r.shape)).then(n=>{
            if(!alive()||!state.variants[key]) return;
            state.variants[key].label = n?'via '+n:'alternatief';
            renderAlts();
          });
        }
      }catch{}
      state.pending=false; renderAlts();
    }
    if(!found && zoekAlternatief) notes.push('Geen wezenlijk andere route gevonden; alle wegen komen hier op hetzelfde neer.');

    /* Wil je nieuwe wegen? Dan wint de route die je het minst kent. */
    if(found && zoekAlternatief && el('noRidden').checked && riddenShapes().length){
      let beste=state.shown, bs=state.variants[state.shown]?.oud ?? 1;
      for(const [k,v] of Object.entries(state.variants))
        if(v.oud!=null && v.oud<bs){ bs=v.oud; beste=k; }
      const nu=state.variants[state.shown]?.oud ?? 0;
      if(beste!==state.shown && nu-bs>0.15){
        applyVariant(beste);
        notes.push(`Je kende ${Math.round(nu*100)}% van de hoofdroute al; deze is nieuwer voor je.`);
      } else if(nu>0.3){
        notes.push(`${Math.round(nu*100)}% van deze route heb je al eens gereden.`);
      }
    }

    /* De route met de minste stad wint, mits het verschil de moeite waard is. */
    if(found && zoekAlternatief && places.length){
      let beste=state.shown, bs=state.variants[state.shown]?.urban?.score ?? 99;
      for(const [k,v] of Object.entries(state.variants))
        if(v.urban && v.urban.score<bs){ bs=v.urban.score; beste=k; }
      const nu=state.variants[state.shown]?.urban?.score ?? 0;
      if(beste!==state.shown && nu-bs>=3){
        const wasStad=state.variants[state.shown]?.urban?.hit?.slice(0,3).join(', ');
        applyVariant(beste);
        notes.push(`De hoofdroute gaat door ${wasStad}; ik heb de rustigere ${state.variants[beste].label} gekozen.`);
      }
    }

    /* 4 — bezienswaardigheden en overnachtingen */
    const jobs=[];
    if(el('findPois').checked) jobs.push(findPois(state.tourShape).then(list=>{
      if(!alive()) return;
      const seen=new Set();
      let p=list.filter(x=>{const k=x.name+Math.round(x.lat*300);return seen.has(k)?false:(seen.add(k),true);});
      p=p.map(x=>({...x,_o:placeAlong(state.shape,state.cum,x).off})).sort((a,b)=>a._o-b._o).slice(0,24);
      p.forEach(x=>marker(x,'poi','',`<strong>${x.name}</strong><br>${x.kind}${x.ele?` · ${Math.round(x.ele)} m`:''}`));
      state.pois=p;
    }).catch(()=>notes.push('Bezienswaardigheden lukten niet.')));

    if(el('findStays').checked) jobs.push(findStays(dest).then(list=>{
      if(!alive()) return;
      list.forEach(s=>marker(s,'stay','',`<strong>${s.name}</strong><br>${s.kind}`));
      state.stays=list;
    }).catch(()=>notes.push('Overnachtingen lukten niet.')));

    if(jobs.length){
      setStatus('Bezienswaardigheden laden nog…');
      await Promise.allSettled(jobs);
      if(!alive()) return;
      renderRoadbook(state.points,state.pois,state.stays,state.cum);
    }
    setStatus(notes.length?notes.join(' '):'');
  }catch(err){
    setStatus(err.message||'Er ging iets mis. Probeer het opnieuw.',true);
    btn.disabled=false; btn.textContent='Route plannen';
  }
}
el('go').addEventListener('click',plan);

/* ================= route slepen ================= */
let skipClick=0;
function enableDragShaping(){
  const canvas=map.getCanvas();
  map.on('mouseenter','route-hit',()=>{ canvas.style.cursor='grab'; });
  map.on('mouseleave','route-hit',()=>{ canvas.style.cursor=''; });
  map.on('mouseenter','curve-line',()=>{ canvas.style.cursor='pointer'; });
  map.on('mouseleave','curve-line',()=>{ canvas.style.cursor=''; });
  map.on('click','curve-line',e=>{
    const p=e.features?.[0]?.properties; if(!p) return;
    new maplibregl.Popup({offset:8,closeButton:false}).setLngLat(e.lngLat)
      .setHTML(`<strong>${p.naam||'Naamloze weg'}</strong><br>bochtigheid ${p.s} · ${p.km} km`)
      .addTo(map);
  });
  map.on('mouseenter','lib-line',()=>{ canvas.style.cursor='pointer'; });
  map.on('mouseleave','lib-line',()=>{ canvas.style.cursor=''; });
  map.on('click','lib-line',e=>{
    const id=e.features?.[0]?.properties?.id;
    const r=libAll().find(x=>String(x.id)===String(id));
    if(r){ skipClick=Date.now(); useImported(r.pts,r.name,r.named); }
  });
  map.on('mouseenter','alts-line',()=>{ canvas.style.cursor='pointer'; });
  map.on('mouseleave','alts-line',()=>{ canvas.style.cursor=''; });
  map.on('click','alts-line',e=>{
    const lv=e.features?.[0]?.properties?.lv;
    if(lv) { skipClick=Date.now(); applyVariant(+lv); }
  });
  map.on('mousedown','route-hit',e=>{
    if(e.originalEvent.button!==0) return;
    if(teken.aan) return;              /* aan het tekenen: niet ook slepen */
    e.preventDefault();
    map.dragPan.disable(); canvas.style.cursor='grabbing';
    const g=document.createElement('div'); g.className='mk ghost';
    const ghost=new maplibregl.Marker({element:g}).setLngLat(e.lngLat).addTo(map);
    const move=ev=>ghost.setLngLat(ev.lngLat);
    const up=ev=>{
      map.off('mousemove',move); map.off('mouseup',up);
      map.dragPan.enable(); canvas.style.cursor=''; ghost.remove();
      skipClick=Date.now();
      addVia(`${ev.lngLat.lat.toFixed(5)}, ${ev.lngLat.lng.toFixed(5)}`);
      plan();
    };
    map.on('mousemove',move); map.on('mouseup',up);
  });
}
/* Alleen tussenstops plaatsen als je daar bewust om vraagt. Anders stapelen
   ze zich op bij elke klik en gaat je route overal langs. */
let addMode=false;
el('addMode').addEventListener('click',()=>{
  addMode=!addMode;
  el('addMode').classList.toggle('on',addMode);
  map.getCanvas().style.cursor=addMode?'crosshair':'';
  setStatus(addMode?'Klik op de kaart om een tussenstop te zetten.':'');
});
map.on('click',e=>{
  if(Date.now()-skipClick<400) return;
  if(teken.aan) return;
  if(map.getLayer('alts-line') &&
     map.queryRenderedFeatures(e.point,{layers:['alts-line']}).length) return;
  if(!addMode||!el('dest').value.trim()) return;
  addVia(`${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`);
  setStatus(`Tussenstop ${state.vias.length} gezet. Plan de route opnieuw, of zet de knop uit.`);
});


/* ================= route tekenen met je vinger =================
   Je trekt een vorm over de kaart; wij leggen daar een handvol punten op en
   laten de routeserver de echte wegen ertussen zoeken. Wat je terugkrijgt
   volgt jouw vorm, maar over asfalt en met jouw wegtype-instelling.

   Er komt geen nieuwe dienst bij kijken: vanaf hier is het precies dezelfde
   berekening als de knop Route plannen.

   Het aantal punten is de hele truc. Te veel en hij volgt elke trilling van je
   vinger, inclusief de rare bochtjes. Te weinig en hij snijdt je vorm af tot
   een rechte lijn. Eén punt per ~12 km blijkt de goede maat.

   We luisteren rechtstreeks naar de aanwijsgebeurtenissen van de browser
   (pointerdown/move/up) in plaats van naar die van de kaart. Eén weg voor
   muis, vinger en pen, en met setPointerCapture blijven we je vinger volgen
   ook als hij even van de kaart af glijdt. */
const teken={ aan:false, bezig:false, punten:[], px:null, pid:null };

function tekenLijnTonen(){
  const heeft=teken.punten.length>1;
  map.getSource('teken')?.setData(heeft
    ? {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:teken.punten}}
    : EMPTY);
  /* Zodra er een tekening ligt hoort de wisknop erbij te staan, ook als de pen
     alweer uit is. Anders moet je het paneel opentrekken om hem weg te halen. */
  el('drawClear').hidden=!heeft;
}

function tekenWis(){ teken.punten=[]; teken.bezig=false; tekenLijnTonen(); }

/* Onderweg staat het paneel dicht, dus setStatus() is op de telefoon
   onzichtbaar. Wat je tijdens het tekenen moet weten hoort over de kaart. */
function tekenZeg(tekst,fout){
  el('drawBanner').textContent=tekst;
  el('drawBanner').classList.toggle('err',!!fout);
  setStatus(tekst,fout);
}

const TEKEN_GREEP=['dragPan','dragRotate','touchZoomRotate','scrollZoom',
                   'doubleClickZoom','keyboard','touchPitch','boxZoom'];

function tekenModus(aan){
  teken.aan=aan;
  el('drawMode').classList.toggle('on',aan);
  el('drawBanner').hidden=!aan;
  const vak=map.getCanvasContainer();
  vak.style.cursor=aan?'crosshair':'';
  /* Zonder dit schuift of zoomt de browser zelf mee met je vinger. */
  vak.style.touchAction=aan?'none':'';
  /* Alle kaartbewegingen uit: je bent aan het tekenen óf aan het kijken,
     niet beide. Anders vecht de kaart met je vinger. */
  for(const naam of TEKEN_GREEP){
    try{ aan ? map[naam]?.disable() : map[naam]?.enable(); }catch{}
  }
  if(aan){
    if(addMode){ addMode=false; el('addMode').classList.remove('on'); }
    /* Het kaartmenu dicht. Op de telefoon dekt dat een flink stuk van je
       scherm af, en dan teken je op knoppen in plaats van op de kaart. */
    el('mapTools').classList.remove('open');
    el('toolsBtn').classList.remove('on');
    tekenZeg('Trek een vorm over de kaart. Eindig waar je begon voor een rondje.');
  }else{
    el('drawBanner').classList.remove('err');
  }
}

el('drawMode').addEventListener('click',()=>tekenModus(!teken.aan));
el('drawClear').addEventListener('click',()=>{
  tekenWis();
  if(teken.aan) tekenZeg('Tekening weg. Trek een nieuwe vorm.');
  else setStatus('Tekening weg.');
});

/* Waar op de kaart ligt dit puntje van het scherm? */
function tekenPlek(ev){
  const r=map.getCanvasContainer().getBoundingClientRect();
  const ll=map.unproject([ev.clientX-r.left, ev.clientY-r.top]);
  return [ll.lng,ll.lat];
}

function tekenNeer(ev){
  if(!teken.aan||teken.bezig) return;
  if(ev.button>0) return;                       /* alleen de linkerknop */
  ev.preventDefault();
  teken.bezig=true; teken.pid=ev.pointerId;
  try{ ev.currentTarget.setPointerCapture(ev.pointerId); }catch{}
  teken.px=[ev.clientX,ev.clientY];
  teken.punten=[tekenPlek(ev)];                 /* een nieuwe vorm wist de oude */
  tekenLijnTonen();
}

function tekenBeweeg(ev){
  if(!teken.aan||!teken.bezig||ev.pointerId!==teken.pid) return;
  ev.preventDefault();
  /* In beeldpunten meten en niet in meters: zo tekent het net zo fijn of je
     ver uitgezoomd zit of dicht op de kaart. */
  const dx=ev.clientX-teken.px[0], dy=ev.clientY-teken.px[1];
  if(dx*dx+dy*dy<36) return;                    /* minder dan 6 punten bewogen */
  teken.px=[ev.clientX,ev.clientY];
  teken.punten.push(tekenPlek(ev));
  tekenLijnTonen();
}

function tekenOp(ev){
  if(!teken.aan||!teken.bezig) return;
  teken.bezig=false; teken.pid=null;
  try{ ev.currentTarget.releasePointerCapture?.(ev.pointerId); }catch{}
  /* Na het optillen van je vinger komt er nog een klik langs. Die mag geen
     tussenstop worden. */
  skipClick=Date.now();
  tekenUitvoeren();
}

const tekenVak=map.getCanvasContainer();
tekenVak.addEventListener('pointerdown',tekenNeer);
tekenVak.addEventListener('pointermove',tekenBeweeg);
tekenVak.addEventListener('pointerup',tekenOp);
tekenVak.addEventListener('pointercancel',tekenOp);

/* De vorm opdelen in punten op gelijke afstand. Apart gezet zodat het na te
   rekenen is met de zelftest. Nooit meer dan 17 punten: de routeserver mag
   maar één aanroep per seconde en hij moet er wel iets van kunnen maken. */
function tekenPunten(lijn,perKm=12,maxVakken=16){
  const lcum=cumulative(lijn);
  const totaal=lcum[lcum.length-1];
  const vakken=Math.max(2,Math.min(maxVakken,Math.round(totaal/perKm)));
  const uit=[];
  for(let k=0;k<=vakken;k++){
    const doel=totaal*k/vakken;
    let i=lcum.findIndex(d=>d>=doel);
    if(i<0) i=lijn.length-1;
    uit.push(lijn[i]);
  }
  return uit;
}

function tekenUitvoeren(){
  const p=teken.punten;
  const lengte=p.length>1?cumulative(p).slice(-1)[0]:0;
  if(p.length<3){
    tekenZeg('Ik zag alleen een tik, geen lijn. Houd vast en sleep over de kaart.',true);
    tekenWis();
    return;
  }
  if(lengte<5){
    tekenZeg(`Je vorm is maar ${Math.round(lengte*1000)} meter lang. `
      +'Zoom eerst wat uit, dan wordt dezelfde veeg een echte rit.',true);
    tekenWis();
    return;
  }
  /* Eindig je in de buurt van je begin, dan wilde je een rondje. */
  const rond=haversine(p[0],p[p.length-1])<Math.max(2,lengte*0.12);
  const lijn=rond?[...p,p[0]]:p;
  const totaal=cumulative(lijn).slice(-1)[0];
  const punten=tekenPunten(lijn);

  /* Je hebt de hele vorm zelf getekend, dus heen-en-terug of een rondje er
     nóg eens omheen is niet wat je bedoelt. */
  const knop=document.querySelector('#tripMode button[data-m="one"]');
  if(knop&&tripMode!=='one') knop.click();

  const naam=c=>`${c[1].toFixed(5)}, ${c[0].toFixed(5)}`;
  el('start').value=naam(punten[0]);
  el('dest').value=naam(punten[punten.length-1]);
  state.vias=punten.slice(1,-1).map(naam);
  manualOrder=true; el('manualOrder').checked=true;
  renderVias();
  tekenModus(false);

  setStatus(`Je vorm is ${Math.round(totaal)} km lang${rond?' en loopt rond':''}. `
    +`Ik leg er ${punten.length} punten op en zoek de wegen ertussen. `
    +`Je tekening blijft als stippellijn staan, dan kun je vergelijken.`);
  plan();
}
