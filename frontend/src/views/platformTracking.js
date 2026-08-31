import { applyRecordFilters, catOptsHtml, fillCatFilter, fillSampleFilter, refreshFilterMenus, subcatOptsHtml } from '../components/filters.js';
import { requireAdmin, requireDelete } from '../components/guards.js';
import { noteSampleChecks, refreshSampleChecks } from '../components/productFields.js';
import { recordCardHtml, recordCrumbHtml, versionTimelineHtml } from '../components/recordCard.js';
import { confirmModal, toast } from '../components/ui.js';
import { filesDisplayHtml, imagesDisplayHtml, initFileUploader, initImageUploader } from '../components/uploaders.js';
import { ARCHIVE_AFTER_DAYS, applyStatusOnRecord, closeDaysOf, isRecordArchived, recordStatus } from '../domain/archive.js';
import { canDelete } from '../domain/permissions.js';
import { CERT_CLS, CERT_LBL, PLATFORMS, PLAT_COLOR, PLAT_NAMES, PLAT_PFX, STATUSES, STATUS_MAP, STATUS_NEXT, TYPES_ALT_MAP, TYPES_AUDIO_MAP, TYPE_MAP, catDef, getTypesForPlat, legacyTypeLabel, recordSampleLabels, recordSampleValues, sampleTypesFor } from '../domain/platforms.js';
import { recordAssets, recordVersionNo } from '../domain/records.js';
import { recordSoftwareLabel, softwareOpts, testSoftwareList } from '../domain/software.js';
import { getCurrentEmail, getCurrentUser } from '../services/auth.js';
import { afterMutation, persistSettings, removeRecordRow, saveRecordRow } from '../services/db.js';
import { commitFiles, commitImages, deleteStoredImages } from '../services/storage.js';
import { appConfig, curP, myApproval, records, setCurP, setRecords, viewMode } from '../state.js';
import { todayISO } from '../utils/dates.js';
import { esc, fmtUser } from '../utils/format.js';
import { ensureAllowedUsers, identityFieldHtml, readIdentity } from './login.js';
import { renderProjectView } from './projectLog.js';

function manageTestSoftware(){
  const ov=document.createElement('div');
  ov.className='modal-overlay';
  const draw=()=>{
    const rows=testSoftwareList().map((s,i)=>`<div class="ts-row"><span>${esc(s)}</span><button type="button" class="ts-del" data-i="${i}" title="Remove"><i class="ti ti-x" aria-hidden="true"></i></button></div>`).join('')||'<div class="db-empty">No software yet</div>';
    ov.querySelector('#ts-list').innerHTML=rows;
    ov.querySelectorAll('.ts-del').forEach(b=>b.onclick=async()=>{
      const i=+b.dataset.i; appConfig.testSoftware=testSoftwareList().slice(); appConfig.testSoftware.splice(i,1);
      draw(); persistSettings();
    });
  };
  ov.innerHTML=`<div class="modal-card" role="dialog" aria-modal="true" style="max-width:440px">
    <div class="modal-title">Manage Test Software</div>
    <div class="modal-msg" style="margin-bottom:14px">This list is shared with everyone. Add or remove the test software used in your lab.</div>
    <div id="ts-list" style="max-height:260px;overflow:auto;margin-bottom:12px"></div>
    <div style="display:flex;gap:8px;margin-bottom:18px">
      <input type="text" id="ts-new" placeholder="New software name…" style="flex:1">
      <button type="button" class="btn primary" id="ts-add"><i class="ti ti-plus" aria-hidden="true"></i> Add</button>
    </div>
    <div class="modal-actions"><button type="button" class="btn" id="ts-done">Done</button></div>
  </div>`;
  document.body.appendChild(ov);
  const close=()=>{ ov.classList.remove('show'); setTimeout(()=>ov.remove(),200); };
  ov.addEventListener('click',e=>{ if(e.target===ov) close(); });
  ov.querySelector('#ts-done').onclick=close;
  const addFn=()=>{
    const inp=ov.querySelector('#ts-new'); const v=(inp.value||'').trim();
    if(!v) return;
    if(testSoftwareList().some(s=>s.toLowerCase()===v.toLowerCase())){ toast('That software is already in the list.','warn'); return; }
    appConfig.testSoftware=testSoftwareList().slice(); appConfig.testSoftware.push(v);
    inp.value=''; inp.focus(); draw(); persistSettings();
  };
  ov.querySelector('#ts-add').onclick=addFn;
  ov.querySelector('#ts-new').onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); addFn(); } };
  draw();
  requestAnimationFrame(()=>ov.classList.add('show'));
}



let editId=null;



