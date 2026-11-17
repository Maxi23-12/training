'use strict';
/* TRAINING automatic Intervals.icu API refresh v0.4.
   Direct browser GET only. Key is read from existing local/session connection,
   never sent anywhere other than https://intervals.icu. */
(() => {
  const $=id=>document.getElementById(id);
  const STORE='training-auto-sync-enabled-v1';
  const ATHLETE='training-icu-athlete-v1';
  const KEY_SESSION='training-icu-key-session-v1';
  const KEY_PERSIST='training-icu-key-device-v1';
  const EVERY=15*60*1000, WINDOW=60; // schedule: 15 minutes; always refresh last 60 days
  let context=null, initialized=false,busy=false,lastAttempt=0,lastGood=0,needsSyncAfterConnect=false;
  function ymd(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
  function plusDays(offset){const d=new Date();d.setDate(d.getDate()+offset);return ymd(d)}
  function getStore(k,store){try{return store.getItem(k)||''}catch(_){return ''}}
  function getCredentials(){
    const athlete=getStore(ATHLETE,localStorage)||$('icuUploadAthlete')?.value.trim()||'';
    const key=getStore(KEY_SESSION,sessionStorage)||getStore(KEY_PERSIST,localStorage)||$('icuUploadKey')?.value||'';
    return {athlete,key};
  }
  function status(message,kind=''){
    const el=$('autoSyncStatus');if(!el)return;
    el.textContent=message;el.classList.remove('ok','warn');if(kind)el.classList.add(kind);
  }
  function enabled(){return getStore(STORE,localStorage)!=='off'}
  function numeric(v){if(v==null||v==='')return null;let x=Number(v);return Number.isFinite(x)?x:null}
  function activity(o){
    if(!o||typeof o!=='object'||!o.id)return null;
    const d=o.start_date||o.start_date_local||o.startDate;
    if(typeof d!=='string'||!Number.isFinite(Date.parse(d)))return null;
    const type=String(o.type||''),sport=/ride|cycling|bike/i.test(type)?'bike':/run/i.test(type)?'run':'other';
    const dist=numeric(o.distance),move=numeric(o.moving_time),record=numeric(o.icu_recording_time);
    const corrected=move>10800&&record>300&&move>record*2;
    return {source:'intervals',id:String(o.id),date:d,name:String(o.name||'Aktivität'),sport,
      km:dist==null?0:Math.max(0,dist/1000),secs:corrected?record:(move||0),corrected,
      elapsed:numeric(o.elapsed_time),load:numeric(o.icu_training_load),watts:numeric(o.icu_average_watts),
      np:numeric(o.icu_normalized_watts),hr:numeric(o.average_heartrate)};
  }
  function wellness(o){
    if(!o||typeof o!=='object')return null;
    const date=String(o.id||o.date||'');
    if(!/^\d{4}-\d\d-\d\d$/.test(date))return null;
    const sl=numeric(o.sleepSecs),rv=numeric(o.hrvSDNN??o.hrv),hr=numeric(o.restingHR);
    return {date,sleep:sl>=3600&&sl<=72000?sl/3600:null,
      hrv:rv>0&&rv<300?rv:null,restingHR:hr>20&&hr<120?hr:null};
  }
  async function getJson(url,key){
    const auth='Basic '+btoa('API_KEY:'+key);
    const response=await fetch(url,{method:'GET',headers:{Authorization:auth,Accept:'application/json'},
      cache:'no-store',credentials:'omit',redirect:'error'});
    if(!response.ok)throw Error('HTTP '+response.status+(response.status===401||response.status===403?' – Zugang oder API-Rechte prüfen':''));
    return response.json();
  }
  function mergeActivity(existing, incoming){
    const map=new Map();
    for(const a of existing){if(!a?.id)continue;map.set(String(a.id),a)}
    for(const a of incoming){
      const key=String(a.id),old=map.get(key);
      // Never replace useful historical non-null measurements by missing API fields.
      map.set(key,old?{...old,...Object.fromEntries(Object.entries(a).filter(([k,v])=>
        v!==null&&v!==undefined&&(k!=='km'||v>0)&&(k!=='secs'||v>0)))}:a);
    }
    return [...map.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  }
  function mergeWellness(existing,incoming){
    const map=new Map();
    for(const a of existing){if(a?.date)map.set(a.date,a)}
    for(const a of incoming){
      const old=map.get(a.date)||{};
      map.set(a.date,{...old,...Object.fromEntries(Object.entries(a).filter(([k,v])=>v!==null&&v!==undefined))});
    }
    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }
  async function synchronize(manual=false){
    if(busy||!context||(!manual&&!enabled()))return;
    if(!manual&&lastAttempt&&Date.now()-lastAttempt<EVERY)return;
    const {athlete,key}=getCredentials();
    if(!/^i\d{1,15}$/.test(athlete)||!key){
      status('Noch keine Verbindung: Unter Coaching bitte zuerst den Intervals.icu-Zugang hinterlegen.','warn');
      return;
    }
    busy=true;lastAttempt=Date.now();$('autoSyncNow').disabled=true;
    status('Prüfe Intervals.icu auf neue Aktivitäten und Wellnesswerte …');
    try{
      const db=context.db;
      // More lookback for first successful read; afterward a sliding 60-day overlap.
      const first=!db.autoSync?.lastSuccess;
      const oldest=plusDays(first?-120:-WINDOW),newest=plusDays(1);
      const api='https://intervals.icu/api/v1/athlete/'+encodeURIComponent(athlete);
      const qs='?oldest='+oldest+'&newest='+newest;
      const [ar,wr]=await Promise.allSettled([
        getJson(api+'/activities'+qs,key),getJson(api+'/wellness'+qs,key)
      ]);
      const nextA=ar.status==='fulfilled'&&Array.isArray(ar.value)?ar.value.map(activity).filter(Boolean):null;
      const nextW=wr.status==='fulfilled'&&Array.isArray(wr.value)?wr.value.map(wellness).filter(Boolean):null;
      if(nextA===null&&nextW===null)throw Error('Aktivitäten: '+(ar.reason?.message||'Ungültige Antwort')+
        '; Wellness: '+(wr.reason?.message||'Ungültige Antwort'));
      const previousA=(db.liveIntervals||[]).length,previousW=(db.liveWellness||[]).length;
      // Keep source arrays and all historical CSV values untouched.
      if(nextA!==null)db.liveIntervals=mergeActivity(db.liveIntervals||[],nextA);
      if(nextW!==null)db.liveWellness=mergeWellness(db.liveWellness||[],nextW);
      const addA=(db.liveIntervals||[]).length-previousA,addW=(db.liveWellness||[]).length-previousW;
      db.autoSync={lastSuccess:new Date().toISOString(),oldest,newest,
        activityCount:nextA?.length??null,wellnessCount:nextW?.length??null,
        partial:nextA===null||nextW===null};
      const persisted=context.safeStore();
      context.rebuild();context.render();
      lastGood=Date.now();
      const summary='Letzte Prüfung: '+new Date().toLocaleString('de-DE')+' · '+
        (nextA===null?'Aktivitäten nicht abrufbar':addA+' neue API-Aktivitäten')+' · '+
        (nextW===null?'Wellness nicht abrufbar':addW+' neue Wellness-Tage')+'.';
      status(summary+(persisted?'':' Speichern fehlgeschlagen – bitte Backup sichern.'),db.autoSync.partial?'warn':'ok');
    }catch(e){
      status('Aktualisierung nicht möglich: '+String(e?.message||e)+'. Die bestehenden Daten bleiben unverändert.','warn');
    }finally{busy=false;$('autoSyncNow').disabled=false}
  }
  function render(ctx){
    context=ctx;
    if(!initialized){
      initialized=true;
      $('autoSyncEnabled').checked=enabled();
      $('autoSyncEnabled').addEventListener('change',e=>{
        try{localStorage.setItem(STORE,e.target.checked?'on':'off')}catch(_){}
        status(e.target.checked?'Automatische Aktualisierung ist eingeschaltet.':'Automatische Aktualisierung ist ausgeschaltet.');
        if(e.target.checked)synchronize(true);
      });
      $('autoSyncNow').addEventListener('click',()=>synchronize(true));
      document.addEventListener('visibilitychange',()=>{
        if(!document.hidden&&enabled())synchronize();
      });
      window.setInterval(()=>{if(!document.hidden&&enabled())synchronize()},EVERY);
    }
    const latest=context.db.autoSync;
    if(latest?.lastSuccess)$('autoSyncLast').textContent='Letzte erfolgreiche API-Prüfung: '+
      new Date(latest.lastSuccess).toLocaleString('de-DE')+
      (latest.partial?' · mindestens eine Datenquelle war nicht verfügbar':'');
    if(enabled()&&!lastAttempt)queueMicrotask(()=>synchronize());
  }
  window.TrainingAutoSync={render,refresh:()=>synchronize(true)};
})();