import { confirmModal, toast } from '../components/ui.js';
import { LABS } from '../domain/platforms.js';
import { getCurrentUser } from '../services/auth.js';
import { afterMutation, saveLabRow } from '../services/db.js';
import { labInstruments, records } from '../state.js';
import { daysSince, todayISO } from '../utils/dates.js';
import { esc, extractVersion, fmtUser } from '../utils/format.js';

// Freshness bucket for the "last verified" indicator
function labFreshness(iso){
  const n=daysSince(iso);
  if(!iso) return {cls:'lf-none',label:'never'};   // daysSince never returns Infinity
  return {cls:n<=30?'lf-ok':n<=90?'lf-warn':'lf-old',label:n+'d ago'};
}




let curLab=null; // Lab Instruments state (keyed by lab id)






/* ===== Lab Instruments view ===== */
let _labEdit=null, _labParsed=null;   // _labEdit = {index, isNew} — the single row currently being edited



let _labReorder=false, _labOrderDraft=null, _labGroupsDraft=null, _labDragFrom=null;   // reorder mode works on a draft until Done



let _labCatEdit=null;   // {mode:'new'} | {mode:'rename', name} — inline category editor



/* Categories are per lab and free-form. The lab's `groups` array is the authoritative
   list, so a category can exist while still empty; an item's `group` just names one. */
const DEFAULT_LAB_GROUPS=['Teams','Chrome Audio'];



function labItemGroup(it){ return ((it&&it.group)||'').trim(); }



// Authoritative category list for a lab (defaults apply only when none was ever stored)
function labGroupList(d){
  const out=Array.isArray(d&&d.groups)?d.groups.slice():DEFAULT_LAB_GROUPS.slice();
  ((d&&d.items)||[]).forEach(it=>{ const g=labItemGroup(it); if(g&&!out.includes(g)) out.push(g); });
  return out;
}



function labGroupsOf(items,order){
  const out=(order||[]).slice();
  (items||[]).forEach(it=>{ const g=labItemGroup(it); if(g&&!out.includes(g)) out.push(g); });
  return out;
}



function labIndexesIn(items,g){ return (items||[]).map((_,i)=>i).filter(i=>labItemGroup(items[i])===g); }



// Flat items array rebuilt so it is stored grouped, in the display order
function labNormalizeOrder(items,order){
  const out=[];
  labGroupsOf(items,order).forEach(g=>labIndexesIn(items,g).forEach(i=>out.push(items[i])));
  labIndexesIn(items,'').forEach(i=>out.push(items[i]));
  return out;
}



function labData(id){ return labInstruments[id]||{items:[],verifiedAt:null}; }



// Last time any instrument version actually changed (max of item changedAt) — informational, never drives the light
function labLastChanged(d){ const ds=(d.items||[]).map(i=>i.changedAt).filter(Boolean).sort(); return ds.length?ds[ds.length-1]:null; }



function renderLabView(){
  const host=document.getElementById('view-lab');
  if(!host) return;
  if(curLab && LABS.some(l=>l.id===curLab)) renderLabDetail(host);
  else { curLab=null; renderLabList(host); }
}



function openLab(id){ curLab=id; _labEdit=null; _labCatEdit=null; _labParsed=null; _labReorder=false; _labOrderDraft=null; renderLabView(); }



function labBack(){ curLab=null; _labEdit=null; _labCatEdit=null; _labParsed=null; _labReorder=false; _labOrderDraft=null; renderLabView(); }



function renderLabList(host){
  const cards=LABS.map(l=>{
    const d=labData(l.id), f=labFreshness(d.verifiedAt), n=(d.items||[]).length, chg=labLastChanged(d);
    return `<button class="lab-card" onclick="openLab('${l.id}')">
      <div class="lab-card-top">
        <span class="lab-name">${esc(l.id)}${l.note?`<span class="lab-note">${esc(l.note)}</span>`:''}</span>
        <span class="lf-dot ${f.cls}"></span>
      </div>
      <div class="lab-card-meta">${n} item${n===1?'':'s'}${chg?' · changed '+esc(chg.slice(0,10)):''}</div>
      <div class="lf-pill ${f.cls}"><i class="ti ti-checkbox" aria-hidden="true"></i> ${d.verifiedAt?('Checked '+esc(d.verifiedAt.slice(0,10))+' · '+f.label):'Never checked'}</div>
    </button>`;
  }).join('');
  host.innerHTML=`
    <div class="lab-head">
      <div class="lab-h1"><i class="ti ti-microscope" aria-hidden="true"></i> Lab Instruments</div>
      <div class="lab-sub">Each lab's instrument &amp; software versions. Click a lab to view or update; colour shows time since last verified.</div>
    </div>
    <div class="lab-grid">${cards}</div>`;
}