function switchP(el){
  document.querySelectorAll('.ptab').forEach(t=>{t.className='ptab';});
  const p=el.dataset.p;
  el.classList.add(p=='all'?'p-all':'p-'+PLAT_COLOR[p]);
  setCurP(p);
  fillCatFilter();
  fillSampleFilter();
  render();
}




function genId(plat){
  const pfx=PLAT_PFX[plat]||'XX';
  const n=records.filter(r=>r.platform===plat).length+1;
  return pfx+'-'+String(n).padStart(3,'0');
}




function filtered(){
  const base=curP==='all'?records:records.filter(r=>r.platform===curP);
  const qst=(document.getElementById('q-stat')||{}).value||'';
  let d=applyRecordFilters(base.filter(r=>{
    // Archived has exactly one home, the Archived section, or filtering by Closed
    // would list the same card twice for an admin
    if(isRecordArchived(r)) return false;
    const st=recordStatus(r);
    if(qst) return st===qst;
    return st!=='closed';
  }));
  return d;
}



function closedPool(){
  const base=curP==='all'?records:records.filter(r=>r.platform===curP);
  return applyRecordFilters(base.filter(r=>recordStatus(r)==='closed'));
}



function filteredClosed(){ return closedPool().filter(r=>!isRecordArchived(r)); }



function filteredArchived(){ return closedPool().filter(isRecordArchived); }




function onStatCardClick(status){
  const sel=document.getElementById('q-stat');
  if(!sel) return;
  if(sel.value===status) sel.value='';
  else sel.value=status;
  refreshFilterMenus();
  renderDashboard();
  renderList();
}



function renderList(){
  const d=filtered();
  const el=document.getElementById('list-area');
  if(!d.length){
    el.innerHTML='<div class="empty"><i class="ti ti-clipboard-off" style="font-size:26px;display:block;margin:0 auto 8px;color:#6b7280" aria-hidden="true"></i>No active records<br><button onclick="showForm()" class="btn primary" style="margin-top:14px;font-size:14px"><i class="ti ti-plus" style="font-size:13px" aria-hidden="true"></i> Add Record</button></div>';
  }else{
    el.innerHTML=d.map(r=>recordCardHtml(r)).join('');
  }
  renderClosedArchive();
  renderBatchBar();
  markClampedDescriptions();
}



// Only promise "there is more" when the text is genuinely cut off
function markClampedDescriptions(){
  document.querySelectorAll('.desc-clamp').forEach(d=>{
    const hint=d.nextElementSibling;
    if(hint&&hint.classList.contains('desc-more')) hint.hidden=(d.scrollHeight<=d.clientHeight+1);
  });
}



function renderClosedArchive(){
  const wrap=document.getElementById('closed-archive');
  const el=document.getElementById('closed-list-area');
  if(!wrap||!el) return;
  renderArchivedSection();
  const d=filteredClosed();
  if(!d.length){
    wrap.hidden=true;
    el.innerHTML='';
    return;
  }
  wrap.hidden=false;
  const hintEl=wrap.querySelector('.archive-hint');
  if(hintEl) hintEl.textContent=`${d.length} closed record(s) · moves to Archived after ${ARCHIVE_AFTER_DAYS} days`;
  el.innerHTML=d.map(r=>recordCardHtml(r,{archive:true})).join('');
}



/* Hiding, not access control: the rows stay readable through the API, and this is
   internal notice material rather than anything customer-facing. What it buys is
   that fourteen other people are not scrolling past work that finished months ago. */
function renderArchivedSection(){
  const wrap=document.getElementById('archived-section');
  const el=document.getElementById('archived-list-area');
  if(!wrap||!el) return;
  const d=myApproval.isAdmin?filteredArchived():[];
  wrap.hidden=!d.length;
  if(!d.length){ el.innerHTML=''; return; }
  const hintEl=document.getElementById('archived-hint');
  if(hintEl) hintEl.textContent=`${d.length} record(s) closed over ${ARCHIVE_AFTER_DAYS} days ago · admin only · nothing here is deleted automatically`;
  el.innerHTML=d.map(r=>recordCardHtml(r,{archive:true})).join('');
}



/* Deliberately not chained to the export. openPrintReport only opens a print
   dialog - if the PDF is cancelled at the save step the app never finds out, so a
   flow that deleted "once exported" would be resting on something it cannot check.
   Two buttons means the files are on disk and looked at before this one is pressed. */
