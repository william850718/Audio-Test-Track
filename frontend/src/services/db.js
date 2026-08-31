import { toast } from '../components/ui.js';
import { STORAGE_KEY, migrateRecords } from '../domain/records.js';
import { softwareOpts } from '../domain/software.js';
import { getCurrentUser } from './auth.js';
import { redraw, showLoadingPlaceholder } from './hooks.js';
import { bumpId, setSyncStatus } from './supabase.js';
import { appConfig, projects, records, sb, setAppConfig, setLabInstruments, setProjects, setRecords } from '../state.js';
import { nowISO, todayISO } from '../utils/dates.js';

async function loadSettings(){
  try{
    const {data}=await sb.from('app_settings').select('data').eq('id','config').maybeSingle();
    if(data&&data.data&&Array.isArray(data.data.testSoftware)) setAppConfig({...appConfig,...data.data});
  }catch(e){ /* table may not exist yet — keep defaults */ }
}


async function saveSettings(){
  const {error}=await sb.from('app_settings').upsert({id:'config',data:appConfig,updated_at:nowISO(),updated_by:getCurrentUser()});
  if(error) throw error;
}


async function persistSettings(){
  // refresh any open software dropdown in the record form
  const sel=document.getElementById('f-software');
  if(sel){ const cur=sel.value; sel.innerHTML=softwareOpts(cur); }
  try{
    if(sb&&(await sb.auth.getSession()).data.session){ await saveSettings(); setSyncStatus('ok'); }
  }catch(e){ console.error(e); toast('Could not sync the software list. Did you run aclab-settings-setup.sql?','error',5000); }
}



function parseStore(raw){
  const data=JSON.parse(raw);
  if(Array.isArray(data)) return {records:migrateRecords(data),projects:[]};
  return {records:migrateRecords(data.records||[]),projects:data.projects||[]};
}


function localBackup(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify({records,projects}));}catch(e){}
}


/* ---- Per-row cloud persistence (records / projects / logs) ---- */
async function saveRecordRow(r,isNew){
  r.updated=todayISO(); r.updatedBy=getCurrentUser();
  const row=()=>({id:r.id,data:r,updated_at:nowISO(),updated_by:r.updatedBy});
  if(isNew){
    for(let t=0;t<30;t++){
      const {error}=await sb.from('records').insert(row());
      if(!error) return;
      if(error.code==='23505'){ r.id=bumpId(r.id); continue; } // ID taken -> next number
      throw error;
    }
    throw new Error('Could not allocate a unique record ID.');
  }
  const {error}=await sb.from('records').upsert(row());
  if(error) throw error;
}


async function removeRecordRow(id){
  const {error}=await sb.from('records').delete().eq('id',id);
  if(error) throw error;
}


// Lab Instruments: graceful load (table may not exist yet) + upsert one lab
async function loadLabInstruments(){
  try{
    const {data,error}=await sb.from('lab_instruments').select('id,data,updated_by');
    if(error) throw error;
    const m={};
    (data||[]).forEach(row=>{ m[row.id]={...(row.data||{}),updatedBy:row.updated_by}; });
    setLabInstruments(m);
  }catch(e){ /* table may not exist yet — keep whatever we have */ }
}


async function saveLabRow(labId,obj){
  const clean={...obj}; delete clean.updatedBy;
  const {error}=await sb.from('lab_instruments').upsert({id:labId,data:clean,updated_at:nowISO(),updated_by:getCurrentUser()});
  if(error) throw error;
}


async function saveProjectRow(p,isNew){
  p.updated=todayISO(); p.updatedBy=getCurrentUser();
  const row=()=>{ const {logs,...pd}=p; return {id:p.id,data:pd,updated_at:nowISO(),updated_by:p.updatedBy}; };
  if(isNew){
    for(let t=0;t<30;t++){
      const {error}=await sb.from('projects').insert(row());
      if(!error) return;
      if(error.code==='23505'){ p.id=bumpId(p.id); continue; }
      throw error;
    }
    throw new Error('Could not allocate a unique project ID.');
  }
  const {error}=await sb.from('projects').upsert(row());
  if(error) throw error;
}


async function removeProjectRow(id){
  const {error}=await sb.from('projects').delete().eq('id',id); // logs cascade-delete in DB
  if(error) throw error;
}


async function saveLogRow(projId,l,isNew){
  l.updated=todayISO(); l.updatedBy=getCurrentUser();
  const row=()=>({project_id:projId,id:l.id,data:l,updated_at:nowISO(),updated_by:l.updatedBy});
  if(isNew){
    for(let t=0;t<30;t++){
      const {error}=await sb.from('logs').insert(row());
      if(!error) return;
      if(error.code==='23505'){ l.id=bumpId(l.id); continue; }
      throw error;
    }
    throw new Error('Could not allocate a unique log ID.');
  }
  const {error}=await sb.from('logs').upsert(row());
  if(error) throw error;
}


