'use strict';
/* TRAINING · Intervals.icu calendar upload v0.3
 * Uses official API directly. Credentials are never persisted.
 * Requests are only initiated after an explicit confirmation.
 */
(() => {
  let started=false, busy=false;
  const ATHLETE_STORE='training-icu-athlete-v1';
  const KEY_SESSION='training-icu-key-session-v1';
  const KEY_PERSIST='training-icu-key-device-v1';
  function save(key,value,persistent=false){
    const store=persistent?localStorage:sessionStorage;
    if(value)store.setItem(key,value);else store.removeItem(key);
  }
  function getStored(key,persistent=false){
    try{return (persistent?localStorage:sessionStorage).getItem(key)||''}catch(_){return ''}
  }
  function guessAthlete(){
    const dbName=(()=>{try{const db=JSON.parse(localStorage.getItem('training-performance-lab-v1')||'{}');return db.updated?.intervals?.filename||''}catch(_){return ''}})();
    const m=dbName.match(/(i\d{3,15})[_-]activities/i);
    return m?m[1]:'';
  }
  function remember(){
    const athlete=$('icuUploadAthlete').value.trim();
    const key=$('icuUploadKey').value;
    const persistent=$('icuRememberKey').checked;
    if(!/^i\d{1,15}$/.test(athlete)){message('Bitte eine gültige Athleten-ID eintragen.','error');return false}
    try{
      save(ATHLETE_STORE,athlete,true);
      if(key){
        save(KEY_SESSION,key);
        if(persistent)save(KEY_PERSIST,key,true);
        else save(KEY_PERSIST,'',true);
      }else if(!persistent){
        save(KEY_PERSIST,'',true);
      }else{
        message('Zum dauerhaften Speichern bitte den API-Schlüssel einmal eingeben.','error');return false;
      }
      message(persistent?'✓ Verbindung auf diesem Gerät hinterlegt. Bitte nur auf einem privaten Gerät verwenden.':'✓ Athleten-ID dauerhaft und API-Schlüssel für diesen Tab gemerkt.','success');
      return true;
    }catch(err){message('Browserspeicher nicht verfügbar: '+err.message,'error');return false}
  }
  function forget(){
    for(const [k,persistent] of [[ATHLETE_STORE,true],[KEY_SESSION,false],[KEY_PERSIST,true]]){
      try{save(k,'',persistent)}catch(_){}
    }
    $('icuUploadAthlete').value='';
    $('icuUploadKey').value='';
    $('icuRememberKey').checked=false;
    message('Gespeicherte Verbindung und die Eingabefelder wurden geleert.','success');
  }
  function hydrate(){
    const athlete=getStored(ATHLETE_STORE,true)||guessAthlete();
    if(athlete)$('icuUploadAthlete').value=athlete;
    const persistent=getStored(KEY_PERSIST,true);
    const session=getStored(KEY_SESSION);
    if(persistent){$('icuRememberKey').checked=true;$('icuUploadKey').value=persistent}
    else if(session){$('icuRememberKey').checked=false;$('icuUploadKey').value=session}
  }

  const $=id=>document.getElementById(id);
  const TODAY=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
  const message=(value,kind='')=>{
    const el=$('icuUploadMessage');el.textContent=value;el.classList.toggle('error',kind==='error');el.classList.toggle('success',kind==='success');
  };
  const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v+'T12:00:00Z'));
  function event(){
    const date=$('icuUploadDate').value,id=$('icuUploadWorkout').value;
    if(!window.TrainingCoach?.intervalsEvent)throw Error('Die Einheitenbibliothek ist noch nicht geladen. Bitte die Seite aktualisieren.');
    return window.TrainingCoach.intervalsEvent(id,date);
  }
  function preview(){
    try{
      const e=event();$('icuUploadDescription').textContent=e.name+'\nDatum: '+e.start_date_local.slice(0,10)+'\n\n'+e.description;
      $('icuUploadDescription').hidden=false;message('Vorschau erstellt. Es wurde noch nichts gesendet.');
      return e;
    }catch(err){message(err.message,'error');return null}
  }
  function fill(id,date){
    const select=$('icuUploadWorkout');
    if(id&&[...select.options].some(x=>x.value===id))select.value=id;
    if(date&&validDate(date))$('icuUploadDate').value=date;
    preview();
    $('intervalsConnectCard').scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function send(){
    if(busy)return;
    const athlete=$('icuUploadAthlete').value.trim(),key=$('icuUploadKey').value||getStored(KEY_SESSION)||getStored(KEY_PERSIST,true);
    if(!/^i\d{1,15}$/.test(athlete)){message('Bitte die Intervals.icu-Athleten-ID im Format i123456 eintragen.','error');return}
    if(!key||key.length<8){message('Bitte den persönlichen API-Schlüssel eintragen.','error');return}
    let e=preview();if(!e)return;
    const workout=e.name,when=e.start_date_local.slice(0,10);
    if(!confirm('Wirklich "'+workout+'" für den '+when+' an deinen Intervals.icu-Kalender übertragen?\n\nBitte vor erneutem Senden kontrollieren, ob dort bereits ein gleicher Eintrag existiert.'))return;
    // Store the identifier and optional key choice only after the explicit action.
    if(!remember())return;
    // Explicitly origin-pin the only remote endpoint; no backend, proxies or analytics.
    const url='https://intervals.icu/api/v1/athlete/'+encodeURIComponent(athlete)+'/events';
    const button=$('icuUploadSend');busy=true;button.disabled=true;button.textContent='Übertrage …';
    message('Verbindung zu Intervals.icu wird hergestellt …');
    try{
      const authorization='Basic '+btoa('API_KEY:'+key);
      const response=await fetch(url,{method:'POST',headers:{'Authorization':authorization,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(e),cache:'no-store',credentials:'omit',redirect:'error'});
      let body=null;
      try{body=await response.json()}catch(_){}
      if(!response.ok){
        const detail=body?.message||body?.error||'';
        throw Error('Intervals.icu meldet HTTP '+response.status+(detail?': '+String(detail).slice(0,200):'.'));
      }
      const id=body?.id;

      $('icuUploadDescription').hidden=true;
      message('✓ Training für den '+when+' erfolgreich an Intervals.icu übertragen.'+(id?' Kalender-Eintrag #'+id+'.':''),'success');
    }catch(err){

      const network=err instanceof TypeError;
      message(network?'Die Anfrage konnte nicht bestätigt werden (Netzwerk/CORS). Bitte zuerst den Intervals.icu-Kalender prüfen und nicht sofort erneut senden.':('Übertragung fehlgeschlagen: '+err.message+'. Vor erneutem Senden im Kalender nachsehen.'),'error');
    }finally{busy=false;button.disabled=false;button.textContent='An Intervals.icu senden'}
  }
  function render(){
    if(started)return;
    started=true;
    const list=window.TrainingCoach?.listWorkouts?.()||[];
    const select=$('icuUploadWorkout');select.replaceChildren();
    for(const w of list){
      const op=document.createElement('option');op.value=w.id;op.textContent=w.name;select.append(op);
    }
    $('icuUploadDate').value=TODAY();
    hydrate();
    $('icuSaveConnection').addEventListener('click',remember);
    $('icuForgetConnection').addEventListener('click',forget);
    $('icuRememberKey').addEventListener('change',()=>{
      if(!$('icuRememberKey').checked){
        try{save(KEY_PERSIST,'',true)}catch(_){}
        message('Dauerhafte Speicherung deaktiviert. Der Schlüssel bleibt nur für diesen Tab verfügbar.');
      }else{
        message('Achtung: Bei dauerhaftem Merken liegt der Schlüssel unverschlüsselt im Browserspeicher. Nur auf deinem privaten Gerät aktivieren.');
      }
    });
    $('icuUploadPreview').addEventListener('click',preview);
    $('icuUploadSend').addEventListener('click',send);
    select.addEventListener('change',()=>{$('icuUploadDescription').hidden=true});
    $('icuUploadDate').addEventListener('change',()=>{$('icuUploadDescription').hidden=true});
    // Credentials are only sent to intervals.icu; persistent local storage requires explicit opt-in.
    // Not included in the application's JSON backup or in any GitHub commit.
  }
  window.TrainingIntervalsSync={render,fill};
})();