async function clearArchivedRecords(){
  if(!requireAdmin()) return;
  const d=filteredArchived();
  if(!d.length){ toast('Nothing archived to clear.','warn'); return; }
  const imgs=d.flatMap(r=>recordAssets(r));
  if(!(await confirmModal(
      `${d.length} archived record(s) and ${imgs.length} attachment(s) will be permanently deleted from the database and from storage. `
      +`Export them first if you have not — this cannot be undone.`,
      {title:'Clear archived records?',okText:'Delete permanently',danger:true}))) return;
  const ids=new Set(d.map(r=>r.id));
  setRecords(records.filter(r=>!ids.has(r.id)));
  await afterMutation(async()=>{
    for(const id of ids) await removeRecordRow(id);
    await deleteStoredImages(imgs);
  });
  render();
  toast(`${ids.size} archived record(s) deleted`,'success');
}



function render(){
  if(viewMode==='platform'){renderDashboard();renderList();}
  else renderProjectView();
}




// A single slim strip rather than a panel: the counts double as the status filter,
// which is what the old stat cards were actually used for.
function renderDashboard(){
  const el=document.getElementById('dashboard');
  if(!el) return;
  el.hidden=false;
  const pool=curP==='all'?records:records.filter(r=>r.platform===curP);
  const archived=pool.filter(isRecordArchived);
  const base=pool.filter(r=>!isRecordArchived(r));
  const total=base.length;
  const active=base.filter(r=>recordStatus(r)!=='closed').length;
  const closed=base.filter(r=>recordStatus(r)==='closed');
  // The average is worth more over every record that ever closed, so it reads the
  // whole pool and does not drift upward as items archive out of the list
  const cds=pool.filter(r=>recordStatus(r)==='closed').map(closeDaysOf).filter(v=>v!=null);
  const avgClose=cds.length?Math.round(cds.reduce((a,b)=>a+b,0)/cds.length):null;
  const archivedN=myApproval.isAdmin?archived.length:0;
  const curStat=(document.getElementById('q-stat')||{}).value||'';
  const pill=(v,n,label,cls,title)=>`<button type="button" class="stat-pill${cls?' '+cls:''}${curStat===v?' on':''}" onclick="onStatCardClick('${v}')" title="${esc(title)}">
    <span class="stat-n">${n}</span><span class="stat-k">${label}</span></button>`;
  el.innerHTML=`<div class="stat-strip">
    ${pill('',total,'Total','','Show all')}
    ${pill('in-progress',active,'In progress','s-open','Filter: In progress')}
    ${pill('closed',closed.length,'Closed','s-closed','Filter: Closed')}
    <span class="stat-pill static" title="Average days from created to closed"><span class="stat-n s-avg">${avgClose==null?'—':avgClose}</span><span class="stat-k">avg days to close</span></span>
    ${archivedN>0?`<span class="stat-pill static" title="Closed over ${ARCHIVE_AFTER_DAYS} days ago — listed under Archived, admin only"><span class="stat-n">${archivedN}</span><span class="stat-k">archived</span></span>`:''}
  </div>`;
}




/* ===== Debounced search ===== */
let _searchTimer=null;

function onSearchInput(){ clearTimeout(_searchTimer); _searchTimer=setTimeout(renderList,250); }



/* ===== Duplicate a record as a new one ===== */
function duplicateRecord(id){
  const r=records.find(x=>x.id===id); if(!r) return;
  editId=null;
  renderForm({
    platform:r.platform, category:r.category, subCategory:r.subCategory,
    type:r.type, updateSubtype:r.updateSubtype,
    sampleTypes:recordSampleValues(r), testSoftware:r.testSoftware, testSoftwareOther:r.testSoftwareOther,
    assignee:r.assignee, fwVersion:r.fwVersion,
    title:''
    // note: images, status, id intentionally NOT copied
  });
  document.getElementById('form-area').scrollIntoView({behavior:'smooth',block:'nearest'});
  toast('Duplicated — edit the title and save as a new record','info');
}




/* ===== Batch selection & actions ===== */
let selectedIds=new Set(), selectionMode=false;



function toggleSelectionMode(){
  selectionMode=!selectionMode;
  if(!selectionMode) selectedIds.clear();
  const btn=document.getElementById('select-toggle'); if(btn) btn.classList.toggle('active',selectionMode);
  render();
}



function exitSelectionMode(){ selectionMode=false; selectedIds.clear(); const btn=document.getElementById('select-toggle'); if(btn) btn.classList.remove('active'); render(); }



function toggleSelect(id,on){ if(on) selectedIds.add(id); else selectedIds.delete(id); const c=document.querySelector(`.record .rec-select[onclick*="'${id}'"]`); if(c) c.closest('.record').classList.toggle('selected',on); renderBatchBar(); }



function clearSelection(){ selectedIds.clear(); render(); }



