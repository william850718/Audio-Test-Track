import { filesDisplayHtml, imagesDisplayHtml } from './uploaders.js';
import { recordClosedAt, recordStatus } from '../domain/archive.js';
import { canDelete } from '../domain/permissions.js';
import { CERT_CLS, CERT_LBL, PLATFORMS, PLAT_COLOR, STATUSES, STATUS_MAP, TYPES_ALT_MAP, TYPES_AUDIO_MAP, TYPE_ICON, TYPE_MAP, catDisplay, catLbl, legacyTypeLabel, recordSampleLabels } from '../domain/platforms.js';
import { recordVersionNo } from '../domain/records.js';
import { recordSoftwareLabel } from '../domain/software.js';
import { esc, fmtUser } from '../utils/format.js';
import { cycleStatus, delRecord, editRecord, openRecordDetail, selectedIds } from '../views/platformTracking.js';

// Timeline, newest first, with the implicit v1 entry at the bottom
function versionTimelineHtml(r){
  const vs=(r.versions||[]);
  // Entries written by the first cut of this feature were content snapshots
  // ({savedAt,savedBy,title,desc}); read those field names too so their date,
  // author and text do not disappear from the timeline.
  const entries=vs.map((v,i)=>({
    v:v.v||i+2,
    note:v.note||v.desc||v.title||'',
    at:v.at||v.savedAt||'',
    by:v.by||v.savedBy||''
  }));
  entries.push({v:1,note:'Original version',at:r.created||'',by:r.assignee||'',first:true});
  entries.sort((a,b)=>b.v-a.v);   // newest version at the top
  return `<ol class="ver-timeline">${entries.map((e,idx,arr)=>`
    <li class="ver-tl-item${idx===arr.length-1?' last':''}">
      <span class="ver-tl-rail"><span class="ver-tl-dot${e.first?' first':''}"></span></span>
      <div class="ver-tl-body">
        <div class="ver-tl-head"><span class="ver-tag">v${e.v}</span>
          ${e.at?`<span class="ver-when">${esc(e.at)}</span>`:''}
          ${e.by?`<span class="ver-by"><i class="ti ti-user" aria-hidden="true"></i>${esc(fmtUser(e.by))}</span>`:''}
        </div>
        <div class="ver-note${e.first?' muted':''}">${esc(e.note)||'<span class="ver-note muted">No change note</span>'}</div>
      </div>
    </li>`).join('')}</ol>`;
}



// One quiet classification line: platform in its own colour, then category › sub, then
// the record type. Icons mark which is which so it does not read as a run-on sentence.
function recordCrumbHtml(r,to){
  const pc=PLAT_COLOR[r.platform]||'';
  const parts=[`<span class="crumb-plat"${pc?` style="color:var(--color-${pc})"`:''}><i class="ti ti-layout-grid" aria-hidden="true"></i>${esc(PLATFORMS[r.platform]?.label||r.platform)}</span>`];
  if(r.category) parts.push(esc(catLbl(r.platform,r.category))+(r.subCategory?' <span class="crumb-sep">›</span> '+esc(r.subCategory):''));
  parts.push(`<span class="crumb-type"><i class="ti ${TYPE_ICON[r.type]||'ti-tag'}" aria-hidden="true"></i>${esc(to.lbl)}</span>`);
  return parts.join(' <span class="crumb-sep">·</span> ');
}



