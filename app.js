const DAYS=['P','W','Ś','C','P','S','N'];
const chevR=`<svg width="6" height="10" viewBox="0 0 6 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="1 1 5 5 1 9"/></svg>`;
const plusSVG=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const trashSVG=`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>`;
const checkSVG=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const homeSVG=`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><polyline points="9 21 9 12 15 12 15 21"/></svg>`;
const clockSVG=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 7 12 12 15 14"/></svg>`;

function defaultState(){
  return{
    sectors:[
      {id:'s1',name:'💼',schedules:[{startH:8,startM:0,endH:16,endM:0,weekdays:[0,1,2,3,4]}]},
      {id:'s2',name:'🏠',schedules:[{startH:17,startM:0,endH:21,endM:0,weekdays:[0,1,2,3,4]}]},
      {id:'sw',name:'☀️',schedules:[{startH:8,startM:0,endH:22,endM:0,weekdays:[5,6]}]},
    ],
    habits:[],
      daily:{},
    timeEntries:{}, // keyed by date → array of {id,label,isWork:bool,blocks:[{h,q}]}
  };
}

function migrateState(s){
  const nm={'Praca':'💼','Dom':'🏠','Weekend':'☀️'};
  for(const sec of s.sectors){
    if(nm[sec.name]) sec.name=nm[sec.name];
    if(!sec.schedules) sec.schedules=[{startH:sec.startH||8,startM:sec.startM||0,endH:sec.endH||17,endM:sec.endM||0,weekdays:sec.weekdays||[0,1,2,3,4]}];
    if(sec.isDefault===undefined) sec.isDefault=false;
  }
  for(const h of s.habits){
    if(h.paused!==undefined) delete h.paused;
    if(h.order===undefined) h.order=0;
  }
  for(const e of (s.extraStats||[])){
    if(e.order===undefined) e.order=0;
    if(e.url===undefined) e.url='';
  }
  if(!s.timeEntries) s.timeEntries={};
  // Remove legacy temps from daily entries
  for(const dk of Object.keys(s.daily||{})) delete s.daily[dk].temps;
  return s;
}

let state;
try{ const r=localStorage.getItem('hs9'); state=r?migrateState(JSON.parse(r)):defaultState(); }catch{ state=defaultState(); }
pruneOldTimeEntries(state); // #12: clean stale entries once at startup
let _saveTimer=null;
// #2: setState() — thin wrapper for state mutations. Use instead of direct state.x = y.
// Merges patch into state shallowly (top-level keys only), then schedules a save.
// Deep mutations (e.g. pushing to state.habits) still work — just call save() after.
function setState(patch){
  Object.assign(state, patch);
  save();
}
// UI-only state — not persisted to localStorage
const ui={ weekCalOpen:false, settingsOpen:false, doneFromTap:false };
function save(){
  // Debounce rapid saves (e.g. during animations)
  if(_saveTimer) clearTimeout(_saveTimer);
  _saveTimer=setTimeout(()=>{
    _saveTimer=null;
    saveNow();
  },300);
}
function saveNow(){
  if(_saveTimer){ clearTimeout(_saveTimer); _saveTimer=null; }
  try{ localStorage.setItem('hs9',JSON.stringify(state)); }catch{}
}
// #12: Prune old timeEntries once at load time, not on every save
function pruneOldTimeEntries(s){
  if(!s.timeEntries) return;
  const now=new Date();
  for(const dk of Object.keys(s.timeEntries)){
    const d=new Date(dk+'T00:00:00');
    if((now-d)/(864e5)>90) delete s.timeEntries[dk];
  }
}

let _todayCache=null,_todayTick=-1;
function today(){
  const now=Date.now();
  if(_todayTick<0||now-_todayTick>1000){ const d=new Date(); _todayCache=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; _todayTick=now; }
  return _todayCache;
}
function jsDay(){ const d=new Date().getDay(); return d===0?6:d-1; }
function fmtDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function getDayData(){ const k=today(); if(!state.daily[k]) state.daily[k]={habits:{},extras:{}}; return state.daily[k]; }

let _sectorCache=null,_sectorTick=-1;
function getActiveSectorCached(){
  const now=Date.now();
  if(_sectorTick<0||now-_sectorTick>5000){ _sectorCache=getActiveSector(); _sectorTick=now; }
  return _sectorCache;
}
function invalidateSectorCache(){ _sectorTick=-1; }
function isDone(v){ return v!==undefined&&v!==null&&v!==false&&v!==''; }

function getActiveSector(){
  const now=new Date(); const cur=now.getHours()*60+now.getMinutes(); const jsd=jsDay();
  for(const s of state.sectors)
    for(const sc of (s.schedules||[]))
      if(sc.weekdays.includes(jsd)&&cur>=sc.startH*60+sc.startM&&cur<sc.endH*60+sc.endM) return s;
  // fallback: sektor domyślny (brak harmonogramu) lub pierwszy sektor
  return state.sectors.find(s=>s.isDefault) || state.sectors[0] || null;
}


/* ── RENDER HOME ── */
function diffZone(container, items, makeRow){
  // Batch all reads before any writes to avoid layout thrashing
  const toRemove=[];
  Array.from(container.children).forEach(row=>{
    if(!items.find(it=>it.key===row.dataset.key)) toRemove.push(row);
  });
  if(toRemove.length){
    // Read phase: measure all at once
    const measures=toRemove.map(row=>{
      const h=row._cachedH||row.offsetHeight;
      const cs=getComputedStyle(row);
      return{row,h,mb:parseFloat(cs.marginBottom)||0,pt:parseFloat(cs.paddingTop)||0,pb:parseFloat(cs.paddingBottom)||0};
    });
    // Write phase: animate all at once
    measures.forEach(({row,h,mb,pt,pb})=>{
      row.classList.add('vanishing');
      const a=row.animate([
        {opacity:1,height:h+'px',marginBottom:mb+'px',paddingTop:pt+'px',paddingBottom:pb+'px',overflow:'hidden'},
        {opacity:0,height:'0px',marginBottom:'0px',paddingTop:'0px',paddingBottom:'0px',overflow:'hidden'}
      ],{duration:320,easing:'cubic-bezier(0.4,0,0.2,1)',fill:'forwards'});
      a.onfinish=()=>row.remove();
      setTimeout(()=>row.remove(),400);
    });
  }
  items.forEach((item,i)=>{
    let row=container.querySelector(`[data-key="${item.key}"]`);
    if(!row){
      row=makeRow(item); row.dataset.key=item.key;
      container.insertBefore(row,container.children[i]||null);
    } else {
      if(row!==container.children[i]) container.insertBefore(row,container.children[i]||null);
      row.classList.remove('dimmed');
    }
  });
}

function updateProgressBar(){
  const pb=document.getElementById('progressBar');
  const fill=document.getElementById('pbFill');
  if(!pb||!fill) return;
  const today_=today();
  const d=new Date(today_+'T00:00:00');
  const jsd=d.getDay()===0?6:d.getDay()-1;
  const sector=getActiveSectorCached();
  const habits=(state.habits||[]).filter(h=>h.sectorId===sector?.id&&(h.days||[]).includes(jsd));
  const dd=state.daily?.[today_]?.habits||{};
  const _done=habits.filter(h=>isDone(dd[h.id])).length;
  const _total=habits.length;
  if(_total===0||_done===_total){ pb.classList.remove('visible'); return; }
  pb.classList.add('visible');
  fill.style.width=Math.round(_done/_total*100)+'%';
}


// Build 7-day streak strip for a habit row
function buildStreakDots(h){
  const strip=document.createElement('div');
  strip.style.cssText='display:flex;gap:0;margin-top:8px;align-items:center;justify-content:center;';
  const now=new Date();
  // Start from Monday of current week
  const dow=now.getDay(); // 0=Sun
  const mon=new Date(now); mon.setDate(now.getDate()-(dow===0?6:dow-1));
  // Polish day index: 0=P(Mon)..6=N(Sun)
  for(let i=0;i<7;i++){
    const d=new Date(mon); d.setDate(mon.getDate()+i);
    const dk=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const active=h.days.includes(i);
    const done=active&&h.completions&&h.completions[dk];
    // Check prev/next for pill merging
    const prevDone=i>0&&h.days.includes(i-1)&&h.completions&&h.completions[fmtDate(new Date(mon.getTime()+(i-1)*864e5))];
    const nextDone=i<6&&h.days.includes(i+1)&&h.completions&&h.completions[fmtDate(new Date(mon.getTime()+(i+1)*864e5))];
    const el=document.createElement('div');
    const isFirst=done&&!prevDone; const isLast=done&&!nextDone;
    if(done){
      let br='';
      if(isFirst&&isLast) br='border-radius:6px';
      else if(isFirst) br='border-radius:6px 0 0 6px';
      else if(isLast) br='border-radius:0 6px 6px 0';
      else br='border-radius:0';
      el.style.cssText=`width:${100/7}%;height:4px;background:var(--accent);${br};`;
    } else if(active){
      el.style.cssText=`width:${100/7}%;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;`;
    } else {
      el.style.cssText=`width:${100/7}%;height:4px;background:transparent;`;
    }
    strip.appendChild(el);
  }
  return strip;
}
function renderHome(){
  const sector=getActiveSectorCached();
  const hList=document.getElementById('habitsList');
  const ds=document.getElementById('doneState');
  if(!hList) return;

  if(!sector){
    Array.from(hList.children).forEach(r=>{
      const cs=getComputedStyle(r),h=r.offsetHeight,mb=parseFloat(cs.marginBottom)||0,pt=parseFloat(cs.paddingTop)||0,pb=parseFloat(cs.paddingBottom)||0;
      r.animate([{height:h+'px',marginBottom:mb+'px',paddingTop:pt+'px',paddingBottom:pb+'px',overflow:'hidden'},{height:'0px',marginBottom:'0px',paddingTop:'0px',paddingBottom:'0px',overflow:'hidden'}],{duration:380,easing:'cubic-bezier(0.4,0,0.2,1)',fill:'forwards'});
    });
    setTimeout(()=>{ hList.innerHTML=''; ds.classList.add('show'); },440);
    return;
  }
  const dd=getDayData(); const jsd=jsDay();
  const habits=state.habits.filter(h=>h.sectorId===sector.id&&h.days.includes(jsd));
  habits.sort((a,b)=>(a.order||0)-(b.order||0));
  const remaining=habits.filter(h=>!isDone(dd.habits[h.id]));


  if(remaining.length===0){
    Array.from(hList.children).forEach(r=>{
      const cs=getComputedStyle(r),h=r.offsetHeight,mb=parseFloat(cs.marginBottom)||0,pt=parseFloat(cs.paddingTop)||0,pb=parseFloat(cs.paddingBottom)||0;
      r.animate([{height:h+'px',marginBottom:mb+'px',paddingTop:pt+'px',paddingBottom:pb+'px',overflow:'hidden'},{height:'0px',marginBottom:'0px',paddingTop:'0px',paddingBottom:'0px',overflow:'hidden'}],{duration:380,easing:'cubic-bezier(0.4,0,0.2,1)',fill:'forwards'});
    });
    const fromTap=ui.doneFromTap; ui.doneFromTap=false;
    setTimeout(()=>{
      hList.innerHTML='';
      if(fromTap){
        ds.classList.add('show');
      } else {
        // On initial load — show checkmark instantly, no animation
        ds.classList.add('show','show-instant');
      }
    },fromTap?400:0);
    const dz=document.getElementById('doneSettingsZone');
    if(dz) dz.style.display='block';
    return;
  }
  ds.classList.remove('show','show-instant');

  const dz=document.getElementById('doneSettingsZone');
  if(dz) dz.style.display='none';


  requestAnimationFrame(updateProgressBar);
  diffZone(hList, remaining.map(h=>({key:'h'+h.id,h})), item=>{
    const h=item.h, row=document.createElement('div');
    row.id='row-'+h.id; row.className='habit-row row-enter'; requestAnimationFrame(()=>{ const _cs=getComputedStyle(row); row._cachedH=row.offsetHeight; row._cachedMb=parseFloat(_cs.marginBottom)||0; row._cachedPt=parseFloat(_cs.paddingTop)||0; row._cachedPb=parseFloat(_cs.paddingBottom)||0; });
    let _ts=0,_ty=0,_moved=false;
    row.addEventListener('touchstart',e=>{_ts=Date.now();_ty=e.touches[0].clientY;_moved=false;},{passive:true});
    row.addEventListener('touchmove',e=>{if(Math.abs(e.touches[0].clientY-_ty)>5)_moved=true;},{passive:true});
    row.addEventListener('touchend',e=>{if(!_moved&&Date.now()-_ts<400)handleHabitTap(h.id);},{passive:true});
    row.style.userSelect='none';row.style.webkitUserSelect='none';
    // #13: Safe DOM construction — never use innerHTML with user-controlled data (XSS)
    const nameSpan=document.createElement('span');
    nameSpan.className='habit-name';
    nameSpan.textContent=h.name; // textContent is always safe
    // Wrap name + streak dots in a column
    const nameCol=document.createElement('div');
    nameCol.style.cssText='flex:1;display:flex;flex-direction:column;align-items:center;min-width:0;';
    nameCol.appendChild(nameSpan);
    nameCol.appendChild(buildStreakDots(h));
    if(h.trackTime && (h.type==='number'||h.type==='text')){
      const inp=document.createElement('input');
      inp.className='habit-value-input';
      inp.type=h.type==='number'?'number':'text';
      inp.inputMode=h.type==='number'?'numeric':'text';
      inp.placeholder='';
      inp.onclick=e=>e.stopPropagation();
      inp.onchange=()=>completeHabitInputThenTime(h.id,inp);
      row.appendChild(nameCol); row.appendChild(inp);
    } else if(h.trackTime){
      row.appendChild(nameCol);
    } else if(h.type==='number'||h.type==='text'){
      const inp=document.createElement('input');
      inp.className='habit-value-input';
      inp.type=h.type==='number'?'number':'text';
      inp.inputMode=h.type==='number'?'numeric':'text';
      inp.placeholder='';
      inp.onclick=e=>e.stopPropagation();
      inp.onchange=()=>completeHabitInput(h.id,inp);
      row.appendChild(nameCol); row.appendChild(inp);
    } else {
      row.appendChild(nameCol);
    }
    return row;
  });

}