function renderBatchBar(){
  const bar=document.getElementById('batch-bar'); if(!bar) return;
  if(!selectionMode){ bar.hidden=true; bar.innerHTML=''; return; }
  bar.hidden=false;
  const n=selectedIds.size;
  bar.innerHTML=`<span class="batch-n"><i class="ti ti-checkbox" aria-hidden="true"></i> ${n?n+' selected':'Select records to close or delete'}</span>
    ${n?`<button class="btn" onclick="batchClose()"><i class="ti ti-lock" aria-hidden="true"></i> Close</button>
    ${myApproval.isAdmin?`<button class="btn btn-danger-text" onclick="batchDelete()"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button>`:''}`:''}
    <button class="btn" onclick="exitSelectionMode()"><i class="ti ti-x" aria-hidden="true"></i> Done</button>`;
}



async function batchClose(){
  const ids=[...selectedIds];
  const targets=records.filter(r=>ids.includes(r.id)&&recordStatus(r)!=='closed');
  if(!targets.length){ toast('Selected records are already closed.','info'); return; }
  targets.forEach(r=>applyStatusOnRecord(r,'closed'));
  await afterMutation(async()=>{ for(const r of targets) await saveRecordRow(r,false); });
  selectedIds.clear(); render(); toast(targets.length+' record(s) closed','success');
}



async function batchDelete(){
  if(!requireAdmin('Only an admin can delete in bulk. A record you filed yourself can be deleted from its own card.')) return;
  const ids=[...selectedIds];
  if(!ids.length) return;
  if(!(await confirmModal(ids.length+' record(s) and their screenshots will be permanently deleted.',{title:'Delete '+ids.length+' records?',okText:'Delete',danger:true}))) return;
  const targets=records.filter(r=>ids.includes(r.id));
  setRecords(records.filter(r=>!ids.includes(r.id)));
  await afterMutation(async()=>{ for(const r of targets){ await removeRecordRow(r.id); await deleteStoredImages(recordAssets(r)); } });
  selectedIds.clear(); render(); toast(targets.length+' record(s) deleted','success');
}




/* ===== Skeleton loading placeholders ===== */
function skeletonCards(n){
  return '<div class="skel-wrap">'+Array.from({length:n||4}).map(()=>
    `<div class="skel-card"><div class="skel-line w70"></div><div class="skel-line w30"></div><div class="skel-line w90"></div></div>`
  ).join('')+'</div>';
}




function showForm(){
  editId=null;
  renderForm({});
}



function editRecord(id){
  editId=id;
  const r=records.find(x=>x.id===id);
  renderForm(r||{});
  document.getElementById('form-area').scrollIntoView({behavior:'smooth',block:'nearest'});
}



/* Record detail — opened by clicking a card. Keeps the list itself uncluttered:
   version history and the full details live here rather than on every card. */
