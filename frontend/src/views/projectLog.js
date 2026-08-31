import { animateCertGauges, certGaugeHtml, certItemChecksHtml, certListHtml, onCertItemChange, readCertItemsFromForm } from '../components/certGauge.js';
import { requireAdmin, requireDelete } from '../components/guards.js';
import { buildProductTypeExtra, collectProductTypeFields, onProductTypeChange, platformExtraHtml, productTypeOpts, renderPlatformExtra } from '../components/productFields.js';
import { confirmModal, toast } from '../components/ui.js';
import { filesDisplayHtml, imagesDisplayHtml, initFileUploader, initImageUploader } from '../components/uploaders.js';
import { ARCHIVE_AFTER_DAYS, isProjectArchived } from '../domain/archive.js';
import { CERT_PHASES, CERT_PLATFORMS, PHASES, PHASE_MAP, certItemLabel, certItemsFor, certPlatLabel, hasProgressBar, latestFw, logCertItems, projOS, projPlatform, qualSampleClash, sortedLogs } from '../domain/certification.js';
import { canDelete } from '../domain/permissions.js';
import { PLAT_COLOR } from '../domain/platforms.js';
import { productTypeSummary, usesProductType } from '../domain/products.js';
import { recordAssets, stripLogs } from '../domain/records.js';
import { exportArchivedProjects, exportArchivedProjectsPDF } from '../export/reports.js';
import { getCurrentEmail, getCurrentUser } from '../services/auth.js';
import { afterMutation, removeLogRow, removeProjectRow, saveLogRow, saveProjectRow } from '../services/db.js';
import { commitFiles, commitImages, deleteStoredImages } from '../services/storage.js';
import { curProjectId, myApproval, projects, setCurProjectId, setProjects } from '../state.js';
import { fmtDateShort, isoMonthsAhead, todayISO } from '../utils/dates.js';
import { esc, fmtUser } from '../utils/format.js';
import { ensureAllowedUsers, identityFieldHtml, readIdentity } from './login.js';

let editProjId=null, editLogId=null;



async function clearArchivedProjects(){
  if(!requireAdmin()) return;
  const d=archivedProjects();
  if(!d.length){ toast('Nothing archived to clear.','warn'); return; }
  const logs=d.reduce((n,p)=>n+(p.logs||[]).length,0);
  const imgs=d.flatMap(p=>(p.logs||[]).flatMap(l=>recordAssets(l)));
  if(!(await confirmModal(
      `${d.length} archived project(s), ${logs} log(s) and ${imgs.length} attachment(s) will be permanently deleted from the database and from storage. `
      +`Export them first if you have not — this cannot be undone.`,
      {title:'Clear archived projects?',okText:'Delete permanently',danger:true}))) return;
  const ids=new Set(d.map(p=>p.id));
  setProjects(projects.filter(p=>!ids.has(p.id)));
  await afterMutation(async()=>{
    for(const id of ids) await removeProjectRow(id);
    await deleteStoredImages(imgs);
  });
  renderProjectView();
  toast(`${ids.size} archived project(s) deleted`,'success');
}



let _projSearchTimer=null;



function onProjSearchInput(){ clearTimeout(_projSearchTimer); _projSearchTimer=setTimeout(renderProjectListContent,250); }




function genProjectId(){
  const n=projects.length+1;
  return 'PRJ-'+String(n).padStart(3,'0');
}



function genLogId(proj){
  const n=(proj.logs||[]).length+1;
  return 'LOG-'+String(n).padStart(3,'0');
}



function getProject(id){return projects.find(p=>p.id===id);}



function renderProjectView(){
  if(curProjectId) renderProjectDetail();
  else renderProjectList();
  checkProjectDeleteReminders();
}




function setProjToolbar(mode){
  const list=document.getElementById('proj-tb-list');
  const detail=document.getElementById('proj-tb-detail');
  if(list) list.hidden=(mode!=='list');
  if(detail) detail.hidden=(mode!=='detail');
}



function onProjSearch(){renderProjectListContent();}



function closeProjectFromCard(id){
  const p=getProject(id);
  if(!p) return;
  showProjectCloseModal(p);
}



async function reopenProject(id){
  const p=getProject(id);
  if(!p) return;
  p.status='active';
  delete p.closedAt;
  delete p.deleteAfter;
  await afterMutation(()=>saveProjectRow(p,false),{k:'saveProject',data:stripLogs(p)});
  if(curProjectId===id) renderProjectDetail(); else renderProjectListContent();
}



