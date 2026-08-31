import { PLATFORMS, PLAT_NAMES, UPDATE_SUBTYPES, catDef, catDisplay, catHasChildren, getTypesForPlat, recordSampleValues, sampleOptsFor } from '../domain/platforms.js';
import { curP } from '../state.js';
import { esc, qv } from '../utils/format.js';
import { renderList } from '../views/platformTracking.js';

function fillTypeFilter(){
  const sel=document.getElementById('q-type');
  if(!sel) return;
  const prev=sel.value;
  let opts='<option value="">All Types</option>';
  const allTypes=getTypesForPlat(curP==='all'?'':curP,(document.getElementById('q-cat')||{}).value||'');
  allTypes.forEach(t=>{opts+=`<option value="${t.v}">${t.lbl}</option>`;});
  sel.innerHTML=opts;
  if([...sel.options].some(o=>o.value===prev)) sel.value=prev; else sel.value='';
  refreshFilterMenus();
}



function fillSampleFilter(){
  const sel=document.getElementById('q-sample');
  if(!sel) return;
  const prev=sel.value;
  const qcat=(document.getElementById('q-cat')||{}).value||'';
  const m=new Map();
  const add=t=>{if(!m.has(t.v)) m.set(t.v,t);};
  const addAllOf=p=>{
    const cfg=PLATFORMS[p]||{};
    (cfg.samples||[]).forEach(add);
    (cfg.categories||[]).forEach(c=>(c.samples||[]).forEach(add));
  };
  if(curP==='all') PLAT_NAMES.forEach(addAllOf);
  else if(qcat) sampleOptsFor(curP,qcat).forEach(add);
  else addAllOf(curP);
  const list=[...m.values()];
  // 該平台/分類沒有樣品類型時（如 Lenovo）整個篩選器隱藏
  const dd=document.getElementById('q-sample-dd');
  if(dd) dd.style.display=list.length?'':'none';
  sel.innerHTML='<option value="">All Sample Types</option>'+list.map(t=>`<option value="${t.v}">${esc(t.l)}</option>`).join('');
  if(list.length&&[...sel.options].some(o=>o.value===prev)) sel.value=prev; else sel.value='';
  refreshFilterMenus();   // options are built here, so the menu must be rebuilt after
}



function fillCatFilter(){
  const sel=document.getElementById('q-cat');
  if(!sel) return;
  const prev=sel.value;
  let opts='<option value="">All Categories</option>';
  if(curP!=='all'&&PLATFORMS[curP]){
    PLATFORMS[curP].categories.forEach(c=>{opts+=`<option value="${c.v}">${c.l}</option>`;});
  }
  sel.innerHTML=opts;
  if([...sel.options].some(o=>o.value===prev)) sel.value=prev; else sel.value='';
  fillSubcatFilter();
  refreshFilterMenus();
}



function fillSubcatFilter(){
  const wrap=document.getElementById('q-subcat-wrap');
  const sel=document.getElementById('q-subcat');
  const qcat=(document.getElementById('q-cat')||{}).value||'';
  // 只有當特定平台被選中、且該 category 有子分類時才顯示
  const show=curP!=='all'&&!!qcat&&catHasChildren(curP,qcat);
  if(wrap) wrap.classList.toggle('visible',show);
  if(!sel) return;
  if(!show){sel.value='';return;}
  const prev=sel.value;
  const cat=PLATFORMS[curP]?.categories?.find(x=>x.v===qcat);
  let opts='<option value="">All</option>';
  (cat?.children||[]).forEach(ch=>{opts+=`<option value="${ch.v}">${ch.l}</option>`;});
  sel.innerHTML=opts;
  if([...sel.options].some(o=>o.value===prev)) sel.value=prev; else sel.value='';
}



function onCatFilterChange(){
  fillSubcatFilter();
  fillTypeFilter();
  fillSampleFilter();
  refreshFilterMenus();
  renderList();
}



function onTypeFilterChange(){
  const t=(document.getElementById('q-type')||{}).value||'';
  const s=document.getElementById('q-subtype-update');
  if(t!=='update'&&s) s.value='';
  refreshFilterMenus();
  renderList();
}




function filterMenuItem(label,active,onclick,children){
  const kids=children&&children.length
    ? `<div class="dd-sub">${children.map(c=>
        `<button type="button" class="${c.active?'active':''}" onclick="${c.onclick}">${esc(c.label)}</button>`).join('')}</div>`
    : '';
  return `<div class="dd-item${children&&children.length?' has-sub':''}">
    <button type="button" class="${active?'active':''}" onclick="${onclick}">${esc(label)}${children&&children.length?'<i class="ti ti-chevron-right dd-arrow" aria-hidden="true"></i>':''}</button>
    ${kids}</div>`;
}