function openRecordDetail(id){
  const r=records.find(x=>x.id===id); if(!r) return;
  const pc=PLAT_COLOR[r.platform]||'other';
  const st=recordStatus(r);
  const so=STATUS_MAP[st]||STATUSES[0];
  // Current list first: the legacy maps still label issue as "ISSUE", which no longer
  // matches the filter menu now that the label is shown as plain text
  const to=TYPES_AUDIO_MAP[r.type]||TYPE_MAP[r.type]||TYPES_ALT_MAP[r.type]||{lbl:legacyTypeLabel(r.type),cls:'b-cat'};
  const ov=document.createElement('div');
  ov.className='modal-overlay';
  ov.innerHTML=`<div class="modal-card rec-detail" role="dialog" aria-modal="true">
    <button type="button" class="rd-close" title="Close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button>
    <div class="rd-head">
      <div class="rd-title">${esc(r.title||'(Untitled)')}</div>
      <span class="badge ${so.cls}">${so.lbl}</span>
    </div>
    <div class="rec-crumb">${recordCrumbHtml(r,to)}${r.certType?`<span class="badge ${CERT_CLS[r.certType]||''}">${CERT_LBL[r.certType]||r.certType}</span>`:''}</div>
    <div class="meta-row">
      <span class="meta"><i class="ti ti-hash" aria-hidden="true"></i>${esc(r.id)}<span class="ver-pill">v${recordVersionNo(r)}</span></span>
      ${r.assignee?`<span class="meta"><i class="ti ti-user" aria-hidden="true"></i>${esc(fmtUser(r.assignee))}</span>`:''}
      ${r.fwVersion?`<span class="meta"><i class="ti ti-cpu" aria-hidden="true"></i>FW ${esc(r.fwVersion)}</span>`:''}
      <span class="meta" title="Created"><i class="ti ti-clock" aria-hidden="true"></i>${esc(r.created)}</span>
      ${(r.updated&&r.updated!==r.created)?`<span class="meta" title="Last updated"><i class="ti ti-history" aria-hidden="true"></i>${esc(r.updated)}</span>`:''}
      ${(r.updatedBy&&r.updatedBy!==r.assignee)?`<span class="meta" title="Last edited by"><i class="ti ti-pencil" aria-hidden="true"></i>${esc(fmtUser(r.updatedBy))}</span>`:''}
    </div>
    ${(recordSampleLabels(r).length||recordSoftwareLabel(r))?`<div class="rec-aux">
      ${recordSampleLabels(r).length?`<span class="aux"><i class="ti ti-device-audio" aria-hidden="true"></i>${recordSampleLabels(r).map(esc).join(', ')}</span>`:''}
      ${recordSoftwareLabel(r)?`<span class="aux"><i class="ti ti-device-desktop-analytics" aria-hidden="true"></i>${esc(recordSoftwareLabel(r))}</span>`:''}
    </div>`:''}
    ${r.desc?`<div class="desc">${esc(r.desc)}</div>`:''}
    ${imagesDisplayHtml(r.images)}
    ${filesDisplayHtml(r.files)}
    <div class="rd-sec"><i class="ti ti-history" aria-hidden="true"></i> Version history</div>
    ${versionTimelineHtml(r)}
    <div class="rd-actions">
      <button type="button" class="btn" data-act="edit"><i class="ti ti-edit" aria-hidden="true"></i> Edit</button>
      <button type="button" class="btn" data-act="dup"><i class="ti ti-copy" aria-hidden="true"></i> Duplicate</button>
      <button type="button" class="btn" data-act="status"><i class="ti ti-${st==='closed'?'lock-open':'lock'}" aria-hidden="true"></i> ${st==='closed'?'Reopen':'Close'}</button>
      ${canDelete(r)?'<button type="button" class="btn btn-danger-text" data-act="del"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button>':''}
    </div>
  </div>`;
  document.body.appendChild(ov);
  const close=()=>{ ov.classList.remove('show'); setTimeout(()=>ov.remove(),200); document.removeEventListener('keydown',onKey); };
  function onKey(e){ if(e.key==='Escape') close(); }
  ov.addEventListener('click',e=>{ if(e.target===ov) close(); });
  ov.querySelector('.rd-close').onclick=close;
  ov.querySelector('[data-act=edit]').onclick=()=>{ close(); editRecord(id); };
  ov.querySelector('[data-act=dup]').onclick=()=>{ close(); duplicateRecord(id); };
  ov.querySelector('[data-act=status]').onclick=()=>{ close(); cycleStatus(id); };
  const delBtn=ov.querySelector('[data-act=del]');   // absent for everyone but an admin
  if(delBtn) delBtn.onclick=()=>{ close(); delRecord(id); };
  document.addEventListener('keydown',onKey);
  requestAnimationFrame(()=>ov.classList.add('show'));
}



// Show the "what changed" note only when saving as a new version
function onSaveModeChange(){
  const mode=(document.querySelector('input[name="save-mode"]:checked')||{}).value||'update';
  const w=document.getElementById('ver-note-wrap');
  if(w) w.style.display=(mode==='version')?'block':'none';
  const btn=document.getElementById('form-submit');
  if(btn) btn.textContent=(mode==='version')?'Save as new version':'Save changes';
  if(mode==='version'){ const n=document.getElementById('f-vernote'); if(n) n.focus(); }
}




// userChanged=true 代表是使用者自己動了平台/分類（而非 renderForm 初始化），
// 這時才把不屬於新平台/分類的舊勾選清掉
function onPlatChange(userChanged){
  const plat=document.getElementById('f-plat')?.value||'Teams';
  const catSel=document.getElementById('f-cat');
  const catLblEl=document.getElementById('f-cat-lbl');
  const noCat=!PLATFORMS[plat]?.categories?.length;
  if(catLblEl) catLblEl.textContent=noCat?'Platform Category':'Platform Category *';
  if(catSel){
    catSel.innerHTML=catOptsHtml(plat,'','');
    catSel.disabled=noCat;
  }
  onCatChange(userChanged);
}



function onCatChange(userChanged){
  const plat=document.getElementById('f-plat')?.value||'Teams';
  const cat=document.getElementById('f-cat')?.value||'';
  const typeSel=document.getElementById('f-type');
  if(typeSel){
    const cur=typeSel.value;
    const types=getTypesForPlat(plat,cat);
    typeSel.innerHTML=types.map(t=>`<option value="${t.v}"${t.v===cur?' selected':''}>${t.lbl}</option>`).join('');
    if(!types.find(t=>t.v===cur)) typeSel.value=types[0].v;
  }
  const wrap=document.getElementById('f-subcat-wrap');
  const sel=document.getElementById('f-subcat');
  const c=PLATFORMS[plat]?.categories?.find(x=>x.v===cat);
  const show=!!c?.children?.length;
  if(wrap) wrap.style.display=show?'block':'none';
  if(sel){
    if(show) sel.innerHTML='<option value="">— Select subcategory —</option>'+subcatOptsHtml(plat,cat,'');
    else sel.value='';
  }
  refreshSampleChecks(userChanged);
}




