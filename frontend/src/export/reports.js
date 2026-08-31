import { applyRecordFilters } from '../components/filters.js';
import { toast } from '../components/ui.js';
import { ARCHIVE_AFTER_DAYS, isRecordArchived, recordStatus } from '../domain/archive.js';
import { PHASE_MAP, sortedLogs } from '../domain/certification.js';
import { PLATFORMS, STATUS_MAP, catDisplay, recordSampleLabels, recordTypeLabel } from '../domain/platforms.js';
import { productTypeSummary } from '../domain/products.js';
import { recordSoftwareLabel } from '../domain/software.js';
import { imgPublicUrl } from '../services/storage.js';
import { curP, curProjectId, projects, records } from '../state.js';
import { fmtDateShort, todayISO } from '../utils/dates.js';
import { downloadJson } from '../utils/download.js';
import { esc, fmtUser } from '../utils/format.js';
import { filteredArchived } from '../views/platformTracking.js';
import { archivedProjects, getProject } from '../views/projectLog.js';

/* No button any more: the per-view and per-archive exports cover day to day, and
   two Export controls that did different things was the confusing part. This stays
   because it is the only "everything, including open work" dump left - run
   exportBackup() from the console if a full snapshot is ever needed. */
function exportBackup(){
  const name='aclab-backup-'+todayISO()+'.json';
  const blob=new Blob([JSON.stringify({records,projects,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  URL.revokeObjectURL(a.href);
}




/* ===== JSON / PDF export =====
   Two shapes on purpose: JSON is the raw record for whatever ends up analysing it
   later, PDF is the one a person opens. Neither is derived from the other. */
function exportRecordsJSON(){
  const list=recordsForExport();
  if(!list.length){ toast('No records to export in the current view.','warn'); return; }
  const scope=curP==='all'?'all':curP.replace(/\s+/g,'-');
  downloadJson('aclab-records-'+scope+'-'+todayISO()+'.json',
    {kind:'records',scope,exportedAt:new Date().toISOString(),records:list});
}



/* Records currently matching the platform tab + filters, in every status but
   archived. Archived is not on screen here, and "Export the current view" that
   quietly includes it is how you end up with a file you cannot account for -
   the Archived section has its own two buttons. */
function recordsForExport(){
  // The Status filter lives outside applyRecordFilters (filteredList applies it by
  // hand), so an export that skipped it quietly disagreed with the list on screen.
  // Filtering to Closed and exporting now gives exactly the closed records, which
  // is why the Closed section needs no buttons of its own.
  const qst=(document.getElementById('q-stat')||{}).value||'';
  const base=(curP==='all'?records:records.filter(r=>r.platform===curP))
    .filter(r=>!isRecordArchived(r))
    .filter(r=>!qst||recordStatus(r)===qst);
  return applyRecordFilters(base);
}



function imagesReportHtml(images){
  if(!Array.isArray(images)||!images.length) return '';
  return '<div class="imgs">'+images.map(im=>`<img src="${imgPublicUrl(im.path)}" alt="">`).join('')+'</div>';
}



function openPrintReport(title,bodyHtml,footHtml){
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Segoe UI,Arial,"Microsoft JhengHei",sans-serif;color:#111;margin:28px;font-size:12px}
    h1{font-size:20px;margin:0 0 4px} .meta{color:#444;font-size:12px;margin-bottom:6px}
    .notes{margin:6px 0 12px;color:#333}
    table{border-collapse:collapse;width:100%;margin-top:10px} th,td{border:1px solid #bbb;padding:6px 8px;vertical-align:top;text-align:left}
    th{background:#f0f2f5;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
    .nowrap{white-space:nowrap} .sub{color:#666;font-size:11px} .imgs{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
    h2{font-size:16px;margin:0 0 4px} .pbreak{page-break-before:always}
    .imgs img{max-width:180px;max-height:130px;border:1px solid #ccc;border-radius:4px}
    .foot{margin-top:16px;color:#888;font-size:11px} tr{break-inside:avoid}
    @media print{body{margin:12mm}}
  </style></head><body>${bodyHtml}<div class="foot">${footHtml||''}</div></body></html>`;
  const w=window.open('','_blank');
  if(!w){ toast('Please allow pop-ups for this site to export the PDF report.','warn',4200); return; }
  w.document.open(); w.document.write(html); w.document.close();
  w.onload=()=>{ setTimeout(()=>{ try{ w.focus(); w.print(); }catch(e){} },400); };
}



function exportRecordsPDF(){
  const list=recordsForExport();
  if(!list.length){ toast('No records to export in the current view.','warn'); return; }
  const scope=curP==='all'?'All Platforms':(PLATFORMS[curP]?.label||curP);
  openRecordsReport('Platform Tracking Report',list,`Scope: ${esc(scope)} &nbsp;·&nbsp; ${list.length} record(s)`);
}



/* The archive gets its own report rather than a filtered version of the one above:
   what it is is the whole point of the document, and a reader should not have to
   check a scope line to find out which pile they are holding. */
function exportArchivedPDF(){
  const list=filteredArchived();
  if(!list.length){ toast('Nothing archived to export.','warn'); return; }
  const scope=curP==='all'?'All Platforms':(PLATFORMS[curP]?.label||curP);
  openRecordsReport('Platform Tracking — Archived Records',list,
    `Scope: ${esc(scope)} &nbsp;·&nbsp; ${list.length} record(s) &nbsp;·&nbsp; closed over ${ARCHIVE_AFTER_DAYS} days ago`);
}



function openRecordsReport(title,list,metaLine){
  const rows=list.map(r=>{
    const sampleLbls=r.type==='note'?recordSampleLabels(r):[];
    const swLbl=recordSoftwareLabel(r);
    const sample=(sampleLbls.length?` · ${esc(sampleLbls.join(', '))}`:'')+(swLbl?` · ${esc(swLbl)}`:'');
    const metaBits=[r.assignee&&('Assignee: '+esc(fmtUser(r.assignee))),r.fwVersion&&('FW: '+esc(r.fwVersion)),r.updatedBy&&('Edited by: '+esc(fmtUser(r.updatedBy)))].filter(Boolean).join(' · ');
    return `<tr>
      <td class="nowrap">${esc(r.id)}</td>
      <td class="nowrap">${esc(PLATFORMS[r.platform]?.label||r.platform||'')}</td>
      <td>${esc(catDisplay(r))}</td>
      <td class="nowrap">${esc(recordTypeLabel(r))}${sample}</td>
      <td><strong>${esc(r.title||'(Untitled)')}</strong>${r.desc?`<div>${esc(r.desc).replace(/\n/g,'<br>')}</div>`:''}${metaBits?`<div class="sub">${metaBits}</div>`:''}${imagesReportHtml(r.images)}</td>
      <td class="nowrap">${esc((STATUS_MAP[recordStatus(r)]||{}).lbl||recordStatus(r))}</td>
    </tr>`;
  }).join('');
  const body=`<h1>${esc(title)}</h1>
    <div class="meta">${metaLine}</div>
    <table><thead><tr><th>ID</th><th>Platform</th><th>Category</th><th>Type</th><th>Title / Details</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  openPrintReport(title,body,`Generated ${new Date().toLocaleString()} · ${list.length} record(s) · AudioTracker`);
}



function exportProjectPDF(id){
  const p=getProject(id||curProjectId); if(!p) return;
  openPrintReport(p.name+' — Test Log Report', projectReportBlock(p,'h1'),
    `Generated ${new Date().toLocaleString()} · ${(p.logs||[]).length} log(s) · AudioTracker`);
}



/* Every archived project in one document, each starting on its own page. The JSON
   beside it is the machine copy; this is the one that gets filed on the server and
   read by a person two years from now. */
function exportArchivedProjectsPDF(){
  const d=archivedProjects();
  if(!d.length){ toast('Nothing archived to export.','warn'); return; }
  const logs=d.reduce((n,p)=>n+(p.logs||[]).length,0);
  const body=`<h1>Project Log — Archived Projects</h1>
    <div class="meta">${d.length} project(s) · ${logs} log(s) · closed over ${ARCHIVE_AFTER_DAYS} days ago</div>`
    +d.map((p,i)=>`<div class="${i?'pbreak':''}">${projectReportBlock(p,'h2')}</div>`).join('');
  openPrintReport('Project Log — Archived Projects',body,
    `Generated ${new Date().toLocaleString()} · ${d.length} project(s) · AudioTracker`);
}



function projectReportBlock(p,tag){
  const logs=sortedLogs(p.logs);
  const fwHist=[...new Set(logs.map(l=>l.fwVersion).filter(Boolean))].join(' → ');
  const rows=logs.map(l=>`<tr>
    <td class="nowrap">${esc(fmtDateShort(l.date))}</td>
    <td class="nowrap">${esc((PHASE_MAP[l.phase]||{}).lbl||l.phase||'')}</td>
    <td>${esc(l.lab||'')}</td>
    <td class="nowrap">${esc(l.fwVersion||'')}</td>
    <td>${esc(l.platform?(PLATFORMS[l.platform]?.label||l.platform):'')}</td>
    <td>${esc(l.reporter||'')}</td>
    <td>${esc(l.summary||'').replace(/\n/g,'<br>')}${imagesReportHtml(l.images)}</td>
  </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;color:#888">No logs</td></tr>';
  const meta=[
    productTypeSummary(p)?'Product: '+esc(productTypeSummary(p)):'',
    p.customer?'Customer: '+esc(p.customer):'',
    'Created: '+esc(p.created||''),
    fwHist?'FW History: '+esc(fwHist):''
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const status=p.status==='closed'
    ? ` &nbsp;·&nbsp; Closed${p.closedAt?' '+esc(p.closedAt):''}` : '';
  return `<${tag}>${esc(p.name)} — Test Log Report</${tag}>
    <div class="meta">${meta}${status}</div>
    ${p.notes?`<div class="notes"><strong>Notes:</strong> ${esc(p.notes)}</div>`:''}
    <table>
      <thead><tr><th>Date</th><th>Phase</th><th>Lab</th><th>FW</th><th>Platform</th><th>Reporter</th><th>Summary</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}



function exportArchived(){
  const d=filteredArchived();
  if(!d.length){ toast('Nothing archived to export.','warn'); return; }
  downloadJson('aclab-archived-records-'+todayISO()+'.json',
    {kind:'records',archivedAfterDays:ARCHIVE_AFTER_DAYS,exportedAt:new Date().toISOString(),records:d});
}




/* Logs travel with the project here. A project without its logs answers no
   question worth asking later, and logs are where the per-engineer detail lives. */
function exportArchivedProjects(){
  const d=archivedProjects();
  if(!d.length){ toast('Nothing archived to export.','warn'); return; }
  downloadJson('aclab-archived-projects-'+todayISO()+'.json',
    {kind:'projects',archivedAfterDays:ARCHIVE_AFTER_DAYS,exportedAt:new Date().toISOString(),projects:d});
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  exportArchived, exportArchivedPDF, exportArchivedProjects, exportArchivedProjectsPDF,
  exportBackup, exportProjectPDF, exportRecordsJSON, exportRecordsPDF, imagesReportHtml,
  openPrintReport, openRecordsReport, projectReportBlock, recordsForExport
};