function renderLabDetail(host){
  const meta=LABS.find(l=>l.id===curLab)||{id:curLab,note:''};
  const d=labData(curLab), f=labFreshness(d.verifiedAt), chg=labLastChanged(d);
  const items=_labReorder?_labOrderDraft:(d.items||[]);
  const order=_labReorder?_labGroupsDraft:labGroupList(d);
  const isEmpty=!(d.items||[]).length;
  const editingNew=!!(_labEdit&&_labEdit.isNew);
  let rows=labSectionsHtml(items,order);
  if(editingNew&&!_labEdit.group) rows+=labEditRowHtml({name:'',value:'',group:''});
  if(_labCatEdit&&_labCatEdit.mode==='new') rows+=labCatEditHtml('');
  host.innerHTML=`
    <button class="btn" onclick="labBack()" style="margin-bottom:14px"><i class="ti ti-arrow-left" aria-hidden="true"></i> All labs</button>
    <div class="lab-detail-head">
      <div>
        <div class="lab-h1">${esc(meta.id)}${meta.note?`<span class="lab-note">${esc(meta.note)}</span>`:''} <span style="font-size:15px;color:var(--text-secondary);font-weight:400">instruments</span></div>
        <div class="lab-dates">
          <span class="lf-pill ${f.cls}"><i class="ti ti-checkbox" aria-hidden="true"></i> ${d.verifiedAt?('Checked '+esc(d.verifiedAt.slice(0,10))+' · '+f.label):'Never checked'}</span>
          ${d.updatedBy?`<span class="lab-by">by ${esc(fmtUser(d.updatedBy))}</span>`:''}
          <span class="lab-changed-note"><i class="ti ti-history" aria-hidden="true"></i> Last change: ${chg?esc(chg.slice(0,10)):'—'}</span>
        </div>
      </div>
      <div class="lab-actions">${_labReorder
        ? `<button class="btn" onclick="labCancelReorder()">Cancel</button>
           <button class="btn primary" onclick="labSaveReorder()"><i class="ti ti-check" aria-hidden="true"></i> Done</button>`
        : `<button class="btn" onclick="labVerify()" title="Confirm the list is still correct — records today as the last-checked date without changing any data"${(_labEdit||_labCatEdit)?' disabled':''}><i class="ti ti-checkbox" aria-hidden="true"></i> Mark checked</button>
           ${((d.items||[]).length>1||labGroupList(d).length>1)?`<button class="btn" onclick="labStartReorder()" title="Change the order of the instruments and categories"${(_labEdit||_labCatEdit)?' disabled':''}><i class="ti ti-arrows-sort" aria-hidden="true"></i> Reorder</button>`:''}`}</div>
    </div>
    ${_labReorder?'<div class="lab-reorder-hint"><i class="ti ti-info-circle" aria-hidden="true"></i> Drag a handle to reorder — drop it on another section to move it there. Arrows reorder within a category. Nothing is saved until you press Done.</div>':''}
    <div class="lab-table${_labReorder?' reordering':''}">
      <div class="lab-tr lab-thead${_labReorder?' lab-tr-reorder':''}">${_labReorder?'<span></span>':''}<span>Instrument / item</span><span>Version</span><span class="lab-ver-col">Latest update</span><span></span></div>
      ${rows}
      ${(!_labEdit&&!_labCatEdit&&!_labReorder)?`<div class="lab-addrow">
        <button class="btn" onclick="labAddInstrument('')"><i class="ti ti-plus" aria-hidden="true"></i> Add instrument</button>
        <button class="btn" onclick="labAddCategory()"><i class="ti ti-folder-plus" aria-hidden="true"></i> Add category</button>
      </div>`:''}
    </div>
    ${(!_labEdit&&!_labReorder&&isEmpty)?labPasteHtml():''}`;
  const focusEl=_labCatEdit?document.getElementById('lab-cat-input')
    :(_labEdit?document.getElementById(_labEdit.isNew?'lab-edit-name':'lab-edit-value'):null);
  if(focusEl){ focusEl.focus(); if(focusEl.setSelectionRange) focusEl.setSelectionRange(focusEl.value.length,focusEl.value.length); }
}