function renderForm(r){
  const plat=r.platform||'Teams';
  // Sample Type 由 平台+分類 決定；沒有可選項時整段不顯示
  const formCat=r.category||catDef(plat);
  const selSamples=recordSampleValues(r);
  const showSample=(r.type||'')==='note'&&sampleTypesFor(plat,formCat,selSamples).length>0;
  const platOpts=PLAT_NAMES.map(p=>`<option value="${p}" ${plat===p?'selected':''}>${PLATFORMS[p].label}</option>`).join('');
  const statOpts=STATUSES.map(s=>`<option value="${s.v}" ${(r.status||'in-progress')===s.v?'selected':''}>${s.lbl}</option>`).join('');

  document.getElementById('form-area').innerHTML=`
    <div class="form-panel">
      <div class="fp-title"><i class="ti ti-edit-box" style="color:#3b82f6" aria-hidden="true"></i> ${editId?'Edit Record':'New Record'}</div>

      <div class="fg2">
        <div>
          <label for="f-plat">Test Platform *</label>
          <select id="f-plat" onchange="onPlatChange(true)">${platOpts}</select>
        </div>
        <div class="cat-group">
          <div>
            <label for="f-cat" id="f-cat-lbl">Platform Category *</label>
            <select id="f-cat" onchange="onCatChange(true)">${catOptsHtml(plat,r.category||'',r.subCategory||'')}</select>
          </div>
          <div id="f-subcat-wrap" class="subcat-nested" style="display:none">
            <label for="f-subcat">Function Subcategory *</label>
            <select id="f-subcat">${subcatOptsHtml(plat,r.category||'',r.subCategory||'')}</select>
          </div>
        </div>
        <div>
          <label for="f-type">Record Type *</label>
          <select id="f-type" onchange="onTypeChange()">
            <option value="" ${!r.type?'selected':''} disabled>— Select record type —</option>
            ${getTypesForPlat(r.platform||'',r.category||'').map(t=>`<option value="${t.v}" ${(r.type||'')===t.v?'selected':''}>${t.lbl}</option>`).join('')}
          </select>
        </div>
        <div id="f-subtype-wrap" style="display:${(r.type||'')==='update'?'block':'none'}">
          <label for="f-subtype">Update Type *</label>
          <select id="f-subtype" onchange="onSubtypeChange()">
            <option value="" ${!(r.updateSubtype)?'selected':''} disabled>— Select update type —</option>
            <option value="spec" ${'spec'===(r.updateSubtype||'')?'selected':''}>Spec</option>
            <option value="sequence" ${'sequence'===(r.updateSubtype||'')?'selected':''}>Sequence</option>
            <option value="firmware" ${'firmware'===(r.updateSubtype||'')?'selected':''}>Firmware</option>
            <option value="test-tool" ${'test-tool'===(r.updateSubtype||'')?'selected':''}>Test Tool</option>
          </select>
        </div>
        <div id="f-software-wrap" style="display:${((r.type||'')==='update'&&(r.updateSubtype||'')==='firmware')?'block':'none'}">
          <label for="f-software">Test Software <a href="#" onclick="manageTestSoftware();return false;" style="font-weight:400;font-size:12px;color:#8b5cf6;margin-left:6px">⚙ manage</a></label>
          <select id="f-software" onchange="onSoftwareChange()">${softwareOpts(r.testSoftware||'')}</select>
        </div>
        <div id="f-software-other-wrap" style="display:${(r.testSoftware==='__other__')?'block':'none'}">
          <label for="f-software-other">Software name</label>
          <input type="text" id="f-software-other" placeholder="Enter software name" value="${esc(r.testSoftwareOther||'')}">
        </div>
        <div id="f-sample-wrap" style="display:${showSample?'block':'none'}">
          <label>Sample Type <span style="color:var(--text-secondary);font-weight:400">(select one or more)</span></label>
          <div class="sample-checks">${noteSampleChecks(selSamples,plat,formCat)}</div>
        </div>

        <div class="ff">
          <label for="f-title">Title *</label>
          <input type="text" id="f-title" placeholder="Enter a short summary..." value="${r.title||''}">
        </div>
      </div>


      <div class="fg2">
        <div class="ff">
          <label for="f-desc">Details / Issue / Steps to Reproduce</label>
          <textarea id="f-desc" placeholder="Describe test method, commands, or log observations...">${r.desc||''}</textarea>
        </div>
      </div>

      <div class="sec-div"><hr><span>Version · Assignee · Schedule</span><hr></div>

      <div class="fg3">
        <div>
          ${identityFieldHtml('f-who','Assignee',r.assignee)}
        </div>
        <div id="fw-wrap">
          <label for="f-fw">FW Version</label>
          <input type="text" id="f-fw" placeholder="e.g. v1.5.2" value="${r.fwVersion||''}">
        </div>
        <div>
          <label for="f-stat">Status</label>
          <select id="f-stat">${statOpts}</select>
        </div>

      </div>


      <div class="sec-div"><hr><span>Screenshots</span><hr></div>
      <div id="img-uploader"></div>

      <div class="sec-div"><hr><span>Attachments</span><hr></div>
      <div id="file-uploader"></div>

      ${editId?`<div class="save-mode">
        <div class="sm-lbl">Save as</div>
        <label class="sm-opt"><input type="radio" name="save-mode" value="update" checked onchange="onSaveModeChange()">
          <span><span class="sm-n">Update this record</span><span class="sm-d">Overwrite it — no history kept (typo fixes, small corrections)</span></span></label>
        <label class="sm-opt"><input type="radio" name="save-mode" value="version" onchange="onSaveModeChange()">
          <span><span class="sm-n">Save as new version</span><span class="sm-d">Bump to v${recordVersionNo(records.find(x=>x.id===editId)||{})+1} and log what changed</span></span></label>
        <div id="ver-note-wrap" style="display:none">
          <label for="f-vernote">What changed? *</label>
          <input type="text" id="f-vernote" placeholder="e.g. 補上判讀標準、修正 step 3 的量測距離">
        </div>
      </div>`:''}

      <div class="form-actions">
        <button class="btn" onclick="cancelForm()">Cancel</button>
        <button class="btn primary" id="form-submit" onclick="submitForm()">${editId?'Save changes':'Add Record'}</button>
      </div>
    </div>`;
  ensureAllowedUsers();
  onPlatChange();
  if(r.category){
    const catSel=document.getElementById('f-cat');
    if(catSel){
      // 舊記錄用的分類若已從清單移除（如 Zoom 的 Zoom meeting），補回一個選項，
      // 否則編輯存檔後該筆的分類會被清空
      if(!Array.from(catSel.options).some(o=>o.value===r.category)){
        const o=document.createElement('option');
        o.value=r.category; o.textContent=r.category+'（舊分類）';
        catSel.appendChild(o);
      }
      catSel.value=r.category;
    }
  }
  onCatChange();
  if(r.subCategory){
    const subSel=document.getElementById('f-subcat');
    if(subSel) subSel.value=r.subCategory;
  }
  onTypeChange();
  initImageUploader(r.images);
  initFileUploader(r.files);
}