/* ── THINGS TAP ── */
const timers={};
function thingsTap(key,onConfirm){
  const row=document.getElementById(`row-${key}`);
  if(!row) return;
  if(timers[key]){ clearTimeout(timers[key]); delete timers[key]; return; }
  const name=row.querySelector('.habit-name')?.textContent||'';

  onConfirm();
  updateProgressBar();

  // Use cached size to avoid forced reflow on tap (set in diffZone after first paint)
  const fullH=row._cachedH||row.offsetHeight;
  const cs=row._cachedH?null:getComputedStyle(row);
  const mb=row._cachedMb||(cs?parseFloat(cs.marginBottom)||0:0);
  const pt=row._cachedPt||(cs?parseFloat(cs.paddingTop)||0:0);
  const pb=row._cachedPb||(cs?parseFloat(cs.paddingBottom)||0:0);

  let _doneFired=false;
  const done=()=>{
    if(_doneFired) return; _doneFired=true;
    row.remove();
    ui.doneFromTap=true;
    renderHome();
    showUndoToast(name,key,onConfirm);
  };

  // Phase 1: dim quickly (~120ms)
  row.animate(
    [{ opacity:1 }, { opacity:0.35 }],
    { duration:120, easing:'ease-out', fill:'forwards' }
  );

  // Phase 2: hold dimmed, then collapse
  setTimeout(()=>{
    const anim=row.animate([
      { opacity:0.35, height:fullH+'px', marginBottom:mb+'px', paddingTop:pt+'px', paddingBottom:pb+'px', overflow:'hidden' },
      { opacity:0.35, height:'0px',      marginBottom:'0px',   paddingTop:'0px',   paddingBottom:'0px',  overflow:'hidden' }
    ],{ duration:400, easing:'cubic-bezier(0.4,0,0.2,1)', fill:'forwards' });
    anim.onfinish=done;
    setTimeout(done, 480);
  }, 420);
}
let _undoTimer=null,_undoKey=null,_undoConfirm=null;
function showUndoToast(name,key,onConfirm){
  const ex=document.getElementById('undoToast'); if(ex) ex.remove();
  if(_undoTimer){ clearTimeout(_undoTimer); _undoTimer=null; }
  _undoKey=key; _undoConfirm=onConfirm;
  const t=document.createElement('div');
  t.id='undoToast';
  t.style.cssText='position:fixed;bottom:calc(var(--safe-bottom)+110px);left:50%;transform:translateX(-50%);z-index:300;background:rgba(28,28,30,0.96);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:22px;padding:11px 20px 11px 16px;display:flex;align-items:center;gap:14px;font-size:14px;color:rgba(255,255,255,0.75);white-space:nowrap;animation:toastIn .25s cubic-bezier(.34,1.56,.64,1) forwards;box-shadow:0 4px 24px rgba(0,0,0,0.4);';
  // #XSS-fix: build toast via DOM — name is user-controlled, never inject via innerHTML
  const nameEl=document.createElement('span');
  nameEl.style.cssText='opacity:.55;max-width:170px;overflow:hidden;text-overflow:ellipsis';
  nameEl.textContent=name||'Gotowe';
  const undoBtn=document.createElement('button');
  undoBtn.style.cssText='background:none;border:none;color:var(--accent);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;padding:0;touch-action:manipulation';
  undoBtn.textContent='Cofnij';
  undoBtn.onclick=undoLastComplete;
  t.appendChild(nameEl); t.appendChild(undoBtn);
  document.body.appendChild(t);
  _undoTimer=setTimeout(dismissUndoToast,3200);
}
function dismissUndoToast(){
  if(_undoTimer){ clearTimeout(_undoTimer); _undoTimer=null; }
  const t=document.getElementById('undoToast'); if(!t) return;
  t.style.animation='toastOut .2s ease forwards';
  setTimeout(()=>t.remove(),220);
  _undoKey=null; _undoConfirm=null;
}
function undoLastComplete(){
  dismissUndoToast();
  if(!_undoKey) return;
  const hId=_undoKey;
  const dd=getDayData(); delete dd.habits[hId]; save(); renderHome();
}
function handleHabitTap(hId){
  const h=state.habits.find(x=>x.id===hId); if(!h) return;
  if(h.trackTime){
    if(h.type==='number'||h.type==='text'){
      openInputSheetThenTime(h);
      return;
    }
    openTimeTracker(hId); return;
  }
  if(h.type==='number'||h.type==='text') return;
  if(h.url){ thingsTap(hId,()=>{ completeHabit(hId,true); try{ window.open(h.url,'_blank'); }catch(e){} }); return; }
  thingsTap(hId,()=>completeHabit(hId,true));
}

function openInputSheetThenTime(h){
  curHabit=h;
  document.getElementById('inputSheetLabel').textContent=h.name;
  const f=document.getElementById('inputSheetField');
  f.value=''; f.type=h.type==='number'?'number':'text';
  f.inputMode=h.type==='number'?'numeric':'text';
  f.placeholder=h.type==='number'?'0':'';
  // #fix: use one-shot AbortController instead of patching onclick — no risk of double-wrap
  const ac=new AbortController();
  const confirmBtn=document.querySelector('#inputSheet .is-confirm');
  if(confirmBtn){
    confirmBtn.addEventListener('click',()=>{
      ac.abort(); // remove this listener immediately
      const v=f.value.trim();
      if(v){ completeHabit(h.id,v); }
      closeInputSheet();
      openTimeTracker(h.id);
    },{signal:ac.signal,once:true});
  }
  showSheet('inputSheet');
  setTimeout(()=>f.focus(),340);
}
function completeHabit(hId,val){ const dd=getDayData(); dd.habits[hId]=val; save(); }
function completeHabitInput(hId,input){
  const val=input.value.trim(); if(!val) return;
  input.blur();
  const row=document.getElementById('row-'+hId); if(!row) return;
  completeHabit(hId,val);
  const cs2=getComputedStyle(row),h2=row.offsetHeight,mb2=parseFloat(cs2.marginBottom)||0,pt2=parseFloat(cs2.paddingTop)||0,pb2=parseFloat(cs2.paddingBottom)||0;
  row.animate([{height:h2+'px',marginBottom:mb2+'px',paddingTop:pt2+'px',paddingBottom:pb2+'px',overflow:'hidden'},{height:'0px',marginBottom:'0px',paddingTop:'0px',paddingBottom:'0px',overflow:'hidden'}],{duration:320,easing:'cubic-bezier(0.4,0,0.2,1)',fill:'forwards'}).onfinish=()=>renderHome();
}
function completeHabitInputThenTime(hId,input){
  const val=input.value.trim(); if(!val) return;
  input.blur();
  if(val) completeHabit(hId,val);
  openTimeTracker(hId);
}

/* ── INPUT SHEET ── */
let curHabit=null;
function openInputSheet(h){
  curHabit=h;
  document.getElementById('inputSheetLabel').textContent=h.name;
  const f=document.getElementById('inputSheetField');
  f.value=''; f.type=h.type==='number'?'number':'text';
  f.inputMode=h.type==='number'?'numeric':'text';
  f.placeholder=h.type==='number'?'0':'';
  showSheet('inputSheet');
  setTimeout(()=>f.focus(),340);
}
function closeInputSheet(){ hideSheet('inputSheet'); curHabit=null; }
function confirmInput(){
  if(!curHabit) return;
  const v=document.getElementById('inputSheetField').value.trim();
  if(v){ completeHabit(curHabit.id,v); closeInputSheet(); }
  else closeInputSheet();
}


/* ── EXTRAS SHEET ── */
function openSheet(){
  const dd=getDayData(); const body=document.getElementById('sheetBody');
  const extras=(state.extraStats||[]).slice().sort((a,b)=>(a.order||0)-(b.order||0));
  const pending=extras.filter(e=>!isDone(dd.extras?.[e.id]));
  if(!pending.length){
    body.innerHTML=`<div class="extras-done"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>`;
    showSheet('mainSheet'); return;
  }
  let html='<div style="display:flex;flex-direction:column;gap:10px;padding:8px 0">';
  for(const e of pending){
    if(e.type==='checkbox'){
      html+=`<div id="xrow-${e.id}" style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.06);border-radius:14px;padding:14px 16px;gap:12px">
        <span style="font-size:16px;color:#fff">${e.name.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>
        <button onclick="completeExtraCheck('${e.id}')" style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">✓</button>
      </div>`;
    } else {
      html+=`<div id="xrow-${e.id}" style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.06);border-radius:14px;padding:14px 16px">
        <span style="font-size:16px;color:#fff;flex:1">${e.name.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>
        <input type="${e.type==='number'?'number':'text'}" inputmode="${e.type==='number'?'numeric':'text'}"
          style="width:90px;background:rgba(255,255,255,0.1);border:none;border-radius:10px;padding:8px 10px;color:#fff;font-size:15px;font-family:inherit;text-align:center;outline:none"
          placeholder="" onchange="completeExtraInput('${e.id}',this)">
      </div>`;
    }
  }
  html+='</div>';
  body.innerHTML=html; showSheet('mainSheet');
}
function completeExtraCheck(eId){
  const dd=getDayData(); if(!dd.extras) dd.extras={};
  dd.extras[eId]=true; save();
  const row=document.getElementById('xrow-'+eId);
  if(row){
    const cs=getComputedStyle(row),h=row.offsetHeight,mb=parseFloat(cs.marginBottom)||0,pt=parseFloat(cs.paddingTop)||0,pb=parseFloat(cs.paddingBottom)||0;
    row.animate([{opacity:1,height:h+'px',marginBottom:mb+'px',paddingTop:pt+'px',paddingBottom:pb+'px',overflow:'hidden'},{opacity:0,height:'0px',marginBottom:'0px',paddingTop:'0px',paddingBottom:'0px',overflow:'hidden'}],{duration:300,easing:'cubic-bezier(0.4,0,0.2,1)',fill:'forwards'}).onfinish=()=>openSheet();
  }
}
function completeExtraInput(eId,input){
  const val=input.value.trim(); if(!val) return;
  input.blur();
  const dd=getDayData(); if(!dd.extras) dd.extras={};
  dd.extras[eId]=val; save();
  const row=document.getElementById('xrow-'+eId);
  if(row){
    const cs=getComputedStyle(row),h=row.offsetHeight,mb=parseFloat(cs.marginBottom)||0,pt=parseFloat(cs.paddingTop)||0,pb=parseFloat(cs.paddingBottom)||0;
    row.animate([{opacity:1,height:h+'px',marginBottom:mb+'px',paddingTop:pt+'px',paddingBottom:pb+'px',overflow:'hidden'},{opacity:0,height:'0px',marginBottom:'0px',paddingTop:'0px',paddingBottom:'0px',overflow:'hidden'}],{duration:300,easing:'cubic-bezier(0.4,0,0.2,1)',fill:'forwards'}).onfinish=()=>openSheet();
  }
}

/* ── EXTRA TIME SCREEN ── */
let _extraTimeId=null;
let etSelBlocks=new Set();
function openExtraTimeScreen(eId){
  _extraTimeId=eId;
  etSelBlocks.clear();
  const e=state.extraStats.find(x=>x.id===eId); if(!e) return;
  document.getElementById('etHabitName').textContent=e.name;
  renderExtraTimeGrid();
  document.getElementById('extraTimeScreen').style.transform='translateY(0)';
}
function closeExtraTimeScreen(){
  document.getElementById('extraTimeScreen').style.transform='translateY(100%)';
  _extraTimeId=null; etSelBlocks.clear();
  updateEtDuration();
}
function saveExtraTime(){
  if(!_extraTimeId){ closeExtraTimeScreen(); return; }
  const e=state.extraStats.find(x=>x.id===_extraTimeId); if(!e) return;
  const dd=getDayData(); if(!dd.extras) dd.extras={};
  dd.extras[_extraTimeId]=true;
  if(etSelBlocks.size>0){
    const blocks=Array.from(etSelBlocks).map(k=>{const[hh,q]=k.split(':');return{h:+hh,q:+q};});
    const k=today();
    if(!state.timeEntries) state.timeEntries={};
    if(!state.timeEntries[k]) state.timeEntries[k]=[];
    state.timeEntries[k].push({id:'tt'+Date.now(),label:e.name,blocks});
  }
  save(); closeExtraTimeScreen(); openSheet();
}
function renderExtraTimeGrid(){
  const inner=document.getElementById('etGridInner'); if(!inner) return;
  const filled=getFilledBlocks();
  const now=new Date(); const curH=now.getHours();
  const startH=Math.max(0,curH-4);
  let html='';
  for(let h=startH;h<24;h++){
    const allFull=[0,1,2,3].every(q=>filled.has(`${h}:${q}`)); if(allFull) continue;
    html+=`<div class="tt-hour-row" style="gap:0"><div class="tt-hour-label">${h}</div><div class="tt-blocks" style="position:relative">`;
    for(let q=0;q<4;q++){
      const key=`${h}:${q}`;
      const isSel=etSelBlocks.has(key);
      const isFilled=filled.has(key);
      html+=`<div class="tt-block${isFilled?' filled':''}${isSel?' selecting':''}" data-h="${h}" data-q="${q}"
        style="${isFilled?'background:var(--bg);':''}${isSel&&!isFilled?'background:rgba(61,221,101,0.45);':''}"
        ontouchstart="etBlockTouch(event,${h},${q})"
        ontouchmove="etBlockMove(event)"
        ontouchend="etBlockEnd()"
        onclick="etBlockClick(${h},${q})"></div>`;
    }
    html+=`</div></div>`;
  }
  inner.innerHTML=html;
  updateEtDuration();
  requestAnimationFrame(()=>{
    const grid=document.getElementById('etGrid');
    const first=inner.firstElementChild;
    if(first&&grid) grid.scrollTop=Math.max(0,first.offsetTop-100);
  });
}
let etTouchStartH=-1,etTouchStartQ=-1,etTouchEndH=-1,etTouchEndQ=-1,etTouchActive=false;
function etBlockClick(h,q){
  const key=`${h}:${q}`;
  if(etSelBlocks.has(key)) etSelBlocks.delete(key); else etSelBlocks.add(key);
  renderExtraTimeGrid();
}
function etBlockTouch(e,h,q){
  e.preventDefault(); etTouchActive=true;
  etTouchStartH=h; etTouchStartQ=q; etTouchEndH=h; etTouchEndQ=q;
  etSelBlocks.clear(); etUpdateRange(); renderExtraTimeGrid();
}
function etBlockMove(e){
  if(!etTouchActive) return; e.preventDefault();
  const t=e.touches[0];
  const el=document.elementFromPoint(t.clientX,t.clientY);
  const dh=parseInt(el?.dataset?.h),dq=parseInt(el?.dataset?.q);
  if(isNaN(dh)||isNaN(dq)||(dh===etTouchEndH&&dq===etTouchEndQ)) return;
  etTouchEndH=dh; etTouchEndQ=dq; etUpdateRange(); renderExtraTimeGrid();
}
function etBlockEnd(){ etTouchActive=false; }
function etUpdateRange(){
  const s=blockIndex(etTouchStartH,etTouchStartQ), e2=blockIndex(etTouchEndH,etTouchEndQ);
  const lo=Math.min(s,e2),hi=Math.max(s,e2);
  etSelBlocks.clear();
  for(let i=lo;i<=hi;i++){const{h,q}=indexToHQ(i);etSelBlocks.add(`${h}:${q}`);}
}
function updateEtDuration(){
  const el=document.getElementById('etDuration'); if(!el) return;
  if(!etSelBlocks.size){el.innerHTML='';return;}
  const sorted=[...etSelBlocks].map(k=>{const[h,q]=k.split(':');return{h:+h,q:+q};}).sort((a,b)=>blockIndex(a.h,a.q)-blockIndex(b.h,b.q));
  const f=sorted[0],l=sorted[sorted.length-1];
  const fmt=(h,q)=>`${h}:${String(q*15).padStart(2,'0')}`;
  const eq=(l.q+1)%4,eh=l.h+(l.q===3?1:0);
  const mins=etSelBlocks.size*15,hh=Math.floor(mins/60),m=mins%60;
  el.innerHTML=`<span style="font-size:22px;font-weight:300">${fmt(f.h,f.q)}–${fmt(eh,eq)}</span><span style="display:block;font-size:13px;color:rgba(255,255,255,0.5);margin-top:2px">${hh>0?hh+'h':''}${m>0?' '+m+'m':''}</span>`;
}