// Renders the table body: one section per category, uncategorised items last.
// Headers are hidden entirely when a lab uses no categories at all.
function labSectionsHtml(items,order){
  const named=(order||[]).slice();
  let html='';
  const section=(label,idxs,gi)=>{
    const isReal=gi>=0;
    if(!isReal&&!idxs.length) return;                       // no "Uncategorized" unless it has items
    if(_labCatEdit&&_labCatEdit.mode==='rename'&&_labCatEdit.name===label){ html+=labCatEditHtml(label); }
    else html+=labGroupHeadHtml(label,gi,named.length);
    idxs.forEach((flat,pos)=>{
      html+=_labReorder
        ? labReorderRowHtml(items[flat],flat,pos===0,pos===idxs.length-1)
        : labRowHtml(items[flat],flat);
    });
    // inline "new instrument" row belonging to this category
    if(_labEdit&&_labEdit.isNew&&_labEdit.group===label) html+=labEditRowHtml({name:'',value:'',group:label});
    if(isReal&&!idxs.length&&!(_labEdit&&_labEdit.isNew&&_labEdit.group===label))
      html+=`<div class="lab-group-empty">No instruments in this category yet.</div>`;
  };
  named.forEach((g,gi)=>section(g,labIndexesIn(items,g),gi));
  section('',labIndexesIn(items,''),-1);
  return html;
}



function labGroupHeadHtml(label,gi,total){
  const q=String(label).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const busy=!!(_labEdit||_labCatEdit);
  let actions='';
  if(_labReorder&&gi>=0){
    actions=`<span class="lab-row-actions">
      <button class="lab-iconbtn" onclick="labMoveGroup('${q}',-1)" title="Move category up" aria-label="Move category up"${gi===0?' disabled':''}><i class="ti ti-chevron-up" aria-hidden="true"></i></button>
      <button class="lab-iconbtn" onclick="labMoveGroup('${q}',1)" title="Move category down" aria-label="Move category down"${gi===total-1?' disabled':''}><i class="ti ti-chevron-down" aria-hidden="true"></i></button>
    </span>`;
  }else if(!_labReorder&&gi>=0){
    actions=`<span class="lab-row-actions">
      <button class="lab-iconbtn" onclick="labAddInstrument('${q}')" title="Add an instrument to ${esc(label)}" aria-label="Add instrument"${busy?' disabled':''}><i class="ti ti-plus" aria-hidden="true"></i></button>
      <button class="lab-iconbtn" onclick="labRenameCategory('${q}')" title="Rename category" aria-label="Rename category"${busy?' disabled':''}><i class="ti ti-pencil" aria-hidden="true"></i></button>
      <button class="lab-iconbtn danger" onclick="labDeleteCategory('${q}')" title="Delete category" aria-label="Delete category"${busy?' disabled':''}><i class="ti ti-trash" aria-hidden="true"></i></button>
    </span>`;
  }
  const dz=_labReorder?` ondragover="labDragOver(event,-1)" ondrop="labDropOnGroup(event,'${q}')"`:'';
  return `<div class="lab-group-head${label?'':' none'}"${dz}>
    <span class="lab-group-name">${label?esc(label):'Uncategorized'}</span>${actions}
  </div>`;
}



// Inline editor used both for creating and for renaming a category
function labCatEditHtml(current){
  return `<div class="lab-group-head editing">
    <input id="lab-cat-input" class="lab-in" value="${esc(current||'')}" placeholder="Category name, e.g. Teams"
      onkeydown="if(event.key==='Enter'){event.preventDefault();labCatSave();}else if(event.key==='Escape'){labCatCancel();}">
    <span class="lab-row-actions">
      <button class="lab-iconbtn ok" onclick="labCatSave()" title="Save" aria-label="Save"><i class="ti ti-check" aria-hidden="true"></i></button>
      <button class="lab-iconbtn" onclick="labCatCancel()" title="Cancel" aria-label="Cancel"><i class="ti ti-x" aria-hidden="true"></i></button>
    </span>
  </div>`;
}



