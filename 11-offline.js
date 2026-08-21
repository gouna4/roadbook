/* Roadbook — 11-offline.js
   De kaart meenemen, zodat je hem ook ziet zonder bereik.

   We halen de kaartstukjes van een gebied binnen en zetten ze in een eigen
   kast (een Cache), los van de kast die zichzelf vult tijdens het kijken. Die
   laatste wordt opgeruimd als hij te vol raakt; wat jij bewust hebt
   binnengehaald mag nooit zomaar verdwijnen.

   Alleen van OpenFreeMap. Daar mag dit uitdrukkelijk en het kost niets.
   OpenTopoMap en de luchtfoto's van Esri zijn vrijwilligers- en
   bedrijfsdiensten die bulk-ophalen niet toestaan — die kun je onderweg dus
   wel bekijken, maar niet vooruit binnenhalen.

   Het diepste niveau bij OpenFreeMap is zoom 14. Dat is geen beperking: de
   kaart rekt die stukjes zelf uit naar 15 tot 18, dus inzoomen blijft werken.

   Hoe groot een stukje is loopt enorm uiteen: 2 KB boven de Ardennen, ruim
   500 KB boven Keulen. Daarom schatten we niet, maar meten we eerst een
   handvol stukjes van het gebied dat jij hebt gekozen. */

const OFF_KAST='roadbook-offline-v1';
const OFM='https://tiles.openfreemap.org';
const OFF_DIEPST=14;          /* dieper heeft OpenFreeMap niet */
const OFF_ONDIEPST=6;         /* daarboven is de wereldkaart al klein genoeg */
const OFF_MAXTEGELS=20000;    /* rem tegen een gebied van het halve continent */

let offBezig=false, offStop=false, offWachtend=null;

/* ================= welke stukjes horen bij een gebied? ================= */
function tegelX(lon,z){ return Math.floor((lon+180)/360*Math.pow(2,z)); }
function tegelY(lat,z){
  const r=lat*Math.PI/180;
  return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z));
}
/* Hoe breed is één stukje hier, in kilometers? Bij ons ongeveer 1,5 km op z14. */
function tegelKm(lat,z){ return 40075*Math.cos(lat*Math.PI/180)/Math.pow(2,z); }

/* Een strook langs de route: alle stukjes binnen zoveel kilometer van de lijn. */
function tegelsLangsLijn(shape,km){
  const uit=new Set(), z=OFF_DIEPST;
  const stap=Math.max(1,Math.floor(shape.length/2500));
  for(let i=0;i<shape.length;i+=stap){
    const lon=shape[i][0], lat=shape[i][1];
    const r=Math.max(1,Math.ceil(km/tegelKm(lat,z)));
    const x0=tegelX(lon,z), y0=tegelY(lat,z);
    for(let dx=-r;dx<=r;dx++) for(let dy=-r;dy<=r;dy++) uit.add(z+'/'+(x0+dx)+'/'+(y0+dy));
  }
  return uit;
}

/* Een rechthoek: wat je nu op het scherm hebt. */
function tegelsInVak(west,zuid,oost,noord){
  const uit=new Set(), z=OFF_DIEPST;
  const x1=tegelX(west,z), x2=tegelX(oost,z);
  const y1=tegelY(noord,z), y2=tegelY(zuid,z);
  for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++)
    for(let y=Math.min(y1,y2);y<=Math.max(y1,y2);y++) uit.add(z+'/'+x+'/'+y);
  return uit;
}

/* Bij elk stukje horen de grovere stukjes erboven, anders is de kaart leeg als
   je uitzoomt. Elk niveau omhoog is vier keer minder werk. */
function metOuders(set){
  const alles=new Set(set);
  let laag=[...set];
  for(let z=OFF_DIEPST-1;z>=OFF_ONDIEPST;z--){
    const boven=new Set();
    for(const s of laag){
      const d=s.split('/');
      boven.add(z+'/'+(+d[1]>>1)+'/'+(+d[2]>>1));
    }
    for(const s of boven) alles.add(s);
    laag=[...boven];
  }
  return alles;
}

