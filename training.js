'use strict';
/*
 * TRAINING · Coach Desk V0.2.
 * Purely local, deterministic training suggestions. No network access.
 * Personal data arrive only from the surrounding app.
 */
(() => {
  let ctx=null, selectedId='endurance', suggestedId='endurance', started=false;
  const $=id=>document.getElementById(id);
  const fmt=(n,d=0)=>Number.isFinite(n)?n.toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d}):'–';
  const day=t=>new Date(t).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});
  const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const kcal=n=>Math.round(n);
  const workouts=[
    {id:'recovery',name:'Recovery Spin',min:45,type:'Erholung',level:'Sehr locker',percent:'45–60 % FTP',blurb:'Beine bewegen, ohne einen Trainingsreiz erzwingen zu wollen.',blocks:[['10 min','50 %'],['25 min','55–60 %'],['10 min','45–50 %']],shape:[50,55,55,55,50]},
    {id:'endurance',name:'Aerobic Flow',min:60,type:'Grundlage',level:'Locker',percent:'60–75 % FTP',blurb:'Kontrollierte aerobe Arbeit mit ruhiger Herzfrequenz. Auch draußen nach Gefühl fahrbar.',blocks:[['10 min','50–65 %'],['3 × 12 min','65–75 %, je 2 min locker dazwischen'],['10 min','55–60 %']],shape:[50,55,65,68,72,68,50,65,70,73,70,50,60,55]},
    {id:'tempo',name:'Sweetspot 3 × 10',min:65,type:'Sweetspot',level:'Moderat–hart',percent:'88–92 % FTP',blurb:'Zeit in oberer aerober Zone. Ruhig und gleichmäßig, nicht als Rennen.',blocks:[['12 min','progressives Warm-up, 50–80 %'],['3 × 10 min','88–92 % FTP'],['2 × 5 min','55–60 % zwischen den Blöcken'],['13 min','Cooldown, 60–45 %']],shape:[50,60,70,80,90,90,90,55,55,90,90,90,55,55,90,90,90,60,50]},
    {id:'vo2',name:'30/30 VO₂max 3 × 10',min:60,type:'VO₂max',level:'Hart',percent:'120 / 50 % FTP',blurb:'30 Sekunden hart, 30 Sekunden locker; drei Blöcke. Bei schwerer Müdigkeit verschieben.',blocks:[['15 min','Warm-up, progressiv inkl. kurzen Aktivierungen'],['3 × 10 min','je 10 × 30 s bei 120 % / 30 s bei 50 %'],['2 × 5 min','lockere Blockpause bei ca. 50 %'],['5 min','Cooldown 60–40 %']],shape:[50,60,70,85,120,50,120,50,120,50,50,120,50,120,50,120,50,50,120,50,120,50,120,50,55]},
    {id:'long',name:'Long Endurance',min:180,type:'Langstrecke',level:'Locker–moderat',percent:'60–75 % FTP',blurb:'Lange, gleichmäßige Grundlage – mit Verpflegung und kurzen Pausen nach Bedarf.',blocks:[['15 min','locker einrollen'],['150+ min','60–75 % FTP, Terrain nach Wahl'],['15 min','locker nach Hause rollen']],shape:[50,60,65,70,72,75,70,68,73,72,68,65,55]},
    {id:'free',name:'Freie Outdoor-Runde',min:60,type:'Flexibel',level:'Nach Tagesform',percent:'Ohne Wattvorgabe',blurb:'Fahren, weil draußen fahren > Rolle ist. Länge und Intensität nach Lust, Wetter und Beinen.',blocks:[['Gesamte Fahrt','Gesprächstempo als Ausgangspunkt'],['Anstiege','locker bis moderat; kein Intervallzwang']],shape:[45,55,62,68,65,74,58,65,55]}
  ];
  const get=id=>workouts.find(w=>w.id===id)||workouts[1];
  const watt=(pct)=>Math.round((ctx?.db?.settings?.ftp||280)*pct/100);
  const pctRange=s=>s.replace(/(\d+)\s*[–-]\s*(\d+)\s*%|(\d+)\s*%/g,(_,a,b,c)=>a!==undefined?a+'–'+b+' % ('+watt(+a)+'–'+watt(+b)+' W)':c+' % ('+watt(+c)+' W)');
  const ageHours=(a,b)=>(a-b)/3600000;
  const startTime=x=>Date.parse(x?.date||'');
  function derive(){
    const now=Date.now(),acts=ctx?.activities||[];
    const last=acts.length?startTime(acts[0]):NaN;
    const seven=acts.filter(a=>{const t=startTime(a);return t<=now+12*3600000&&t>now-7*86400000});
    const twentyEight=acts.filter(a=>{const t=startTime(a);return t<=now+12*3600000&&t>now-28*86400000});
    const hr=arr=>arr.filter(a=>a.sport==='bike').reduce((s,a)=>s+(a.secs||0),0)/3600;
    const load=arr=>arr.filter(a=>a.source==='intervals'&&a.load!==null&&a.load!==undefined&&Number.isFinite(a.load)).reduce((s,a)=>s+a.load,0);
    const hasLoad=arr=>arr.some(a=>a.source==='intervals'&&a.load!==null&&a.load!==undefined&&Number.isFinite(a.load));
    const days=new Set(seven.map(a=>a.date?.slice(0,10)).filter(Boolean));
    // "Hard" only where watts/NP or explicit structured workout title support it.
    const ftp=ctx?.db?.settings?.ftp||280;
    const hard=acts.filter(a=>{const t=startTime(a);if(!Number.isFinite(t)||t>now+12*3600000||t<now-28*86400000)return false;
      return /30[/-]30|vo2|vo₂|anaerobic|threshold|sweetspot|schwelle|interval/i.test(a.name||'') ||
        (a.sport==='bike'&&a.np!=null&&a.np>ftp*.92&&(a.secs||0)>=1500);
    });
    return {now,seven,twentyEight,h7:hr(seven),h28:hr(twentyEight),l7:load(seven),l28:load(twentyEight),l7n:hasLoad(seven),l28n:hasLoad(twentyEight),days:days.size,last,lastHard:hard.length?Math.max(...hard.map(a=>startTime(a))):NaN,stale:!Number.isFinite(last)||ageHours(now,last)>72,hasData:acts.length>0};
  }
  function choice(s){
    const goal=$('trainGoal').value,place=$('trainPlace').value,feel=$('trainFeel').value,time=Number($('trainTime').value);
    let id='endurance',why='';
    if(feel==='tired'){id='recovery';why='Du meldest schwere oder müde Beine. Das ist wichtiger als eine rechnerische Trainingslast. Kurze lockere Einheit oder Ruhe ist heute sinnvoll.'}
    else if(goal!=='auto'){
      id={base:'endurance',threshold:'tempo',vo2:'vo2',recovery:'recovery'}[goal]||'endurance';
      why='Der gewählte Schwerpunkt hat Vorrang – sofern du dich belastbar fühlst.';
    }else if(feel==='fresh'&&!s.stale&&s.hasData&&s.days<=5&&(Number.isFinite(s.lastHard)?ageHours(s.now,s.lastHard)>=72:true)&&time>=60){
      id='vo2';why='Du fühlst dich frisch, und in den verfügbaren Aufzeichnungen liegt kein klarer intensiver Reiz innerhalb der letzten 72 Stunden. Ein VO₂max-Reiz wäre eine Option – nicht Pflicht.';
    }else{
      id='endurance';why='Grundlage ist die flexible Standardoption. Ohne aktuelle verlässliche Ermüdungsinformationen erzwingen wir keine Intervalle.';
    }
    if(id==='vo2'&&time<60){id='endurance';why='Für die vollständige 30/30-Einheit ist dein Zeitfenster heute zu kurz. Lieber sauber Grundlage fahren.'}
    if(id==='tempo'&&time<60){id='endurance';why='Für einen vollständigen Sweetspot-Aufbau ist heute zu wenig Zeit.'}
    if(id==='endurance'&&time>=180&&feel!=='tired'){id='long';why='Du hast ausreichend Zeit und möchtest locker fahren: Eine längere Grundlagentour wäre möglich. Dauer an Wetter und Verpflegung anpassen.'}
    if(place==='outdoor'&&id==='vo2'&&goal==='auto'){id='free';why='Du möchtest draußen fahren. Bei guten Bedingungen zählt die Freude an der Runde – einen VO₂max-Block müssen wir nicht erzwingen.'}
    if(place==='outdoor'&&id==='endurance'){id='free';why='Draußen fahren ist dir wichtig. Eine freie aerobe Runde passt gut, solange du nicht jede Steigung zum Intervall machst.'}
    if(id==='recovery'&&time===30){why+=' Auch 30 Minuten locker rollen sind völlig okay.'}
    return {id,why};
  }
  function showChoice(){
    if(!ctx)return;
    const s=derive(),c=choice(s),w=get(c.id);suggestedId=c.id;
    const box=$('trainSuggestion');if(!box)return;box.replaceChildren();
    const sup=document.createElement('div');sup.className='sup';sup.textContent='MEIN VORSCHLAG';
    const head=document.createElement('h3');head.textContent=w.name+' · '+w.type;
    const desc=document.createElement('p');desc.textContent=w.blurb;
    const reason=document.createElement('p');reason.className='reason';reason.textContent=c.why;
    const wt=document.createElement('p');wt.textContent='Intensität: '+pctRange(w.percent)+' · Richtdauer: '+w.min+' min'+(w.id==='free'?' (variabel)':'');
    box.append(sup,head,desc,wt,reason);
  }
  function insight(s){
    $('train7h').textContent=s.hasData?fmt(s.h7,1)+' h':'–';
    $('train28h').textContent=s.hasData?fmt(s.h28/4,1)+' h/W':'–';
    $('train7load').textContent=s.l7n?fmt(s.l7):'–';
    $('train7days').textContent=s.hasData?String(s.days):'–';
    $('trainingDataNotice').textContent=!s.hasData?'Noch keine Aktivitäten importiert. Für individuelle Belastungsvergleiche zuerst deine Exporte laden.':
      s.stale?'Datenstand beachten: Deine letzte importierte Aktivität ist '+(Number.isFinite(s.last)?day(s.last):'unbekannt')+'. Empfehlungen stützen sich deshalb vor allem auf deine heutige Selbsteinschätzung.':
      'Aktivitätsdaten bis '+day(s.last)+' vorhanden. Die Empfehlungen berücksichtigen zusätzlich deine Tagesform und die aktuelle Trainingsdichte.';
    const el=$('trainInsight');el.replaceChildren();
    function p(t,bold){let x=document.createElement('p');if(bold){const strong=document.createElement('strong');strong.textContent=bold+' ';x.append(strong)}x.append(document.createTextNode(t));el.append(x)}
    if(!s.hasData){p('Die historische Datenbasis wird nach dem Import automatisch ausgewertet. Bis dahin kannst du die Einheiten-Bibliothek und den Planer unabhängig davon verwenden.');return}
    p(fmt(s.h7,1)+' Radstunden in den letzten sieben Kalendertagen; '+fmt(s.h28/4,1)+' Stunden pro Woche im 28-Tage-Mittel.','Umfang:');
    if(s.l7n)p(fmt(s.l7)+' Belastungspunkte in sieben Tagen. Fehlende Lastwerte werden nicht geschätzt.','Trainingslast:');
    else p('Für die letzten sieben Tage liegen keine auswertbaren Intervals.icu-Lastwerte vor.','Trainingslast:');
    if(s.stale)p('Die Aufzeichnungen sind nicht aktuell genug für eine belastbare Ermüdungsbewertung.','Datenqualität:');
    else if(s.h28/4>0&&s.h7>s.h28/4*1.5)p('Dein aktueller Radumfang liegt deutlich über dem Vierwochenmittel. Tempo und Regeneration bewusst steuern.','Umfangssprung:');
    else if(s.h28/4>0)p('Dein 7-Tage-Umfang lässt sich mit dem persönlichen 28-Tage-Mittel vergleichen. Belastbarkeit ergibt sich aber nicht allein aus Stunden oder TSS.','Einordnung:');
    p('Frische Beine, Schlaf, Motivation und Trainingsziel zählen mit. Ein langer Trainingshintergrund rechtfertigt keine automatische harte Einheit.','Grundsatz:');
  }
  function drawRecent(s){
    const box=$('trainRecent');box.replaceChildren();const latest=(ctx?.activities||[]).slice(0,5);
    if(!latest.length){const p=document.createElement('p');p.className='training-empty';p.textContent='Nach dem Import erscheinen hier die letzten Trainingseinheiten.';box.append(p);return}
    for(const a of latest){const d=document.createElement('div');d.className='recent-row';
      const t=document.createElement('time');t.textContent=day(startTime(a));const span=document.createElement('span');span.textContent=a.name;const b=document.createElement('b');b.textContent=a.km>0?fmt(a.km,1)+' km':Math.round((a.secs||0)/60)+' min';d.append(t,span,b);box.append(d)}
  }
  function blocks(w){
    const el=$('trainWorkoutDetail');el.replaceChildren();const h=document.createElement('h3');h.textContent=w.name+' · '+w.min+' Minuten';
    const p=document.createElement('p');p.textContent=w.blurb;
    const met=document.createElement('div');met.className='workout-meter';
    for(const x of w.shape){const bar=document.createElement('span');bar.className=x>=85?'hard':'';bar.style.height=Math.max(15,x/125*100)+'%';bar.style.flex='1';bar.title=x+' % FTP';met.append(bar)}
    const blk=document.createElement('div');blk.className='workout-blocks';
    for(const [duration,description] of w.blocks){const row=document.createElement('div');row.className='workout-block';const a=document.createElement('span');a.textContent=duration;const b=document.createElement('b');b.textContent=pctRange(description);row.append(a,b);blk.append(row)}
    const foot=document.createElement('p');foot.textContent=w.type==='VO₂max'?'Hinweis: 30/30-Intervalle unter ERG können kurze Leistungsrampen haben. Beurteile die Intervalle gemeinsam mit deiner Empfindung.':'Die Wattbereiche dienen auf der Rolle als Orientierung. Draußen nach Terrain, Puls und Gefühl fahren.';
    el.append(h,p,met,blk,foot);
  }
  function drawWorkouts(){
    $('trainFTPLabel').textContent=(ctx?.db?.settings?.ftp||280)+' W FTP';
    const list=$('trainWorkoutList');list.replaceChildren();
    const opts=$('trainPlanWorkout'),old=opts.value;opts.replaceChildren();
    for(const w of workouts){
      const btn=document.createElement('button');btn.type='button';btn.className='training-workout'+(selectedId===w.id?' selected':'');btn.dataset.workout=w.id;
      const b=document.createElement('strong');b.textContent=w.name;
      const small=document.createElement('small');small.textContent=w.min+' min · '+w.level;btn.append(b,small);
      btn.addEventListener('click',()=>{selectedId=w.id;drawWorkouts()});list.append(btn);
      const opt=document.createElement('option');opt.value=w.id;opt.textContent=w.name;opts.append(opt);
    }
    opts.value=workouts.some(w=>w.id===old)?old:suggestedId;
    blocks(get(selectedId));
  }
  function recordPlanned(){
    const db=ctx.db; if(!Array.isArray(db.planned))db.planned=[];
    return db.planned;
  }
  function planAdd(){
    const date=$('trainPlanDate').value,id=$('trainPlanWorkout').value,note=$('trainPlanNote').value.trim();
    const msg=$('trainPlanMessage');
    if(!/^\d{4}-\d\d-\d\d$/.test(date)){msg.textContent='Bitte ein gültiges Datum auswählen.';return}
    recordPlanned().push({id:'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),date,workout:id,note,status:'planned',created:new Date().toISOString()});
    ctx.safeStore();$('trainPlanNote').value='';msg.textContent='✓ Einheit vorgemerkt und lokal gespeichert.';msg.classList.add('success');drawPlan();
  }
  function drawPlan(){
    const el=$('trainPlanList');el.replaceChildren();
    const plans=[...recordPlanned()].sort((a,b)=>a.date.localeCompare(b.date)||a.created.localeCompare(b.created));
    if(!plans.length){const empty=document.createElement('p');empty.className='training-empty';empty.textContent='Hier ist noch nichts geplant. Wenn du Lust hast, suchst du dir eine passende Einheit aus – ganz ohne festen Wochenplan.';el.append(empty);return}
    for(const p of plans){
      const w=get(p.workout),line=document.createElement('div');line.className='training-plan-entry'+(p.status==='done'?' done':'');
      const top=document.createElement('div');top.className='line';
      const head=document.createElement('strong');head.textContent=w.name;
      const t=document.createElement('time');t.textContent=p.date.split('-').reverse().join('.');
      top.append(head,t);line.append(top);
      if(p.note){const note=document.createElement('p');note.textContent=p.note;line.append(note)}
      const state=document.createElement('p');state.textContent=p.status==='done'?'✓ Manuell als erledigt markiert':p.status==='skipped'?'↷ Verschoben / ausgefallen':'◯ Geplant';line.append(state);
      const acts=document.createElement('div');acts.className='actions';
      for(const [value,text] of [['planned','Geplant'],['done','Erledigt'],['skipped','Ausgefallen']]){
        const b=document.createElement('button');b.textContent=text;b.type='button';b.className=p.status===value?'active':'';b.addEventListener('click',()=>{p.status=value;ctx.safeStore();drawPlan()});acts.append(b)}
      const del=document.createElement('button');del.type='button';del.className='delete';del.textContent='Löschen';del.addEventListener('click',()=>{ctx.db.planned=recordPlanned().filter(x=>x.id!==p.id);ctx.safeStore();drawPlan()});acts.append(del);line.append(acts);el.append(line);
    }
  }
  function init(){
    if(started)return;started=true;
    $('trainPlanDate').value=today();
    for(const id of ['trainFeel','trainTime','trainPlace','trainGoal'])$(id).addEventListener('change',showChoice);
    $('trainShowWorkout').addEventListener('click',()=>{selectedId=suggestedId;drawWorkouts();$('trainWorkoutDetail').scrollIntoView({behavior:'smooth',block:'center'})});
    $('trainPlanSuggestion').addEventListener('click',()=>{ $('trainPlanWorkout').value=suggestedId;planAdd()});
    $('trainAddPlan').addEventListener('click',planAdd);
  }
  window.TrainingCoach={
    render(context){ctx=context;init();const s=derive();insight(s);drawRecent(s);showChoice();drawWorkouts();drawPlan()}
  };
})();