function showProjectCloseModal(p){
  const modal=document.createElement('div');
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML=`<div style="background:var(--bg-panel);border:1px solid var(--border-color);border-radius:12px;padding:28px 32px;max-width:440px;width:90%;color:var(--text-primary);">
    <div style="font-size:18px;font-weight:600;margin-bottom:6px;color:#f87171;">🔒 Close Project</div>
    <div style="color:var(--text-secondary);font-size:14px;margin-bottom:20px;">Close <strong style="color:var(--text-primary)">${esc(p.name)}</strong>? Select when to be reminded about deletion:</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
      ${[1,3,6,12,24].map(m=>`<button class="pco-btn" data-months="${m}" style="padding:10px 16px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);cursor:pointer;font-size:14px;text-align:left;">${m<12?m+' -month reminder':(m/12)+' -year reminder'}</button>`).join('')}
      <button class="pco-btn" data-months="0" style="padding:10px 16px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-secondary);cursor:pointer;font-size:14px;text-align:left;">No reminder — keep permanently</button>
    </div>
    <div style="display:flex;justify-content:flex-end;">
      <button id="pco-cancel" style="padding:8px 18px;border-radius:6px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);cursor:pointer;font-size:14px;">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#pco-cancel').onclick=()=>document.body.removeChild(modal);
  modal.querySelectorAll('.pco-btn').forEach(btn=>{
    btn.onmouseenter=()=>btn.style.borderColor='#f87171';
    btn.onmouseleave=()=>btn.style.borderColor='var(--border-color)';
    btn.onclick=()=>{
      const months=parseInt(btn.dataset.months);
      p.status='closed';
      p.closedAt=todayISO();
      if(months>0) p.deleteAfter=isoMonthsAhead(months);
      else delete p.deleteAfter;
      document.body.removeChild(modal);
      afterMutation(()=>saveProjectRow(p,false),{k:'saveProject',data:stripLogs(p)}).then(()=>renderProjectListContent());
    };
  });
}



function checkProjectDeleteReminders(){
  // Only the admin can act on this, and the dialog offers Delete All - putting it
  // in front of fourteen other people is how history gets lost by accident
  if(!myApproval.isAdmin) return;
  const today=todayISO();
  const due=projects.filter(p=>p.status==='closed'&&p.deleteAfter&&p.deleteAfter<=today);
  if(!due.length||window._projReminderShown) return;
  window._projReminderShown=true;
  const modal=document.createElement('div');
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
  const listHtml=due.map(p=>`<li style="background:var(--bg-input);border-radius:6px;padding:8px 12px;font-size:13px;display:flex;justify-content:space-between;"><span>${esc(p.name)}</span><span style="color:var(--text-secondary);font-size:12px;">Closed ${esc(p.closedAt)}</span></li>`).join('');
  modal.innerHTML=`<div style="background:var(--bg-panel);border:1px solid var(--border-color);border-radius:12px;padding:28px 32px;max-width:480px;width:90%;color:var(--text-primary);">
    <div style="font-size:18px;font-weight:600;margin-bottom:8px;">📋 Project Deletion Reminder</div>
    <div style="color:var(--text-secondary);font-size:14px;margin-bottom:16px;">The following <strong style="color:var(--text-primary)">${due.length}</strong> closed project(s) have reached their scheduled reminder date. Delete?</div>
    <ul style="max-height:160px;overflow-y:auto;margin-bottom:20px;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;">${listHtml}</ul>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
      <button id="pdr-keep" style="padding:8px 18px;border-radius:6px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);cursor:pointer;font-size:14px;">Keep All</button>
      <button id="pdr-extend" style="padding:8px 18px;border-radius:6px;border:1px solid #3b82f6;background:transparent;color:#60a5fa;cursor:pointer;font-size:14px;">Postpone 6 Months</button>
      <button id="pdr-delete" style="padding:8px 18px;border-radius:6px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-size:14px;">Delete All</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#pdr-keep').onclick=async()=>{due.forEach(p=>{delete p.deleteAfter;});document.body.removeChild(modal);await afterMutation(async()=>{for(const p of due) await saveProjectRow(p,false);});};
  modal.querySelector('#pdr-extend').onclick=async()=>{due.forEach(p=>{p.deleteAfter=isoMonthsAhead(6);});document.body.removeChild(modal);await afterMutation(async()=>{for(const p of due) await saveProjectRow(p,false);});renderProjectListContent();};
  modal.querySelector('#pdr-delete').onclick=async()=>{const ids=new Set(due.map(p=>p.id));const imgs=due.flatMap(p=>(p.logs||[]).flatMap(l=>recordAssets(l)));setProjects(projects.filter(p=>!ids.has(p.id)));document.body.removeChild(modal);await afterMutation(async()=>{for(const id of ids) await removeProjectRow(id); await deleteStoredImages(imgs);});renderProjectView();};
}