async function removeLogRow(projId,id){
  const {error}=await sb.from('logs').delete().eq('project_id',projId).eq('id',id);
  if(error) throw error;
}


// Bulk upsert everything (used by import + one-time migration)
async function persistAll(){
  if(records.length){
    const rows=records.map(r=>({id:r.id,data:r,updated_at:nowISO(),updated_by:r.updatedBy||getCurrentUser()}));
    const {error}=await sb.from('records').upsert(rows); if(error) throw error;
  }
  if(projects.length){
    const prows=projects.map(p=>{const {logs,...pd}=p; return {id:p.id,data:pd,updated_at:nowISO(),updated_by:p.updatedBy||getCurrentUser()};});
    const {error}=await sb.from('projects').upsert(prows); if(error) throw error;
    const lrows=[];
    projects.forEach(p=>(p.logs||[]).forEach(l=>lrows.push({project_id:p.id,id:l.id,data:l,updated_at:nowISO(),updated_by:l.updatedBy||getCurrentUser()})));
    if(lrows.length){ const {error:le}=await sb.from('logs').upsert(lrows); if(le) throw le; }
  }
  localBackup();
}


// One-time migration: split the old single-row snapshot into the new tables
async function maybeMigrateSnapshot(){
  const [{count:rc},{count:pc}]=await Promise.all([
    sb.from('records').select('id',{count:'exact',head:true}),
    sb.from('projects').select('id',{count:'exact',head:true})
  ]).then(a=>a.map(x=>({count:x.count||0})));
  if(rc>0||pc>0) return; // already has normalized data
  const {data}=await sb.from('app_snapshot').select('records,projects').eq('id','main').maybeSingle();
  if(!data) return;
  const oldRecords=migrateRecords(data.records||[]);
  const oldProjects=data.projects||[];
  if(!oldRecords.length&&!oldProjects.length) return;
  setSyncStatus('loading','Migrating data…');
  if(oldRecords.length){
    const rows=oldRecords.map(r=>({id:r.id,data:r,updated_at:nowISO(),updated_by:null}));
    const {error}=await sb.from('records').upsert(rows); if(error) throw error;
  }
  if(oldProjects.length){
    const prows=oldProjects.map(p=>{const {logs,...pd}=p; return {id:p.id,data:pd,updated_at:nowISO(),updated_by:null};});
    const {error}=await sb.from('projects').upsert(prows); if(error) throw error;
    const lrows=[];
    oldProjects.forEach(p=>(p.logs||[]).forEach(l=>lrows.push({project_id:p.id,id:l.id,data:l,updated_at:nowISO(),updated_by:null})));
    if(lrows.length){ const {error:le}=await sb.from('logs').upsert(lrows); if(le) throw le; }
  }
}



async function cloudLoad(){
  await maybeMigrateSnapshot();
  await loadSettings();
  await loadLabInstruments();
  const [recRes,projRes,logRes]=await Promise.all([
    sb.from('records').select('id,data,updated_by'),
    sb.from('projects').select('id,data,updated_by'),
    sb.from('logs').select('project_id,id,data,updated_by')
  ]);
  if(recRes.error) throw recRes.error;
  if(projRes.error) throw projRes.error;
  if(logRes.error) throw logRes.error;
  setRecords(migrateRecords((recRes.data||[]).map(row=>({...row.data,id:row.id,updatedBy:row.updated_by}))));
  const logsByProj={};
  (logRes.data||[]).forEach(row=>{(logsByProj[row.project_id]=logsByProj[row.project_id]||[]).push({...row.data,id:row.id,updatedBy:row.updated_by});});
  setProjects((projRes.data||[]).map(row=>({...row.data,id:row.id,updatedBy:row.updated_by,logs:logsByProj[row.id]||[]})));
  localBackup();
}



// Wrap an in-memory mutation's cloud write: local backup always, cloud best-effort
/* ---- Offline write queue: retry writes that failed with no network ---- */
let writeQueue=[];
try{ writeQueue=JSON.parse(localStorage.getItem('aclab_write_queue')||'[]')||[]; }catch(e){ writeQueue=[]; }


function persistQueue(){ try{ localStorage.setItem('aclab_write_queue',JSON.stringify(writeQueue)); }catch(e){} }


function enqueueWrite(op){ if(op){ writeQueue.push(op); persistQueue(); } }


let _flushing=false;