function onTypeChange(){
  const t=(document.getElementById('f-type')||{}).value;
  const fw=document.getElementById('fw-wrap');
  if(fw) fw.style.display=(t==='issue'||t==='acqua-fw')?'block':'none';
  const sw=document.getElementById('f-subtype-wrap');
  if(sw) sw.style.display=(t==='update')?'block':'none';
  refreshSampleChecks();
  onSubtypeChange();
}



function onSubtypeChange(){
  const t=(document.getElementById('f-type')||{}).value;
  const st=(document.getElementById('f-subtype')||{}).value;
  const sw=document.getElementById('f-software-wrap');
  const show=(t==='update'&&st==='firmware');
  if(sw) sw.style.display=show?'block':'none';
  if(!show){ const ow=document.getElementById('f-software-other-wrap'); if(ow) ow.style.display='none'; }
  else onSoftwareChange();
}



function onSoftwareChange(){
  const v=(document.getElementById('f-software')||{}).value;
  const ow=document.getElementById('f-software-other-wrap');
  if(ow) ow.style.display=(v==='__other__')?'block':'none';
}




async function submitForm(){
  const titleEl = document.getElementById('f-title');
  const title = titleEl ? titleEl.value : '';
  if(!title.trim()){toast('Please enter a title.','warn');return;}

  const plat = document.getElementById('f-plat').value;
  const category = (document.getElementById('f-cat')||{}).value||'';
  const subCategory = (document.getElementById('f-subcat')||{}).value||'';
  const cfg = PLATFORMS[plat];
  if(cfg?.categories?.length && !category){toast('Please select a platform category.','warn');return;}
  const catObj = cfg?.categories?.find(c=>c.v===category);
  if(catObj?.children?.length && !subCategory){toast('Please select a Function subcategory.','warn');return;}
  const now = todayISO();
  const type=document.getElementById('f-type').value;

  const recId = editId || genId(plat);
  const existing = editId ? records.find(x=>x.id===editId) : null;
  const saveMode = editId ? ((document.querySelector('input[name="save-mode"]:checked')||{}).value||'update') : 'new';
  let verNote='';
  if(saveMode==='version'){
    verNote=((document.getElementById('f-vernote')||{}).value||'').trim();
    if(!verNote){ toast('Please describe what changed in this version.','warn'); const n=document.getElementById('f-vernote'); if(n) n.focus(); return; }
  }
  let images, files;
  try{ images = await commitImages('records/'+recId); files = await commitFiles('records/'+recId); }
  catch(e){ toast(e.message||e,'error',5000); return; }

  const obj={
    platform:plat,
    category:category||'',
    subCategory:subCategory||'',
    type,
    updateSubtype:(document.getElementById('f-subtype')||{}).value||'',
    sampleTypes:type==='note'?Array.from(document.querySelectorAll('.f-sample-cb:checked')).map(c=>c.value):[],
    sampleType:'',
    testSoftware:(type==='update'&&(document.getElementById('f-subtype')||{}).value==='firmware')?((document.getElementById('f-software')||{}).value||''):'',
    testSoftwareOther:(type==='update'&&(document.getElementById('f-subtype')||{}).value==='firmware'&&(document.getElementById('f-software')||{}).value==='__other__')?(((document.getElementById('f-software-other')||{}).value||'').trim()):'',
    title:title.trim(),
    desc:document.getElementById('f-desc').value,
    assignee:readIdentity('f-who',(existing&&existing.assignee)||getCurrentUser()),
    fwVersion:(document.getElementById('f-fw')||{}).value||'',
    status:document.getElementById('f-stat').value,
    images,
    files,
    updated:now
  };

  const isNew=!editId;
  const savedVersion=(saveMode==='version')&&existing;
  let newVerNo=0;
  if(savedVersion){
    // Changelog entry: what changed in the version this save creates
    newVerNo=recordVersionNo(existing)+1;
    obj.versions=[...(existing.versions||[]),{v:newVerNo,note:verNote,at:now,by:getCurrentUser()}];
  }
  let target;
  if(editId){
    const i=records.findIndex(x=>x.id===editId);
    if(i>-1){
      records[i]={...records[i],...obj};
      applyStatusOnRecord(records[i], obj.status);
      target=records[i];
    }
  } else {
    const nr={...obj,id:recId,created:now,createdTs:new Date().toISOString(),createdBy:getCurrentEmail()};
    applyStatusOnRecord(nr, nr.status);
    records.push(nr);
    target=nr;
  }

  if(target) await afterMutation(()=>saveRecordRow(target,isNew),{k:'saveRecord',data:target});
  editId=null;
  document.getElementById('form-area').innerHTML='';
  render();
  toast(savedVersion?('Saved as v'+newVerNo):(isNew?'Record added':'Record updated'),'success');
}