function backToProjectList(){
  setCurProjectId(null);
  document.getElementById('proj-form-area').innerHTML='';
  setProjToolbar('list');
  renderProjectListContent();
}
// 攔截瀏覽器返回手勢（Android 右滑 / 返回鍵）
window.addEventListener('popstate',function(e){
  if(curProjectId){
    // 使用者按返回/右滑：回到列表
    backToProjectList();
    // 推回一個 list 根紀錄，確保下次仍可攔截，不會直接關頁面
    history.replaceState({aclab:'list'},'');
    history.pushState({aclab:'list-guard'},'');
  }
});



function renderProjectList(){
  setCurProjectId(null);
  setProjToolbar('list');
  renderProjPlatRow();
  renderProjectListContent();
}



/* Coloured toggles rather than a dropdown: there are only four platforms, each
   already has a colour elsewhere in the app, and a filter you can see the state
   of beats one you have to open. */
let projPlatFilter='';



function setProjPlatFilter(k){
  // Not a toggle: "All" is already the way to clear, so clicking the active pill
  // again bouncing back to All was a second, unsignposted way to do the same thing
  projPlatFilter=k;
  renderProjPlatRow();
  renderProjectListContent();
}



function renderProjPlatRow(){
  const row=document.getElementById('pq-plat-row');
  if(!row) return;
  const counts={};
  projects.forEach(p=>{ const k=projPlatform(p); counts[k]=(counts[k]||0)+1; });
  row.innerHTML=`<button type="button" class="plat-pill neutral${projPlatFilter===''?' on':''}"
      onclick="setProjPlatFilter('')">All <span class="pill-n">${projects.length}</span></button>`
    +CERT_PLATFORMS.map(k=>`<button type="button" class="plat-pill b-${PLAT_COLOR[k]||'cat'}${projPlatFilter===k?' on':''}"
        onclick="setProjPlatFilter('${k}')">${esc(certPlatLabel(k))} <span class="pill-n">${counts[k]||0}</span></button>`).join('');
}



/* The list, the two export buttons and the clear button all read this, so what a
   button acts on is always what is on screen above it. */
function projectPool(){
  const q=(document.getElementById('pq-s')||{}).value||'';
  let list=[...projects];
  if(q) list=list.filter(p=>{
    const blob=[p.name,p.customer,productTypeSummary(p)].join(' ').toLowerCase();
    return blob.includes(q.toLowerCase());
  });
  if(projPlatFilter) list=list.filter(p=>projPlatform(p)===projPlatFilter);
  return list;
}



function archivedProjects(){ return projectPool().filter(isProjectArchived); }