function renderCatMenu(){
  const menu=document.getElementById('q-cat-menu'), lbl=document.getElementById('q-cat-lbl');
  if(!menu) return;
  const cur=qv('q-cat'), curSub=qv('q-subcat');
  const cats=(curP!=='all'&&PLATFORMS[curP])?PLATFORMS[curP].categories:[];
  let html=filterMenuItem('All Categories',!cur,"pickCat('','')");
  cats.forEach(c=>{
    const kids=(c.children||[]).map(ch=>({
      label:ch.l,active:cur===c.v&&curSub===ch.v,
      onclick:`pickCat('${c.v.replace(/'/g,"\\'")}','${ch.v.replace(/'/g,"\\'")}')`
    }));
    if(kids.length) kids.unshift({label:'All '+c.l,active:cur===c.v&&!curSub,onclick:`pickCat('${c.v.replace(/'/g,"\\'")}','')`});
    html+=filterMenuItem(c.l,cur===c.v&&!curSub,`pickCat('${c.v.replace(/'/g,"\\'")}','')`,kids);
  });
  menu.innerHTML=html||'<div class="dd-empty">Pick a platform first</div>';
  if(lbl){
    const c=cats.find(x=>x.v===cur);
    const ch=c&&(c.children||[]).find(x=>x.v===curSub);
    lbl.textContent=!c?'All Categories':(ch?(c.l+' › '+ch.l):c.l);
  }
  const dd=document.getElementById('q-cat-dd'); if(dd) dd.classList.toggle('is-set',!!cur);
}



function renderTypeMenu(){
  const menu=document.getElementById('q-type-menu'), lbl=document.getElementById('q-type-lbl');
  if(!menu) return;
  const cur=qv('q-type'), curSub=qv('q-subtype-update');
  const types=getTypesForPlat(curP==='all'?'':curP,qv('q-cat'));
  let html=filterMenuItem('All Types',!cur,"pickType('','')");
  types.forEach(t=>{
    const kids=t.v==='update'?UPDATE_SUBTYPES.map(s=>({
      label:s.l,active:cur==='update'&&curSub===s.v,onclick:`pickType('update','${s.v}')`
    })):[];
    if(kids.length) kids.unshift({label:'All Update Types',active:cur==='update'&&!curSub,onclick:"pickType('update','')"});
    html+=filterMenuItem(t.lbl,cur===t.v&&!curSub,`pickType('${t.v.replace(/'/g,"\\'")}','')`,kids);
  });
  menu.innerHTML=html;
  if(lbl){
    const t=types.find(x=>x.v===cur);
    const s=cur==='update'?UPDATE_SUBTYPES.find(x=>x.v===curSub):null;
    lbl.textContent=!t?'All Types':(s?(t.lbl+' › '+s.l):t.lbl);
  }
  const dd=document.getElementById('q-type-dd'); if(dd) dd.classList.toggle('is-set',!!cur);
}



// Single-level filters build their menu straight from the hidden select's options,
// so every filter in the bar looks and behaves the same with no duplicated labels
function renderSelectMenu(selId,ddId,menuId,lblId){
  const sel=document.getElementById(selId), menu=document.getElementById(menuId), lbl=document.getElementById(lblId);
  if(!sel||!menu) return;
  const cur=sel.value, opts=[...sel.options];
  // Options may not be built yet on first paint — leave the label rather than blanking it
  if(!opts.length){ menu.innerHTML='<div class="dd-empty">Nothing to filter by</div>'; return; }
  menu.innerHTML=opts.map(o=>filterMenuItem(o.textContent,cur===o.value,
    `pickSelect('${selId}','${String(o.value).replace(/'/g,"\\'")}')`)).join('');
  if(lbl) lbl.textContent=(opts.find(o=>o.value===cur)||opts[0]).textContent;
  const dd=document.getElementById(ddId); if(dd) dd.classList.toggle('is-set',!!cur);
}



function pickSelect(selId,val){
  const sel=document.getElementById(selId); if(!sel) return;
  sel.value=val;
  closeFilterMenus(); refreshFilterMenus(); renderList();
}



function refreshFilterMenus(){
  renderCatMenu(); renderTypeMenu();
  renderSelectMenu('q-sample','q-sample-dd','q-sample-menu','q-sample-lbl');
  renderSelectMenu('q-stat','q-stat-dd','q-stat-menu','q-stat-lbl');
}