/* ================= adressen ================= */
/* Zonder de stijl, de lettertypes en de symbolen blijft de kaart leeg, ook al
   heb je alle stukjes. Het zijn maar een paar bestanden. */
function offVasteAdressen(){
  const uit=[OFM+'/styles/liberty', OFM+'/planet'];
  for(const naam of ['Noto Sans Regular','Noto Sans Bold','Noto Sans Italic'])
    for(const bereik of ['0-255','256-511'])
      uit.push(OFM+'/fonts/'+encodeURIComponent(naam)+'/'+bereik+'.pbf');
  for(const e of ['.json','.png','@2x.json','@2x.png'])
    uit.push(OFM+'/sprites/ofm_f384/ofm'+e);
  return uit;
}

/* Het adres van de stukjes staat in een lijstje bij OpenFreeMap, met een datum
   erin. Dat lijstje bewaren we mee, zodat de kaart zonder bereik naar dezelfde
   stukjes blijft vragen als die we hebben binnengehaald. */
async function offTegelAdres(){
  const r=await fetch(OFM+'/planet');
  if(!r.ok) throw new Error('de kaartserver antwoordt niet.');
  const j=await r.json();
  const u=j?.tiles?.[0];
  if(!u) throw new Error('de kaartserver geeft geen adressen door.');
  return u;
}

const offUrl=(patroon,sleutel)=>{
  const d=sleutel.split('/');
  return patroon.replace('{z}',d[0]).replace('{x}',d[1]).replace('{y}',d[2]);
};

/* ================= binnenhalen ================= */
async function offHaal(kast,url){
  try{
    const r=await fetch(url);
    if(!r.ok) return 0;
    const kopie=r.clone();
    await kast.put(url,r);
    return (await kopie.arrayBuffer()).byteLength;
  }catch{ return 0; }
}

/* Niet schatten maar meten: van elk zoomniveau een paar stukjes ophalen en
   daarmee de rest doorrekenen. Die stukjes zijn niet weggegooid werk — ze
   staan meteen in de kast. */
async function offMeten(sleutels,patroon){
  const perZoom=new Map();
  for(const s of sleutels){
    const z=+s.split('/')[0];
    if(!perZoom.has(z)) perZoom.set(z,[]);
    perZoom.get(z).push(s);
  }
  const kast=await caches.open(OFF_KAST);
  let totaal=0, gemeten=0;
  for(const [z,lijst] of [...perZoom].sort((a,b)=>a[0]-b[0])){
    const n=Math.min(4,lijst.length);
    let som=0, gelukt=0;
    for(let i=0;i<n;i++){
      const b=await offHaal(kast,offUrl(patroon,lijst[Math.floor(i*lijst.length/n)]));
      if(b){ som+=b; gelukt++; }
      gemeten++;
      el('okEst').innerHTML=`Even meten hoe groot dit gebied is… (${gemeten} stukjes bekeken)`;
    }
    /* Lukt het meten niet, dan rekenen we met een voorzichtige 60 KB. */
    totaal+=lijst.length*(gelukt?som/gelukt:60*1024);
  }
  return totaal;
}

