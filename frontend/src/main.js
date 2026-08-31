import { fillCatFilter, fillSampleFilter, fillTypeFilter } from './components/filters.js';
import { toast } from './components/ui.js';
import { purgeStoredPassword } from './services/auth.js';
import { load } from './services/db.js';
import { setLoadingPlaceholder, setRedraw } from './services/hooks.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, authStorage } from './services/supabase.js';
import { curProjectId, currentLoginEmail, records, sb, setCurrentLoginEmailValue, setSb, setViewMode, viewMode } from './state.js';
import { renderLabView } from './views/labInstruments.js';
import { SESSION_MAX_MIN, enterAppIfApproved, initSwipeBack, loginBusy, showApp, showLogin, startIdleTimer, updateLoginFileWarn } from './views/login.js';
import { cancelForm, render, showForm, skeletonCards } from './views/platformTracking.js';
import { cancelProjForm, renderProjectView, showLogForm, showProjectForm } from './views/projectLog.js';

/* Entry point. The markup loads this and nothing else.

   What lives here is the wiring rather than any feature: the theme, initApp, the
   global keyboard and history listeners, and the callback the data layer calls
   when records change. That callback is the if/else that used to sit inline in
   both load() and the realtime handler - services must not import views, so the
   decision moved here instead of being duplicated. */

/* ===== Light / dark theme ===== */
function applyTheme(t){
  const dark=(t!=='light');
  document.documentElement.setAttribute('data-theme',dark?'dark':'light');
  const btn=document.getElementById('theme-toggle');
  if(btn){ btn.innerHTML=`<i class="ti ti-${dark?'moon':'sun'}" aria-hidden="true"></i>`; btn.title=dark?'Switch to light mode':'Switch to dark mode'; }
}


function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme');
  const next=cur==='light'?'dark':'light';
  try{localStorage.setItem('aclab_theme',next);}catch(e){}
  applyTheme(next);
}
applyTheme(localStorage.getItem('aclab_theme')==='light'?'light':'dark');



async function initApp(){
  purgeStoredPassword();   // before anything else, so a failure later still clears it
  if(!window.supabase){toast('Failed to load Supabase JS. Please check your connection to cdn.jsdelivr.net.','error',5000);return;}
  setSb(window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storage:authStorage}
  }));
  updateLoginFileWarn();
  const _d=new Date();const _days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];document.getElementById('date-lbl').textContent=_d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+_days[_d.getDay()];
  /* Reopening within SESSION_MAX_MIN skips the login screen. The idle timer only
     runs while a tab is open, so this is what covers a closed laptop: eight hours
     carries one working day and expires overnight, which matters on a shared
     machine. (It read 1440 — a day — under a comment claiming ten minutes.) */
  sb.auth.getSession().then(({data:{session}})=>{
    const savedAt=parseInt(localStorage.getItem('aclab_login_at')||sessionStorage.getItem('aclab_login_at')||'0');
    const elapsed=(Date.now()-savedAt)/1000/60;
    if(session&&savedAt>0&&elapsed<SESSION_MAX_MIN){
      setCurrentLoginEmailValue(session.user.email);
      enterAppIfApproved(currentLoginEmail).then(ok=>{
        if(!ok) return;
        showApp();
        load();
        startIdleTimer();
        initSwipeBack();
      });
    } else {
      if(session) sb.auth.signOut();
      showLogin();
    }
  });
  sb.auth.onAuthStateChange((event)=>{
    if(event==='SIGNED_OUT'&&!loginBusy) showLogin();
  });
  initHistoryGuard();
}


function switchMode(m){
  setViewMode(m);
  document.querySelectorAll('.mode-tab').forEach(t=>{
    t.classList.toggle('active',t.dataset.mode===m);
  });
  document.getElementById('view-platform').hidden=(m!=='platform');
  document.getElementById('view-project').hidden=(m!=='project');
  document.getElementById('view-lab').hidden=(m!=='lab');
  if(m==='platform') render();
  else if(m==='lab') renderLabView();
  else renderProjectView();
}