function labRowHtml(it,i){
  if(_labEdit && !_labEdit.isNew && _labEdit.index===i) return labEditRowHtml(it);
  const dis=_labEdit?' disabled':'';
  return `<div class="lab-tr">
    <span class="lab-name-cell">${esc(it.name||'')}</span>
    <span class="lab-val-cell">${esc(it.value||'')}</span>
    <span class="lab-ver-col"><span class="lab-chg">${it.changedAt?esc(it.changedAt.slice(0,10)):'—'}</span></span>
    <span class="lab-row-actions">
      <button class="lab-iconbtn" onclick="labMoveMenu(this,${i})" title="Move to another category" aria-label="Move to category"${dis}><i class="ti ti-folder-symlink" aria-hidden="true"></i></button>
      <button class="lab-iconbtn" onclick="labEditRow(${i})" title="Edit this item" aria-label="Edit"${dis}><i class="ti ti-edit" aria-hidden="true"></i></button>
      <button class="lab-iconbtn danger" onclick="labDeleteRow(${i})" title="Delete this item" aria-label="Delete"${dis}><i class="ti ti-trash" aria-hidden="true"></i></button>
    </span>
  </div>`;
}



function labEditRowHtml(it){
  const d=labData(curLab);
  const opts=labGroupsOf(d.items||[],d.groups||[]).map(g=>`<option value="${esc(g)}"></option>`).join('');
  const kd=`if(event.key==='Enter'){event.preventDefault();labRowSave();}else if(event.key==='Escape'){labRowCancel();}`;
  return `<div class="lab-tr lab-tr-edit">
    <input id="lab-edit-group" class="lab-in lab-group-in" list="lab-group-list" value="${esc(it.group||'')}" placeholder="Category" title="Type a new category or pick an existing one" onkeydown="${kd}">
    <datalist id="lab-group-list">${opts}</datalist>
    <input id="lab-edit-name" class="lab-in" value="${esc(it.name||'')}" placeholder="e.g. ACQUA Version" onkeydown="${kd}">
    <input id="lab-edit-value" class="lab-in lab-val-in" value="${esc(it.value||'')}" placeholder="e.g. 6.2.210" onkeydown="${kd}">
    <span class="lab-row-actions">
      <button class="lab-iconbtn ok" onclick="labRowSave()" title="Save" aria-label="Save"><i class="ti ti-check" aria-hidden="true"></i></button>
      <button class="lab-iconbtn" onclick="labRowCancel()" title="Cancel" aria-label="Cancel"><i class="ti ti-x" aria-hidden="true"></i></button>
    </span>
  </div>`;
}



/* ---- Reorder mode: explicit, so nothing can be dragged by accident ---- */
function labReorderRowHtml(it,i,isFirst,isLast){
  return `<div class="lab-tr lab-tr-reorder" id="labrow-${i}"
      ondragstart="labDragStart(event,${i})" ondragover="labDragOver(event,${i})"
      ondrop="labDrop(event,${i})" ondragend="labDragEnd(event,${i})">
    <span class="lab-grip" title="Drag to reorder" onmousedown="labGripDown(${i})" onmouseup="labGripUp(${i})"><i class="ti ti-grip-vertical" aria-hidden="true"></i></span>
    <span class="lab-name-cell">${esc(it.name||'')}</span>
    <span class="lab-val-cell">${esc(it.value||'')}</span>
    <span class="lab-ver-col"><span class="lab-chg">${it.changedAt?esc(it.changedAt.slice(0,10)):'—'}</span></span>
    <span class="lab-row-actions">
      <button class="lab-iconbtn" onclick="labMoveRow(${i},-1)" title="Move up" aria-label="Move up"${isFirst?' disabled':''}><i class="ti ti-chevron-up" aria-hidden="true"></i></button>
      <button class="lab-iconbtn" onclick="labMoveRow(${i},1)" title="Move down" aria-label="Move down"${isLast?' disabled':''}><i class="ti ti-chevron-down" aria-hidden="true"></i></button>
    </span>
  </div>`;
}



function labStartReorder(){
  if(_labEdit) return;
  const d=labData(curLab);
  _labOrderDraft=(d.items||[]).map(it=>({...it}));
  _labGroupsDraft=labGroupsOf(_labOrderDraft,d.groups||[]);
  _labReorder=true; renderLabView();
}



function labCancelReorder(){ _labReorder=false; _labOrderDraft=null; _labGroupsDraft=null; _labDragFrom=null; renderLabView(); }



// Items only move within their own category — changing category is done by editing the row
function labMoveRow(i,dir){
  const arr=_labOrderDraft; if(!arr||!arr[i]) return;
  const idxs=labIndexesIn(arr,labItemGroup(arr[i]));
  const target=idxs[idxs.indexOf(i)+dir];
  if(target===undefined) return;
  const t=arr[i]; arr[i]=arr[target]; arr[target]=t;
  renderLabView();
}