async function offDownload(urls,meta){
  if(offBezig) return;
  offBezig=true; offStop=false;
  try{
  const kast=await caches.open(OFF_KAST);
  let gedaan=0, mislukt=0, bytes=0;
  const totaal=urls.length;

  offBalk(0,totaal,0);
  /* Eén knop: tijdens het binnenhalen heet hij Stoppen. */
  el('okGo').hidden=false;
  el('okGo').textContent='Stoppen';
  el('okGo').dataset.rol='stop';

  /* Zes tegelijk: snel genoeg, en niet zo veel dat je verbinding dichtslibt. */
  const rij=urls.slice();
  const werker=async()=>{
    while(rij.length && !offStop){
      const n=await offHaal(kast,rij.pop());
      if(n) bytes+=n; else mislukt++;
      gedaan++;
      if(gedaan%10===0||!rij.length) offBalk(gedaan,totaal,bytes);
    }
  };
  await Promise.all([1,2,3,4,5,6].map(werker));

  offBezig=false;
  el('okGo').hidden=true;
  el('okGo').dataset.rol='';
  offBalk(gedaan,totaal,bytes);

  if(offStop){
    setStatus(`Gestopt na ${gedaan} van de ${totaal} stukjes. Wat er al staat blijft `
      +`bewaard, en je kunt later gewoon opnieuw beginnen.`);
  }else{
    const lijst=store.get('rb.gebieden',[]).filter(x=>x.naam!==meta.naam);
    lijst.unshift({...meta, id:Date.now(), aantal:gedaan-mislukt, bytes, at:Date.now()});
    store.set('rb.gebieden',lijst.slice(0,12));
    setStatus(`Klaar: "${meta.naam}" staat in je telefoon `
      +`(${(bytes/1048576).toFixed(0)} MB${mislukt?`, ${mislukt} stukjes mislukt`:''}). `
      +`Zet je wifi en mobiel internet even uit en kijk of de kaart blijft staan.`);
  }
  offGebiedenTonen();
  offRuimteTonen();
  }finally{
    /* Ook als het openen van de kast mislukt moet deze vlag omlaag, anders kun
       je nooit meer een gebied binnenhalen zonder de app te herstarten. */
    offBezig=false;
    el('okGo').dataset.rol='';
  }
}

function offBalk(gedaan,totaal,bytes){
  el('okBar').hidden=false;
  const pct=totaal?Math.round(gedaan/totaal*100):0;
  el('okBarIn').style.width=pct+'%';
  el('okBarTxt').textContent=`${pct}% · ${gedaan} van ${totaal} stukjes`
    +(bytes?` · ${(bytes/1048576).toFixed(1)} MB binnen`:'');
}

/* ================= wat gaat het kosten? ================= */
async function offKlaarzetten(tegels,naam,meta){
  if(offBezig){ setStatus('Er wordt al een gebied binnengehaald.',true); return; }
  const alles=metOuders(tegels);
  el('okGo').hidden=true;
  offWachtend=null;

  if(alles.size>OFF_MAXTEGELS){
    el('okEst').innerHTML=`<b>Dit gebied is te groot:</b> ${alles.size} kaartstukjes. `
      +`Kies een kleiner gebied, of een smallere strook langs je route.`;
    return;
  }
  el('okEst').innerHTML='Even meten hoe groot dit gebied is…';
  try{
    const patroon=await offTegelAdres();
    const sleutels=[...alles];
    const bytes=await offMeten(sleutels,patroon);
    const mb=Math.round(bytes/1048576);
    el('okEst').innerHTML=`<b>${naam}</b><br>${sleutels.length} kaartstukjes, `
      +`ongeveer <b>${mb} MB</b>.`
      +(mb>250?' Dat is veel — doe dit op wifi en met de lader erin.':' Doe dit op wifi.');
    el('okGo').hidden=false;
    el('okGo').textContent=`Binnenhalen (± ${mb} MB)`;
    offWachtend={ urls:offVasteAdressen().concat(sleutels.map(s=>offUrl(patroon,s))),
                  meta:{naam, ...meta} };
  }catch(e){
    el('okEst').innerHTML='';
    setStatus('Het meten lukte niet: '+e.message
      +' Zonder internet kan ik geen nieuw gebied binnenhalen.',true);
  }
}

el('okRoute').addEventListener('click',()=>{
  const v=state.variants?.[state.shown];
  if(!v?.shape?.length){
    setStatus('Plan eerst een route, dan weet ik welk gebied je nodig hebt.',true); return;
  }
  const km=+el('okBreed').value||5;
  const shape=state.fast.shape.length?state.fast.shape.concat(v.shape):v.shape;
  offKlaarzetten(tegelsLangsLijn(shape,km),
    `Strook van ${km} km langs je route`,
    {soort:'route', km, lijn:simplify(shape,0.4)});
});

el('okVak').addEventListener('click',()=>{
  const b=map.getBounds();
  const vak=[+b.getWest().toFixed(4),+b.getSouth().toFixed(4),
             +b.getEast().toFixed(4),+b.getNorth().toFixed(4)];
  offKlaarzetten(tegelsInVak(vak[0],vak[1],vak[2],vak[3]),
    'Het gebied dat je nu op je scherm hebt', {soort:'vak', vak});
});