function closeFilterMenus(){ document.querySelectorAll('.dropdown.open').forEach(d=>d.classList.remove('open')); }



function pickCat(cat,sub){
  const c=document.getElementById('q-cat'); if(c) c.value=cat;
  const s=document.getElementById('q-subcat'); if(s) s.value=sub||'';
  closeFilterMenus();
  fillTypeFilter(); fillSampleFilter();
  // fillSubcatFilter() rebuilds q-subcat's options, so re-apply the chosen child
  fillSubcatFilter();
  if(s&&sub) s.value=sub;
  refreshFilterMenus();
  renderList();
}



function pickType(type,sub){
  const t=document.getElementById('q-type'); if(t) t.value=type;
  const s=document.getElementById('q-subtype-update'); if(s) s.value=(type==='update'?(sub||''):'');
  closeFilterMenus();
  refreshFilterMenus();
  renderList();
}




function applyRecordFilters(list){
  let d=[...list];
  const qs=(document.getElementById('q-s')||{}).value||'';
  const qt=(document.getElementById('q-type')||{}).value||'';
  const qcat=(document.getElementById('q-cat')||{}).value||'';
  const qsub=(document.getElementById('q-subcat')||{}).value||'';
  if(qs) d=d.filter(r=>(r.title||'').toLowerCase().includes(qs.toLowerCase())||(r.id||'').includes(qs)||catDisplay(r).toLowerCase().includes(qs.toLowerCase()));
  if(qt) d=d.filter(r=>r.type===qt);
  const qsub_update=(document.getElementById('q-subtype-update')||{}).value||'';
  if(qt==='update'&&qsub_update) d=d.filter(r=>r.updateSubtype===qsub_update);
  if(qcat){
    d=d.filter(r=>r.category===qcat);
    if(qsub&&catHasChildren(curP,qcat)) d=d.filter(r=>r.subCategory===qsub);
  }
  const qsample=(document.getElementById('q-sample')||{}).value||'';
  if(qsample) d=d.filter(r=>recordSampleValues(r).includes(qsample));
  return sortRecords(d);
}



let curSort='created-desc';



function setSort(v){
  curSort=v;
  document.querySelectorAll('#sort-menu button').forEach(b=>b.classList.toggle('active',b.dataset.sort===v));
  renderList();
}



function sortRecords(list){
  const s=curSort||'created-desc';
  const arr=[...list];
  const t=v=>new Date(v||0).getTime()||0;
  const ck=r=>t(r.createdTs||r.created);                                   // creation key (full ts if available, else date)
  const idn=(a,b)=>String(a.id||'').localeCompare(String(b.id||''),undefined,{numeric:true}); // TM-006 > TM-005
  switch(s){
    case 'created-asc': arr.sort((a,b)=>ck(a)-ck(b)||idn(a,b)); break;
    case 'updated-desc': arr.sort((a,b)=>t(b.updated||b.created)-t(a.updated||a.created)||idn(b,a)); break;
    case 'title-asc': arr.sort((a,b)=>(a.title||'').localeCompare(b.title||'')||idn(a,b)); break;
    case 'platform': arr.sort((a,b)=>(a.platform||'').localeCompare(b.platform||'')||ck(b)-ck(a)||idn(b,a)); break;
    default: arr.sort((a,b)=>ck(b)-ck(a)||idn(b,a)); // created-desc (newest first)
  }
  return arr;
}



function catOptsHtml(plat,selCat,selSub){
  const cfg=PLATFORMS[plat];
  if(!cfg||!cfg.categories.length) return '<option value="">— No subcategory —</option>';
  return cfg.categories.map(c=>{
    const sel=(selCat||catDef(plat))===c.v?'selected':'';
    return `<option value="${c.v}" ${sel}>${c.l}</option>`;
  }).join('');
}



function subcatOptsHtml(plat,cat,selSub){
  const c=PLATFORMS[plat]?.categories?.find(x=>x.v===cat);
  if(!c?.children) return '';
  return c.children.map(ch=>`<option value="${ch.v}" ${(selSub||'')===ch.v?'selected':''}>${ch.l}</option>`).join('');
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  applyRecordFilters, catOptsHtml, closeFilterMenus, curSort, fillCatFilter,
  fillSampleFilter, fillSubcatFilter, fillTypeFilter, filterMenuItem, onCatFilterChange,
  onTypeFilterChange, pickCat, pickSelect, pickType, refreshFilterMenus, renderCatMenu,
  renderSelectMenu, renderTypeMenu, setSort, sortRecords, subcatOptsHtml
};
