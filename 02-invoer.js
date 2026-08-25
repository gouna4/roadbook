/* Roadbook — 02-invoer.js
   Adressen en plaatsen zoeken, tussenstops beheren, wegtype-knoppen. */

/* ================= meetypen ================= */
const PICKED=new Map();
const KIND={ hotel:'Hotel',guest_house:'Pension',hostel:'Hostel',chalet:'Vakantiehuis',
  apartment:'Appartement',camp_site:'Camping',motel:'Motel',attraction:'Bezienswaardigheid',
  viewpoint:'Uitzichtpunt',museum:'Museum',castle:'Kasteel',ruins:'Ruïne',peak:'Top',
  water:'Water',wood:'Bos',restaurant:'Restaurant',cafe:'Café',fuel:'Tankstation',
  city:'Stad',town:'Plaats',village:'Dorp',hamlet:'Buurtschap' };

function acItem(f){
  const p=f.properties||{}, g=f.geometry?.coordinates;
  if(!g) return null;
  const name=p.name||[p.street,p.housenumber].filter(Boolean).join(' ')||p.city||p.county||'Naamloos';
  const ctx=[...new Set([p.city,p.district,p.county,p.state,p.country].filter(Boolean))]
    .filter(v=>v!==name).slice(0,3).join(' · ');
  return { name, ctx, kind:KIND[p.osm_value]||'', lat:g[1], lon:g[0],
           label: ctx?`${name}, ${ctx}`:name };
}

function attachAC(input){
  const box=document.createElement('div'); box.className='ac'; box.hidden=true;
  input.parentNode.appendChild(box);
  let items=[],sel=-1,timer=null,seq=0;
  const close=()=>{ box.hidden=true; box.innerHTML=''; items=[]; sel=-1; };
  const draw=()=>{
    box.innerHTML='';
    if(!items.length) box.innerHTML='<div class="note">Niets gevonden. Probeer plaats + land erbij.</div>';
    items.forEach((it,i)=>{
      const d=document.createElement('div');
      d.className='opt'+(i===sel?' sel':'');
      d.innerHTML=`<div class="n">${it.name}</div><div class="c">${it.kind?`<span class="k">${it.kind}</span> · `:''}${it.ctx||'—'}</div>`;
      d.addEventListener('mousedown',e=>{ e.preventDefault(); choose(i); });
      box.appendChild(d);
    });
    box.hidden=false;
  };
  const choose=i=>{
    const it=items[i]; if(!it) return;
    PICKED.set(it.label,{name:it.name,lat:it.lat,lon:it.lon});
    input.value=it.label; close();
    input.dispatchEvent(new Event('change'));
  };
  input.setAttribute('autocomplete','off');
  input.addEventListener('input',()=>{
    clearTimeout(timer);
    const q=input.value.trim();
    if(q.length<3){ close(); return; }
    timer=setTimeout(async()=>{
      const my=++seq;
      try{
        const c=map.getCenter();
        const r=await fetch(`${PHOTON}?limit=6&lang=de&lat=${c.lat.toFixed(3)}&lon=${c.lng.toFixed(3)}&q=${encodeURIComponent(q)}`);
        if(!r.ok||my!==seq) return;
        const j=await r.json();
        if(my!==seq) return;
        items=(j.features||[]).map(acItem).filter(Boolean); sel=-1; draw();
      }catch{}
    },280);
  });
  input.addEventListener('keydown',e=>{
    if(box.hidden||!items.length) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); sel=(sel+1)%items.length; draw(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); sel=(sel-1+items.length)%items.length; draw(); }
    else if(e.key==='Enter'&&sel>=0){ e.preventDefault(); choose(sel); }
    else if(e.key==='Escape'){ close(); }
  });
  input.addEventListener('blur',()=>setTimeout(close,150));
}

let lastNominatim=0;
async function resolve(text){
  const t=(text||'').trim();
  if(!t) return null;
  const hit=PICKED.get(t);
  if(hit) return {...hit};
  const m=t.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if(m) return { name:`${(+m[1]).toFixed(4)}, ${(+m[2]).toFixed(4)}`, lat:+m[1], lon:+m[2] };
  const wait=1100-(Date.now()-lastNominatim);
  if(wait>0) await sleep(wait);
  lastNominatim=Date.now();
  const r=await fetch(`${NOMINATIM}?format=jsonv2&limit=1&q=${encodeURIComponent(t)}`,
    {headers:{'Accept':'application/json'}});
  if(!r.ok) throw new Error('De plaatsenzoeker antwoordde niet. Probeer het over een minuut opnieuw.');
  const j=await r.json();
  if(!j.length) throw new Error(`"${t}" niet gevonden. Probeer plaats + land, of vul coördinaten in.`);
  return { name:(j[0].display_name||t).split(',')[0], lat:+j[0].lat, lon:+j[0].lon };
}