el('okGo').addEventListener('click',async()=>{
  /* Dezelfde knop stopt het ook weer. */
  if(el('okGo').dataset.rol==='stop'){ offStop=true; return; }
  if(!offWachtend||offBezig) return;
  /* De telefoon vragen dit niet zomaar op te ruimen. Zegt hij nee, dan gaan we
     gewoon door; dan is het alleen minder zeker dat het blijft staan. */
  try{ await navigator.storage?.persist?.(); }catch{}
  const w=offWachtend;
  offWachtend=null;
  el('okEst').innerHTML='';
  await offDownload(w.urls,w.meta);
});


/* ================= wat staat er, en hoeveel ruimte kost het? ================= */
function offGebiedenTonen(){
  const lijst=store.get('rb.gebieden',[]);
  const box=el('okList');
  box.innerHTML='';
  el('okLeeg').hidden=!!lijst.length;
  lijst.forEach(g=>{
    const d=document.createElement('div'); d.className='r';
    const dag=new Date(g.at).toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
    d.innerHTML=`<div><div class="nm">${g.naam}</div>
      <div class="ds">${(g.bytes/1048576).toFixed(0)} MB · ${g.aantal} stukjes · ${dag}</div></div>`;
    const acts=document.createElement('div'); acts.className='acts';
    const opn=document.createElement('button'); opn.className='text-btn';
    opn.textContent='Opnieuw'; opn.title='Nog eens binnenhalen';
    opn.addEventListener('click',()=>offOpnieuw(g));
    const del=document.createElement('button'); del.className='text-btn';
    del.style.color='#8D9AA4'; del.textContent='×'; del.title='Weggooien';
    del.addEventListener('click',()=>offWeggooien(g));
    acts.append(opn,del); d.appendChild(acts); box.appendChild(d);
  });
}

function offSleutelsVan(g){
  if(g.soort==='vak'&&g.vak) return metOuders(tegelsInVak(g.vak[0],g.vak[1],g.vak[2],g.vak[3]));
  if(g.soort==='route'&&g.lijn?.length) return metOuders(tegelsLangsLijn(g.lijn,g.km||5));
  return new Set();
}

function offOpnieuw(g){
  setStatus('Ik kijk hoe groot dit gebied is; daarna kun je op Binnenhalen drukken. '
    +'Doe dit als de kaart onderweg leeg bleef — telefoons ruimen soms zelf op.');
  offKlaarzetten(offSleutelsVan(g), g.naam, g);
}

/* Weggooien mag geen ander gebied slopen: stukjes die ook bij een ander
   bewaard gebied horen laten we staan. */
async function offWeggooien(g){
  const anderen=store.get('rb.gebieden',[]).filter(x=>x.id!==g.id);
  const houden=new Set();
  for(const a of anderen) for(const s of offSleutelsVan(a)) houden.add(s);
  const weg=[...offSleutelsVan(g)].filter(s=>!houden.has(s));
  try{
    const kast=await caches.open(OFF_KAST);
    const patroon=await offTegelAdres();
    let n=0;
    for(const s of weg) if(await kast.delete(offUrl(patroon,s))) n++;
    store.set('rb.gebieden',anderen);
    offGebiedenTonen(); offRuimteTonen();
    setStatus(`"${g.naam}" is weg, ${n} stukjes opgeruimd.`);
  }catch{
    store.set('rb.gebieden',anderen);
    offGebiedenTonen();
    setStatus('Het gebied staat niet meer in de lijst, maar opruimen lukte niet '
      +'zonder internet. Dat gebeurt de volgende keer wel.',true);
  }
}

async function offRuimteTonen(){
  const box=el('okRuimte');
  if(!box) return;
  try{
    const s=await navigator.storage?.estimate?.();
    if(!s?.usage){ box.textContent=''; return; }
    box.textContent=`De app gebruikt nu ${(s.usage/1048576).toFixed(0)} MB`
      +(s.quota?` van de ${(s.quota/1048576).toFixed(0)} MB die je telefoon toestaat.`:'.');
  }catch{ box.textContent=''; }
}