function cancelForm(){document.getElementById('form-area').innerHTML='';editId=null;}




async function cycleStatus(id){
  const r=records.find(x=>x.id===id);
  if(!r) return;
  const st=recordStatus(r);
  applyStatusOnRecord(r, STATUS_NEXT[st]||'in-progress');
  await afterMutation(()=>saveRecordRow(r,false),{k:'saveRecord',data:r}); render();
}



async function delRecord(id){
  if(!requireDelete(records.find(r=>r.id===id),'record')) return;
  if(!(await confirmModal('This record and its screenshots will be permanently deleted.',{title:'Delete record?',okText:'Delete',danger:true}))) return;
  const rec=records.find(r=>r.id===id);
  setRecords(records.filter(r=>r.id!==id));
  selectedIds.delete(id);
  await afterMutation(async()=>{ await removeRecordRow(id); await deleteStoredImages(recordAssets(rec)); },{k:'removeRecord',id});
  render();
  toast('Record deleted','success');
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  _searchTimer, batchClose, batchDelete, cancelForm, clearArchivedRecords, clearSelection,
  closedPool, cycleStatus, delRecord, duplicateRecord, editId, editRecord, exitSelectionMode,
  filtered, filteredArchived, filteredClosed, genId, manageTestSoftware,
  markClampedDescriptions, onCatChange, onPlatChange, onSaveModeChange, onSearchInput,
  onSoftwareChange, onStatCardClick, onSubtypeChange, onTypeChange, openRecordDetail, render,
  renderArchivedSection, renderBatchBar, renderClosedArchive, renderDashboard, renderForm,
  renderList, selectedIds, showForm, skeletonCards, submitForm, switchP, toggleSelect,
  toggleSelectionMode
};