function closeSheet(){ hideSheet('mainSheet'); }

/* ══ TASKS SCREEN ══ */






/* ══ ADD TASK OVERLAY ══ */






/* ══ ALL TASKS VIEW ══ */







const ALL_SHEETS=['mainSheet','inputSheet','extraSheet'];
function showSheet(id){ document.getElementById('overlay').classList.add('open'); document.getElementById(id).classList.add('open'); }
function hideSheet(id){
  document.getElementById(id)?.classList.remove('open');
  if(!ALL_SHEETS.some(s=>document.getElementById(s)?.classList.contains('open'))) document.getElementById('overlay').classList.remove('open');
}
function closeAllSheets(){ ALL_SHEETS.forEach(s=>document.getElementById(s)?.classList.remove('open')); document.getElementById('overlay').classList.remove('open'); }

let extraType='checkbox';
function setExtraType(t,el){ extraType=t; document.querySelectorAll('#extraTypePicker .type-btn').forEach(b=>b.classList.remove('active')); el.classList.add('active'); }
// #2: pending new extra lives outside state — no temp mutation of state.extraStats
let _pendingNewExtra=null;
function openExtraSheet(){
  const tempId='_new_'+Date.now();
  _pendingNewExtra={id:tempId,name:'',type:'checkbox',url:'',order:(state.extraStats||[]).length,trackTime:false};
  editExtraId=tempId;
  openExtraDetail(tempId);
}
function closeExtraSheet(){ hideSheet('extraSheet'); }
function confirmExtra(){ const n=document.getElementById('extraNameField').value.trim(); if(!n){ closeExtraSheet(); return; } const order=(state.extraStats||[]).length; state.extraStats.push({id:'e'+Date.now(),name:n,type:extraType,order}); save(); closeExtraSheet(); renderSettings(); }
function deleteExtra(eId){ state.extraStats=state.extraStats.filter(e=>e.id!==eId); save(); renderSettings(); }

/* ── EXTRA DETAIL ── */
let editExtraId=null;
function openExtraDetail(eId){
  editExtraId=eId;
  // #2: _new_ items live in _pendingNewExtra, not in state.extraStats
  const e=eId.startsWith('_new_')?_pendingNewExtra:state.extraStats.find(x=>x.id===eId); if(!e) return;
  const body=document.getElementById('extraDetailBody');
  body.innerHTML='';

  // Name — same style as habit detail
  const nameWrap=document.createElement('div');
  nameWrap.style.cssText='padding:32px 0 22px';
  const nameInput=document.createElement('input');
  nameInput.className='hd-name-input'; nameInput.id='edn'; nameInput.value=e.name; nameInput.placeholder='';
  nameInput.style.cssText='width:100%;text-align:center';
  nameWrap.appendChild(nameInput); body.appendChild(nameWrap);

  // Type buttons — same as habit detail
  const typeBtnsDiv=document.createElement('div');
  typeBtnsDiv.className='type-mini-btns';
  typeBtnsDiv.style.cssText='justify-content:center;display:flex;gap:8px;margin-bottom:28px';
  [{k:'checkbox',lbl:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><polyline points="7 13 10 16 17 9"/></svg>'},{k:'number',lbl:'<span style="font-size:18px">#</span>'},{k:'text',lbl:'<span style="font-size:18px">t</span>'}].forEach(t=>{
    const btn=document.createElement('button');
    btn.className='type-mini-btn'+(e.type===t.k?' active':'');
    btn.innerHTML=t.lbl;
    btn.onclick=()=>edType(t.k,btn);
    typeBtnsDiv.appendChild(btn);
  });
  body.appendChild(typeBtnsDiv);

  // Separator
  const sep=document.createElement('div'); sep.style.cssText='height:1px;background:rgba(255,255,255,0.08);margin:8px 0'; body.appendChild(sep);

  // URL row — same as habit detail (icon + toggle)
  const urlSep=document.createElement('div'); urlSep.style.cssText='height:1px;background:rgba(255,255,255,0.08);margin:0'; body.appendChild(urlSep);
  const urlRow=document.createElement('div');
  urlRow.style.cssText='display:flex;align-items:center;gap:14px;padding:16px 0';
  const urlIcon=document.createElement('span');
  urlIcon.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  urlIcon.style.cssText='color:rgba(255,255,255,0.7);flex-shrink:0;display:flex;align-items:center';
  const urlToggle=document.createElement('div');
  urlToggle.className='toggle'+(e.url?' on':''); urlToggle.id='edUrlToggle';
  const urlInput=document.createElement('input');
  urlInput.className='url-input'; urlInput.id='edu'; urlInput.value=e.url||''; urlInput.placeholder='';
  urlInput.style.cssText='flex:1;display:'+(e.url?'flex':'none');
  urlToggle.onclick=()=>{
    urlToggle.classList.toggle('on');
    const on=urlToggle.classList.contains('on');
    urlInput.style.display=on?'flex':'none';
    if(on) setTimeout(()=>urlInput.focus(),50);
    else urlInput.value='';
  };
  urlRow.appendChild(urlIcon); urlRow.appendChild(urlToggle); urlRow.appendChild(urlInput); body.appendChild(urlRow);

  // Spacer + Save + Delete
  const spacer=document.createElement('div'); spacer.className='hd-spacer'; body.appendChild(spacer);
  const saveBtn=document.createElement('button');
  saveBtn.className='save-btn'; saveBtn.textContent='Zapisz';
  saveBtn.onclick=saveExtraDetail; body.appendChild(saveBtn);
  const delBtn=document.createElement('button');
  delBtn.className='delete-btn'; delBtn.id='del-e-'+eId;
  delBtn.innerHTML=trashSVG+' Usuń';
  delBtn.onclick=()=>askDelete(delBtn,e.name,()=>deleteExtraD(eId));
  body.appendChild(delBtn);

  document.getElementById('extraDetail').classList.add('open');
  setTimeout(()=>nameInput.focus(),350);
}
function closeExtraDetail(){
  // #2: If closing a new (unsaved) extra, just discard _pendingNewExtra — no state mutation needed
  if(editExtraId&&editExtraId.startsWith('_new_')){
    _pendingNewExtra=null;
  }
  document.getElementById('extraDetail').classList.remove('open');
  editExtraId=null;
}
function edType(t,el){ document.querySelectorAll('#extraDetailBody .type-mini-btn').forEach(b=>b.classList.remove('active')); el.classList.add('active'); }
function saveExtraDetail(){
  const name=document.getElementById('edn')?.value.trim(); if(!name) return;
  const tl=['checkbox','number','text'];
  const _typeBtns=document.querySelectorAll('#extraDetailBody .type-mini-btn'); // #10: cache once
  const type=tl.find(t=>_typeBtns[tl.indexOf(t)]?.classList.contains('active'))||'checkbox';
  const url=document.getElementById('edu')?.value.trim()||'';
  // #2: commit pending new extra into state, or update existing
  let e;
  if(editExtraId&&editExtraId.startsWith('_new_')){
    if(!_pendingNewExtra) return;
    e={..._pendingNewExtra, id:'e'+Date.now(), name, type, url};
    state.extraStats.push(e);
    _pendingNewExtra=null;
  } else {
    e=state.extraStats.find(x=>x.id===editExtraId); if(!e) return;
    Object.assign(e,{name,type,url});
  }
  save(); closeExtraDetail(); renderSettings();
}
function deleteExtraD(eId){ deleteExtra(eId); closeExtraDetail(); }

/* ── STREAKS — last 7 days, day-number only ── */

/* ── SETTINGS ── */
function openSettings(){
  renderSettings();
  document.getElementById('home').classList.add('slide-out');
  document.getElementById('settings').classList.add('active');
  document.querySelector('.habits-scroll').style.overflow='hidden';
}
function closeSettings(){
  const s=document.getElementById('settings'), h=document.getElementById('home');
  s.style.transition=''; h.style.transition='';
  s.style.transform=''; h.style.transform='';
  h.classList.remove('slide-out'); s.classList.remove('active');
  document.querySelector('.habits-scroll').style.overflow='';
}

