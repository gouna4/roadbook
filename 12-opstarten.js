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


/* De app begint met **lege velden**. Je vult zelf in waar je heen wil; er stond
   altijd nog de bestemming van de vorige keer, en die moest je dan eerst
   weghalen. Je instellingen (wegtype, onverhard, wat je onderweg wil zien)
   worden wél onthouden — die stel je één keer in en daarna niet meer.

   Alleen je vertrekpunt wordt gevuld, van je gps: dat is bijna altijd waar je
   staat. Zie het blok onderaan dit bestand. */
const remembered=store.get('rb.set');
if(remembered){
  applySettings(remembered);
  /* De plekken van je laatste rit blijven wel bekend. Typ je dezelfde plaats
     opnieuw, dan hoeft hij hem niet nog eens op te zoeken. */
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

/* Waar je vertrekt: gewoon waar je staat. Het veld begint leeg en de app vult
   het met je gps — dat klopt vaker dan de plaats die er de vorige keer stond.

   `rb.startZelf` gaat bij elke start op nul, want het veld is leeg: er is nog
   niets wat jij zelf hebt gekozen. Zodra je er wél zelf in typt gaat de vlag om
   en blijft jouw tekst staan, ook als het antwoord van de gps daarna pas komt.

   Bij een gedeelde route gebeurt het niet: daar hoort het vertrek bij de rit. */
store.set('rb.startZelf',false);
if(!gedeeld) pakMijnLocatie(true);
if(!store.ok())
  setStatus('Let op: dit venster mag geen gegevens bewaren. Op je eigen site werkt Bewaren wel.');