function labMoveGroup(name,dir){
  if(!_labGroupsDraft) return;
  const i=_labGroupsDraft.indexOf(name), j=i+dir;
  if(i<0||j<0||j>=_labGroupsDraft.length) return;
  const t=_labGroupsDraft[i]; _labGroupsDraft[i]=_labGroupsDraft[j]; _labGroupsDraft[j]=t;
  renderLabView();
}



// Only the grip arms the row for dragging, so grabbing text never starts a drag
function labGripDown(i){ const el=document.getElementById('labrow-'+i); if(el) el.draggable=true; }



function labGripUp(i){ const el=document.getElementById('labrow-'+i); if(el) el.draggable=false; }



function labDragStart(e,i){ _labDragFrom=i; try{ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',String(i)); }catch(err){} }



function labDragOver(e,i){
  if(_labDragFrom===null||_labDragFrom===undefined) return;
  e.preventDefault();
  document.querySelectorAll('.drop-above,.drop-below').forEach(el=>el.classList.remove('drop-above','drop-below'));
  if(i<0) return;   // section header: no line, the whole header highlights via :hover
  const el=document.getElementById('labrow-'+i);
  if(el&&i!==_labDragFrom) el.classList.add(i<_labDragFrom?'drop-above':'drop-below');
}



function labDrop(e,i){
  e.preventDefault();
  const from=_labDragFrom;
  if(from===null||from===undefined||from===i||!_labOrderDraft) return;
  const targetGroup=labItemGroup(_labOrderDraft[i]);
  const [m]=_labOrderDraft.splice(from,1);
  m.group=targetGroup;                       // dropping into another section refiles the item
  _labOrderDraft.splice(i,0,m);
  _labDragFrom=null;
  renderLabView();
}



// Dropping onto a section header files the item at the end of that category (works for empty ones)
function labDropOnGroup(e,g){
  e.preventDefault();
  const from=_labDragFrom;
  if(from===null||from===undefined||!_labOrderDraft) return;
  const [m]=_labOrderDraft.splice(from,1);
  m.group=g;
  const idxs=labIndexesIn(_labOrderDraft,g);
  _labOrderDraft.splice(idxs.length?idxs[idxs.length-1]+1:_labOrderDraft.length,0,m);
  _labDragFrom=null;
  renderLabView();
}



function labDragEnd(e,i){ const el=document.getElementById('labrow-'+i); if(el) el.draggable=false; _labDragFrom=null;
  document.querySelectorAll('.lab-tr-reorder.drop-above,.lab-tr-reorder.drop-below').forEach(el2=>el2.classList.remove('drop-above','drop-below')); }



async function labSaveReorder(){
  const d=labData(curLab);
  const groups=(_labGroupsDraft||[]).slice();
  const items=labNormalizeOrder((_labOrderDraft||[]).map(it=>({...it})),groups);
  // Reordering is cosmetic: it must not touch the last-checked or per-item change dates
  const obj={items,groups,verifiedAt:d.verifiedAt||null};
  labInstruments[curLab]={...obj,updatedBy:getCurrentUser()};
  _labReorder=false; _labOrderDraft=null; _labGroupsDraft=null; _labDragFrom=null;
  renderLabView();
  await afterMutation(()=>saveLabRow(curLab,obj),{k:'saveLab',labId:curLab,data:obj});
  toast('Order saved','success');
}




function labEditRow(i){ if(_labEdit||_labCatEdit||_labReorder) return; _labEdit={index:i,isNew:false}; renderLabView(); }



function labAddInstrument(group){ if(_labEdit||_labCatEdit) return; _labEdit={index:(labData(curLab).items||[]).length,isNew:true,group:group||''}; renderLabView(); }



function labRowCancel(){ _labEdit=null; renderLabView(); }




/* ---- Move an existing instrument straight into another category ---- */
function closeLabMenu(){ const m=document.getElementById('lab-move-menu'); if(m) m.remove(); }



function labMoveMenu(btn,i){
  closeLabMenu();
  if(_labEdit||_labCatEdit||_labReorder) return;
  const d=labData(curLab);
  const cur=labItemGroup((d.items||[])[i]);
  const opts=labGroupList(d).map(g=>({v:g,l:g})).concat([{v:'',l:'Uncategorized'}]);
  const m=document.createElement('div');
  m.className='lab-menu'; m.id='lab-move-menu';
  m.innerHTML='<div class="lab-menu-h">Move to</div>'+opts.map(o=>
    `<button type="button" data-g="${esc(o.v)}"${o.v===cur?' class="sel"':''}>${esc(o.l)}${o.v===cur?' <i class="ti ti-check" aria-hidden="true"></i>':''}</button>`).join('');
  document.body.appendChild(m);
  const r=btn.getBoundingClientRect();
  m.style.left=Math.max(8,Math.min(r.right-m.offsetWidth,window.innerWidth-m.offsetWidth-8))+'px';
  m.style.top=(r.bottom+window.innerHeight-r.bottom<m.offsetHeight+12?Math.max(8,r.top-m.offsetHeight-4):r.bottom+4)+'px';
  m.querySelectorAll('button').forEach(b=>b.onclick=e=>{ e.stopPropagation(); closeLabMenu(); if(b.dataset.g!==cur) labMoveToCategory(i,b.dataset.g); });
  setTimeout(()=>document.addEventListener('click',closeLabMenu,{once:true}),0);
}



async function labMoveToCategory(i,group){
  const d=labData(curLab);
  const items=(d.items||[]).map((it,idx)=>idx===i?{...it,group:group||''}:{...it});
  const groups=labGroupList(d);
  if(group&&!groups.includes(group)) groups.push(group);
  // Filing an instrument is organisational — it must not count as a re-check or a version change
  const obj={items:labNormalizeOrder(items,groups),groups,verifiedAt:d.verifiedAt||null};
  labInstruments[curLab]={...obj,updatedBy:getCurrentUser()};
  renderLabView();
  await afterMutation(()=>saveLabRow(curLab,obj),{k:'saveLab',labId:curLab,data:obj});
  toast('Moved to '+(group||'Uncategorized'),'success');
}




/* ---- Categories: created up front, so instruments can be filed into them ---- */
function labAddCategory(){ if(_labEdit||_labCatEdit) return; _labCatEdit={mode:'new'}; renderLabView(); }



function labRenameCategory(g){ if(_labEdit||_labCatEdit) return; _labCatEdit={mode:'rename',name:g}; renderLabView(); }



function labCatCancel(){ _labCatEdit=null; renderLabView(); }



async function labCatSave(){
  const inp=document.getElementById('lab-cat-input'); if(!inp||!_labCatEdit) return;
  const name=(inp.value||'').trim();
  const mode=_labCatEdit.mode, old=_labCatEdit.name;
  if(!name){ if(mode==='new'){ labCatCancel(); return; } toast('Please enter a category name.','warn'); return; }
  const d=labData(curLab);
  const groups=labGroupList(d);
  if(name!==old&&groups.some(g=>g.toLowerCase()===name.toLowerCase())){ toast('That category already exists.','warn'); return; }
  let items=(d.items||[]).map(it=>({...it}));
  if(mode==='new') groups.push(name);
  else{
    const i=groups.indexOf(old); if(i>-1) groups[i]=name;
    items.forEach(it=>{ if(labItemGroup(it)===old) it.group=name; });   // keep items attached
  }
  const obj={items:labNormalizeOrder(items,groups),groups,verifiedAt:d.verifiedAt||null};
  labInstruments[curLab]={...obj,updatedBy:getCurrentUser()};
  _labCatEdit=null; renderLabView();
  await afterMutation(()=>saveLabRow(curLab,obj),{k:'saveLab',labId:curLab,data:obj});
  toast(mode==='new'?'Category added':'Category renamed','success');
}



async function labDeleteCategory(g){
  const d=labData(curLab);
  const n=labIndexesIn(d.items||[],g).length;
  const msg=n?('Delete the category "'+g+'"? Its '+n+' instrument'+(n===1?'':'s')+' will move to Uncategorized — nothing is deleted.')
             :('Delete the empty category "'+g+'"?');
  if(!(await confirmModal(msg,{title:'Delete category',okText:'Delete',danger:true}))) return;
  const groups=labGroupList(d).filter(x=>x!==g);
  const items=(d.items||[]).map(it=>labItemGroup(it)===g?{...it,group:''}:{...it});
  const obj={items:labNormalizeOrder(items,groups),groups,verifiedAt:d.verifiedAt||null};
  labInstruments[curLab]={...obj,updatedBy:getCurrentUser()};
  renderLabView();
  await afterMutation(()=>saveLabRow(curLab,obj),{k:'saveLab',labId:curLab,data:obj});
  toast('Category deleted','success');
}



async function labRowSave(){
  const nameEl=document.getElementById('lab-edit-name'), valEl=document.getElementById('lab-edit-value');
  if(!nameEl||!valEl) return;
  const name=(nameEl.value||'').trim(), value=(valEl.value||'').trim();
  const group=((document.getElementById('lab-edit-group')||{}).value||'').trim();
  const isNew=!!(_labEdit&&_labEdit.isNew);
  if(!name){ if(isNew&&!value){ labRowCancel(); return; } toast('Please enter an instrument name.','warn'); return; }
  const d=labData(curLab);
  let items=(d.items||[]).map(it=>({...it}));
  if(isNew){
    items.push({name,value,group,version:extractVersion(value),changedAt:todayISO()});
  }else{
    const prev=items[_labEdit.index]||{};
    const changed=(prev.value||'').trim()!==value;
    items[_labEdit.index]={name,value,group,version:extractVersion(value),changedAt:changed?todayISO():(prev.changedAt||todayISO())};
  }
  const groups=labGroupList(d);
  if(group&&!groups.includes(group)) groups.push(group);
  items=labNormalizeOrder(items,groups);
  const obj={items,groups,verifiedAt:todayISO()};
  labInstruments[curLab]={...obj,updatedBy:getCurrentUser()};
  _labEdit=null; renderLabView();
  await afterMutation(()=>saveLabRow(curLab,obj),{k:'saveLab',labId:curLab,data:obj});
  toast(isNew?'Instrument added':'Instrument updated','success');
}



async function labDeleteRow(i){
  const it=(labData(curLab).items||[])[i]; if(!it) return;
  const ok=await confirmModal('Delete "'+(it.name||'this item')+'" from '+curLab+'?',{danger:true,okText:'Delete',title:'Delete instrument'});
  if(!ok) return;
  const items=(labData(curLab).items||[]).filter((_,idx)=>idx!==i);
  const obj={items,groups:labGroupList(labData(curLab)),verifiedAt:todayISO()};
  labInstruments[curLab]={...obj,updatedBy:getCurrentUser()};
  renderLabView();
  await afterMutation(()=>saveLabRow(curLab,obj),{k:'saveLab',labId:curLab,data:obj});
  toast('Instrument deleted','success');
}



async function labVerify(){
  const ok=await confirmModal('Confirm '+curLab+' is still correct with no changes? This records today as the last-checked date.',{title:'Mark as checked',okText:'Yes, still current'});
  if(!ok) return;
  const d=labData(curLab);
  const obj={items:d.items||[],groups:labGroupList(d),verifiedAt:todayISO()};
  labInstruments[curLab]={...obj,updatedBy:getCurrentUser()};
  renderLabView();
  await afterMutation(()=>saveLabRow(curLab,obj),{k:'saveLab',labId:curLab,data:obj});
  toast('Marked as checked today','success');
}



function labPasteHtml(){
  return `<div class="lab-paste">
    <div class="lab-paste-h"><i class="ti ti-clipboard-text" aria-hidden="true"></i> First-time setup — paste your instrument list</div>
    <div class="lab-paste-sub">Only shown while this lab is empty. Paste a "name: value" list once to fill the table; after that, edit each item with its edit icon.</div>
    <textarea id="lab-paste-txt" class="lab-paste-txt" placeholder="ACQUA Version: 6.2.210&#10;Labcore Version: 3.12.10&#10;3Pass Version: 2.2.300.21853"></textarea>
    <div class="lab-paste-cat"><label for="lab-paste-group">Import into category</label>
      <input type="text" id="lab-paste-group" placeholder="optional — e.g. Teams"></div>
    <button class="btn" onclick="labParsePreview()" style="margin-top:8px"><i class="ti ti-wand" aria-hidden="true"></i> Preview</button>
    <div id="lab-parse-out">${_labParsed?labParsedHtml():''}</div>
  </div>`;
}



function labParsePreview(){
  const txt=(document.getElementById('lab-paste-txt')||{}).value||'';
  const cur=labData(curLab).items||[];
  const parsed=[];
  txt.split(/\r?\n/).forEach(line=>{
    const m=line.match(/^\s*([^:]+?):\s*(.+?)\s*$/);
    if(!m) return;
    const name=m[1].trim(), value=m[2].trim();
    if(!name||!value) return;
    const match=labMatchItem(cur,name);
    let status='new', oldVer='';
    if(match){
      oldVer=match.version||extractVersion(match.value);
      status=(match.value||'').trim()===value?'same':'changed';
    }
    parsed.push({name,value,version:extractVersion(value),status,oldVer,matchName:match?match.name:null});
  });
  _labParsed=parsed;
  const out=document.getElementById('lab-parse-out');
  if(out) out.innerHTML=labParsedHtml();
}



function labMatchItem(items,name){
  const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const k=norm(name), kw=k.split(' ')[0];
  return items.find(it=>{ const n=norm(it.name); return n===k||n.startsWith(k)||k.startsWith(n)||(kw.length>=3&&n.split(' ')[0]===kw); })||null;
}



function labParsedHtml(){
  if(!_labParsed) return '';
  if(!_labParsed.length) return '<div class="lab-empty" style="margin-top:10px">No "name: value" lines detected.</div>';
  const changed=_labParsed.filter(p=>p.status!=='same');
  const rows=_labParsed.map(p=>{
    const badge=p.status==='new'?'<span class="lab-badge lf-warn">new</span>':p.status==='changed'?'<span class="lab-badge lf-ok">changed</span>':'<span class="lab-badge lf-none">same</span>';
    const ver=p.status==='changed'?`<span class="lab-chg-old">${esc(p.oldVer||'—')}</span> → <span class="lab-chg-new">${esc(p.version||'—')}</span>`:esc(p.version||'—');
    return `<div class="lab-parse-row">${badge}<span class="lab-parse-name">${esc(p.name)}</span><span class="lab-parse-ver">${ver}</span></div>`;
  }).join('');
  return `<div class="lab-parse-panel">
    <div class="lab-parse-sum">${changed.length} change${changed.length===1?'':'s'} detected (${_labParsed.length} line${_labParsed.length===1?'':'s'} parsed)</div>
    ${rows}
    <button class="btn primary" onclick="labApplyParsed()" style="margin-top:10px"><i class="ti ti-arrow-down-to-arc" aria-hidden="true"></i> Apply to list &amp; save</button>
  </div>`;
}



async function labApplyParsed(){
  if(!_labParsed||!_labParsed.length) return;
  const impGroup=((document.getElementById('lab-paste-group')||{}).value||'').trim();
  const cur=(labData(curLab).items||[]).map(it=>({...it}));
  const byName={}; cur.forEach(it=>{ byName[(it.name||'').toLowerCase()]=it; });
  _labParsed.forEach(p=>{
    const target=p.matchName?byName[p.matchName.toLowerCase()]:null;
    if(target){
      if((target.value||'').trim()!==p.value){ target.value=p.value; target.version=p.version; target.changedAt=todayISO(); }
    }else{
      const it={name:p.name,value:p.value,group:impGroup,version:p.version,changedAt:todayISO()};
      cur.push(it); byName[p.name.toLowerCase()]=it;
    }
  });
  const groups=labGroupList(labData(curLab));
  if(impGroup&&!groups.includes(impGroup)) groups.push(impGroup);
  const obj={items:labNormalizeOrder(cur,groups),groups,verifiedAt:todayISO()};
  labInstruments[curLab]={...obj,updatedBy:getCurrentUser()};
  _labParsed=null; _labEdit=null; renderLabView();
  await afterMutation(()=>saveLabRow(curLab,obj),{k:'saveLab',labId:curLab,data:obj});
  toast('Applied report to lab instruments','success');
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  DEFAULT_LAB_GROUPS, _labCatEdit, _labEdit, _labReorder, closeLabMenu, curLab,
  labAddCategory, labAddInstrument, labApplyParsed, labBack, labCancelReorder, labCatCancel,
  labCatEditHtml, labCatSave, labData, labDeleteCategory, labDeleteRow, labDragEnd,
  labDragOver, labDragStart, labDrop, labDropOnGroup, labEditRow, labEditRowHtml,
  labFreshness, labGripDown, labGripUp, labGroupHeadHtml, labGroupList, labGroupsOf,
  labIndexesIn, labItemGroup, labLastChanged, labMatchItem, labMoveGroup, labMoveMenu,
  labMoveRow, labMoveToCategory, labNormalizeOrder, labParsePreview, labParsedHtml,
  labPasteHtml, labRenameCategory, labReorderRowHtml, labRowCancel, labRowHtml, labRowSave,
  labSaveReorder, labSectionsHtml, labStartReorder, labVerify, openLab, renderLabDetail,
  renderLabList, renderLabView
};