function recordCardHtml(r,opts={}){
  const pc=PLAT_COLOR[r.platform]||'other';
  const st=recordStatus(r);
  const so=STATUS_MAP[st]||STATUSES[0];
  // Current list first: the legacy maps still label issue as "ISSUE", which no longer
  // matches the filter menu now that the label is shown as plain text
  const to=TYPES_AUDIO_MAP[r.type]||TYPE_MAP[r.type]||TYPES_ALT_MAP[r.type]||{lbl:legacyTypeLabel(r.type),cls:'b-cat'};
  const certBadge=r.certType?`<span class="badge ${CERT_CLS[r.certType]||''}">${CERT_LBL[r.certType]||r.certType}</span>`:'';
  const catBadge=catDisplay(r)?`<span class="badge b-cat">${esc(catDisplay(r))}</span>`:'';
  const closedAt=recordClosedAt(r);
  const archiveMeta=(opts.archive&&st==='closed')
    ?`<span class="meta"><i class="ti ti-archive" aria-hidden="true"></i>Closed ${esc(closedAt)}</span>`:'';
  // Classification reads as one quiet line so colour is left to say one thing: the status
  const crumb=recordCrumbHtml(r,to);
  const samples=recordSampleLabels(r);
  const sw=recordSoftwareLabel(r);
  // "last edited by" is only worth a slot when it differs from the assignee
  const editor=(r.updatedBy&&r.updatedBy!==r.assignee)?r.updatedBy:'';
  return`<div class="record clickable${selectedIds.has(r.id)?' selected':''}" onclick="openRecordDetail('${r.id}')" title="Open record">
    <div class="rec-top">
      <div class="rec-title">${esc(r.title||'(Untitled)')}</div>
      <span class="badge ${so.cls} rec-status">${so.lbl}</span>
    </div>
    <div class="rec-crumb">${crumb}${certBadge?' '+certBadge:''}</div>
    <div class="meta-row">
      <span class="meta"><i class="ti ti-hash" aria-hidden="true"></i>${esc(r.id)}${(r.versions||[]).length?`<span class="ver-pill" title="Version ${recordVersionNo(r)} — open the record to see what changed">v${recordVersionNo(r)}</span>`:''}</span>
      ${r.assignee?`<span class="meta"><i class="ti ti-user" aria-hidden="true"></i>${esc(fmtUser(r.assignee))}</span>`:''}
      ${r.fwVersion?`<span class="meta"><i class="ti ti-cpu" aria-hidden="true"></i>FW ${esc(r.fwVersion)}</span>`:''}
      <span class="meta" title="Last updated (created ${esc(r.created||'—')})"><i class="ti ti-clock" aria-hidden="true"></i>${esc(r.updated||r.created)}</span>
      ${editor?`<span class="meta" title="Last edited by"><i class="ti ti-pencil" aria-hidden="true"></i>${esc(fmtUser(editor))}</span>`:''}
      ${archiveMeta}
    </div>
    ${(samples.length||sw)?`<div class="rec-aux">
      ${samples.length?`<span class="aux"><i class="ti ti-device-audio" aria-hidden="true"></i>${samples.map(esc).join(', ')}</span>`:''}
      ${sw?`<span class="aux"><i class="ti ti-device-desktop-analytics" aria-hidden="true"></i>${esc(sw)}</span>`:''}
    </div>`:''}
    ${r.desc?`<div class="desc desc-clamp">${esc(r.desc)}</div><div class="desc-more" hidden><i class="ti ti-dots" aria-hidden="true"></i> Open the record to read the rest</div>`:''}
    ${imagesDisplayHtml(r.images,true)}
    ${filesDisplayHtml(r.files)}
    <div class="rec-hover-actions">
      <button class="iconbtn" onclick="event.stopPropagation();editRecord('${r.id}')" title="Edit" aria-label="Edit"><i class="ti ti-edit" aria-hidden="true"></i></button>
      <button class="iconbtn" onclick="event.stopPropagation();cycleStatus('${r.id}')" title="${st==='closed'?'Reopen':'Close'}" aria-label="${st==='closed'?'Reopen':'Close'}"><i class="ti ti-${st==='closed'?'lock-open':'lock'}" aria-hidden="true"></i></button>
      ${canDelete(r)?`<button class="iconbtn dgr" onclick="event.stopPropagation();delRecord('${r.id}')" title="Delete" aria-label="Delete"><i class="ti ti-trash" aria-hidden="true"></i></button>`:''}
    </div>
  </div>`;
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  recordCardHtml, recordCrumbHtml, versionTimelineHtml
};
