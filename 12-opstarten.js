/* Roadbook — 11-opstarten.js
   Als laatste: de app opstarten. Dit bestand moet onderaan blijven,
   want hier wordt alles wat hierboven staat voor het eerst gebruikt. */

/* ================= opstarten ================= */
el('addVia').addEventListener('click',()=>addVia());
attachAC(el('start')); attachAC(el('dest'));
el('dirt').addEventListener('input',e=>{ el('dirtVal').textContent=e.target.value; saveSettings(); });
['sprintKm','noHighway','avoidTowns','noRepeat','noDirt','noRidden','noToll','noFerry','findScenic','findPois','findStays','showPhotos','loopKm']
  .forEach(id=>el(id).addEventListener('change',saveSettings));
['start','dest'].forEach(id=>{
  el(id).addEventListener('change',saveSettings);
  el(id).addEventListener('keydown',e=>{
    if(e.key==='Enter' && !document.querySelector('.ac:not([hidden])')){ e.preventDefault(); plan(); }
  });
});
el('depTime').value=store.get('rb.set',{}).depTime||'09:00';
el('gpxPts').addEventListener('change',saveSettings);
updateDestLabel();

el('tipClose').addEventListener('click',()=>{ el('tip').hidden=true; store.set('rb.tip','off'); });
if(store.get('rb.tip')==='off') el('tip').hidden=true;

const remembered=store.get('rb.set');
if(remembered){
  applySettings(remembered);
  if(remembered.start) el('start').value=remembered.start;
  if(remembered.dest) el('dest').value=remembered.dest;
  state.vias=Array.isArray(remembered.vias)?remembered.vias:[];
  const last=store.get('rb.last');
  if(last?.pts){
    if(last.start) PICKED.set(last.start,last.pts.start);
    if(last.dest) PICKED.set(last.dest,last.pts.dest);
    (last.vias||[]).forEach((v,i)=>{ if(last.pts.vias?.[i]) PICKED.set(v,last.pts.vias[i]); });
  }
}
renderVias();
renderSaved();
ritBlokBij();
offGebiedenTonen();
offRuimteTonen();
renderLib();
renderLog();

/* Offline werken: alleen als sw.js naast index.html staat. */
if('serviceWorker' in navigator)
  navigator.serviceWorker.register('sw.js').catch(()=>{});

const gedeeld=(location.hash.match(/^#r=(.+)$/)||[])[1];
if(gedeeld) applyShared(gedeeld);
if(!store.ok())
  setStatus('Let op: dit venster mag geen gegevens bewaren. Op je eigen site werkt Bewaren wel.');