/* ================= tussenstops ================= */
function renderVias(){
  const box=el('vias'); box.innerHTML='';
  const n=state.vias.length;
  const move=(from,to)=>{
    to=Math.max(0,Math.min(n-1,to));
    if(to===from){ renderVias(); return; }
    if(typeof pushUndo==='function') pushUndo();
    const [x]=state.vias.splice(from,1);
    state.vias.splice(to,0,x);
    manualOrder=true;   /* punten die jij aanwijst houden hun volgorde */
    renderVias(); saveSettings();
    setStatus(`Punt staat nu op plek ${to+1}. Plan de route opnieuw.`);
  };
  state.vias.forEach((v,i)=>{
    const row=document.createElement('div'); row.className='via-row';
    row.innerHTML=`<div class="ord">
        <button class="up" title="Naar voren" aria-label="Punt ${i+1} naar voren">▲</button>
        <input class="numin" type="number" min="1" max="${n}" value="${i+1}"
               title="Typ een nummer om dit punt te verplaatsen"
               aria-label="Volgnummer van punt ${i+1}">
        <button class="dn" title="Naar achteren" aria-label="Punt ${i+1} naar achteren">▼</button>
      </div>
      <div class="field">
        <label>Punt ${i+1}</label>
        <input value="${String(v).replace(/"/g,'&quot;')}" placeholder="Plaats of coördinaten">
      </div>
      <button class="icon-btn" title="Verwijderen" aria-label="Punt ${i+1} verwijderen">×</button>`;
    const inp=row.querySelector('.field input');
    ['input','change'].forEach(ev=>inp.addEventListener(ev,e=>{ state.vias[i]=e.target.value; saveSettings(); }));
    attachAC(inp);
    const num=row.querySelector('.numin');
    num.addEventListener('change',()=>move(i,(parseInt(num.value,10)||i+1)-1));
    num.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); num.blur(); } });
    const up=row.querySelector('.up'), dn=row.querySelector('.dn');
    up.disabled=i===0; dn.disabled=i===n-1;
    up.addEventListener('click',()=>move(i,i-1));
    dn.addEventListener('click',()=>move(i,i+1));
    row.querySelector('.icon-btn').addEventListener('click',()=>{
      if(typeof pushUndo==='function') pushUndo();
      state.vias.splice(i,1); renderVias(); saveSettings();
    });
    box.appendChild(row);
  });
  updateDestLabel();
}

/* De bestemming krijgt het nummer dat er na jouw laatste punt komt. */
function updateDestLabel(){
  const n=state.vias.filter(v=>String(v).trim()).length;
  el('destLabel').textContent = tripMode==='loop'?'welke kant op':'bestemming';
}

function addVia(text=''){ if(typeof pushUndo==='function') pushUndo();
  state.vias.push(text); renderVias(); }

/* Wie bepaalt de volgorde van de tussenstops? Punten die je zelf op de kaart
   aanwijst houden de orde waarin je ze zette; getypte plaatsnamen sorteert de
   app langs de route. Daar hoef jij niets voor aan te vinken. */
/* Het toetsenbord weg als je ergens anders tikt. Op een telefoon blijft het
   anders staan tot je op het vinkje van het toetsenbord drukt, en dan zie je de
   halve app niet. We laten tikken in hetzelfde veld en in de suggestielijst met
   rust, anders kun je geen adres meer kiezen. */
document.addEventListener('pointerdown',e=>{
  const a=document.activeElement;
  if(!a||!/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
  if(e.target&&e.target.closest&&e.target.closest('.plek,.field,.ac,.numin,.slider,.zoekbalk')) return;
  a.blur();
},true);

/* Enter sluit het toetsenbord ook, tenzij je nog een suggestie aan het kiezen
   bent — dan is Enter voor die lijst. */
['start','dest'].forEach(id=>el(id).addEventListener('keydown',e=>{
  if(e.key!=='Enter') return;
  if(document.querySelector('.ac:not([hidden])')) return;
  el(id).blur();
}));

/* Een kruisje in het veld om het leeg te maken. Uitgummen met de terugtoets is
   op een telefoon met handschoenen aan geen werk voor een mens. Het kruisje
   verschijnt alleen als er iets staat. */
function wisKnopBij(veld,knop){
  el(knop).hidden = !el(veld).value.trim();
}
[['start','startWis'],['dest','destWis']].forEach(([veld,knop])=>{
  el(veld).addEventListener('input',()=>wisKnopBij(veld,knop));
  el(knop).addEventListener('click',()=>{
    el(veld).value='';
    wisKnopBij(veld,knop);
    el(veld).focus();
    /* De rest van de app moet weten dat het veld leeg is. */
    el(veld).dispatchEvent(new Event('input',{bubbles:true}));
    saveSettings();
  });
  wisKnopBij(veld,knop);
});

let manualOrder=false;

/* ================= wegtype-knoppen ================= */
document.querySelectorAll('#levels button').forEach(b=>{
  b.addEventListener('click',()=>{
    level=+b.dataset.v;
    document.querySelectorAll('#levels button').forEach(x=>x.classList.toggle('on',x===b));
    el('levelHint').textContent=LEVELS[level].hint;
    saveSettings();
  });
});