function renderProjectListContent(){
  const q=(document.getElementById('pq-s')||{}).value||'';
  const fPlat=projPlatFilter;
  let list=projectPool();
  list.sort((a,b)=>new Date((sortedLogs(b.logs)[0]||{}).date||b.created)-new Date((sortedLogs(a.logs)[0]||{}).date||a.created));

  // Same rule as records: closed long enough drops out of the list for everyone,
  // and an admin gets it back in its own section rather than mixed into the rest
  const archivedList=list.filter(isProjectArchived);
  list=list.filter(p=>!isProjectArchived(p));
  const showArchived=myApproval.isAdmin&&archivedList.length>0;

  const el=document.getElementById('proj-content');
  if(!list.length&&!showArchived){
    const filtering=q||fPlat;
    el.innerHTML='<div class="empty"><i class="ti ti-briefcase-off" style="font-size:26px;display:block;margin:0 auto 8px;color:#6b7280" aria-hidden="true"></i>'
      +(filtering?'No project matches these filters.':'No projects yet. Create your first project (e.g. WL327).')+'</div>';
    return;
  }
  const projCardHtml=p=>{
    const logs=sortedLogs(p.logs);
    const last=logs[0];
    const fw=latestFw(p);
    const isClosed=p.status==='closed';
    const closedBadge=isClosed?`<span class="badge" style="background:rgba(239,68,68,0.15);color:#f87171">Closed</span>`:'';
    return`<div class="record proj-card${isClosed?' proj-closed':''}" onclick="openProject('${p.id}')">
      <div class="proj-row">
        ${certGaugeHtml(p,74)}
        <div class="proj-col">
          <div class="rec-top" style="margin-bottom:6px">
            <div class="proj-titlewrap">
              <div class="rec-title">${esc(p.name)}</div>
              ${p.customer?`<span class="cust-tag" title="${esc(p.customer)}"><i class="ti ti-building" aria-hidden="true"></i>${esc(p.customer)}</span>`:''}
            </div>
            <span class="rec-status rec-status-group">${closedBadge}<span class="badge b-cat">${logs.length}  log(s)</span></span>
          </div>
          ${productTypeSummary(p)?`<div class="proj-hint">${esc(productTypeSummary(p))}</div>`:''}
          <div class="proj-hint">
            ${last?`Latest ${fmtDateShort(last.date)} · ${PHASE_MAP[last.phase]?.lbl||last.phase}`:'No logs yet'}
            ${fw?` · FW ${esc(fw)}`:''}
            ${isClosed&&p.closedAt?` · <span style="color:#94a3b8">Closed ${esc(p.closedAt)}</span>`:''}
          </div>
        </div>
      </div>
      <div class="rec-hover-actions">
        <button class="iconbtn" onclick="event.stopPropagation();showProjectForm('${p.id}')" title="Edit" aria-label="Edit"><i class="ti ti-edit" aria-hidden="true"></i></button>
        ${isClosed
          ?`<button class="iconbtn" onclick="event.stopPropagation();reopenProject('${p.id}')" title="Reopen" aria-label="Reopen"><i class="ti ti-lock-open" aria-hidden="true"></i></button>`
          :`<button class="iconbtn" onclick="event.stopPropagation();closeProjectFromCard('${p.id}')" title="Close project" aria-label="Close project"><i class="ti ti-lock" aria-hidden="true"></i></button>`
        }
        ${canDelete(p)?`<button class="iconbtn dgr" onclick="event.stopPropagation();delProject('${p.id}')" title="Delete" aria-label="Delete"><i class="ti ti-trash" aria-hidden="true"></i></button>`:''}
      </div>
    </div>`;
  };
  el.innerHTML=(list.length
      ?list.map(projCardHtml).join('')
      :'<div class="empty">Every project matching these filters is archived.</div>')
    +(showArchived?`<div class="archive-section">
      <div class="sec-div"><hr><span>Archived</span><hr></div>
      <div class="archive-hint-row">
        <span class="archive-hint">${archivedList.length} project(s) closed over ${ARCHIVE_AFTER_DAYS} days ago · admin only · nothing here is deleted automatically</span>
        <button type="button" class="btn" onclick="event.stopPropagation();exportArchivedProjectsPDF()"><i class="ti ti-file-type-pdf" aria-hidden="true"></i> PDF</button>
        <button type="button" class="btn" onclick="event.stopPropagation();exportArchivedProjects()"><i class="ti ti-file-code" aria-hidden="true"></i> JSON</button>
        <button type="button" class="btn btn-danger-text" onclick="event.stopPropagation();clearArchivedProjects()"><i class="ti ti-trash" aria-hidden="true"></i> Clear</button>
      </div>
      ${archivedList.map(projCardHtml).join('')}
    </div>`:'');
  animateCertGauges(el);
}



function openProject(id){
  setCurProjectId(id);
  document.getElementById('proj-form-area').innerHTML='';
  // 推假歷史，讓 Android/iOS 的返回手勢觸發 popstate 而非關閉頁面
  history.pushState({aclab:'project',id:id},'',' ');
  renderProjectDetail();
}




