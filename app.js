'use strict';
(() => {
  const KEY='training-performance-lab-v1';
  const empty=()=>({version:1,settings:{ftp:280,hrMax:194},intervals:[],strava:[],renpho:[],wellness:[],liveIntervals:[],liveWellness:[],autoSync:null,updated:{}});
  let db=empty(), activities=[], page='overview',activityShown=40;
  const $=id=>document.getElementById(id);
  const fmt=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d}):'–';
  const n=v=>{if(v==null||String(v).trim()==='')return null;const x=Number(String(v).trim().replace(',','.'));return Number.isFinite(x)?x:null};
  const dstr=ms=>new Date(ms).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
  const dur=s=>!Number.isFinite(s)||s<=0?'–':(s>=3600?Math.floor(s/3600)+' h '+String(Math.round(s%3600/60)).padStart(2,'0')+' min':Math.round(s/60)+' min');
  const niceSport=s=>s==='bike'?'Rad':s==='run'?'Lauf':'Sonstiges';
  const sportOf=x=>/ride|radfahrt|radfahren|cycling|e-bike|ebike/i.test(x||'')?'bike':/run|lauf/i.test(x||'')?'run':'other';
  const safeTime=t=>Number.isFinite(Date.parse(t))?Date.parse(t):null;
  const pad=t=>String(t).padStart(2,'0');
  function stravaDate(x){
    const m=String(x||'').match(/^(\d{2})\.(\d{2})\.(\d{4}),?\s*(\d{2}):(\d{2}):(\d{2})/);
    if(!m)return null;
    // Strava export is in UTC; use UTC components for stable reconciliation.
    return m[3]+'-'+m[2]+'-'+m[1]+'T'+m[4]+':'+m[5]+':'+m[6]+'Z';
  }
  function csvParse(s){
    s=s.replace(/^\ufeff/,'').replace(/^<PARSED TEXT FOR SHEET:[^\n]*\nTAB NAME:[^\n]*>/,'');
    const out=[];let row=[],word='',quoted=false;
    for(let i=0;i<s.length;i++){const c=s[i];if(quoted){if(c==='"'){if(s[i+1]==='"'){word+='"';i++}else quoted=false}else word+=c}else if(c==='"')quoted=true;else if(c===','){row.push(word);word=''}else if(c==='\n'){row.push(word.replace(/\r$/,''));out.push(row);row=[];word=''}else word+=c}
    if(row.length||word){row.push(word.replace(/\r$/,''));out.push(row)}
    if(!out.length)throw Error('Die CSV-Datei ist leer.');
    const h=out.shift().map(t=>t.trim());return {h,rows:out.filter(r=>r.some(v=>String(v).trim()))};
  }
  const col=(h,...names)=>names.map(k=>h.indexOf(k)).find(i=>i>=0)??-1;
  const value=(r,i)=>i>=0?r[i]:undefined;
  const neq=(a,b)=>Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1000);
  const norm=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  function parseIntervals(txt){
    const {h,rows}=csvParse(txt);
    const iDate=col(h,'start_date','start_date_local'),iId=col(h,'id'),iName=col(h,'name'),iType=col(h,'type'),iDist=col(h,'distance'),iMove=col(h,'moving_time'),iRecord=col(h,'icu_recording_time'),iLoad=col(h,'icu_training_load'),iWatt=col(h,'icu_average_watts'),iNP=col(h,'icu_normalized_watts'),iHR=col(h,'average_heartrate'),iElapsed=col(h,'elapsed_time');
    if(iDate<0||iDist<0||iType<0)throw Error('Die Intervals.icu-Aktivitätsfelder wurden nicht gefunden.');
    return rows.map(r=>{
      const date=value(r,iDate);if(!safeTime(date))return null;
      const raw=n(value(r,iMove))||0,record=n(value(r,iRecord))||0;
      // Some Apple Watch commuter activities include an entire workday in elapsed/moving time.
      const correction=record>300&&raw>10800&&raw>record*2;
      return {source:'intervals',id:String(value(r,iId)||''),date,name:String(value(r,iName)||'Aktivität'),sport:sportOf(value(r,iType)),km:(n(value(r,iDist))||0)/1000,secs:correction?record:raw,elapsed:n(value(r,iElapsed)),corrected:correction,load:n(value(r,iLoad)),watts:n(value(r,iWatt)),np:n(value(r,iNP)),hr:n(value(r,iHR))};
    }).filter(Boolean);
  }
  function parseStrava(txt){
    const {h,rows}=csvParse(txt),iId=col(h,'Aktivitäts-ID'),iDate=col(h,'Aktivitätsdatum'),iName=col(h,'Name der Aktivität'),iType=col(h,'Aktivitätsart');
    const distCols=h.map((x,i)=>x==='Distanz'?i:-1).filter(i=>i>=0), iDistance=distCols.at(-1);
    const move=col(h,'Bewegungszeit');
    if(iId<0||iDate<0||iDistance==null||move<0)throw Error('Das ist offenbar kein Strava-Aktivitätenexport.');
    return rows.map(r=>{const date=stravaDate(value(r,iDate));return date?{source:'strava',id:String(value(r,iId)||''),date,name:String(value(r,iName)||'Aktivität'),sport:sportOf(value(r,iType)),km:(n(value(r,iDistance))||0)/1000,secs:n(value(r,move))||0,load:null,hr:null,watts:null,np:null}:null}).filter(Boolean);
  }
  function parseRenpho(txt){
    const {h,rows}=csvParse(txt),iDate=col(h,'Datum'),iWeight=col(h,'Gewicht(kg)');
    if(iDate<0||iWeight<0)throw Error('RENPHO-Datum oder Gewicht wurde nicht gefunden.');
    const vals=new Map();
    for(const r of rows){const s=String(value(r,iDate)||'').replace(/\./g,'-');const w=n(value(r,iWeight));if(/^\d{4}-\d{2}-\d{2}$/.test(s)&&w>30&&w<200)vals.set(s,{date:s,weight:w})}
    return [...vals.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }
  function parseWellness(txt){
    const {h,rows}=csvParse(txt),di=col(h,'date'),wi=col(h,'weight'),si=col(h,'sleepSecs'),hi=col(h,'hrvSDNN'),ri=col(h,'restingHR');
    if(di<0||si<0)throw Error('Die Wellness-CSV-Spalten wurden nicht gefunden.');
    return rows.map(r=>{const date=value(r,di);if(!/^\d{4}-\d\d-\d\d$/.test(date))return null;
      const sleep=n(value(r,si)),hrv=n(value(r,hi)),restingHR=n(value(r,ri));
      // Wellness export contains default weight, intentionally ignored. RENPHO is authoritative.
      return {date,sleep:sleep>=3600&&sleep<=72000?sleep/3600:null,hrv:hrv>0&&hrv<300?hrv:null,restingHR:restingHR>20&&restingHR<120?restingHR:null};
    }).filter(Boolean);
  }
  function safeStore(){
    try{localStorage.setItem(KEY,JSON.stringify(db));return true}
    catch(e){message('Speicherung auf diesem Gerät fehlgeschlagen (Speicherlimit oder privater Browser). Bitte JSON-Backup herunterladen.','error');return false}
  }
  function load(){
    try{const s=localStorage.getItem(KEY);if(s){const v=JSON.parse(s);if(v&&v.version===1){db={...empty(),...v,settings:{...empty().settings,...v.settings}}}}}
    catch(e){console.warn('Local data could not be loaded',e)}
    $('settingFTP').value=db.settings.ftp;$('settingHR').value=db.settings.hrMax;
    rebuild();render();
  }
  function rebuild(){
    const unique=new Map();
    for(const a of [...(db.intervals||[]),...(db.liveIntervals||[])]) {
      if(!a?.id)continue;
      const id=String(a.id),old=unique.get(id);
      unique.set(id,old?{...old,...Object.fromEntries(Object.entries(a).filter(([k,v])=>
        v!==null&&v!==undefined&&(k!=='km'||v>0)&&(k!=='secs'||v>0)))}:{...a});
    }
    // An older Intervals CSV and the live API can contain the same workout under
    // different IDs (e.g. after reconnecting a recording source). Reconcile only
    // very close matches; never delete or rewrite the imported source records.
    const liveIds=new Set((db.liveIntervals||[]).filter(a=>a?.id).map(a=>String(a.id)));
    const csvIds=new Set((db.intervals||[]).filter(a=>a?.id).map(a=>String(a.id)));
    const reconciled=[],byUtcDay=new Map();
    let collapsed=0;
    for(const a of unique.values()){
      const timestamp=safeTime(a.date);
      if(timestamp===null){reconciled.push(a);continue}
      const dayKeys=[-1,0,1].map(offset=>new Date(timestamp+offset*86400000).toISOString().slice(0,10));
      let match=-1,best=Infinity;
      for(const key of dayKeys)for(const i of (byUtcDay.get(key)||[])){
        const b=reconciled[i],otherTime=safeTime(b.date);
        if(otherTime===null||a.sport!==b.sport||a.sport==='other'||!(a.km>0&&b.km>0&&a.secs>0&&b.secs>0))continue;
        const dt=Math.abs(timestamp-otherTime)/1000;
        const distanceDiff=Math.abs(a.km-b.km),durationDiff=Math.abs(a.secs-b.secs);
        const nearStart=dt<=120&&distanceDiff<=Math.max(.10,Math.min(a.km,b.km)*.01)&&
          durationDiff<=Math.max(90,Math.min(a.secs,b.secs)*.02);
        // Some CSVs represent local time without a zone, causing an exact 1h/2h offset.
        // Only apply that exception across CSV/API sources, with much tighter metrics.
        const differentImports=(csvIds.has(String(a.id))&&!liveIds.has(String(a.id))&&liveIds.has(String(b.id)))||
          (csvIds.has(String(b.id))&&!liveIds.has(String(b.id))&&liveIds.has(String(a.id)));
        const sameSpecificName=norm(a.name)===norm(b.name)&&norm(a.name).length>=8;
        const shiftedStart=differentImports&&sameSpecificName&&
          (Math.abs(dt-3600)<=120||Math.abs(dt-7200)<=120)&&
          distanceDiff<=Math.max(.03,Math.min(a.km,b.km)*.002)&&
          durationDiff<=Math.max(15,Math.min(a.secs,b.secs)*.005);
        if(!(nearStart||shiftedStart))continue;
        const score=(nearStart?0:100000)+dt+distanceDiff*1000+durationDiff;
        if(score<best){match=i;best=score}
      }
      if(match>=0){
        const previous=reconciled[match];
        // Prefer live API details but preserve populated historical measurements.
        const preferred=liveIds.has(String(a.id))?a:previous;
        const fallback=preferred===a?previous:a;
        reconciled[match]={...fallback,...Object.fromEntries(Object.entries(preferred).filter(([k,v])=>
          v!==null&&v!==undefined&&(!['km','secs','load','watts','np','hr'].includes(k)||v>0)))};
        collapsed++;
      }else{
        const i=reconciled.push(a)-1,day=new Date(timestamp).toISOString().slice(0,10);
        if(!byUtcDay.has(day))byUtcDay.set(day,[]);
        byUtcDay.get(day).push(i);
      }
    }
    // Fallback for historic snapshots where the same distinctive workout has
    // a very different stored start time. Only exact titles on the same visible
    // calendar day, with nearly identical distance AND duration, qualify.
    // Generic names ("Radfahren", "Mittagslauf", etc.) are intentionally excluded.
    const fingerprinted=[],fingerprintDays=new Map();
    for(const a of reconciled){
      const time=safeTime(a.date),title=norm(a.name);
      const distinctive=title.length>=8&&(/\d/.test(a.name)||title.length>=15&&/\s/.test(a.name))&&
        !['radfahren','cycling','mittagfahrt','mittagslauf','laufen','commute','training'].includes(title);
      if(time===null||!distinctive||!['bike','run'].includes(a.sport)||!(a.km>0&&a.secs>0)){
        fingerprinted.push(a);continue;
      }
      const key=dstr(time)+'|'+a.sport+'|'+title;
      let found=-1;
      for(const i of (fingerprintDays.get(key)||[])){
        const b=fingerprinted[i];
        const distanceDiff=Math.abs(a.km-b.km);
        const durationDiff=Math.abs(a.secs-b.secs);
        if(distanceDiff<=Math.max(.10,Math.min(a.km,b.km)*.002)&&
           durationDiff<=Math.max(75,Math.min(a.secs,b.secs)*.012)){
          found=i;break;
        }
      }
      if(found<0){
        const i=fingerprinted.push(a)-1;
        if(!fingerprintDays.has(key))fingerprintDays.set(key,[]);
        fingerprintDays.get(key).push(i);
      }else{
        const previous=fingerprinted[found];
        const preferred=liveIds.has(String(a.id))?a:previous;
        const fallback=preferred===a?previous:a;
        fingerprinted[found]={...fallback,...Object.fromEntries(Object.entries(preferred).filter(([k,v])=>
          v!==null&&v!==undefined&&(!['km','secs','load','watts','np','hr'].includes(k)||v>0)))};
        collapsed++;
      }
    }
    activities=fingerprinted;
    db._intervalDuplicatesCollapsed=collapsed;
    const original=(db.strava||[]).map(x=>({...x}));
    const linkedI=new Set(),linkedS=new Set(),idMap=new Map(),byDay=new Map();
    activities.forEach((a,i)=>{if(a.id&&!idMap.has(a.id))idMap.set(a.id,i);const day=a.date.slice(0,10);if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(i)});
    original.forEach((s,j)=>{const i=idMap.get(s.id);if(i!==undefined&&!linkedI.has(i)){linkedI.add(i);linkedS.add(j)}});
    const candidates=[];
    original.forEach((s,j)=>{if(linkedS.has(j))return;for(const i of (byDay.get(s.date.slice(0,10))||[])){
      if(linkedI.has(i))continue;
      const a=activities[i],dt=Math.abs(safeTime(a.date)-safeTime(s.date))/1000,dr=neq((a.km||0)*1000,(s.km||0)*1000),same=norm(a.name)===norm(s.name);
      if((dt<=900&&dr<=.03)||(dt<=15)||(same&&dt<=3600&&dr<=.15)||(dt<=3600&&dr<=.005&&s.km>5)){
        candidates.push({i,j,score:dt+dr*3000});
      }
    }});
    candidates.sort((a,b)=>a.score-b.score);
    for(const c of candidates)if(!linkedI.has(c.i)&&!linkedS.has(c.j)){linkedI.add(c.i);linkedS.add(c.j)}
    activities.push(...original.filter((x,i)=>!linkedS.has(i)));
    activities.sort((a,b)=>safeTime(b.date)-safeTime(a.date));
    db._matchCount=linkedS.size;
  }
  function aggregate(){
    const annual=new Map(),monthly=new Map(),weekly=new Map();
    const append=(map,key,a)=>{let o=map.get(key);if(!o){o={key,bikeKm:0,bikeH:0,runKm:0,runH:0,load:0,loadN:0,n:0};map.set(key,o)}o.n++;
      if(a.sport==='bike'){o.bikeKm+=Math.max(a.km||0,0);o.bikeH+=Math.max(a.secs||0,0)/3600}
      if(a.sport==='run'){o.runKm+=Math.max(a.km||0,0);o.runH+=Math.max(a.secs||0,0)/3600}
      if(a.load!=null&&a.source==='intervals'){o.load+=a.load;o.loadN++}
    };
    for(const a of activities){const d=a.date.slice(0,10);if(!/^\d{4}-\d\d-\d\d$/.test(d))continue;append(annual,d.slice(0,4),a);append(monthly,d.slice(0,7),a);
      let date=new Date(d+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
      append(weekly,date.toISOString().slice(0,10),a);
    }
    return {annual,monthly,weekly};
  }
  function barChart(el,items,key,opt={}){
    el.replaceChildren();if(!items.length||!items.some(x=>x.value>0)){el.innerHTML='<div class="empty-chart">Hier erscheinen deine Daten nach dem Import.</div>';return}
    const wrap=document.createElement('div');wrap.className='bars'+(items.length>14?' compact':'');const max=Math.max(...items.map(x=>x.value||0),1);
    for(let i=0;i<items.length;i++){
      const x=items[i],cell=document.createElement('div');cell.className='bar-cell';cell.title=x.label+': '+fmt(x.value,1);
      const v=document.createElement('span');v.className='bar-value';v.textContent=opt.compact?fmt(x.value/1000,1)+'k':fmt(x.value,x.value<100?1:0);
      const b=document.createElement('div');b.className='bar'+(i===items.length-1?' accent':'');b.style.height=Math.max(2,(x.value||0)/max*100)+'%';
      const lab=document.createElement('span');lab.className='bar-label';lab.textContent=x.label;cell.append(v,b,lab);wrap.append(cell);
    }
    el.append(wrap);
  }
  const mons=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const valOf=(m,metric)=>metric==='km'?m.bikeKm:metric==='hours'?m.bikeH:metric==='runKm'?m.runKm:m.load;
  function latest(arr,field){return [...arr].filter(x=>x[field]!=null).sort((a,b)=>b.date.localeCompare(a.date))[0]}
  function noteHtml(t){const p=document.createElement('p');p.textContent=t;return p}
  function activityMarkup(a){
    const div=document.createElement('div');div.className='activity-row';
    const date=document.createElement('span');date.className='activity-date';date.textContent=dstr(safeTime(a.date));
    const title=document.createElement('div');title.className='activity-name';
    const name=document.createElement('strong');name.textContent=a.name;
    const small=document.createElement('small');small.textContent=(a.source==='strava'?'Strava':'Intervals.icu')+(a.corrected?' · Fahrzeit bereinigt':'');
    title.append(name,small);
    const sport=document.createElement('span');sport.className='tag-'+a.sport;sport.textContent=niceSport(a.sport);
    const km=document.createElement('span');km.className='activity-stat';km.textContent=(a.km>0?fmt(a.km,1)+' km':'–');
    const duration=document.createElement('span');duration.className='activity-stat';duration.textContent=dur(a.secs);
    div.append(date,title,sport,km,duration);return div;
  }
  function weightSeries(well){
    const perDay=new Map();
    for(const row of well){
      if(row?.date&&Number.isFinite(row.weight)&&row.weight>=30&&row.weight<=250)
        perDay.set(row.date,{date:row.date,weight:row.weight,source:'Intervals.icu'});
    }
    // Preserve the original RENPHO CSV when both sources have the same day.
    for(const row of (db.renpho||[])){
      if(row?.date&&Number.isFinite(row.weight)&&row.weight>=30&&row.weight<=250)
        perDay.set(row.date,{date:row.date,weight:row.weight,source:'RENPHO'});
    }
    return [...perDay.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }
  function drawOverview(ag){
    const now=Date.now(),week=7*86400000,eligible=a=>{
      const t=safeTime(a.date);return t!==null&&t<=now+3600000;
    };
    const last7=activities.filter(a=>eligible(a)&&safeTime(a.date)>=now-week);
    const last28=activities.filter(a=>eligible(a)&&safeTime(a.date)>=now-4*week);
    const hours=arr=>arr.filter(a=>a.sport==='bike').reduce((s,a)=>s+Math.max(0,a.secs||0),0)/3600;
    const loadRows=arr=>arr.filter(a=>a.source==='intervals'&&Number.isFinite(a.load)&&a.load>=0);
    const loadSum=arr=>loadRows(arr).reduce((s,a)=>s+a.load,0);
    const h7=hours(last7),h28=hours(last28),avg28=h28/4;
    const l7=loadSum(last7),l28=loadSum(last28);
    const loadCount=loadRows(last7).length;
    const days=new Set(last7.map(a=>a.date.slice(0,10))).size;
    const todayYear=String(new Date().getFullYear());
    const yearData=ag.annual.get(todayYear);
    const well=wellnessMerged(),sleep=latest(well,'sleep'),rest=latest(well,'restingHR'),hrv=latest(well,'hrv');
    const weight=weightSeries(well).at(-1);
    const shownDay=date=>date?dstr(Date.parse(date+'T12:00:00')):'Keine Messung';
    const wellnessDate=date=>'Messung '+shownDay(date);
    const lastActivity=activities.filter(eligible)[0];
    $('overviewAsOf').textContent=lastActivity?'Letzte Aktivität: '+dstr(safeTime(lastActivity.date)):'Noch keine Aktivitäten';
    $('kpiHours').textContent=last7.length?fmt(h7,1)+' h':'–';
    $('kpiHoursNote').textContent=h28>0?'Ø '+fmt(avg28,1)+' h/Woche · 28 Tage':'Noch kein 28-Tage-Vergleich';
    $('kpiLoad').textContent=loadCount?fmt(l7,0):'–';
    $('kpiLoadNote').textContent=loadCount&&loadRows(last28).length?'Ø '+fmt(l28/4,0)+' / Woche · 28 Tage':'Nur vorhandene Intervals.icu-Werte';
    $('kpiKm').textContent=yearData?fmt(yearData.bikeKm,0)+' km':'–';
    $('kpiKmNote').textContent=todayYear+' · Aufgezeichnete Kilometer';
    $('kpiDays').textContent=last7.length?String(days):'–';
    $('kpiDaysNote').textContent='Rad, Lauf & weitere Sportarten';
    $('overviewSleep').textContent=sleep?fmt(sleep.sleep,1)+' h':'–';
    $('overviewSleepDate').textContent=sleep?wellnessDate(sleep.date):'Keine Messung';
    $('overviewResting').textContent=rest?fmt(rest.restingHR,0)+' bpm':'–';
    $('overviewRestingDate').textContent=rest?wellnessDate(rest.date):'Keine Messung';
    $('overviewHrv').textContent=hrv?fmt(hrv.hrv,0)+' ms':'–';
    $('overviewHrvDate').textContent=hrv?wellnessDate(hrv.date):'Keine Messung';
    $('kpiWeight').textContent=weight?fmt(weight.weight,2)+' kg':'–';
    $('kpiWeightNote').textContent=weight?shownDay(weight.date)+' · '+weight.source:'Keine Messung';

    const lastT=lastActivity?safeTime(lastActivity.date):null;
    const recentSleep=sleep&&Date.parse(sleep.date+'T12:00:00')>=now-72*3600000;
    const highVolume=avg28>=1&&h7>avg28*1.5;
    let headline='Dein Training im Blick.',reason='Sobald aktuelle Aktivitäten vorhanden sind, siehst du hier eine vorsichtige Einordnung deines Trainingsumfangs.';
    if(lastT!==null&&lastT<now-4*86400000){
      headline='Erst den Datenstand prüfen.';
      reason='Die letzte aufgezeichnete Aktivität liegt einige Tage zurück. Wenn du wieder einsteigst, orientiere dich zuerst an deiner tatsächlichen Tagesform.';
    }else if(lastT!==null&&recentSleep&&sleep.sleep<6.5){
      headline='Heute lieber bewusst dosieren.';
      reason='Die zuletzt erfasste Schlafdauer war eher kurz. Eine lockere Einheit oder Erholung könnte besser passen als ein harter Reiz – dein Gefühl entscheidet.';
    }else if(lastT!==null&&highVolume){
      headline='Umfang steigt – Erholung mitdenken.';
      reason='Deine Radzeit in den vergangenen sieben Tagen liegt deutlich über dem 28-Tage-Wochendurchschnitt. Steigere nicht automatisch weiter.';
    }else if(lastT!==null){
      headline='Grundlage ist eine gute Option.';
      reason='Dein aktueller Trainingsverlauf ist erfasst. Für die heutige Einheit zählen zusätzlich Beine, Motivation, verfügbare Zeit und die Erholung.';
    }
    $('overviewCoachHeadline').textContent=headline;
    $('overviewCoachWhy').textContent=reason;
    $('overviewCoachHours').textContent=last7.length?fmt(h7,1)+' h':'–';
    $('overviewCoachAverage').textContent=h28>0?fmt(avg28,1)+' h/Woche':'–';

    // Anchor all eight bars on the CURRENT calendar week, not on the latest
    // imported workout. Missing weeks are shown as zero, not omitted.
    const monday=new Date();monday.setHours(12,0,0,0);
    monday.setDate(monday.getDate()-(monday.getDay()+6)%7);
    const series=[];
    for(let back=7;back>=0;back--){
      const d=new Date(monday);d.setDate(d.getDate()-back*7);
      const key=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
      series.push({label:pad(d.getDate())+'.'+pad(d.getMonth()+1),week:ag.weekly.get(key)||null});
    }
    barChart($('overviewWeeks'),series.map(x=>({label:x.label,value:x.week?.load||0})));
    barChart($('overviewHours'),series.map(x=>({label:x.label,value:x.week?.bikeH||0})));
    $('firstStart').hidden=activities.length>0;
    const recent=$('recentActivities');recent.replaceChildren();
    for(const a of activities.slice(0,5))recent.append(activityMarkup(a));
    if(!activities.length)recent.innerHTML='<div class="empty-chart">Deine letzten Einheiten erscheinen hier.</div>';
    const notes=$('coachNotes');notes.replaceChildren();
    if(last7.length)notes.append(noteHtml('Die vergangenen sieben Tage: '+fmt(h7,1)+' Radstunden an insgesamt '+days+' Trainingstagen.'));
    else notes.append(noteHtml('In den letzten sieben Tagen sind noch keine Aktivitäten erfasst.'));
    if(avg28>0)notes.append(noteHtml('Dein vierwöchiger Durchschnitt liegt bei '+fmt(avg28,1)+' Radstunden pro Woche. Entscheidend ist die Entwicklung über mehrere Wochen, nicht ein einzelner Tag.'));
    else notes.append(noteHtml('Für einen aussagekräftigen Umfangsvergleich benötigen wir weitere aufgezeichnete Wochen.'));
    if(yearData)notes.append(noteHtml('Bisher im Jahr '+todayYear+': '+fmt(yearData.bikeKm,0)+' Radkilometer. Weitere Jahresvergleiche findest du in der Historie.'));
    notes.append(noteHtml('Trainingslast, Schlaf und HRV helfen bei der Einordnung – sie sind allein keine sichere Aussage über deine Tagesform.'));
  }
  function drawHistory(ag){
    const select=$('historyYear');const years=[...ag.annual.keys()].sort().reverse(),old=select.value;
    select.replaceChildren();for(const y of years){const opt=document.createElement('option');opt.value=y;opt.textContent=y;select.append(opt)}
    select.value=years.includes(old)?old:(years.includes('2026')?'2026':years[0]||'');
    const ay=$('activityYear'),oldAy=ay.value;ay.replaceChildren();
    const opt=document.createElement('option');opt.value='all';opt.textContent='Alle Jahre';ay.append(opt);
    for(const y of years){const o=document.createElement('option');o.value=y;o.textContent=y;ay.append(o)}ay.value=years.includes(oldAy)?oldAy:'all';
    redrawHistory(ag);
    const tbody=$('annualTable');tbody.replaceChildren();for(const y of years){const a=ag.annual.get(y),tr=document.createElement('tr');const arr=[y,fmt(a.bikeKm,0),fmt(a.bikeH,1),fmt(a.runKm,0),fmt(a.n,0),a.loadN?fmt(a.load,0):'–'];for(const s of arr){const td=document.createElement('td');td.textContent=s;tr.append(td)}tbody.append(tr)}
  }
  function redrawHistory(ag){const y=$('historyYear').value,metric=$('historyMetric').value;
    const names={km:'Radkilometer',hours:'Radstunden',runKm:'Laufkilometer',load:'Trainingsbelastung'};
    $('historyTitle').textContent=names[metric]+' · '+(y||'–');
    const series=mons.map((label,i)=>({label,value:valOf(ag.monthly.get(y+'-'+pad(i+1))||{},metric)||0}));
    barChart($('historyChart'),y?series:[]);
    const year=ag.annual.get(y),s=$('historyStats');s.replaceChildren();
    if(year)for(const [k,v] of [['Radkilometer',fmt(year.bikeKm,0)+' km'],['Radstunden',fmt(year.bikeH,1)+' h'],['Laufkilometer',fmt(year.runKm,0)+' km'],['Aktivitäten',fmt(year.n)]]){const div=document.createElement('div');div.className='mini-stat';div.innerHTML='<strong></strong><small></small>';div.querySelector('strong').textContent=v;div.querySelector('small').textContent=k;s.append(div)}
  }
  function drawActivities(){
    let year=$('activityYear').value,sport=$('activitySport').value,term=$('activitySearch').value.toLowerCase().trim();
    const list=activities.filter(a=>(year==='all'||a.date.startsWith(year))&&(sport==='all'||a.sport===sport)&&a.name.toLowerCase().includes(term));
    $('activityCount').textContent=fmt(list.length)+' Aktivitäten'+
      (db._intervalDuplicatesCollapsed?' · '+fmt(db._intervalDuplicatesCollapsed)+' Doppelimporte ausgeblendet':'');
    const warning=$('activityStravaWarning');
    if(warning){
      const count=db.autoSync?.protectedStravaCount||0;
      warning.hidden=!(db.autoSync?.lastSuccess);
      if(!warning.hidden){
        const parts=['Automatische Intervals.icu-Aktualisierung ist nur teilweise vollständig: Strava-geschützte Aktivitäten werden über die API nicht mit ihren Originaldaten ausgeliefert.'];
        if(count)parts.push(count+' geschützte Strava-Platzhalter wurden beim letzten Abruf ausgelassen.');
        parts.push('Deshalb können neuere Einheiten hier fehlen, obwohl sie im Intervals.icu-Kalender sichtbar sind. Historische CSV-Daten bleiben erhalten.');
        warning.textContent=parts.join(' ');
      }
    }
    const el=$('activityList');el.replaceChildren();for(const a of list.slice(0,activityShown))el.append(activityMarkup(a));
    if(!list.length)el.innerHTML='<div class="empty-chart">Keine passenden Aktivitäten vorhanden.</div>';
    $('moreActivities').hidden=list.length<=activityShown;
  }
  function drawLine(el,rows,field,unit){el.replaceChildren();const valid=rows.filter(x=>Number.isFinite(x[field]));if(valid.length<2){el.innerHTML='<div class="empty-chart">Noch nicht genügend Messwerte vorhanden.</div>';return}
    const width=940,height=280,L=38,R=15,T=18,B=35;
    let values=valid.map(x=>x[field]),min=Math.min(...values),max=Math.max(...values);let p=(max-min)*.1||1;min-=p;max+=p;
    const xx=i=>L+i*(width-L-R)/Math.max(1,valid.length-1),yy=v=>T+(max-v)*(height-T-B)/(max-min);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.setAttribute('class','svg-chart');svg.setAttribute('role','img');svg.setAttribute('aria-label','Zeitreihe '+field);
    function add(type,attrs,text){const e=document.createElementNS('http://www.w3.org/2000/svg',type);for(const [k,v] of Object.entries(attrs||{}))e.setAttribute(k,String(v));if(text)e.textContent=text;svg.append(e);return e}
    for(let j=0;j<5;j++){let v=min+(max-min)*j/4,y=yy(v);add('line',{x1:L,x2:width-R,y1:y,y2:y,stroke:'#294256','stroke-dasharray':'3 5'});add('text',{x:L-5,y:y+4,'text-anchor':'end',fill:'#9db3c7','font-size':12},fmt(v,1))}
    add('polyline',{points:valid.map((row,i)=>xx(i)+','+yy(row[field])).join(' '),fill:'none',stroke:'#65dec6','stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round'});
    valid.forEach((row,i)=>{if(i%Math.max(1,Math.round(valid.length/7))!==0&&i!==valid.length-1)return;add('text',{x:xx(i),y:height-8,'text-anchor':'middle',fill:'#8faabc','font-size':12},row.date.slice(2,7))});
    const last=valid.at(-1);add('circle',{cx:xx(valid.length-1),cy:yy(last[field]),r:5,fill:'#65dec6'});
    const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent='Letzter Wert '+fmt(last[field],2)+' '+unit+' am '+last.date;svg.append(title);el.append(svg);
  }
  function wellnessMerged(){
    const map=new Map();
    for(const row of [...(db.wellness||[]),...(db.liveWellness||[])]) {
      if(!row?.date)continue;
      map.set(row.date,{...(map.get(row.date)||{}),...Object.fromEntries(Object.entries(row).filter(([k,v])=>v!==null&&v!==undefined))});
    }
    return [...map.values()];
  }
  function drawWellness(){
    const well=wellnessMerged(),sleep=latest(well,'sleep'),hrv=latest(well,'hrv'),rest=latest(well,'restingHR');
    const weigh=weightSeries(well);
    const w=weigh.at(-1);
    $('wellWeight').textContent=w?fmt(w.weight,2)+' kg':'–';
    $('wellWeightInfo').textContent=w?w.date+' · '+w.source:'Noch keine Gewichtsmessung';
    $('wellSleep').textContent=sleep?fmt(sleep.sleep,1)+' h':'–';
    $('wellHRV').textContent=hrv?fmt(hrv.hrv,1)+' ms':'–';
    $('wellRest').textContent=rest?fmt(rest.restingHR,0)+' bpm':'–';
    const metric=$('wellMetric').value,days=$('wellPeriod').value;
    let rows=metric==='weight'?weigh:well;rows=[...rows].sort((a,b)=>a.date.localeCompare(b.date));
    if(days!=='all'&&rows.length){const end=new Date(rows.at(-1).date+'T12:00:00Z').getTime(),floor=end-Number(days)*86400000;rows=rows.filter(x=>Date.parse(x.date+'T12:00:00Z')>=floor)}
    // Downsample only for rendering; preserve extreme points within each bucket.
    if(rows.length>500){const step=Math.ceil(rows.length/450);rows=rows.filter((x,i)=>i%step===0||i===rows.length-1)}
    drawLine($('wellChart'),rows,metric,metric==='weight'?'kg':metric==='sleep'?'h':metric==='hrv'?'ms':'bpm');
  }
  function drawData(){
    const div=$('importStats');div.replaceChildren();
    for(const [lab,v] of [['Intervals CSV',db.intervals.length],['Intervals API',db.liveIntervals.length],['Strava',db.strava.length],['Zusammengeführt',activities.length],['RENPHO',db.renpho.length],['Wellness',wellnessMerged().length]]){
      const el=document.createElement('div');el.className='mini-stat';const strong=document.createElement('strong');strong.textContent=fmt(v);const small=document.createElement('small');small.textContent=lab;el.append(strong,small);div.append(el)
    }
    $('dataStatus').textContent=activities.length?fmt(activities.length)+' Aktivitäten':'Noch keine Daten';
  }
  function render(){const agg=aggregate();drawOverview(agg);drawHistory(agg);drawActivities();drawWellness();drawData();if(window.TrainingCoach)window.TrainingCoach.render({db,activities,safeStore});if(window.TrainingIntervalsSync)window.TrainingIntervalsSync.render();if(window.TrainingAutoSync)window.TrainingAutoSync.render({db,rebuild,render,safeStore});}
  function navigate(name){page=name;document.querySelectorAll('.page').forEach(p=>{const active=p.id==='page-'+name;p.classList.toggle('active',active);p.hidden=!active});document.querySelectorAll('[data-nav]').forEach(x=>{const active=x.dataset.nav===name;x.classList.toggle('selected',active);x.setAttribute('aria-current',active?'page':'false')});window.scrollTo({top:0,behavior:'instant'})}
  function message(text,error=false){$('importMessage').textContent=text;$('importMessage').classList.toggle('error',!!error)}
  async function doFile(input,key,parser){
    const file=input.files?.[0];if(!file)return;
    try{message('Importiere '+file.name+' …');
      const content=await file.text();const parsed=parser(content);
      if(!parsed.length)throw Error('Keine gültigen Datensätze gefunden.');
      db[key]=parsed;db.updated[key]={filename:file.name,date:new Date().toISOString(),count:parsed.length};
      rebuild();const persisted=safeStore();render();message('✓ '+fmt(parsed.length)+' Datensätze aus '+file.name+' importiert.'+(persisted?' Lokal gespeichert.':' Bitte Backup sichern.'));
    }catch(e){console.error(e);message('Import fehlgeschlagen: '+e.message,true)}
    finally{input.value=''}
  }
  function backup(){
    try{const data=JSON.stringify({...db,_matchCount:undefined},null,2);const blob=new Blob([data],{type:'application/json'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='training-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);message('Private Sicherung heruntergeladen. Bitte sicher aufbewahren.')}
    catch(e){message('Backup konnte nicht erstellt werden: '+e.message,true)}
  }
  async function restore(input){
    const f=input.files?.[0];if(!f)return;
    try{const v=JSON.parse(await f.text());if(!v||v.version!==1||!['intervals','strava','renpho','wellness'].every(k=>Array.isArray(v[k])))throw Error('Keine gültige Trainingssicherung.');
      if(!confirm('Die lokalen Daten dieses Geräts durch dieses Backup ersetzen?'))return;
      db={...empty(),...v,settings:{...empty().settings,...v.settings}};rebuild();safeStore();$('settingFTP').value=db.settings.ftp;$('settingHR').value=db.settings.hrMax;render();message('✓ Backup wiederhergestellt.');
    }catch(e){message('Backup-Import fehlgeschlagen: '+e.message,true)}finally{input.value=''}
  }
  document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.nav)));
  document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));
  $('quickImport').addEventListener('click',()=>navigate('data'));
  $('fileIntervals').addEventListener('change',e=>doFile(e.currentTarget,'intervals',parseIntervals));
  $('fileStrava').addEventListener('change',e=>doFile(e.currentTarget,'strava',parseStrava));
  $('fileRenpho').addEventListener('change',e=>doFile(e.currentTarget,'renpho',parseRenpho));
  $('fileWellness').addEventListener('change',e=>doFile(e.currentTarget,'wellness',parseWellness));
  $('historyYear').addEventListener('change',()=>redrawHistory(aggregate()));
  $('historyMetric').addEventListener('change',()=>redrawHistory(aggregate()));
  ['activityYear','activitySport'].forEach(k=>$(k).addEventListener('change',()=>{activityShown=40;drawActivities()}));
  $('activitySearch').addEventListener('input',()=>{activityShown=40;drawActivities()});
  $('moreActivities').addEventListener('click',()=>{activityShown+=60;drawActivities()});
  ['wellMetric','wellPeriod'].forEach(k=>$(k).addEventListener('change',drawWellness));
  $('saveSettings').addEventListener('click',()=>{
    const ftp=n($('settingFTP').value),hrMax=n($('settingHR').value);
    if(ftp<100||ftp>600||hrMax<120||hrMax>240){message('FTP oder HFmax außerhalb plausibler Grenzen.',true);navigate('data');return}
    db.settings={ftp,hrMax};safeStore();message('Einstellungen gespeichert.');
  });
  $('exportBackup').addEventListener('click',backup);
  $('importBackup').addEventListener('change',e=>restore(e.currentTarget));
  $('clearData').addEventListener('click',()=>{
    if(!confirm('Alle lokal gespeicherten Trainings- und Gesundheitsdaten auf diesem Gerät löschen?'))return;
    try{localStorage.removeItem(KEY)}catch(e){}
    db=empty();activities=[];$('settingFTP').value=280;$('settingHR').value=194;render();message('Lokale Daten gelöscht.');
  });
  load();
})();