function applyBgColor(v){
  if(!v||!/^#[0-9a-fA-F]{6}$/i.test(v)) return;
  document.documentElement.style.setProperty('--bg',v);
  document.documentElement.style.backgroundColor=v;
  document.body.style.background=v;
  document.querySelectorAll('.screen').forEach(el=>el.style.background=v);
  const home=document.getElementById('home');
  const tt=document.getElementById('timeTracker');
  if(home) home.style.background=v;
  if(tt) tt.style.background=v;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',v);
  try{localStorage.setItem('customBg',v);}catch{}
}

let _rsTimer=null;
function renderSettings(){ if(_rsTimer) return; _rsTimer=requestAnimationFrame(()=>{ _rsTimer=null; _renderSettingsNow(); }); }
function _renderSettingsNow(){
  const scroll=document.getElementById('settingsScroll');
  if(!scroll) return;
  const _st=scroll.scrollTop;
  let html='';
  try{

  const settingsOpen=ui.settingsOpen===true; // default: false (closed)

  // ── INLINE CALENDAR (always visible) ──
  {
    const _D=['P','W','Ś','C','P','S','N'];
    const _calH=state.habits;
    const _SC=[['#60a5fa','rgba(96,165,250,0.13)'],['#34d399','rgba(52,211,153,0.13)'],['#fbbf24','rgba(251,191,36,0.13)'],['#c084fc','rgba(192,132,252,0.13)'],['#f87171','rgba(248,113,113,0.13)'],['#2dd4bf','rgba(45,212,191,0.13)']];
    html+=`<div style="padding-top:max(env(safe-area-inset-top,44px),44px)">`;
    html+=`<div style="margin:0;overflow:hidden;width:100%;box-sizing:border-box;background:rgba(255,255,255,0.32);border-radius:16px;padding:0 8px 8px;">`;
    // Day header
    html+=`<div style="display:grid;grid-template-columns:repeat(7,1fr);padding:12px 0 10px">`;
    _D.forEach(d=>html+=`<div style="text-align:center;font-size:15px;color:#fff;font-weight:700;letter-spacing:.03em">${d}</div>`);
    html+=`</div>`;
    (state.sectors||[]).forEach((sec,si)=>{
      const sh=_calH.filter(h=>h.sectorId===sec.id).sort((a,b)=>(a.order||0)-(b.order||0));
      if(!sh.length) return;
      const [s,f]=_SC[si%_SC.length];
      html+=`<div style="padding:14px 0 16px;text-align:center"><span style="font-size:15px;color:rgba(255,255,255,0.4);font-weight:600;letter-spacing:.06em;text-transform:uppercase">${sec.name}</span></div>`;
      sh.forEach(h=>{
        // Build streak-connected row: consecutive active days merge into a pill
        const cells=[];
        for(let d=0;d<7;d++){
          const on=h.days.includes(d);
          const prevOn=d>0&&h.days.includes(d-1);
          const nextOn=d<6&&h.days.includes(d+1);
          if(!on){ cells.push(`<div style="height:38px"></div>`); continue; }
          // Determine pill shape
          const isFirst=!prevOn; const isLast=!nextOn;
          let br='';
          if(isFirst&&isLast) br='border-radius:10px';
          else if(isFirst) br='border-radius:10px 0 0 10px';
          else if(isLast) br='border-radius:0 10px 10px 0';
          else br='border-radius:0';
          // Gap: merge by removing margin between consecutive days
          const marginR=nextOn?'margin-right:-1px':'';
          const marginL=prevOn?'margin-left:-1px':'';
          // Show name only in first cell of streak
          const showName=isFirst;
          cells.push(`<div onclick="openHabitFromCal('${h.id}')" style="background:${s};${br};padding:10px 0;font-size:13px;color:rgba(255,255,255,0.9);cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;text-align:center;${marginR};${marginL};position:relative;height:38px;display:flex;align-items:center;justify-content:flex-start;padding-left:${isFirst?'8px':'0px'};overflow:hidden">${showName?`<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px">${h.name}</span>`:''}</div>`);
        }
        html+=`<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0;margin-bottom:3px">`;
        cells.forEach(c=>html+=`<div>${c}</div>`);
        html+=`</div>`;
      });
    });
    html+=`</div></div>`;
  }

  // ── GEAR ICON — toggles sectors/settings below ──
  html+=`<div onclick="toggleFold('settings')" style="display:flex;align-items:center;justify-content:center;padding:32px 20px 14px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color:${settingsOpen?'#fff':'rgba(255,255,255,0.35)'}"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  </div>`;

  if(settingsOpen){

  // SECTORS
  html+=`<div class="s-section">`;
  for(const sec of state.sectors){
    const sh=state.habits.filter(h=>h.sectorId===sec.id).sort((a,b)=>(a.order||0)-(b.order||0));
    html+=`<div class="sector-block${expandedSectors.has(sec.id)?' expanded':''}" id="sb-${sec.id}"
      draggable="true"
      ondragstart="secDragStart(event,'${sec.id}')"
      ondragover="secDragOver(event,'${sec.id}')"
      ondrop="secDragDrop(event,'${sec.id}')"
      ondragend="secDragEnd()"
      ontouchstart="secTouchStart(event,'${sec.id}')"
      ontouchend="secTouchEnd(event)">
      <div class="sector-block-header" onclick="toggleSB('${sec.id}')">
        <span class="sbn">${sec.name}</span>
      </div>
      <div class="sector-edit-panel" id="sep-${sec.id}">
        <div style="padding:0 0 18px">
          <input class="hd-name-input" id="sn-${sec.id}" value="${sec.name}" style="width:100%;box-sizing:border-box;margin-bottom:22px" oninput="markSectorDirty('${sec.id}')">
          <div id="ssl-${sec.id}" style="display:flex;flex-direction:column;gap:14px;${sec.isDefault?'opacity:0.25;pointer-events:none;':''}">
            ${(sec.schedules||[]).map((sc,si)=>`
            <div id="ssr-${sec.id}-${si}" style="background:rgba(255,255,255,0.07);border-radius:16px;padding:18px 14px 14px;">
              <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:14px">
                <input class="time-input" type="number" inputmode="numeric" id="sh-${sec.id}-${si}" min="0" max="23" value="${sc.startH}" oninput="markSectorDirty('${sec.id}')">
                <span class="time-colon">:</span>
                <input class="time-input" type="number" inputmode="numeric" id="sm-${sec.id}-${si}" min="0" max="59" value="${String(sc.startM).padStart(2,'0')}" oninput="markSectorDirty('${sec.id}')">
                <span style="color:rgba(255,255,255,0.3);padding:0 6px">–</span>
                <input class="time-input" type="number" inputmode="numeric" id="eh-${sec.id}-${si}" min="0" max="23" value="${sc.endH}" oninput="markSectorDirty('${sec.id}')">
                <span class="time-colon">:</span>
                <input class="time-input" type="number" inputmode="numeric" id="em-${sec.id}-${si}" min="0" max="59" value="${String(sc.endM).padStart(2,'0')}" oninput="markSectorDirty('${sec.id}')">
                ${sec.schedules.length>1?`<button class="del-sched-btn" onclick="removeSchedule('${sec.id}',${si})" style="margin-left:6px">×</button>`:''}
              </div>
              <div style="display:flex;align-items:center;justify-content:center;gap:6px">
                ${DAYS.map((d,di)=>`<button class="day-btn${sc.weekdays.includes(di)?' active':''}" onclick="this.classList.toggle('active');markSectorDirty('${sec.id}')">${d}</button>`).join('')}
              </div>
            </div>`).join('')}
          </div>
          <div style="display:flex;justify-content:center;margin-top:16px;${sec.isDefault?'opacity:0.25;pointer-events:none;':''}">
            <button class="add-schedule-btn" onclick="addSchedule('${sec.id}')">${plusSVG}</button>
          </div>
          <div style="display:flex;gap:8px;margin-top:22px">
            <button class="sec-act-btn danger" id="del-sec-${sec.id}" onclick="askDelete(this,'${sec.name.replace(/'/g,"\'")}',()=>deleteSector('${sec.id}'))" style="flex:0;padding:12px 18px">${trashSVG}</button>
            <button class="sec-act-btn${sec.isDefault?' open-state':''}" onclick="toggleSectorDefault('${sec.id}')" style="flex:0;padding:12px 20px" title="Domyślny sektor">${homeSVG}</button>
            <button class="save-btn" id="sec-save-${sec.id}" onclick="saveSector('${sec.id}')" style="flex:1;padding:13px">Zapisz</button>
          </div>
        </div>
      </div>
      <div class="sector-habits-box" id="shb-${sec.id}">
        ${sh.map(h=>`<div class="sector-habit-row" id="shr-${h.id}" data-hid="${h.id}"
          draggable="true"
          ondragstart="dragStart(event,'${h.id}')"
          ondragover="dragOver(event,'${h.id}')"
          ondrop="dragDrop(event,'${h.id}')"
          ondragend="dragEnd()"
          ontouchstart="hRowTouchStart(event,'${h.id}')"
          ontouchmove="touchDragMove(event)"
          ontouchend="touchDragEnd(event,'${sec.id}')"
          onclick="hRowClick(event,'${h.id}')">
          <span class="shr-name">${h.name}</span>

        </div>`).join('')}
      </div>
      <div class="add-habit-row" onclick="openNewHabit('${sec.id}')">${plusSVG}</div>
    </div>`;
  }
  if(state.sectors.length<5) html+=`<button class="add-sector-btn-icon" onclick="addSector()">${plusSVG}</button>`;
  html+=`</div>`;



  const _curBg=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()||'#061E0C';
  html+=`<div style="display:flex;align-items:center;justify-content:center;margin-top:16px;margin-bottom:8px">
    <label style="background:none;border:none;color:#fff;cursor:pointer;padding:14px 20px;-webkit-tap-highlight-color:transparent;touch-action:manipulation;display:flex;align-items:center;justify-content:center;position:relative">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
      <input type="color" id="_nativeBgPicker" style="position:absolute;opacity:0;width:100%;height:100%;top:0;left:0;cursor:pointer;" oninput="applyBgColor(this.value)" onchange="applyBgColor(this.value)">
    </label>
  </div>`;

  // Export CSV — icon opens slide-up sheet
  html+=`<div style="display:flex;align-items:center;justify-content:center;margin-bottom:24px">
    <button onclick="openCSVSheet()" aria-label="Pobierz CSV" style="background:none;border:none;color:#fff;cursor:pointer;padding:14px 20px;-webkit-tap-highlight-color:transparent;touch-action:manipulation;display:flex;align-items:center;justify-content:center">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>
    </button>
  </div>`;

  } // end settingsOpen

  html+=`<div style="height:60px"></div>`;
  // Only update DOM if content changed (avoids unnecessary reflows)
  if(scroll._lastHtml !== html){
    scroll._lastHtml = html;
    scroll.innerHTML=html;
    scroll.scrollTop=_st;
  }
  }catch(err){ console.error('_renderSettingsNow error:',err,err.stack); scroll.innerHTML=`<div style="padding:40px 20px;color:rgba(255,100,100,.7);font-size:13px">Błąd: ${err.message}<br><pre style="font-size:10px;opacity:.6;white-space:pre-wrap">${err.stack?.split('\n').slice(0,4).join('\n')}</pre></div>`; }
}








function toggleHabitTrackTime(hId){
  const h=state.habits.find(x=>x.id===hId); if(!h) return;
  h.trackTime=!h.trackTime;
  // trackTime toggled
  save(); renderSettings();
}





function toggleFold(key){
  if(key==='settings'){ ui.settingsOpen=!ui.settingsOpen; save(); renderSettings(); return; }
  if(key==='weekCal'){ ui.weekCalOpen=!ui.weekCalOpen; renderSettings(); return; }
}
const expandedSectors=new Set();
function toggleSB(sId){
  if(expandedSectors.has(sId)) expandedSectors.delete(sId);
  else{ expandedSectors.add(sId); setTimeout(()=>document.getElementById(`sn-${sId}`)?.focus(),120); }
  renderSettings();
}
function toggleSectorDefault(sId){
  // Save current DOM state first so godziny/days aren't lost
  saveSectorSilent(sId);
  // Only one sector can be default
  state.sectors.forEach(s=>{ s.isDefault = (s.id===sId) ? !s.isDefault : false; });
  invalidateSectorCache(); save(); renderSettings();
}



/* ── SECTOR CRUD ── */
function addSchedule(sId){
  const sec=state.sectors.find(s=>s.id===sId); if(!sec) return;
  const l=sec.schedules[sec.schedules.length-1]||{startH:9,startM:0,endH:17,endM:0,weekdays:[0,1,2,3,4]};
  sec.schedules.push({...l,weekdays:[...l.weekdays]}); invalidateSectorCache(); save(); renderSettings();
  setTimeout(()=>{ const el=document.getElementById(`sb-${sId}`); if(el&&!el.classList.contains('expanded')) el.classList.add('expanded'); },30);
}
function removeSchedule(sId,si){ const sec=state.sectors.find(s=>s.id===sId); if(!sec||sec.schedules.length<=1) return; sec.schedules.splice(si,1); invalidateSectorCache(); save(); renderSettings(); }
function _readSectorFromDOM(sId,sec){
  const nameEl=document.getElementById(`sn-${sId}`);
  if(nameEl){const n=nameEl.value.trim(); if(n) sec.name=n;}
  const ssl=document.getElementById(`ssl-${sId}`);
  const rows=ssl?Array.from(ssl.children).filter(el=>el.id&&el.id.startsWith(`ssr-${sId}-`)):[];
  if(!rows.length) return false;
  sec.schedules=rows.map(row=>{
    const si=row.id.split('-').pop();
    const days=[];
    row.querySelectorAll('.day-btn').forEach((b,di)=>{ if(b.classList.contains('active')) days.push(di); });
    return {
      startH:clamp(parseInt(document.getElementById(`sh-${sId}-${si}`)?.value)||0,0,23),
      startM:clamp(parseInt(document.getElementById(`sm-${sId}-${si}`)?.value)||0,0,59),
      endH:clamp(parseInt(document.getElementById(`eh-${sId}-${si}`)?.value)||0,0,23),
      endM:clamp(parseInt(document.getElementById(`em-${sId}-${si}`)?.value)||0,0,59),
      weekdays:days
    };
  });
  return true;
}
// #dirty-state: track which sector panels have unsaved changes
const _dirtySecors=new Set();
function markSectorDirty(sId){
  _dirtySecors.add(sId);
  const btn=document.getElementById('sec-save-'+sId);
  if(btn){ btn.style.background='rgba(61,221,101,0.35)'; btn.style.borderColor='var(--accent)'; btn.textContent='● Zapisz'; }
}
function clearSectorDirty(sId){
  _dirtySecors.delete(sId);
}
function saveSector(sId){
  const sec=state.sectors.find(s=>s.id===sId); if(!sec) return;
  _readSectorFromDOM(sId,sec);
  clearSectorDirty(sId);
  invalidateSectorCache(); save(); expandedSectors.delete(sId); renderSettings();
}
function saveSectorSilent(sId){
  const sec=state.sectors.find(s=>s.id===sId); if(!sec) return;
  if(_readSectorFromDOM(sId,sec)) save();
}
function clamp(v,mn,mx){ return Math.min(mx,Math.max(mn,v)); }
function addSector(){
  const nid='s'+Date.now();
  state.sectors.push({id:nid,name:'Nowy',schedules:[{startH:9,startM:0,endH:17,endM:0,weekdays:[0,1,2,3,4]}]});
  expandedSectors.add(nid); save(); renderSettings();
}

/* ── 2-STEP DELETE CONFIRM ── */
const _delTimers={};
function askDelete(btn,label,onConfirm){
  if(btn.classList.contains('confirm-pending')){
    clearTimeout(_delTimers[label]);
    delete _delTimers[label];
    btn.classList.remove('confirm-pending');
    btn.innerHTML=btn._origHTML||btn.innerHTML;
    onConfirm();
    return;
  }
  btn._origHTML=btn.innerHTML;
  btn.classList.add('confirm-pending');
  btn.innerHTML=`Usuń „${label}"?`;
  _delTimers[label]=setTimeout(()=>{
    btn.classList.remove('confirm-pending');
    btn.innerHTML=btn._origHTML||btn.innerHTML;
    delete _delTimers[label];
  },3000);
}

function deleteSector(sId){
  state.sectors=state.sectors.filter(s=>s.id!==sId);
  state.habits=state.habits.filter(h=>h.sectorId!==sId);
  expandedSectors.delete(sId); save(); renderSettings();
}

/* ── DRAG — habits ── */
// ── SECTOR DRAG REORDER ──
let secDragId=null,secDragOverId=null;
let _secTouchId=null,_secTouchTimer=null,_secTouchActive=false,_secTouchStartY=0,_secTouchEl=null;
function secTouchStart(e,sId){
  _secTouchId=sId; _secTouchActive=false;
  _secTouchStartY=e.touches[0].clientY;
  _secTouchEl=e.currentTarget;
  _secTouchEl.addEventListener('touchmove',secTouchMove,{passive:false});
  _secTouchTimer=setTimeout(()=>{
    _secTouchActive=true;
    _secTouchEl.style.opacity='0.6';
    _secTouchEl.style.transform='scale(1.02)';
  },320);
}
function secTouchMove(e){
  if(!_secTouchId) return;
  const dy=Math.abs(e.touches[0].clientY-_secTouchStartY);
  if(!_secTouchActive){
    if(dy>8){ clearTimeout(_secTouchTimer); _secTouchTimer=null; _secTouchId=null; return; }
    return;
  }
  e.preventDefault();
  const el=document.elementFromPoint(e.touches[0].clientX,e.touches[0].clientY)?.closest('.sector-block');
  const oid=el?.id?.replace('sb-','');
  if(oid&&oid!==_secTouchId&&oid!==secDragOverId){
    document.querySelectorAll('.sector-block').forEach(b=>b.classList.remove('sec-drag-over'));
    secDragOverId=oid;
    el.classList.add('sec-drag-over');
  }
}
function secTouchEnd(e){
  clearTimeout(_secTouchTimer); _secTouchTimer=null;
  if(_secTouchEl){ _secTouchEl.removeEventListener('touchmove',secTouchMove); _secTouchEl.style.opacity=''; _secTouchEl.style.transform=''; }
  if(_secTouchActive&&secDragOverId&&secDragOverId!==_secTouchId){
    doReorderSector(_secTouchId,secDragOverId);
  } else {
    document.querySelectorAll('.sector-block').forEach(b=>b.classList.remove('sec-drag-over'));
  }
  _secTouchId=null; _secTouchActive=false; secDragOverId=null; _secTouchEl=null;
}
function secDragStart(e,sId){ secDragId=sId; e.dataTransfer.effectAllowed='move'; e.stopPropagation(); }
function secDragOver(e,sId){
  e.preventDefault(); e.stopPropagation();
  if(secDragOverId!==sId){
    document.querySelectorAll('.sector-block').forEach(el=>el.classList.remove('sec-drag-over'));
    secDragOverId=sId;
    if(sId!==secDragId) document.getElementById('sb-'+sId)?.classList.add('sec-drag-over');
  }
}
function secDragDrop(e,sId){
  e.preventDefault(); e.stopPropagation();
  doReorderSector(secDragId,sId);
}
function secDragEnd(){
  document.querySelectorAll('.sector-block').forEach(el=>el.classList.remove('sec-drag-over'));
  secDragId=null; secDragOverId=null;
}
function doReorderSector(fromId,toId){
  if(!fromId||!toId||fromId===toId){ renderSettings(); return; }
  const from=state.sectors.findIndex(s=>s.id===fromId);
  const to=state.sectors.findIndex(s=>s.id===toId);
  if(from<0||to<0){ renderSettings(); return; }
  const [sec]=state.sectors.splice(from,1);
  state.sectors.splice(to,0,sec);
  invalidateSectorCache(); save(); renderSettings();
}

let dragId=null,dragOverId=null;
function dragStart(e,hId){ dragId=hId; e.dataTransfer.effectAllowed='move'; }
function dragOver(e,hId){ e.preventDefault(); if(dragOverId!==hId){ dragOverId=hId; highlightH(hId); } }
function dragDrop(e,hId){ e.preventDefault(); doReorderH(dragId,hId); }
function dragEnd(){ dragId=null; dragOverId=null; clearHighH(); }
function highlightH(hId){ clearHighH(); const el=document.getElementById('shr-'+hId); if(el) el.style.borderTop='2px solid var(--accent)'; }
function clearHighH(){ document.querySelectorAll('.sector-habit-row').forEach(r=>r.style.borderTop=''); }
function doReorderH(fromId,toId){
  if(!fromId||!toId||fromId===toId){ clearHighH(); renderSettings(); return; }
  const from=state.habits.find(h=>h.id===fromId),to=state.habits.find(h=>h.id===toId);
  if(!from||!to||from.sectorId!==to.sectorId){ clearHighH(); renderSettings(); return; }
  const fi=state.habits.indexOf(from),ti=state.habits.indexOf(to);
  state.habits.splice(fi,1); state.habits.splice(ti,0,from);
  state.habits.filter(h=>h.sectorId===from.sectorId).forEach((h,i)=>h.order=i);
  save(); renderSettings();
}
let tDragId=null,tDragOverId=null,tDragMoved=false,tDragActive=false,tDragStartX=0,tDragStartY=0,tDragTimer=null,tDragEl=null;
function _tDragMoveHandler(e){
  if(!tDragId) return;
  const dx=Math.abs(e.touches[0].clientX-tDragStartX),dy=Math.abs(e.touches[0].clientY-tDragStartY);
  if(dx>8||dy>8){
    if(!tDragActive){ clearTimeout(tDragTimer); tDragTimer=null; tDragId=null; if(tDragEl){ tDragEl.removeEventListener('touchmove',_tDragMoveHandler); tDragEl=null; } return; }
    tDragMoved=true; e.preventDefault();
    const el=document.elementFromPoint(e.touches[0].clientX,e.touches[0].clientY)?.closest('[data-hid]');
    const oid=el?.dataset.hid;
    if(oid&&oid!==tDragId&&oid!==tDragOverId){ tDragOverId=oid; highlightH(oid); }
  }
}
function hRowTouchStart(e,hId){
  tDragId=hId; tDragMoved=false; tDragActive=false;
  tDragStartX=e.touches[0].clientX; tDragStartY=e.touches[0].clientY;
  tDragEl=e.currentTarget;
  tDragEl.addEventListener('touchmove',_tDragMoveHandler,{passive:false});
  tDragTimer=setTimeout(()=>{ tDragActive=true; document.getElementById('shr-'+hId)?.classList.add('drag-lift'); },280);
}
function touchDragMove(e){ /* handled by per-element listener */ }
function touchDragEnd(e,sId){
  clearTimeout(tDragTimer); tDragTimer=null;
  if(tDragEl){ tDragEl.removeEventListener('touchmove',_tDragMoveHandler); tDragEl=null; }
  document.getElementById('shr-'+tDragId)?.classList.remove('drag-lift');
  if(tDragActive&&tDragMoved&&tDragOverId&&tDragOverId!==tDragId) doReorderH(tDragId,tDragOverId);
  else{ clearHighH(); if(!tDragActive&&!tDragMoved) openHabitDetail(tDragId); else renderSettings(); }
  tDragId=null; tDragOverId=null; tDragMoved=false; tDragActive=false;
}
function hRowClick(e,hId){ if(tDragMoved||tDragActive) return; openHabitDetail(hId); }

/* ── DRAG — extras ── */
let eDragId=null,eDragOverId=null;
function eDragStart(e,eId){ eDragId=eId; e.dataTransfer.effectAllowed='move'; }
function eDragOver(e,eId){ e.preventDefault(); if(eDragOverId!==eId){ eDragOverId=eId; clearHighE(); const el=document.getElementById('esr-'+eId); if(el) el.style.borderTop='2px solid var(--accent)'; } }
function eDragDrop(e,eId){ e.preventDefault(); doReorderE(eDragId,eId); }
function eDragEnd(){ eDragId=null; eDragOverId=null; clearHighE(); }
function clearHighE(){ document.querySelectorAll('.extra-setting-row').forEach(r=>r.style.borderTop=''); }
function doReorderE(fromId,toId){
  if(!fromId||!toId||fromId===toId){ clearHighE(); renderSettings(); return; }
  const arr=state.extraStats; const fi=arr.findIndex(e=>e.id===fromId),ti=arr.findIndex(e=>e.id===toId);
  if(fi<0||ti<0){ clearHighE(); renderSettings(); return; }
  const [item]=arr.splice(fi,1); arr.splice(ti,0,item);
  arr.forEach((e,i)=>e.order=i); save(); renderSettings();
}
let etDragId=null,etDragOverId=null,etDragMoved=false,etDragActive=false,etDragStartX=0,etDragStartY=0,etDragTimer=null;
function eRowTouchStart(e,eId){
  etDragId=eId; etDragMoved=false; etDragActive=false;
  etDragStartX=e.touches[0].clientX; etDragStartY=e.touches[0].clientY;
  etDragTimer=setTimeout(()=>{ etDragActive=true; document.getElementById('esr-'+eId)?.classList.add('drag-lift'); },280);
}
function eTouchDragMove(e){
  if(!etDragId) return;
  const dx=Math.abs(e.touches[0].clientX-etDragStartX),dy=Math.abs(e.touches[0].clientY-etDragStartY);
  if(dx>8||dy>8){
    if(!etDragActive){ clearTimeout(etDragTimer); etDragTimer=null; etDragId=null; return; }
    etDragMoved=true; e.preventDefault();
    const el=document.elementFromPoint(e.touches[0].clientX,e.touches[0].clientY)?.closest('[data-eid]');
    const oid=el?.dataset.eid;
    if(oid&&oid!==etDragId&&oid!==etDragOverId){ etDragOverId=oid; clearHighE(); document.getElementById('esr-'+oid)?.style.setProperty('border-top','2px solid var(--accent)'); }
  }
}
function eTouchDragEnd(e){
  clearTimeout(etDragTimer); etDragTimer=null;
  document.getElementById('esr-'+etDragId)?.classList.remove('drag-lift');
  if(etDragActive&&etDragMoved&&etDragOverId&&etDragOverId!==etDragId) doReorderE(etDragId,etDragOverId);
  else{ clearHighE(); if(!etDragActive&&!etDragMoved) openExtraDetail(etDragId); else renderSettings(); }
  etDragId=null; etDragOverId=null; etDragMoved=false; etDragActive=false;
}
function eRowClick(e,eId){ if(etDragMoved||etDragActive) return; openExtraDetail(eId); }

/* ── HABIT DETAIL ── */
let editHabitId=null, editHabitSectorId=null, _callerPage=null;
function openNewHabit(sectorId){
  openHabitDetail('new', sectorId);
  setTimeout(()=>{
    const i=document.getElementById('hdn');
    if(!i) return;
    // Scroll input into view first, then focus
    i.scrollIntoView({behavior:'instant',block:'center'});
    i.focus();
    // After keyboard opens, scroll again to ensure input is visible
    setTimeout(()=>{ i.scrollIntoView({behavior:'smooth',block:'nearest'}); }, 350);
  }, 420);
}
function openHabitFromCal(hId){
  openHabitDetail(hId);
}

function openHabitDetail(hId,defaultSector){
  editHabitId=hId; const isNew=hId==='new';
  editHabitSectorId=defaultSector||null;
  const h=isNew?{id:'new',name:'',sectorId:defaultSector||state.sectors[0]?.id,type:'checkbox',days:[0,1,2,3,4],url:'',trackTime:false}:state.habits.find(x=>x.id===hId);
  if(!h) return;

  const body=document.getElementById('hdBody');
  body.innerHTML='';

  // Sector days computation
  const sector=state.sectors.find(s=>s.id==(h.sectorId||editHabitSectorId));
  const sectorDays=sector?(sector.schedules||[]).reduce((set,sc)=>{ (sc.weekdays||[]).forEach(d=>set.add(d)); return set; },new Set()):new Set([0,1,2,3,4,5,6]);
  const activeDays=isNew?Array.from(sectorDays):h.days;

  // Name
  const nameWrap=document.createElement('div');
  nameWrap.style.cssText='padding:32px 0 22px';
  const nameInput=document.createElement('input');
  nameInput.className='hd-name-input'; nameInput.id='hdn'; nameInput.value=h.name;
  if(isNew) nameInput.setAttribute('autofocus','autofocus');
  nameInput.placeholder=''; nameInput.style.cssText='width:100%;text-align:center';
  nameWrap.appendChild(nameInput); body.appendChild(nameWrap);



  // Days — only show sector days, hidden others
  const daysRow=document.createElement('div');
  daysRow.className='days-row';
  daysRow.style.marginBottom='24px';
  DAYS.forEach((d,i)=>{
    if(!sectorDays.has(i)) return; // hide non-sector days entirely
    const btn=document.createElement('button');
    btn.className='day-btn'+(activeDays.includes(i)?' active':'');
    btn.id='hdd'+i; btn.textContent=d;
    btn.onclick=()=>btn.classList.toggle('active');
    daysRow.appendChild(btn);
  });
  // Hidden inputs for non-sector days (always inactive)
  DAYS.forEach((_,i)=>{
    if(sectorDays.has(i)) return;
    const inp=document.createElement('input');
    inp.type='hidden'; inp.id='hdd'+i; inp.value='inactive';
    body.appendChild(inp);
  });
  body.appendChild(daysRow);

  // URL — centered icon, tap expands input below
  const urlRow=document.createElement('div');
  urlRow.style.cssText='display:flex;flex-direction:column;align-items:center;gap:0;padding:12px 0;';
  const urlIconWrap=document.createElement('div');
  urlIconWrap.style.cssText='display:flex;justify-content:center;width:100%;cursor:pointer;-webkit-tap-highlight-color:transparent;padding:4px 0';
  const urlIconEl=document.createElement('span');
  const hasUrl=!!(h.url);
  urlIconEl.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  urlIconEl.style.cssText='color:rgba(255,255,255,0.5);display:flex;align-items:center';
  const urlInput=document.createElement('input');
  urlInput.className='url-input'; urlInput.id='hdu'; urlInput.value=h.url||''; urlInput.placeholder='';
  urlInput.style.cssText='width:100%;display:'+(hasUrl?'block':'none')+';margin-top:8px';
  urlIconWrap.onclick=()=>{
    const open=urlInput.style.display!=='none';
    urlInput.style.display=open?'none':'block';
    urlIconEl.style.color=open?'rgba(255,255,255,0.5)':'rgba(255,255,255,0.9)';
    if(!open) setTimeout(()=>urlInput.focus(),50);
    else urlInput.value='';
  };
  urlIconWrap.appendChild(urlIconEl); urlRow.appendChild(urlIconWrap); urlRow.appendChild(urlInput); body.appendChild(urlRow);

  // Spacer + Save + Delete
  const spacer=document.createElement('div'); spacer.className='hd-spacer'; body.appendChild(spacer);
  const saveBtn=document.createElement('button');
  saveBtn.className='save-btn'; saveBtn.textContent='Zapisz';
  saveBtn.onclick=saveHabitDetail; body.appendChild(saveBtn);
  if(!isNew){
    const delBtn=document.createElement('button');
    delBtn.className='delete-btn'; delBtn.id='del-h-'+hId;
    delBtn.innerHTML=trashSVG+' Usuń';
    delBtn.onclick=()=>askDelete(delBtn,h.name,()=>deleteHabit(hId));
    body.appendChild(delBtn);
  }

  document.getElementById('habitDetail').classList.add('open');
  // focus handled by openNewHabit with delay
}
function hdType(t,el){ document.querySelectorAll('.hd-body .type-mini-btns .type-mini-btn').forEach(b=>b.classList.remove('active')); el.classList.add('active'); }
function htCatPick(el){ document.querySelectorAll('#hdCatRow .sector-pill').forEach(p=>p.classList.remove('active')); el.classList.add('active'); }
function hdToggleTrackTime(el){ el.classList.toggle('on'); document.getElementById('hdCatRow').style.display=el.classList.contains('on')?'flex':'none'; }
function closeHabitDetail(){ document.getElementById('habitDetail').classList.remove('open'); }
function saveHabitDetail(){
  const name=document.getElementById('hdn')?.value.trim(); if(!name) return;
  const days=DAYS.map((_,i)=>document.getElementById(`hdd${i}`)?.classList.contains('active')?i:-1).filter(x=>x>=0);
  const tl=['checkbox','number','text'];
  const _typeBtns=document.querySelectorAll('.hd-body .type-mini-btns .type-mini-btn'); // #10: cache once
  const type=tl.find(t=>_typeBtns[tl.indexOf(t)]?.classList.contains('active'))||'checkbox';
  const url=document.getElementById('hdu')?.value.trim()||'';
  const trackTime=editHabitId!=='new'?(state.habits.find(x=>x.id===editHabitId)?.trackTime||false):false;
  if(editHabitId==='new'){
    const sectorId=editHabitSectorId||state.sectors[0]?.id;
    const order=state.habits.filter(h=>h.sectorId===sectorId).length;
    state.habits.push({id:'h'+Date.now(),name,sectorId,type,days,url,order,trackTime});
  } else {
    const h=state.habits.find(x=>x.id===editHabitId); if(h) Object.assign(h,{name,type,days,url,trackTime});
  }
  save(); closeHabitDetail(); renderSettings(); renderHome();
}
function deleteHabit(hId){ state.habits=state.habits.filter(x=>x.id!==hId); save(); closeHabitDetail(); renderSettings(); renderHome(); }

/* ══ HABIT TIME SCREEN ══ */
let htHabitId=null, htSelBlocks=new Set();

function openHabitTimeScreen(hId){
  const h=state.habits.find(x=>x.id===hId); if(!h) return;
  htHabitId=hId; htSelBlocks.clear();
  document.getElementById('htHabitName').textContent=h.name;
  renderHabitTimeGrid();
  document.getElementById('habitTimeScreen').style.transform='translateY(0)';
}
function closeHabitTimeScreen(){
  document.getElementById('habitTimeScreen').style.transform='translateY(100%)';
  htHabitId=null; htSelBlocks.clear();
}
function saveHabitTime(){
  if(!htHabitId||!htSelBlocks.size){ closeHabitTimeScreen(); completeHabit(htHabitId||'',true); renderHome(); return; }
  const h=state.habits.find(x=>x.id===htHabitId); if(!h) return;
  const blocks=Array.from(htSelBlocks).map(k=>{const[hh,q]=k.split(':');return{h:+hh,q:+q};});
  const k=today();
  if(!state.timeEntries) state.timeEntries={};
  if(!state.timeEntries[k]) state.timeEntries[k]=[];
  state.timeEntries[k].push({id:'tt'+Date.now(),label:h.name,blocks});
  completeHabit(htHabitId,true);
  save(); closeHabitTimeScreen(); renderHome();
}
function renderHabitTimeGrid(){
  const inner=document.getElementById('htGridInner'); if(!inner) return;
  const filled=getFilledBlocks();
  // Show only unfilled hours near current time
  const now=new Date(); const curH=now.getHours();
  const startH=Math.max(0,curH-4);
  let html='';
  for(let h=startH;h<24;h++){
    const allFull=[0,1,2,3].every(q=>filled.has(`${h}:${q}`)); if(allFull) continue;
    html+=`<div class="tt-hour-row" style="gap:0"><div class="tt-hour-label">${h}</div><div class="tt-blocks" style="position:relative">`;
    for(let q=0;q<4;q++){
      const key=`${h}:${q}`;
      const isSel=htSelBlocks.has(key);
      const isFilled=filled.has(key);
      html+=`<div class="tt-block${isFilled?' filled':''}${isSel?' selecting':''}" data-h="${h}" data-q="${q}"
        style="${isFilled?'background:var(--bg);':''}${isSel&&!isFilled?'background:rgba(61,221,101,0.45);':''}"
        ontouchstart="htBlockTouch(event,${h},${q})"
        ontouchmove="htBlockMove(event)"
        ontouchend="htBlockEnd()"
        onclick="htBlockClick(${h},${q})"></div>`;
    }
    html+=`</div></div>`;
  }
  inner.innerHTML=html;
  updateHtDuration();
  // Scroll to current time
  requestAnimationFrame(()=>{
    const grid=document.getElementById('htGrid');
    const row=inner.querySelector(`[id^="tt-row"]`)||inner.firstElementChild;
    if(row) grid.scrollTop=Math.max(0,row.offsetTop-100);
  });
}
let htTouchStartH=-1,htTouchStartQ=-1,htTouchEndH=-1,htTouchEndQ=-1,htTouchActive=false;
function htBlockClick(h,q){
  const key=`${h}:${q}`;
  if(htSelBlocks.has(key)) htSelBlocks.delete(key); else htSelBlocks.add(key);
  renderHabitTimeGrid();
}
function htBlockTouch(e,h,q){
  e.preventDefault(); htTouchActive=true;
  htTouchStartH=h; htTouchStartQ=q; htTouchEndH=h; htTouchEndQ=q;
  htSelBlocks.clear(); htUpdateRange(); renderHabitTimeGrid();
}
function htBlockMove(e){
  if(!htTouchActive) return; e.preventDefault();
  const t=e.touches[0];
  const el=document.elementFromPoint(t.clientX,t.clientY);
  const dh=parseInt(el?.dataset?.h),dq=parseInt(el?.dataset?.q);
  if(isNaN(dh)||isNaN(dq)||dh===htTouchEndH&&dq===htTouchEndQ) return;
  htTouchEndH=dh; htTouchEndQ=dq; htUpdateRange(); renderHabitTimeGrid();
}
function htBlockEnd(){ htTouchActive=false; }
function htUpdateRange(){
  const s=blockIndex(htTouchStartH,htTouchStartQ), e=blockIndex(htTouchEndH,htTouchEndQ);
  const lo=Math.min(s,e),hi=Math.max(s,e);
  htSelBlocks.clear();
  for(let i=lo;i<=hi;i++){const{h,q}=indexToHQ(i);htSelBlocks.add(`${h}:${q}`);}
}
function updateHtDuration(){
  const el=document.getElementById('htDuration'); if(!el) return;
  if(!htSelBlocks.size){el.innerHTML='';return;}
  const sorted=[...htSelBlocks].map(k=>{const[h,q]=k.split(':');return{h:+h,q:+q};}).sort((a,b)=>blockIndex(a.h,a.q)-blockIndex(b.h,b.q));
  const f=sorted[0],l=sorted[sorted.length-1];
  const fmt=(h,q)=>`${h}:${String(q*15).padStart(2,'0')}`;
  const eq=(l.q+1)%4,eh=l.h+(l.q===3?1:0);
  const mins=htSelBlocks.size*15,hh=Math.floor(mins/60),m=mins%60;
  el.innerHTML=`<span style="font-size:22px;font-weight:300;letter-spacing:0.02em">${fmt(f.h,f.q)}–${fmt(eh,eq)}</span><span style="display:block;font-size:13px;color:rgba(255,255,255,0.5);margin-top:2px">${hh>0?hh+'h':''}${m>0?' '+m+'m':''}</span>`;
}

/* ── EXPORT CSV ── */
function exportJSON(){
  try{
    const data=JSON.stringify(state,null,2);
    const blob=new Blob([data],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const d=new Date();
    a.href=url;
    a.download=`habits-backup-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); },200);
  }catch(e){ alert('Błąd eksportu: '+e.message); }
}
function openCSVSheet(){
  document.getElementById('csvSheet').classList.add('open');
  document.getElementById('overlay').classList.add('open');
  document.getElementById('overlay').onclick=closeCSVSheet;
}
function closeCSVSheet(){
  document.getElementById('csvSheet').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('overlay').onclick=closeAllSheets;
}
function exportCSV(){
  closeCSVSheet();
  try{
    const d=new Date();
    const ds=`${String(d.getFullYear()).slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    // Build rows: date, habit name, sector, done (1/0), value, time tracked (min)
    const rows=[['data','nawyk','sektor','wykonano','wartość','czas_min']];
    const sectorName=id=>(state.sectors||[]).find(s=>s.id===id)?.name||'';
    // Gather all dates present in completions
    const dates=new Set();
    (state.habits||[]).forEach(h=>{
      Object.keys(h.completions||{}).forEach(dk=>dates.add(dk));
    });
    // Also add last 90 days so active habits show 0s
    for(let i=0;i<90;i++){
      const dt=new Date(); dt.setDate(dt.getDate()-i);
      dates.add(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`);
    }
    const sorted=[...dates].sort();
    sorted.forEach(dk=>{
      (state.habits||[]).forEach(h=>{
        const c=h.completions?.[dk];
        const done=c!==undefined&&c!==null&&c!==false?1:0;
        const val=typeof c==='string'||typeof c==='number'?c:'';
        // Time entries for this habit on this date
        const te=(state.timeEntries?.[dk]||[]).filter(e=>e.habitId===h.id);
        const mins=te.reduce((s,e)=>s+Math.round((e.end-e.start)/60000),0);
        rows.push([dk, h.name, sectorName(h.sectorId), done, val, mins||'']);
      });
    });
    const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+ '"').join(',')).join('\r\n');
    const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`habits-${ds}.csv`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); },200);
  }catch(e){ alert('Błąd eksportu: '+e.message); }
}

/* ── AUTO-BACKUP REMINDER ── */
// Shows a non-intrusive toast once every 7 days reminding to export data.
// localStorage on iOS Safari PWA can be cleared by the OS without warning.
(function checkBackupReminder(){
  try{
    const KEY='lastBackupReminder';
    const last=parseInt(localStorage.getItem(KEY)||'0');
    const now=Date.now();
    const SEVEN_DAYS=7*24*60*60*1000;
    if(now-last < SEVEN_DAYS) return;
    // Show after a short delay so app renders first
    setTimeout(()=>{
      localStorage.setItem(KEY,String(now));
      const t=document.createElement('div');
      t.id='backupToast';
      t.style.cssText='position:fixed;bottom:calc(var(--safe-bottom)+110px);left:50%;transform:translateX(-50%);z-index:300;background:rgba(28,28,30,0.97);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:22px;padding:12px 20px 12px 16px;display:flex;align-items:center;gap:14px;font-size:13px;color:rgba(255,255,255,0.7);white-space:nowrap;animation:toastIn .3s cubic-bezier(.34,1.56,.64,1) forwards;box-shadow:0 4px 24px rgba(0,0,0,0.5);max-width:92vw;';
      const txt=document.createElement('span');
      txt.textContent='Zrób backup danych 💾';
      const btn=document.createElement('button');
      btn.style.cssText='background:none;border:none;color:var(--accent);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;padding:0;touch-action:manipulation;flex-shrink:0';
      btn.textContent='Eksportuj';
      btn.onclick=()=>{ t.remove(); exportJSON(); };
      const closeBtn=document.createElement('button');
      closeBtn.style.cssText='background:none;border:none;color:rgba(255,255,255,0.35);font-size:16px;cursor:pointer;padding:0 0 0 4px;touch-action:manipulation;flex-shrink:0;line-height:1';
      closeBtn.textContent='×';
      closeBtn.onclick=()=>{ t.style.animation='toastOut .2s ease forwards'; setTimeout(()=>t.remove(),220); };
      t.appendChild(txt); t.appendChild(btn); t.appendChild(closeBtn);
      document.body.appendChild(t);
      setTimeout(()=>{ if(t.parentNode){ t.style.animation='toastOut .2s ease forwards'; setTimeout(()=>t.remove(),220); } },8000);
    },3000);
  }catch{}
})();
function buildCSVRows(){
  const rows=[];
  // ── NAWYKI ──
  rows.push(['data','sektor','habit','wartosc']);
  for(const[k,data]of Object.entries(state.daily).sort()){
    for(const[hId,val]of Object.entries(data.habits||{})){
      if(!isDone(val)) continue;
      const h=state.habits.find(x=>x.id===hId);
      const sec=state.sectors.find(s=>s.id===h?.sectorId);
      rows.push([k,sec?.name||'',h?.name||hId,val===true?1:String(val)]);
    }
  }
  rows.push(['']);
  // ── CZAS ──
  rows.push(['data','aktywnosc','minuty']);
  for(const[k,entries]of Object.entries(state.timeEntries||{}).sort()){
    for(const e of entries){
      if(e.empty) continue;
      const mins=(e.blocks?.length||0)*15;
      rows.push([k,e.label||'',mins]);
    }
  }
  return rows;
}



/* ══════════════════════════════════════════
   TIME TRACKER
══════════════════════════════════════════ */
let ttSelecting=false;
let ttSelBlocks=new Set(); // set of "H:Q" strings e.g. "14:2"
let ttTouchActive=false;

let _ttViewSectorId=null;

function updateTTSectorLabel(){
  const lbl=document.getElementById('ttSectorLabel');
  if(!lbl) return;
  const sec=getActiveSector();
  lbl.textContent=sec?sec.name:'';
}

function toggleTTSector(){
  // S = start: select current 15min block and show entry panel
  const now=new Date();
  const h=now.getHours();
  const q=Math.floor(now.getMinutes()/15);
  ttSelBlocks.clear();
  ttSelBlocks.add(`${h}:${q}`);
  ttTouchStartH=h; ttTouchStartQ=q; ttTouchEndH=h; ttTouchEndQ=q;
  ttSelecting=true;
  renderTTGrid();
  updateTTSelectionBar();
  if(_ttHabitId){
    document.getElementById('ttHabitSaveBar').style.display='block';
  } else {
    showTTEntryPanel();
  }
  // Scroll to current time
  const scroll=document.getElementById('ttScroll');
  const row=document.getElementById(`tt-row-${h}`);
  if(row&&scroll) scroll.scrollTop=Math.max(0,row.offsetTop-120);
}






function openTimeTracker(habitId){
  _ttHabitId=habitId||null;
  _ttViewSectorId=null;
  document.getElementById('ttSaveHabitBtn').style.display=_ttHabitId?'block':'none';
  if(_ttHabitId){
    const h=state.habits.find(x=>x.id===_ttHabitId);
    ttEntryLabel=h?.name||'';
  }
  document.getElementById('home').classList.add('slide-out');
  const tt=document.getElementById('timeTracker');
  tt.style.transition='none';
  tt.style.transform='translateX(100%)';
  tt.classList.add('active');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    tt.style.transition='transform .55s cubic-bezier(.16,1,.3,1)';
    tt.style.transform='translateX(0)';
  }));
  document.querySelector('.habits-scroll').style.overflow='hidden';
  const blockW=(window.innerWidth-44-60)/4;
  const blockH=72;
  const padPct=(blockH/blockW*100).toFixed(2);
  document.documentElement.style.setProperty('--tt-block-pt',padPct+'%');
  renderTTGrid();
  requestAnimationFrame(()=>{
    const scroll=document.getElementById('ttScroll');
    const now=new Date();
    const curH=now.getHours();
    const nowMin=now.getMinutes();
    const safeTop=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-top'))||44;
    const row=document.getElementById(`tt-row-${curH}`);
    if(row&&scroll){
      // Get row height to compute exact minute offset
      const rowH=row.offsetHeight||56;
      const minuteOffset=Math.round(nowMin/60*rowH);
      const viewH=scroll.clientHeight;
      const target=row.offsetTop+minuteOffset-viewH/2;
      scroll.scrollTop=Math.max(0,target);
    }
  });
}
function closeTimeTracker(){
  const tt=document.getElementById('timeTracker'),home=document.getElementById('home');
  const dur='.55s cubic-bezier(.16,1,.3,1)';
  tt.style.transition='transform '+dur;
  home.style.transition='transform '+dur;
  tt.style.transform='translateX(100%)';
  tt.classList.remove('active');
  home.classList.remove('slide-out');
  home.style.transform='';
  setTimeout(()=>{ tt.style.transform=''; tt.style.transition=''; home.style.transition=''; },580);
  document.querySelector('.habits-scroll').style.overflow='';
  closeTTEntry(); ttSelBlocks.clear(); ttSelecting=false;
  _ttHabitId=null;
  document.getElementById('ttSaveHabitBtn').style.display='none';
  document.getElementById('ttHabitSaveBar').style.display='none';
}
function saveTTHabitMode(){
  if(!_ttHabitId){ closeTimeTracker(); return; }
  const h=state.habits.find(x=>x.id===_ttHabitId);
  if(ttSelBlocks.size>0){
    const blocks=Array.from(ttSelBlocks).map(k=>{const[hh,q]=k.split(':');return{h:+hh,q:+q};});
    const k=today();
    if(!state.timeEntries) state.timeEntries={};
    if(!state.timeEntries[k]) state.timeEntries[k]=[];
    state.timeEntries[k].push({id:'tt'+Date.now(),label:h?.name||ttEntryLabel||'',blocks});
    completeHabit(_ttHabitId,true); save();
  }
  closeTimeTracker(); renderHome();
  // Redirect to URL if set
  if(h?.url){ try{ window.open(h.url,'_blank'); }catch(e){} }
}
function cancelTTHabitSelection(){
  ttSelBlocks.clear(); ttSelecting=false;
  document.getElementById('ttHabitSaveBar').style.display='none';
  renderTTGrid(); updateTTSelectionBar();
}

function getTodayEntries(){
  const k=today();
  if(!state.timeEntries) state.timeEntries={};
  if(!state.timeEntries[k]) state.timeEntries[k]=[];
  return state.timeEntries[k];
}

// Returns set of "H:Q" for all filled blocks today
function getFilledBlocks(){
  const filled=new Map(); // "H:Q" -> entry
  const entries=getTodayEntries();
  for(const e of entries){
    for(const b of (e.blocks||[])) filled.set(`${b.h}:${b.q}`, e);
  }
  return filled;
}



function renderTTGrid(){
  const filled=getFilledBlocks();
  const grid=document.getElementById('ttGrid');
  let html='';
  let prevH=-1;
  const curH=new Date().getHours();

  for(let h=0;h<24;h++){
    const allFilled=[0,1,2,3].every(q=>filled.has(`${h}:${q}`)&&!ttSelBlocks.has(`${h}:${q}`));
    if(allFilled) continue;

    // Full-width white line to mark a gap (skipped hour)
    if(prevH>=0 && h > prevH+1){
      html+=`<div style="display:flex;align-items:center;height:6px">` +
        `<div style="width:44px;flex-shrink:0"></div>` +
        `<div style="flex:1;height:3px;background:rgba(255,255,255,0.7)"></div>` +
      `</div>`;
    }
    prevH=h;

    html+=`<div class="tt-hour-row" id="tt-row-${h}" style="gap:0">`;
    html+=`<div class="tt-hour-label">${h}</div>`;
    html+=`<div class="tt-blocks" id="tt-blocks-${h}" style="position:relative">`;
    // Ruler tick + current hour line
    if(h===curH){
      html+=`<div style="position:absolute;top:0;left:0;right:0;z-index:3;pointer-events:none">` +
        `<div style="height:3px;background:rgba(239,68,68,1)"></div>` +
      `</div>`;
    } else {
      html+=`<div style="position:absolute;top:0;left:0;width:5%;height:3px;background:rgba(255,255,255,0.45);z-index:2;pointer-events:none"></div>`;
    }

    for(let q=0;q<4;q++){
      const key=`${h}:${q}`;
      const entry=filled.get(key);
      const isSel=ttSelBlocks.has(key);
      if(entry){
        const emptyBg=entry.empty?"background:rgba(255,255,255,0.06)":"background:var(--bg)";
        html+=`<div class="tt-block filled${isSel?' selecting':''}" data-h="${h}" data-q="${q}" data-entry="${entry.id}" style="${emptyBg}" ontouchstart="ttBlockTouchStart(event,${h},${q})" ontouchmove="ttBlockTouchMove(event)" ontouchend="ttBlockTouchEnd(event)" onclick="ttBlockClick(${h},${q})"></div>`;
      } else {
        html+=`<div class="tt-block${isSel?' selecting':''}" data-h="${h}" data-q="${q}" id="ttb-${h}-${q}" ontouchstart="ttBlockTouchStart(event,${h},${q})" ontouchmove="ttBlockTouchMove(event)" ontouchend="ttBlockTouchEnd(event)" onclick="ttBlockClick(${h},${q})"></div>`;
      }
    }
    html+=`</div></div>`;
  }
  grid.innerHTML=html;
}

/* Touch drag to select continuous range of blocks — Blockify style */
let ttTouchStartH=-1, ttTouchStartQ=-1, ttTouchEndH=-1, ttTouchEndQ=-1;

function blockIndex(h,q){ return h*4+q; }
function indexToHQ(i){ return {h:Math.floor(i/4),q:i%4}; }

function updateSelectionFromRange(){
  const startIdx=blockIndex(ttTouchStartH,ttTouchStartQ);
  const endIdx=blockIndex(ttTouchEndH,ttTouchEndQ);
  const lo=Math.min(startIdx,endIdx), hi=Math.max(startIdx,endIdx);
  ttSelBlocks.clear();
  for(let i=lo;i<=hi;i++){
    const {h,q}=indexToHQ(i);
    ttSelBlocks.add(`${h}:${q}`); // include filled blocks too
  }
}

function ttBlockTouchStart(e,h,q){
  e.preventDefault();
  ttTouchActive=true;
  ttTouchStartH=h; ttTouchStartQ=q;
  ttTouchEndH=h; ttTouchEndQ=q;
  ttSelecting=true;
  ttSelBlocks.clear();
  updateSelectionFromRange();
  renderTTGrid();
  updateTTSelectionBar();
}
function ttBlockTouchMove(e){
  if(!ttTouchActive||!ttSelecting) return;
  e.preventDefault();
  const touch=e.touches[0];
  // Walk up from elementFromPoint, skipping overlays
  let dh, dq;
  const els=document.elementsFromPoint?document.elementsFromPoint(touch.clientX,touch.clientY):[document.elementFromPoint(touch.clientX,touch.clientY)];
  for(const el of els){
    if(el?.dataset?.h!==undefined&&!isNaN(+el.dataset.h)){
      dh=+el.dataset.h; dq=+el.dataset.q; break;
    }
  }
  if(dh===undefined||isNaN(dh)) return;
  if(dh===ttTouchEndH&&dq===ttTouchEndQ) return;
  ttTouchEndH=dh; ttTouchEndQ=dq;
  updateSelectionFromRange();
  renderTTGrid();
  updateTTSelectionBar();
}
function ttBlockTouchEnd(e){
  ttTouchActive=false;
  if(ttSelBlocks.size>0){
    if(_ttHabitId){
      // Habit mode: show entry panel WITH duration display (same as normal mode)
      updateTTSelectionBar();
      // Show duration in ttEntryDuration without showing the full panel
      document.getElementById('ttHabitSaveBar').style.display='block';
    } else {
      showTTEntryPanel();
    }
  } else ttSelecting=false;
}
function ttBlockClick(h,q){
  const key=`${h}:${q}`;
  const filled=getFilledBlocks();
  const entry=filled.get(key);
  // If it's a filled block and nothing is being selected, open edit
  if(entry&&ttSelBlocks.size===0){
    editTTEntry(entry.id);
    return;
  }
  // Otherwise treat as regular block toggle
  if(ttSelBlocks.size===1&&ttSelBlocks.has(key)){
    ttSelBlocks.clear(); ttSelecting=false;
    renderTTGrid(); updateTTSelectionBar(); closeTTEntry(); return;
  }
  ttSelBlocks.clear();
  ttSelBlocks.add(key);
  ttTouchStartH=h; ttTouchStartQ=q; ttTouchEndH=h; ttTouchEndQ=q;
  ttSelecting=true;
  renderTTGrid(); updateTTSelectionBar(); showTTEntryPanel();
}

function drawSelectionOutline(){
  // Remove old outline
  document.getElementById('ttSelOutline')?.remove();
  if(!ttSelBlocks.size) return;
  // Find bounding box of selection in DOM coordinates
  const blocks=[];
  for(const key of ttSelBlocks){
    const [h,q]=key.split(':');
    const el=document.querySelector(`[data-h="${h}"][data-q="${q}"]`);
    if(el) blocks.push(el.getBoundingClientRect());
  }
  if(!blocks.length) return;
  const scroll=document.getElementById('ttScroll');
  const scrollRect=scroll.getBoundingClientRect();
  const scrollTop=scroll.scrollTop;
  const top=Math.min(...blocks.map(r=>r.top))-scrollRect.top+scrollTop;
  const bot=Math.max(...blocks.map(r=>r.bottom))-scrollRect.top+scrollTop;
  const lft=Math.min(...blocks.map(r=>r.left))-scrollRect.left;
  const rgt=Math.max(...blocks.map(r=>r.right))-scrollRect.left;
  const div=document.createElement('div');
  div.id='ttSelOutline';
  div.style.cssText=`position:absolute;top:${top}px;left:${lft}px;width:${rgt-lft}px;height:${bot-top}px;border:2.5px solid rgba(90,250,126,0.85);border-radius:6px;pointer-events:none;z-index:30;touch-action:none;`;
  scroll.appendChild(div);
}

function updateTTSelectionBar(){
  if(!ttSelBlocks.size){
    document.getElementById('ttEntryDuration').textContent='';
    const hd=document.getElementById('ttHabitDuration');
    if(hd) hd.innerHTML='';
    return;
  }
  const mins=ttSelBlocks.size*15;
  const hh=Math.floor(mins/60),m=mins%60;
  const dur=hh>0?`${hh}h${m>0?' '+m+'m':''}`:mins+'m';
  const bigHTML=`<span style="display:block;font-size:30px;font-weight:200;letter-spacing:-.02em;color:#fff">${dur}</span>`;
  document.getElementById('ttEntryDuration').innerHTML=bigHTML;
  const hd=document.getElementById('ttHabitDuration');
  if(hd) hd.innerHTML=bigHTML;
}

function getTTSuggestions(query){
  const now=new Date();
  const freq={};
  for(const[dk,entries] of Object.entries(state.timeEntries||{})){
    const d=new Date(dk+'T00:00:00');
    if((now-d)/(864e5)>90) continue;
    for(const e of entries){
      if(!e.label||e.empty) continue;

      const key=e.label.trim();
      if(!freq[key]) freq[key]={label:key,count:0};
      freq[key].count++;
    }
  }
  let items=Object.values(freq).sort((a,b)=>b.count-a.count);
  if(query){
    const q=query.toLowerCase();
    items=items.filter(x=>x.label.toLowerCase().startsWith(q));
    if(!items.length) items=Object.values(freq).sort((a,b)=>b.count-a.count).filter(x=>x.label.toLowerCase().includes(q));
    return items.slice(0,1);
  }
  return items.slice(0,1);
}

function renderTTSuggestions(query){
  const box=document.getElementById('ttSuggestions');
  if(!box) return;
  const items=getTTSuggestions(query);
  box.style.cssText='margin:12px 0 0;display:block';
  box.innerHTML='';
  if(!items.length && !query) return;
  items.forEach((item,i)=>{
    const isLast=i===items.length-1;
    const br=i===0?(isLast?'12px':'12px 12px 0 0'):(isLast?'0 0 12px 12px':'0');
    const div=document.createElement('div');
    div.style.cssText='padding:14px 18px;background:rgba(255,255,255,0.32);color:#fff;font-size:17px;font-weight:400;text-align:center;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;margin-bottom:6px;border-radius:12px;';
    div.textContent=item.label;
    div.addEventListener('touchstart',()=>div.style.background='rgba(61,221,101,0.18)',{passive:true});
    div.addEventListener('touchend',()=>div.style.background='rgba(255,255,255,0.32)',{passive:true});
    div.addEventListener('click',()=>fillAndSaveTTSuggestion(item.label));
    box.appendChild(div);
  });
}

function fillAndSaveTTSuggestion(label){
  const blocks=Array.from(ttSelBlocks).map(k=>{const[h,q]=k.split(':');return{h:+h,q:+q};});
  if(!blocks.length) return;
  const k=today();
  if(!state.timeEntries) state.timeEntries={};
  if(!state.timeEntries[k]) state.timeEntries[k]=[];
  state.timeEntries[k].push({id:'tt'+Date.now(),label,blocks});
  save(); renderTTGrid(); ttSelBlocks.clear(); ttSelecting=false;
  closeTTEntry();
  if(_ttHabitId) completeHabit(_ttHabitId,true);
  // Close time tracker and return to home
  closeTimeTracker();
  renderHome();
}
function applyTTSuggestion(label){
  ttEntryLabel=label;
  // save immediately
  const blocks=Array.from(ttSelBlocks).map(k=>{const[h,q]=k.split(':');return{h:+h,q:+q};});
  if(!blocks.length){ closeTTEntry(); return; }
  const k=today();
  if(!state.timeEntries) state.timeEntries={};
  if(!state.timeEntries[k]) state.timeEntries[k]=[];
  state.timeEntries[k].push({id:'tt'+Date.now(),label,blocks});
  save(); renderTTGrid(); ttSelBlocks.clear(); ttSelecting=false;
  closeTTEntry();
  if(_ttHabitId) completeHabit(_ttHabitId,true);
  renderHome();
}

function showTTEntryPanel(){
  updateTTSelectionBar();
  ttLabelPhase=true;
  // Show cancel only in catRow
  const row=document.getElementById('ttCatRow');
  row.style.display='';
  row.innerHTML=`<div style="flex:1"></div><button onclick="cancelTTSelection()" style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.06);border:none;color:rgba(255,255,255,0.5);font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;font-weight:300">×</button>`;
  // Show field + suggestions immediately
  const field=document.getElementById('ttEntryField');
  if(field._sugHandler){ field.removeEventListener('input',field._sugHandler); field._sugHandler=null; }
  field.style.display='';
  field.value='';
  const box=document.getElementById('ttSuggestions');
  box.style.display='';
  renderTTSuggestions('');
  field._sugHandler=()=>{ ttEntryLabel=field.value; renderTTSuggestions(field.value); };
  field.addEventListener('input', field._sugHandler);
  setTimeout(()=>field.focus(),80);
  // Clear btn
  const filled=getFilledBlocks();
  const hasFilledSelected=Array.from(ttSelBlocks).some(k=>filled.has(k));
  let clearBtn=document.getElementById('ttClearBtn');
  if(hasFilledSelected){
    if(!clearBtn){
      clearBtn=document.createElement('button');
      clearBtn.id='ttClearBtn';
      clearBtn.style.cssText='width:100%;background:rgba(224,85,85,0.07);border:none;border-radius:12px;padding:12px;color:rgba(224,85,85,0.55);font-size:14px;font-family:inherit;cursor:pointer;margin-top:6px';
      clearBtn.innerHTML=`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>`;
      clearBtn.onclick=clearSelectedFilledBlocks;
      document.getElementById('ttEntryPanel').appendChild(clearBtn);
    }
  } else { clearBtn?.remove(); }
  document.getElementById('ttEntryPanel').classList.add('open');
  document.getElementById('ttEntryBackdrop').style.display='block';
}



function cancelTTSelection(){
  // × = mark selected blocks as "empty time" — fill them so they appear as used but with no label
  if(ttSelBlocks.size>0){
    const blocks=Array.from(ttSelBlocks).map(k=>{const[h,q]=k.split(':');return{h:parseInt(h),q:parseInt(q)};});
    const k=today();
    const entries=getTodayEntries();
    // Remove selected blocks from existing entries first
    for(const e of entries){
      e.blocks=(e.blocks||[]).filter(b=>!ttSelBlocks.has(`${b.h}:${b.q}`));
    }
    if(state.timeEntries?.[k]) state.timeEntries[k]=entries.filter(e=>e.blocks.length>0);
    // Add as empty entry (no label, no category)
    getTodayEntries().push({id:'tt'+Date.now(),label:'',catId:null,blocks,empty:true});
    save();
  }
  ttSelBlocks.clear(); ttSelecting=false; ttEntryLabel='';
  document.getElementById('ttEntryPanel').classList.remove('open');
  document.getElementById('ttEntryBackdrop').style.display='none';
  document.getElementById('ttEntryField').blur();
  document.getElementById('ttDelBtn')?.remove();
  document.getElementById('ttClearBtn')?.remove();
  ttEditingEntryId=null;
  renderTTGrid();
}

function clearSelectedFilledBlocks(){
  const filled=getFilledBlocks();
  const k=today();
  const entries=getTodayEntries();
  // For each filled selected block, remove its entry or trim its blocks
  const toDelete=new Set();
  for(const selKey of ttSelBlocks){
    const entry=filled.get(selKey);
    if(!entry) continue;
    // Remove only the selected blocks from this entry
    entry.blocks=entry.blocks.filter(b=>!ttSelBlocks.has(`${b.h}:${b.q}`));
    if(entry.blocks.length===0) toDelete.add(entry.id);
  }
  if(state.timeEntries?.[k]) state.timeEntries[k]=state.timeEntries[k].filter(e=>!toDelete.has(e.id));
  save(); closeTTEntry();
}
let ttEntryLabel='';
let ttLabelPhase=false;

function closeTTEntry(){
  document.getElementById('ttEntryPanel').classList.remove('open');
  document.getElementById('ttEntryBackdrop').style.display='none';
  document.getElementById('ttEntryField').blur();
  document.getElementById('ttDelBtn')?.remove();
  document.getElementById('ttClearBtn')?.remove();
  ttSelBlocks.clear(); ttSelecting=false; ttEntryLabel='';
  ttEditingEntryId=null;
  renderTTGrid();
}

let ttEditingEntryId=null;
function editTTEntry(entryId){
  const entries=getTodayEntries();
  const entry=entries.find(e=>e.id===entryId);
  if(!entry) return;
  ttEditingEntryId=entryId;
  ttSelBlocks.clear();
  for(const b of (entry.blocks||[])) ttSelBlocks.add(`${b.h}:${b.q}`);
  ttSelecting=true;
  ttEntryLabel=entry.label||'';
  updateTTSelectionBar();
  const row=document.getElementById('ttCatRow');
  row.style.display='';
  row.innerHTML=`<div style="flex:1"></div><button onclick="cancelTTSelection()" style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.06);border:none;color:rgba(255,255,255,0.5);font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;font-weight:300">×</button>`;
  const field=document.getElementById('ttEntryField');
  field.style.display='';
  field.value=ttEntryLabel;
  // suggestions
  const box=document.getElementById('ttSuggestions');
  if(box){ box.style.display=''; renderTTSuggestions(''); }
  if(field._sugHandler) field.removeEventListener('input', field._sugHandler);
  field._sugHandler=()=>{ ttEntryLabel=field.value; renderTTSuggestions(field.value); };
  field.addEventListener('input', field._sugHandler);
  // Delete button
  document.getElementById('ttDelBtn')?.remove();
  const del=document.createElement('button');
  del.id='ttDelBtn';
  del.style.cssText='width:100%;background:none;border:none;border-radius:12px;padding:12px;color:rgba(224,85,85,0.55);font-size:14px;font-family:inherit;cursor:pointer;margin-top:6px';
  del.textContent='Usuń';
  del.onclick=()=>deleteTTEntry(ttEditingEntryId);
  document.getElementById('ttEntryPanel').appendChild(del);
  document.getElementById('ttEntryPanel').classList.add('open');
  renderTTGrid();
}
function deleteTTEntry(entryId){
  const k=today();
  if(state.timeEntries?.[k]) state.timeEntries[k]=state.timeEntries[k].filter(e=>e.id!==entryId);
  save(); closeTTEntry();
}
// selectTTCat removed — replaced by work toggle

// selectTTCatAndShowLabels replaced by work toggle

document.getElementById('ttEntryField').addEventListener('input',e=>{ ttEntryLabel=e.target.value; });
document.getElementById('ttEntryField').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); saveTTEntry(); } });

function saveTTEntry(){
  if(ttSelBlocks.size===0) return;
  const label=document.getElementById('ttEntryField').value.trim();
  const blocks=Array.from(ttSelBlocks).map(k=>{ const[h,q]=k.split(':'); return{h:parseInt(h),q:parseInt(q)}; });
  const k=today();
  const entries=getTodayEntries();

  if(ttEditingEntryId){
    // Editing: update existing entry
    const idx=entries.findIndex(e=>e.id===ttEditingEntryId);
    if(idx>=0) entries[idx]={...entries[idx],label,blocks};
  } else {
    // New entry: remove selected blocks from any existing entries first
    for(const e of entries){
      e.blocks=(e.blocks||[]).filter(b=>!ttSelBlocks.has(`${b.h}:${b.q}`));
    }
    // Remove entries with no blocks left
    if(state.timeEntries?.[k]) state.timeEntries[k]=entries.filter(e=>e.blocks.length>0);
    getTodayEntries().push({id:'tt'+Date.now(),label,blocks});
  }
  save(); closeTTEntry(); closeTimeTracker();
}

/* ── NAVIGATION: Ghost zones & swipes ── */

// Swipe back from settings
(()=>{
  let sx=0, dragging=false;
  const settings=document.getElementById('settings');
  const home=document.getElementById('home');
  settings.addEventListener('touchstart',e=>{
    sx=e.touches[0].clientX; dragging=false;
  },{passive:true});
  settings.addEventListener('touchmove',e=>{
    if(sx>32) return;
    const dx=e.touches[0].clientX-sx;
    if(dx<0) return;
    dragging=true;
    const pct=Math.min(dx/window.innerWidth*100,100);
    settings.style.transition='none';
    home.style.transition='none';
    settings.style.transform=`translateX(${pct}%)`;
    home.style.transform=`translateX(${-28+pct*0.28}%)`;
  },{passive:true});
  settings.addEventListener('touchend',e=>{
    if(!dragging) return;
    const dx=e.changedTouches[0].clientX-sx;
    settings.style.transition=''; home.style.transition='';
    if(dx>80) closeSettings();
    else{ settings.style.transform='translateX(0)'; home.style.transform='translateX(-28%)'; }
    dragging=false;
  },{passive:true});
})();

(()=>{
  let sx=0,sy=0,moved=false;
  const home=document.getElementById('home');
  home.addEventListener('touchstart',e=>{
    sx=e.touches[0].clientX; sy=e.touches[0].clientY; moved=false;
  },{passive:true});
  home.addEventListener('touchmove',e=>{
    if(sx<window.innerWidth-36) return;
    const dx=sx-e.touches[0].clientX;
    const dy=Math.abs(e.touches[0].clientY-sy);
    if(dx>10&&dy<dx) moved=true;
  },{passive:true});
  home.addEventListener('touchend',e=>{
    if(!moved){ moved=false; return; }
    moved=false;
    const dx=sx-e.changedTouches[0].clientX;
  },{passive:true});
})();

// left-edge swipe removed

// Swipe back from Time Tracker — smooth snap
(()=>{
  let sx=0, moved=false;
  const tt=document.getElementById('timeTracker');
  const home=document.getElementById('home');
  tt.addEventListener('touchstart',e=>{
    sx=e.touches[0].clientX; moved=false;
  },{passive:true});
  tt.addEventListener('touchmove',e=>{
    if(sx>44) return;
    const dx=e.touches[0].clientX-sx;
    if(dx<4) return;
    moved=true;
    const pct=Math.min(dx/window.innerWidth*100,100);
    tt.style.transition='none';
    home.style.transition='none';
    tt.style.transform=`translateX(${pct}%)`;
    home.style.transform=`translateX(${-28+pct*0.28}%)`;
  },{passive:true});
  tt.addEventListener('touchend',e=>{
    if(!moved) return;
    const dx=e.changedTouches[0].clientX-sx;
    moved=false;
    // Double rAF: first frame clears transition:none, second frame triggers the snap animation
    requestAnimationFrame(()=>{
      tt.style.transition='';
      home.style.transition='';
      requestAnimationFrame(()=>{
        if(dx>70) closeTimeTracker();
        else{
          tt.style.transform='translateX(0)';
          home.style.transform='translateX(-28%)';
        }
      });
    });
  },{passive:true});
})();

















if('serviceWorker'in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
renderHome();
// #7: Replace naive setInterval(renderHome,60000) with smart scheduler.
// Re-render only when: (a) app is visible, (b) no text input is focused.
// Uses requestIdleCallback when available so it doesn't interrupt animations.
function _scheduleHomeRefresh(){
  const delay=60000;
  setTimeout(()=>{
    if(!document.hidden && document.activeElement?.tagName!=='INPUT' && document.activeElement?.tagName!=='TEXTAREA'){
      if(typeof requestIdleCallback!=='undefined'){
        requestIdleCallback(renderHome,{timeout:2000});
      } else {
        renderHome();
      }
    }
    _scheduleHomeRefresh(); // reschedule regardless so we don't drift
  },delay);
}
_scheduleHomeRefresh();
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden){ renderHome(); return; }
  document.querySelectorAll('.sector-block.expanded').forEach(block=>{
    const sId=block.id.replace('sb-','');
    if(sId) saveSectorSilent(sId);
  });
  saveNow();
});
window.addEventListener('pagehide',()=>{
  document.querySelectorAll('.sector-block.expanded').forEach(block=>{
    const sId=block.id.replace('sb-','');
    if(sId) saveSectorSilent(sId);
  });
  saveNow();
});