function renderProjectDetail(){
  const p=getProject(curProjectId);
  if(!p){setCurProjectId(null);renderProjectList();return;}
  const logs=sortedLogs(p.logs);
  setProjToolbar('detail');

  // FW History：只顯示上一版 → 目前最新版
  // logs run newest first, so reverse for a history that reads forwards. Showing
  // only the last two under the word "History" made a partial list look complete.
  const fwVersions=[...new Set(logs.filter(l=>l.fwVersion).map(l=>l.fwVersion))].reverse();
  const fwHistory=fwVersions.join(' → ');
  const fwLabel=fwVersions.length>1?'FW History':'FW';

  let timeline='';
  if(!logs.length){
    timeline='<div class="empty" style="margin-top:12px">No logs yet. Click \'New Daily Log\' to record today\'s debug / test notes and FW version.</div>';
  }else{
    timeline='<div class="timeline">'+logs.map(l=>{
      const ph=PHASE_MAP[l.phase]||PHASES[0];
      // No platform badge: a log's platform is copied from the project, so it can
      // only ever repeat what the header already says.
      // Show what the log counted towards, so the progress bar is never a black box
      const mark=l.waived?' ✓':l.result==='pass'?' ✓':l.result==='fail'?' ✕':'';
      const item=logCertItems(l).map(v=>
        `<span class="badge b-cat">${esc(certItemLabel(p,v))}${mark}</span>`).join('');
      return`<div class="log-entry">
        <div class="log-head">
          <span class="log-date">${fmtDateShort(l.date)}</span>
          <span class="badge ${ph.cls}">${ph.lbl}</span>
          ${item}
          ${l.waived?`<span class="badge b-waived" title="Failed, waived by the customer">Waived</span>`:''}
        </div>
        <div class="meta-row" style="border:none;padding-top:0">
          ${l.fwVersion?`<span class="meta"><i class="ti ti-cpu" aria-hidden="true"></i>FW ${esc(l.fwVersion)}</span>`:''}
          ${l.sampleNo?`<span class="meta"><i class="ti ti-device-desktop" aria-hidden="true"></i>${esc(l.sampleNo)}</span>`:''}
          ${l.lab?`<span class="meta"><i class="ti ti-building-community" aria-hidden="true"></i>${esc(l.lab)}</span>`:''}
          ${l.reporter?`<span class="meta"><i class="ti ti-user" aria-hidden="true"></i>${esc(fmtUser(l.reporter))}</span>`:''}
          ${(l.updatedBy&&l.updatedBy!==l.reporter)?`<span class="meta" title="Last edited by"><i class="ti ti-pencil" aria-hidden="true"></i>${esc(fmtUser(l.updatedBy))}</span>`:''}
        </div>
        ${l.summary?`<div class="log-summary">${esc(l.summary)}</div>`:''}
        ${imagesDisplayHtml(l.images,true)}
        ${filesDisplayHtml(l.files)}
        <div class="rec-hover-actions">
          ${(l.result==='fail'&&CERT_PHASES.includes(l.phase))?`<button class="iconbtn${l.waived?' on':''}" onclick="event.stopPropagation();toggleWaive('${l.id}')"
            title="${l.waived?'Remove waiver':'Waive this failure'}" aria-label="Waive"><i class="ti ti-shield-check" aria-hidden="true"></i></button>`:''}
          <button class="iconbtn" onclick="event.stopPropagation();showLogForm('${l.id}')" title="Edit" aria-label="Edit"><i class="ti ti-edit" aria-hidden="true"></i></button>
          <button class="iconbtn dgr" onclick="event.stopPropagation();delLog('${l.id}')" title="Delete" aria-label="Delete"><i class="ti ti-trash" aria-hidden="true"></i></button>
        </div>
      </div>`;
    }).join('')+'</div>';
  }

  document.getElementById('proj-content').innerHTML=`
    <button type="button" class="btn primary proj-act" style="margin-bottom:14px" onclick="showLogForm()">
      <i class="ti ti-calendar-plus" aria-hidden="true"></i> New Daily Log
    </button>
    <div class="detail-header">
      <div style="min-width:0">
        <div class="proj-titlewrap">
          <div class="detail-title">${esc(p.name)}</div>
          ${p.customer?`<span class="cust-tag" title="${esc(p.customer)}"><i class="ti ti-building" aria-hidden="true"></i>${esc(p.customer)}</span>`:''}
        </div>
        ${productTypeSummary(p)?`<div class="proj-hint" style="margin-top:6px">${esc(productTypeSummary(p))}</div>`:''}
        <div class="proj-hint">
          ${esc(certPlatLabel(projPlatform(p)))}${projOS(p)?' · '+esc(projOS(p)):''} ·
          Created ${esc(p.created)}
        </div>
        ${fwHistory?`<div class="fw-timeline"><i class="ti ti-history" aria-hidden="true"></i> ${fwLabel}: ${esc(fwHistory)}</div>`:''}
        ${p.notes?`<div class="desc" style="margin-top:6px;font-size:13px;color:var(--text-secondary)">${esc(p.notes)}</div>`:''}
      </div>
    </div>
    ${(()=>{const c=qualSampleClash(p);return c?`<div class="sample-warn">
      <i class="ti ti-alert-triangle" aria-hidden="true"></i>
      Qualification logs use more than one PAL ID: ${esc(c.join(', '))}
    </div>`:'';})()}
    ${hasProgressBar(p)?`<div style="display:flex;align-items:flex-start;gap:20px;margin:14px 0 4px;flex-wrap:wrap">
      ${certGaugeHtml(p,104,true)}
      <div style="flex:1;min-width:220px;max-width:820px">${certListHtml(p)}</div>
    </div>`:''}
    <div class="sec-div"><hr><span>Test Logs (Newest → Oldest)</span><hr></div>
    ${timeline}`;
  animateCertGauges(document.getElementById('proj-content'));
}




