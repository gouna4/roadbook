/* Roadbook — 11-opstarten.js
   Als laatste: de app opstarten. Dit bestand moet onderaan blijven,
   want hier wordt alles wat hierboven staat voor het eerst gebruikt. */

/* ================= opstarten ================= */
el('addVia').addEventListener('click',()=>addVia());
attachAC(el('start')); attachAC(el('dest'));
el('dirt').addEventListener('input',e=>{ el('dirtVal').textContent=e.target.value; saveSettings(); });
['sprintKm','avoidTowns','noRepeat','noToll','noFerry','findPois','findStays','loopKm','findCurvy','zuinig']
  .forEach(id=>el(id).addEventListener('change',saveSettings));
['start','dest'].forEach(id=>{
  el(id).addEventListener('change',saveSettings);
  el(id).addEventListener('keydown',e=>{
    if(e.key==='Enter' && !document.querySelector('.ac:not([hidden])')){ e.preventDefault(); plan(); }
  });
});
el('depTime').value=store.get('rb.set',{}).depTime||'09:00';
updateDestLabel();


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

/* Offline werken: alleen als de browser het aanbiedt. Let op de vorm van deze
   vraag: `'serviceWorker' in navigator` is ook waar als het er staat maar op
   null — dat komt voor in een afgeschermd venster en op een gewone http-pagina.
   Dan klapte deze regel eruit, en alles wat er ná staat deed niets meer:
   je gedeelde route werd niet geopend en je vertrekpunt niet gepakt. */
if(navigator.serviceWorker)
  navigator.serviceWorker.register('sw.js').then(reg=>{
    /* Staat er een nieuwe versie klaar? Dat moet de app zelf zeggen. Anders
       loop je rond met een oude app en zie je de nieuwe dingen niet, zonder
       dat er iets op fout lijkt te staan. */
    reg.addEventListener('updatefound',()=>{
      const komt=reg.installing;
      if(!komt) return;
      komt.addEventListener('statechange',()=>{
        if(komt.state==='installed' && navigator.serviceWorker.controller)
          setStatus('Er staat een nieuwe versie van Roadbook klaar. '
            +'Sluit de app helemaal af en open hem opnieuw.');
      });
    });
  }).catch(()=>{});

const gedeeld=(location.hash.match(/^#r=(.+)$/)||[])[1];
if(gedeeld) applyShared(gedeeld);

/* Waar je vertrekt: gewoon waar je staat. De app vraagt bij het opstarten zelf
   je gps op en zet die in het vertrekveld — één handeling minder, en het klopt
   vaker dan de plaats die er de vorige keer stond.

   Heb je zelf een vertrekpunt ingetikt, dan blijft dat staan (`rb.startZelf`).
   En bij een gedeelde route ook niet: daar hoort het vertrek bij de rit. */
if(!gedeeld && !store.get('rb.startZelf',false)) pakMijnLocatie(true);
if(!store.ok())
  setStatus('Let op: dit venster mag geen gegevens bewaren. Op je eigen site werkt Bewaren wel.');