async function flushQueue(){
  if(_flushing||!writeQueue.length) return;
  if(!(sb&&(await sb.auth.getSession()).data.session)) return;
  _flushing=true;
  try{
    while(writeQueue.length){
      const op=writeQueue[0], uid=getCurrentUser();
      let error=null;
      if(op.k==='saveRecord'){ ({error}=await sb.from('records').upsert({id:op.data.id,data:op.data,updated_at:nowISO(),updated_by:op.data.updatedBy||uid})); }
      else if(op.k==='removeRecord'){ ({error}=await sb.from('records').delete().eq('id',op.id)); }
      else if(op.k==='saveProject'){ ({error}=await sb.from('projects').upsert({id:op.data.id,data:op.data,updated_at:nowISO(),updated_by:op.data.updatedBy||uid})); }
      else if(op.k==='removeProject'){ await sb.from('logs').delete().eq('project_id',op.id); ({error}=await sb.from('projects').delete().eq('id',op.id)); }
      else if(op.k==='saveLog'){ ({error}=await sb.from('logs').upsert({project_id:op.projId,id:op.data.id,data:op.data,updated_at:nowISO(),updated_by:op.data.updatedBy||uid})); }
      else if(op.k==='removeLog'){ ({error}=await sb.from('logs').delete().eq('project_id',op.projId).eq('id',op.id)); }
      else if(op.k==='saveLab'){ ({error}=await sb.from('lab_instruments').upsert({id:op.labId,data:op.data,updated_at:nowISO(),updated_by:uid})); }
      if(error){ console.warn('Queue flush paused; will retry',error); break; }
      writeQueue.shift(); persistQueue();
    }
  }catch(e){ console.warn('Queue flush error',e); }
  _flushing=false;
  if(!writeQueue.length) setSyncStatus('ok');
}


async function afterMutation(writeFn,op){
  localBackup();
  try{
    setSyncStatus('saving');
    if(sb&&(await sb.auth.getSession()).data.session){
      await writeFn();
      await flushQueue();
      localBackup();
      setSyncStatus(writeQueue.length?'offline':'ok', writeQueue.length?('Syncing '+writeQueue.length+' pending…'):undefined);
    }else{
      enqueueWrite(op);
      localBackup();
      setSyncStatus('offline', op?('Offline — '+writeQueue.length+' change(s) will sync when online'):'Local backup only');
    }
  }catch(e){
    console.error(e);
    enqueueWrite(op);
    setSyncStatus('err', op?('Offline — '+writeQueue.length+' change(s) will sync when online'):'Saved locally, cloud failed');
  }
}
window.addEventListener('online',()=>{ flushQueue(); });



async function load(){
  try{
    setSyncStatus('loading');
    showLoadingPlaceholder();
    await cloudLoad();
    setSyncStatus('ok');
    startRealtime();
    flushQueue();
  }catch(e){
    console.error(e);
    const local=localStorage.getItem(STORAGE_KEY);
    if(local){
      const s=parseStore(local);
      setRecords(s.records); setProjects(s.projects);
      setSyncStatus('offline','Offline: loaded local backup');
    }else{
      setRecords([]); setProjects([]);
      setSyncStatus('err',e.message||'Load failed');
    }
  }
  redraw();
}

/* ---- Realtime ----
   Folded in from its own file: load() starts the channel and the channel calls
   cloudLoad(), so as separate modules they imported each other. They are one
   thing anyway - the live connection to the data. */

/* ---- Realtime: refresh when any user changes a row ---- */
let _rtChannel=null, _rtTimer=null;


function startRealtime(){
  if(_rtChannel||!sb) return;
  const bump=()=>{
    clearTimeout(_rtTimer);
    _rtTimer=setTimeout(async()=>{
      try{
        await cloudLoad();
        redraw();
        setSyncStatus('ok');
      }catch(e){ console.error(e); }
    },600);
  };
  _rtChannel=sb.channel('aclab-sync')
    .on('postgres_changes',{event:'*',schema:'public',table:'records'},bump)
    .on('postgres_changes',{event:'*',schema:'public',table:'projects'},bump)
    .on('postgres_changes',{event:'*',schema:'public',table:'logs'},bump)
    .on('postgres_changes',{event:'*',schema:'public',table:'app_settings'},bump)
    .on('postgres_changes',{event:'*',schema:'public',table:'lab_instruments'},bump)
    .subscribe();
}


function stopRealtime(){
  if(_rtChannel){ try{ sb.removeChannel(_rtChannel); }catch(e){} _rtChannel=null; }
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  _flushing, _rtChannel, afterMutation, cloudLoad, enqueueWrite, flushQueue, load,
  loadLabInstruments, loadSettings, localBackup, maybeMigrateSnapshot, parseStore,
  persistAll, persistQueue, persistSettings, removeLogRow, removeProjectRow, removeRecordRow,
  saveLabRow, saveLogRow, saveProjectRow, saveRecordRow, saveSettings, startRealtime,
  stopRealtime, writeQueue
};