function showProjectForm(id){
  editProjId=id||null;
  const p=id?getProject(id):{};
  document.getElementById('proj-form-area').innerHTML=`
    <div class="form-panel">
      <div class="fp-title">${editProjId?'Edit Project':'New Project'}</div>
      <div class="fg2">
        <div class="ff">
          <label for="pf-name">Project Name / Code *</label>
          <input type="text" id="pf-name" placeholder="e.g. 123、PRJ-Teams-2026" value="${esc(p.name||'')}">
        </div>
        <div>
          <label for="pf-plat">Certification Platform *</label>
          <select id="pf-plat" onchange="onCertPlatformChange()">${
            CERT_PLATFORMS.map(k=>`<option value="${k}" ${projPlatform(p)===k?'selected':''}>${esc(certPlatLabel(k))}</option>`).join('')
          }</select>
        </div>
        <div class="ff" id="pf-type-wrap">
          <label for="pf-type">Product Type *</label>
          <select id="pf-type" onchange="onProductTypeChange()">${productTypeOpts(p.productType||'',projPlatform(p))}</select>
          <div id="pf-type-extra" class="type-extra" style="display:none">${buildProductTypeExtra(p)}</div>
        </div>
        <div class="ff" id="pf-plat-extra">${platformExtraHtml(projPlatform(p),p)}</div>
        <div>
          <label for="pf-cust">Customer (optional)</label>
          <input type="text" id="pf-cust" placeholder="Customer name" value="${esc(p.customer||'')}">
        </div>
        <div class="ff">
          <label for="pf-notes">Project Notes</label>
          <textarea id="pf-notes" placeholder="Certification goal, delivery schedule, etc...">${esc(p.notes||'')}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn" onclick="cancelProjForm()">Cancel</button>
        <button class="btn primary" onclick="submitProject()">${editProjId?'Save':'Create Project'}</button>
      </div>
    </div>`;
  onProductTypeChange();
  onCertPlatformChange();
  document.getElementById('proj-form-area').scrollIntoView({behavior:'smooth',block:'nearest'});
}



// Only Teams splits its checklist by OS, so the field is hidden for the others
// rather than sitting there collecting a value nothing reads.
function onCertPlatformChange(){
  const platform=(document.getElementById('pf-plat')||{}).value||'';
  const wrap=document.getElementById('pf-type-wrap');
  const sel=document.getElementById('pf-type');
  const uses=usesProductType(platform);
  if(wrap) wrap.style.display=uses?'':'none';
  renderPlatformExtra();
  if(!sel) return;
  // Rebuild for the new platform. A selection it does not offer simply goes; the
  // browser leaves the select on its first option, so the extra fields must be
  // redrawn too or they would keep describing the old choice.
  const cur=sel.value;
  sel.innerHTML=uses?productTypeOpts(cur,platform):'';
  if(sel.value!==cur) onProductTypeChange();
}



async function submitProject(){
  const name=(document.getElementById('pf-name')||{}).value||'';
  if(!name.trim()){toast('Please enter a project name.','warn');return;}
  const pt=collectProductTypeFields();
  if(!pt) return;
  const platform=(document.getElementById('pf-plat')||{}).value||'Teams';
  const obj={
    name:name.trim(),
    ...pt,                    // carries os / earpiece / hasControls / chrome fields
    dut:productTypeSummary({...pt,platform}),
    platform,
    customer:(document.getElementById('pf-cust')||{}).value||'',
    notes:(document.getElementById('pf-notes')||{}).value||'',
    updated:todayISO()
  };
  const isNew=!editProjId;
  let target;
  if(editProjId){
    const i=projects.findIndex(x=>x.id===editProjId);
    if(i>-1){ projects[i]={...projects[i],...obj}; target=projects[i]; }
  }else{
    const np={...obj,id:genProjectId(),created:todayISO(),createdBy:getCurrentEmail(),logs:[]};
    projects.push(np);
    target=np;
  }
  editProjId=null;
  document.getElementById('proj-form-area').innerHTML='';
  if(target) await afterMutation(()=>saveProjectRow(target,isNew),{k:'saveProject',data:stripLogs(target)});
  if(isNew&&target) setCurProjectId(target.id);
  renderProjectView();
  toast(isNew?'Project created':'Project updated','success');
}