/* ===== Keyboard shortcuts ===== */
function isTyping(el){ return el && (el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT'||el.isContentEditable); }


function focusSearch(){ const el=viewMode==='project'?document.getElementById('pq-s'):document.getElementById('q-s'); if(el&&el.offsetParent!==null){ el.focus(); if(el.select) el.select(); } }


function newForContext(){ if(viewMode==='project'){ if(curProjectId) showLogForm(); else showProjectForm(); } else showForm(); }


function showShortcuts(){
  if(document.getElementById('shortcuts-modal')) return;
  const ov=document.createElement('div'); ov.className='modal-overlay'; ov.id='shortcuts-modal';
  const row=(k,d)=>`<div class="kbd-row"><span class="kbd">${k}</span><span>${d}</span></div>`;
  ov.innerHTML=`<div class="modal-card" role="dialog" aria-modal="true" style="max-width:420px">
    <div class="modal-title">Keyboard shortcuts</div>
    <div style="margin:6px 0 18px">
      ${row('/','Focus search')}
      ${row('n','New record / log')}
      ${row('Esc','Close form or dialog')}
      ${row('?','Show this help')}
    </div>
    <div class="modal-actions"><button type="button" class="btn" id="kbd-done">Done</button></div>
  </div>`;
  document.body.appendChild(ov);
  const close=()=>{ ov.classList.remove('show'); setTimeout(()=>ov.remove(),200); };
  ov.addEventListener('click',e=>{ if(e.target===ov) close(); });
  ov.querySelector('#kbd-done').onclick=close;
  requestAnimationFrame(()=>ov.classList.add('show'));
}
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey) return;
  const appMain=document.getElementById('app-main');
  if(!appMain||appMain.hidden) return;                         // only inside the app
  if(e.key==='Escape'){
    const sm=document.getElementById('shortcuts-modal'); if(sm){ sm.remove(); return; }
    if(document.querySelector('.dropdown.open')){ document.querySelectorAll('.dropdown.open').forEach(d=>d.classList.remove('open')); return; }
    const fa=document.getElementById('form-area'); if(fa&&fa.innerHTML.trim()){ cancelForm(); return; }
    const pfa=document.getElementById('proj-form-area'); if(pfa&&pfa.innerHTML.trim()){ cancelProjForm(); return; }
    return;
  }
  if(isTyping(document.activeElement)) return;
  if(e.key==='/'){ e.preventDefault(); focusSearch(); }
  else if(e.key==='n'){ e.preventDefault(); newForContext(); }
  else if(e.key==='?'){ e.preventDefault(); showShortcuts(); }
});



// 確保頁面一載入時就有一個基底歷史紀錄（防止第一次右滑關閉頁面）
function initHistoryGuard(){
  if(!history.state||!history.state.aclab){
    history.replaceState({aclab:'root'},'');
    history.pushState({aclab:'list-guard'},'');
  }
}



/* Wiring, kept next to the entry point rather than inside any one view. */
setRedraw(()=>{
  if(viewMode==='project') renderProjectView();
  else if(viewMode==='lab') renderLabView();
  else { fillCatFilter(); fillTypeFilter(); fillSampleFilter(); render(); }
});
setLoadingPlaceholder(()=>{
  const la=document.getElementById('list-area');
  if(la&&!records.length) la.innerHTML=skeletonCards(4);
});

/* ---- window bridge ---- 
   The markup calls handlers by name from inline on* attributes, which resolve
   against window - and a module has its own scope. Before this file was split
   every top-level function was already a window property, so this restores what
   the markup has always been calling, without a list that can be wrong: the
   filter menus build "pickCat('x')" as a string, and no attribute scan finds it.

   Scaffolding. Entries disappear as each view moves to delegated listeners. */
import * as components_certGauge from './components/certGauge.js';
import * as components_filters from './components/filters.js';
import * as components_guards from './components/guards.js';
import * as components_productFields from './components/productFields.js';
import * as components_recordCard from './components/recordCard.js';
import * as components_ui from './components/ui.js';
import * as components_uploaders from './components/uploaders.js';
import * as domain_archive from './domain/archive.js';
import * as domain_certification from './domain/certification.js';
import * as domain_permissions from './domain/permissions.js';
import * as domain_platforms from './domain/platforms.js';
import * as domain_products from './domain/products.js';
import * as domain_records from './domain/records.js';
import * as domain_software from './domain/software.js';
import * as export_reports from './export/reports.js';
import * as services_auth from './services/auth.js';
import * as services_db from './services/db.js';
import * as services_hooks from './services/hooks.js';
import * as services_push from './services/push.js';
import * as services_storage from './services/storage.js';
import * as services_supabase from './services/supabase.js';
import * as state from './state.js';
import * as utils_dates from './utils/dates.js';
import * as utils_download from './utils/download.js';
import * as utils_format from './utils/format.js';
import * as views_labInstruments from './views/labInstruments.js';
import * as views_login from './views/login.js';
import * as views_platformTracking from './views/platformTracking.js';
import * as views_projectLog from './views/projectLog.js';
import * as tests_selfCheck from '../../tests/selfCheck.js';
Object.assign(window, components_certGauge, components_filters, components_guards, components_productFields, components_recordCard, components_ui, components_uploaders, domain_archive, domain_certification, domain_permissions, domain_platforms, domain_products, domain_records, domain_software, export_reports, services_auth, services_db, services_hooks, services_push, services_storage, services_supabase, state, utils_dates, utils_download, utils_format, views_labInstruments, views_login, views_platformTracking, views_projectLog, tests_selfCheck);
Object.assign(window, { applyTheme, focusSearch, initApp, initHistoryGuard, isTyping, newForContext, showShortcuts, switchMode, toggleTheme });
/* ---- end window bridge ---- */

initApp();

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  applyTheme, focusSearch, initApp, initHistoryGuard, isTyping, newForContext, showShortcuts,
  switchMode, toggleTheme
};
