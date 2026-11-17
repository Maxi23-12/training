'use strict';
(() => {
  const KEY='training-performance-lab-v1';
  const empty=()=>({version:1,settings:{ftp:280,hrMax:194},intervals:[],strava:[],renpho:[],wellness:[],updated:{}});
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
    activities=(db.intervals||[]).map(x=>({...x}));
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
  function drawOverview(ag){
    const ys=[...ag.annual.values()].sort((a,b)=>a.key.localeCompare(b.key));
    const year=ys.length?ys.at(-1).key:String(new Date().getFullYear()),cur=ag.annual.get(year);
    $('kpiKm').textContent=cur?fmt(cur.bikeKm,0)+' km':'–';$('kpiKmNote').textContent=cur?year+' · importierter Datenstand':'CSV-Dateien importieren';
    $('kpiHours').textContent=cur?fmt(cur.bikeH,0)+' h':'–';
    const latestActivity=activities[0],mostRecent=latestActivity?safeTime(latestActivity.date):Date.now(),lastWeek=(mostRecent-7*86400000);
    const weeklyLoad=activities.filter(a=>safeTime(a.date)>=lastWeek&&a.source==='intervals'&&a.load!=null).reduce((sum,a)=>sum+a.load,0);
    const loadCount=activities.filter(a=>safeTime(a.date)>=lastWeek&&a.source==='intervals'&&a.load!=null).length;
    $('kpiLoad').textContent=loadCount?fmt(weeklyLoad,0):'–';
    const w=latest(db.renpho||[],'weight');$('kpiWeight').textContent=w?fmt(w.weight,2)+' kg':'–';$('kpiWeightNote').textContent=w?dstr(Date.parse(w.date+'T12:00:00Z')):'RENPHO importieren';
    barChart($('overviewYears'),ys.filter(x=>x.bikeKm>0).slice(-9).map(x=>({label:x.key,value:x.bikeKm})),null,{compact:true});
    const weeks=[...ag.weekly.values()].sort((a,b)=>a.key.localeCompare(b.key)).filter(x=>x.key<=year+'-12-31').slice(-12);
    barChart($('overviewWeeks'),weeks.map(x=>({label:x.key.slice(5),value:x.load})));
    $('firstStart').hidden=activities.length>0;
    const recent=$('recentActivities');recent.replaceChildren();
    for(const a of activities.slice(0,5))recent.append(activityMarkup(a));
    if(!activities.length)recent.innerHTML='<div class="empty-chart">Deine letzten Einheiten erscheinen hier.</div>';
    const notes=$('coachNotes');notes.replaceChildren();
    if(ys.length>1){const all=ys.filter(x=>x.bikeH>0).sort((a,b)=>b.bikeH-a.bikeH);notes.append(noteHtml('Dein umfangreichstes Radjahr nach dokumentierten Fahrstunden: '+all[0].key+' mit '+fmt(all[0].bikeH,0)+' Stunden.'))}
    if(cur)notes.append(noteHtml('Im zuletzt erfassten Jahr stehen '+fmt(cur.bikeKm,0)+' Radkilometer und '+fmt(cur.bikeH,0)+' Stunden. Die Interpretation hängt auch vom Umfang der verfügbaren Daten ab.'));
    notes.append(noteHtml('Wichtig: CTL, TSS und Wattwerte sind keine direkten Leistungsnachweise. Training, Erholung und deine eigene Einschätzung gehören zusammen.'));
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
    $('activityCount').textContent=fmt(list.length)+' Aktivitäten';
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
  function drawWellness(){
    const weigh=(db.renpho||[]),w=latest(weigh,'weight'),well=db.wellness||[],sleep=latest(well,'sleep'),hrv=latest(well,'hrv'),rest=latest(well,'restingHR');
    $('wellWeight').textContent=w?fmt(w.weight,2)+' kg':'–';$('wellWeightInfo').textContent=w?w.date:'RENPHO importieren';
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
    for(const [lab,v] of [['Intervals',db.intervals.length],['Strava',db.strava.length],['Zusammengeführt',activities.length],['RENPHO',db.renpho.length],['Wellness',db.wellness.length]]){
      const el=document.createElement('div');el.className='mini-stat';const strong=document.createElement('strong');strong.textContent=fmt(v);const small=document.createElement('small');small.textContent=lab;el.append(strong,small);div.append(el)
    }
    $('dataStatus').textContent=activities.length?fmt(activities.length)+' Aktivitäten':'Noch keine Daten';
  }
  function render(){const agg=aggregate();drawOverview(agg);drawHistory(agg);drawActivities();drawWellness();drawData()}
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