function showLogForm(logId){
  editLogId=logId||null;
  const p=getProject(curProjectId);
  if(!p) return;
  const l=logId?(p.logs||[]).find(x=>x.id===logId):{};
  const phaseOpts=PHASES.map(ph=>`<option value="${ph.v}" ${(l.phase||'debug')===ph.v?'selected':''}>${ph.lbl}</option>`).join('');

  document.getElementById('proj-form-area').innerHTML=`
    <div class="form-panel">
      <div class="fp-title"><i class="ti ti-calendar-event" style="color:#3b82f6" aria-hidden="true"></i> ${editLogId?'Edit Log':'New Test Log'} — ${esc(p.name)}</div>
      <div class="fg3">
        <div>
          <label for="lf-date">Test Date *</label>
          <input type="date" id="lf-date" value="${l.date||todayISO()}">
        </div>
        <div>
          <label for="lf-phase">Test Phase *</label>
          <select id="lf-phase">${phaseOpts}</select>
        </div>
        <div>
          <label for="lf-lab">Lab *</label>
          <input type="text" id="lf-lab" placeholder="e.g. Taipei Lab A" value="${esc(l.lab||'')}">
        </div>
        <div>
          <label for="lf-fw">FW Version</label>
          <input type="text" id="lf-fw" placeholder="Leave blank if not known yet" value="${esc(l.fwVersion||'')}">
        </div>
        <div>
          <label for="lf-sample">PAL ID</label>
          <input type="text" id="lf-sample" value="${esc(l.sampleNo||'')}">
        </div>
        <div>
          <label>Test Platform</label>
          <div class="lf-fixed">${esc(certPlatLabel(projPlatform(p)))}${projOS(p)?' · '+esc(projOS(p)):''}</div>
        </div>
        <div>
          ${identityFieldHtml('lf-who','Reported By',l.reporter)}
        </div>
      </div>
      ${certItemChecksHtml(p,logCertItems(l))}
      <div id="lf-result-wrap" style="max-width:220px;margin-bottom:8px">
        <label for="lf-result">Result</label>
        <select id="lf-result">
          <option value="" ${!l.result?'selected':''}>— Not set —</option>
          <option value="pass" ${l.result==='pass'?'selected':''}>Pass</option>
          <option value="fail" ${l.result==='fail'?'selected':''}>Fail</option>
        </select>
      </div>
      ${productTypeSummary(p)?`<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px"><i class="ti ti-device-audio" aria-hidden="true"></i> Product type: ${esc(productTypeSummary(p))}</div>`:''}
      <div class="fg2">
        <div class="ff">
          <label for="lf-sum">Daily Work Summary *</label>
          <textarea id="lf-sum" placeholder="Summarize today's debug / test items, observations, pass/fail, changes from previous version...">${esc(l.summary||'')}</textarea>
        </div>
      </div>
      <div class="sec-div"><hr><span>Screenshots</span><hr></div>
      <div id="img-uploader"></div>
      <div class="sec-div"><hr><span>Attachments</span><hr></div>
      <div id="file-uploader"></div>
      <div class="form-actions">
        <button class="btn" onclick="cancelProjForm()">Cancel</button>
        <button class="btn primary" onclick="submitLog()">${editLogId?'Save Log':'Add Log'}</button>
      </div>
    </div>`;
  ensureAllowedUsers();
  initImageUploader(l.images);
  initFileUploader(l.files);
  onCertItemChange();
  document.getElementById('proj-form-area').scrollIntoView({behavior:'smooth',block:'nearest'});
}



async function submitLog(){
  const p=getProject(curProjectId);
  if(!p) return;
  const date=(document.getElementById('lf-date')||{}).value||'';
  const phase=(document.getElementById('lf-phase')||{}).value||'';
  const lab=(document.getElementById('lf-lab')||{}).value||'';
  const fw=(document.getElementById('lf-fw')||{}).value||'';
  const summary=(document.getElementById('lf-sum')||{}).value||'';
  if(!date){toast('Please select a date.','warn');return;}
  if(!lab.trim()){toast('Please enter the lab name.','warn');return;}
  // FW is often not known until qualification, so a log is allowed without one.
  // latestFw() and the FW history already skip logs that have none.
  if(!summary.trim()){toast('Please enter today\'s work summary.','warn');return;}
  const certItems=readCertItemsFromForm();
  // Nothing scored means nothing to record a result against
  const anyScored=certItemsFor(p).some(i=>certItems.includes(i.v)&&!i.ref);
  const logId = editLogId || genLogId(p);
  const prevLog = editLogId ? (p.logs||[]).find(x=>x.id===editLogId) : null;
  let images, files;
  try{ images = await commitImages('logs/'+p.id+'/'+logId); files = await commitFiles('logs/'+p.id+'/'+logId); }
  catch(e){ toast(e.message||e,'error',5000); return; }
  const obj={
    date,
    phase,
    lab:lab.trim(),
    fwVersion:fw.trim(),
    // The project already decided this; a log cannot belong to another platform
    platform:projPlatform(p),
    sampleNo:((document.getElementById('lf-sample')||{}).value||'').trim(),
    certItems,
    certItem:'',   // superseded by certItems[]; cleared so the two cannot disagree
    // The result applies to everything ticked. Items that passed and failed on the
    // same day belong in separate logs.
    result:anyScored?((document.getElementById('lf-result')||{}).value||''):'',
    reporter:readIdentity('lf-who',(prevLog&&prevLog.reporter)||getCurrentUser()),
    summary:summary.trim(),
    images,
    files,
    updated:todayISO()
  };
  if(!p.logs) p.logs=[];
  const isNew=!editLogId;
  let target;
  if(editLogId){
    const i=p.logs.findIndex(x=>x.id===editLogId);
    if(i>-1){ p.logs[i]={...p.logs[i],...obj}; target=p.logs[i]; }
  }else{
    target={...obj,id:logId,created:todayISO()};
    p.logs.push(target);
  }
  p.updated=todayISO();
  editLogId=null;
  document.getElementById('proj-form-area').innerHTML='';
  if(target) await afterMutation(()=>saveLogRow(p.id,target,isNew),{k:'saveLog',projId:p.id,data:target});
  renderProjectDetail();
  toast(isNew?'Log added':'Log updated','success');
}




function cancelProjForm(){
  document.getElementById('proj-form-area').innerHTML='';
  editProjId=null; editLogId=null;
}




/* A waiver is the customer accepting a failure, so it is recorded on the failing
   log rather than turning it into a pass — the log still says it failed, and who
   waived it and when is kept alongside. */
async function toggleWaive(logId){
  const p=getProject(curProjectId);
  if(!p) return;
  const l=(p.logs||[]).find(x=>x.id===logId);
  if(!l) return;
  if(!l.waived&&!(await confirmModal(
      'This failure will count towards certification progress. The log still shows it as a fail.',
      {title:'Waive this failure?',okText:'Waive'}))) return;
  if(l.waived){ delete l.waived; delete l.waivedBy; delete l.waivedAt; }
  else { l.waived=true; l.waivedBy=getCurrentUser(); l.waivedAt=todayISO(); }
  l.updated=todayISO();
  p.updated=todayISO();
  await afterMutation(()=>saveLogRow(p.id,l,false),{k:'saveLog',projId:p.id,data:l});
  renderProjectDetail();
  toast(l.waived?'Waived — counts as passed':'Waiver removed','success');
}




async function delLog(logId){
  if(!(await confirmModal('This log entry and its screenshots will be permanently deleted.',{title:'Delete log?',okText:'Delete',danger:true}))) return;
  const p=getProject(curProjectId);
  if(!p) return;
  const logObj=(p.logs||[]).find(l=>l.id===logId);
  p.logs=(p.logs||[]).filter(l=>l.id!==logId);
  await afterMutation(async()=>{ await removeLogRow(p.id,logId); await deleteStoredImages(recordAssets(logObj)); },{k:'removeLog',projId:p.id,id:logId});
  renderProjectDetail();
  toast('Log deleted','success');
}




async function delProject(id){
  const pid=id||curProjectId;
  if(!pid) return;
  if(!requireDelete(getProject(pid),'project')) return;
  if(!(await confirmModal('Deleting this project will also permanently delete all its logs and screenshots.',{title:'Delete project?',okText:'Delete',danger:true}))) return;
  const proj=getProject(pid);
  const imgs=((proj&&proj.logs)||[]).flatMap(l=>recordAssets(l));
  setProjects(projects.filter(p=>p.id!==pid));
  setCurProjectId(null);
  document.getElementById('proj-form-area').innerHTML='';
  await afterMutation(async()=>{ await removeProjectRow(pid); await deleteStoredImages(imgs); },{k:'removeProject',id:pid});
  renderProjectList();
  toast('Project deleted','success');
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  _projSearchTimer, archivedProjects, backToProjectList, cancelProjForm,
  checkProjectDeleteReminders, clearArchivedProjects, closeProjectFromCard, delLog,
  delProject, editProjId, genLogId, genProjectId, getProject, onCertPlatformChange,
  onProjSearch, onProjSearchInput, openProject, projPlatFilter, projectPool,
  renderProjPlatRow, renderProjectDetail, renderProjectList, renderProjectListContent,
  renderProjectView, reopenProject, setProjPlatFilter, setProjToolbar, showLogForm,
  showProjectCloseModal, showProjectForm, submitLog, submitProject, toggleWaive
};