// Swipe from left edge to close habitDetail (slide-down screens)
(()=>{
  let sy=0, moved=false;
  const hd=document.getElementById('habitDetail');
  hd.addEventListener('touchstart',e=>{ sy=e.touches[0].clientY; moved=false; },{passive:true});
  hd.addEventListener('touchmove',e=>{
    if(e.touches[0].clientY - sy < 20) return;
    moved=true;
    const dy=Math.min(e.touches[0].clientY - sy, window.innerHeight);
    hd.style.transition='none';
    hd.style.transform=`translateY(${dy}px)`;
  },{passive:true});
  hd.addEventListener('touchend',e=>{
    if(!moved){ hd.style.transform=''; return; }
    const dy=e.changedTouches[0].clientY - sy;
    hd.style.transition='';
    if(dy>100){ closeHabitDetail(); hd.style.transform=''; }
    else{ hd.style.transform='translateY(0)'; }
    moved=false;
  },{passive:true});
})();

(()=>{
  let sy=0, moved=false;
  const ed=document.getElementById('extraDetail');
  ed.addEventListener('touchstart',e=>{ sy=e.touches[0].clientY; moved=false; },{passive:true});
  ed.addEventListener('touchmove',e=>{
    if(e.touches[0].clientY - sy < 20) return;
    moved=true;
    const dy=Math.min(e.touches[0].clientY - sy, window.innerHeight);
    ed.style.transition='none';
    ed.style.transform=`translateY(${dy}px)`;
  },{passive:true});
  ed.addEventListener('touchend',e=>{
    if(!moved){ ed.style.transform=''; return; }
    const dy=e.changedTouches[0].clientY - sy;
    ed.style.transition='';
    if(dy>100){ closeExtraDetail(); ed.style.transform=''; }
    else{ ed.style.transform='translateY(0)'; }
    moved=false;
  },{passive:true});
})();

// Apply custom background to all screens on render
(function applyCustomBgToScreens(){
  try{
    const bg=localStorage.getItem('customBg');
    if(bg){
      document.documentElement.style.setProperty('--bg',bg);
      document.body.style.background=bg;
    }
  }catch{}
})();

