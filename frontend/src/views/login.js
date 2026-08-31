import { confirmModal, toast } from '../components/ui.js';
import { LOGIN_EMAIL_KEY, REMEMBER_CREDS_KEY, getCurrentEmail, getCurrentUser, purgeStoredPassword, setCurrentLoginEmail } from '../services/auth.js';
import { load } from '../services/db.js';
import { pushSupported, updateNotifyBtn } from '../services/push.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../services/supabase.js';
import { allowedUsersCache, curProjectId, myApproval, records, sb, setAllowedUsersCache, setMyApproval } from '../state.js';
import { nowISO } from '../utils/dates.js';
import { esc, fmtUser } from '../utils/format.js';
import { backToProjectList } from './projectLog.js';

let loginBusy=false;




function setLoginMsg(text,kind){
  const el=document.getElementById('login-err');
  if(!el) return;
  el.textContent=text||'';
  if(!text){
    el.className='login-err'; // display:none via CSS when no extra class
  } else {
    el.className='login-err'+(kind==='ok'?' ok':kind==='busy'?' busy':' err');
  }
}



function loginErrorMessage(e){
  const msg=String(e?.message||e||'').toLowerCase();
  if(msg.includes('invalid login credentials')||msg.includes('invalid_credentials'))
    return 'Incorrect email or password. Check: (1) User exists in Supabase → Authentication → Users; (2) You are using the Email (not a name); (3) Password matches.';
  if(msg.includes('email not confirmed'))
    return 'Email not confirmed. When creating the user in Supabase, check "Auto Confirm User", or confirm manually in Authentication → Users.';
  if(msg.includes('failed to fetch')||msg.includes('network'))
    return 'Cannot connect to Supabase. Please check your internet connection. If opening HTML directly, use http://localhost instead.';
  if(msg.includes('user banned'))
    return 'This account has been disabled. Please contact your admin.';
  return e?.message||String(e)||'Login failed';
}



function updateLoginFileWarn(){
  const el=document.getElementById('login-file-warn');
  if(!el) return;
  if(location.protocol==='file:'){
    el.style.display='block';
    // Unreachable in practice - a module does not load over file:// at all, so the
    // classic script in the login markup is what actually shows this. Kept as a
    // backstop in case the page is ever served as a classic script again.
    el.innerHTML='Opened as a local file (file://). Run <b>aclab-start.bat</b> and use <b>http://127.0.0.1:8765/</b> instead.';
  }else el.style.display='none';
}



async function testSupabaseConnection(){
  if(!sb){setLoginMsg('Cloud service is not available right now.','');return;}
  setLoginMsg('Testing connection…','busy');
  try{
    const hr=await fetch(SUPABASE_URL+'/auth/v1/health',{headers:{apikey:SUPABASE_ANON_KEY}});
    if(!hr.ok) throw new Error('unavailable');
    const {error}=await sb.from('records').select('id').limit(1);
    if(error){
      const m=String(error.message||'');
      if(error.code==='42501'||/permission|policy|jwt/i.test(m)){
        setLoginMsg('Connected. Please sign in with your account.','ok');
        return;
      }
      throw new Error('unavailable');
    }
    setLoginMsg('Connection OK. Please sign in with your account.','ok');
  }catch(e){
    setLoginMsg('Cloud service is temporarily unavailable. Please try again later.','');
  }
}




function showLogin(){
  document.getElementById('login-screen').hidden=false;
  document.getElementById('app-main').hidden=true;
  // 確保顯示登入面板而非註冊面板
  const lc=document.querySelector('#login-screen .login-card');
  const rc=document.getElementById('register-card');
  if(lc) lc.style.display='';
  if(rc) rc.style.display='none';
  const remember=(localStorage.getItem(REMEMBER_CREDS_KEY)==='1');
  const cb=document.getElementById('remember-creds');
  if(cb) cb.checked=remember;

  const em=document.getElementById('login-email');
  const pw=document.getElementById('login-pass');
  if(em) em.value=remember?(localStorage.getItem(LOGIN_EMAIL_KEY)||''):'';
  if(pw) pw.value='';   // never refilled — autocomplete="current-password" hands this to the browser
  setLoginMsg('','');
  updateLoginFileWarn();
}



function showApp(){
  document.getElementById('login-screen').hidden=true;
  document.getElementById('app-main').hidden=false;
  if(pushSupported()) updateNotifyBtn();
  updateAdminBtn();
}



/* ===== Account approval =====
   RLS is the real gate (see aclab-approval-setup.sql); these screens exist so an
   unapproved user gets a clear explanation instead of an empty, broken app. */



async function loadMyApproval(){
  setMyApproval({approved:false,isAdmin:false,known:false});
  if(!sb) return myApproval;
  const email=getCurrentEmail();
  if(!email) return myApproval;
  try{
    const {data,error}=await sb.from('allowed_users').select('approved,is_admin').eq('email',email).maybeSingle();
    if(error) throw error;
    setMyApproval({approved:!!(data&&data.approved),isAdmin:!!(data&&data.is_admin),known:true,exists:!!data});
  }catch(e){
    // Table missing = approval not deployed yet; keep the app usable as before
    if(/relation .*allowed_users.* does not exist|schema cache/i.test(e.message||'')){
      setMyApproval({approved:true,isAdmin:false,known:false,legacy:true});
    }else console.warn('approval check failed',e);
  }
  return myApproval;
}



// Record a pending request for a brand-new account (self-approval is blocked by RLS)
async function requestApproval(email){
  if(!sb) return;
  try{ await sb.from('allowed_users').insert({email:(email||'').trim().toLowerCase()}); }
  catch(e){ /* already requested, or table not deployed — nothing to do */ }
}



function showPendingScreen(email){
  document.getElementById('app-main').hidden=true;
  document.getElementById('login-screen').hidden=false;
  const lc=document.querySelector('#login-screen .login-card');
  if(lc) lc.style.display='none';
  const rc=document.getElementById('register-card'); if(rc) rc.style.display='none';
  const pc=document.getElementById('pending-card'); if(pc) pc.style.display='';
  const el=document.getElementById('pending-email'); if(el) el.textContent=email||getCurrentEmail()||'—';
}



async function recheckApproval(){
  const btn=document.getElementById('pending-refresh');
  const err=document.getElementById('pending-err');
  if(btn){btn.disabled=true;btn.textContent='Checking…';}
  if(err){err.textContent='';err.className='login-err';}
  await loadMyApproval();
  if(myApproval.approved){ showLoginPanel(); showApp(); startIdleTimer(); initSwipeBack(); await load(); return; }
  if(err){ err.textContent='Still waiting for an administrator to approve this account.'; err.className='login-err'; }
  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-refresh" aria-hidden="true"></i> Check again';}
}



// Returns true when the app may be entered
async function enterAppIfApproved(email){
  await loadMyApproval();
  if(myApproval.approved) return true;
  showPendingScreen(email);
  return false;
}




/* ---- Admin: approve / revoke accounts ---- */
async function fetchAllowedUsers(){
  const {data,error}=await sb.from('allowed_users')
    .select('email,approved,is_admin,requested_at,approved_at,approved_by').order('email');
  if(error) throw error;
  return data||[];
}


/* One field, two shapes. Everyone else is pinned to the account they signed in
   with, so the name on a record is a fact rather than something typed. The admin
   gets a picker instead, because filing on behalf of someone who is mid-test is a
   real need - but a picker, not a text box, so the override stays inside the same
   canonical set of names.

   Locking the input is a data-quality control and not a permission: the table is
   still writable through the API by anyone signed in. What it buys is that Ted,
   Ted Huang and ted.huang stop being three different engineers to whatever ends
   up counting this. The stored value is the mail local-part, which is what
   getCurrentUser has always written, so nothing existing has to be rewritten. */



function allowedUserNames(){
  return (allowedUsersCache||[])
    .filter(u=>u.approved)
    .map(u=>String(u.email||'').split('@')[0].trim())
    .filter(Boolean);
}



function identityOptions(val){
  // A legacy free-text value is kept as its own option: dropping it would silently
  // reassign the record to whoever happens to sort first
  const names=[...new Set(allowedUserNames().concat(val?[val]:[]))];
  names.sort((a,b)=>fmtUser(a).localeCompare(fmtUser(b)));
  return names.map(n=>`<option value="${esc(n)}" ${n===val?'selected':''}>${esc(fmtUser(n))}</option>`).join('');
}



function identityFieldHtml(id,label,current){
  const val=String(current||getCurrentUser()||'').trim();
  if(!myApproval.isAdmin){
    return `<label>${label}</label>
      <div class="lf-fixed" id="${id}" data-val="${esc(val)}" title="Taken from the account you signed in with">${esc(fmtUser(val))||'—'}</div>`;
  }
  return `<label for="${id}">${label}</label>
    <select id="${id}" data-identity="1">${identityOptions(val)}</select>`;
}



function readIdentity(id,fallback){
  const el=document.getElementById(id);
  if(!el) return fallback;
  const v=String(el.tagName==='SELECT'?el.value:(el.dataset.val||'')).trim();
  return v||fallback;
}



/* The list normally arrives with updateAdminBtn at startup. If a form opens before
   that lands, the select still holds the right value and simply has fewer names in
   it, so this fills them in afterwards rather than blocking the form on a fetch. */
async function ensureAllowedUsers(){
  if(allowedUsersCache||!myApproval.isAdmin) return;
  try{ setAllowedUsersCache(await fetchAllowedUsers()); }catch(e){ return; }
  document.querySelectorAll('select[data-identity]').forEach(sel=>{
    sel.innerHTML=identityOptions(sel.value);
  });
}



async function updateAdminBtn(){
  const btn=document.getElementById('admin-users-btn');
  if(!btn) return;
  btn.hidden=!myApproval.isAdmin;
  if(!myApproval.isAdmin) return;
  try{
    setAllowedUsersCache(await fetchAllowedUsers());
    const pending=allowedUsersCache.filter(u=>!u.approved).length;
    const n=document.getElementById('admin-users-n');
    if(n){ n.textContent=pending?String(pending):''; n.hidden=!pending; }
    btn.classList.toggle('has-pending',pending>0);
    btn.title=pending?(pending+' account(s) waiting for approval'):'Approve accounts';
  }catch(e){}
}



function manageUsers(){
  if(!myApproval.isAdmin) return;
  const ov=document.createElement('div');
  ov.className='modal-overlay';
  ov.innerHTML=`<div class="modal-card" role="dialog" aria-modal="true" style="max-width:560px">
    <div class="modal-title">Account approvals</div>
    <div class="modal-msg" style="margin-bottom:12px">New sign-ups stay locked out until approved here. Revoking access takes effect immediately.</div>
    <div id="au-list" class="au-list"><div class="db-empty">Loading…</div></div>
    <div class="modal-actions"><button type="button" class="btn" id="au-done">Done</button></div>
  </div>`;
  document.body.appendChild(ov);
  const close=()=>{ ov.classList.remove('show'); setTimeout(()=>ov.remove(),200); updateAdminBtn(); };
  ov.addEventListener('click',e=>{ if(e.target===ov) close(); });
  ov.querySelector('#au-done').onclick=close;
  requestAnimationFrame(()=>ov.classList.add('show'));

  const me=getCurrentEmail();
  const draw=async()=>{
    const host=ov.querySelector('#au-list');
    let rows=[];
    try{ rows=await fetchAllowedUsers(); }
    catch(e){ host.innerHTML='<div class="db-empty">Could not load the list: '+esc(e.message||e)+'</div>'; return; }
    const pending=rows.filter(u=>!u.approved), active=rows.filter(u=>u.approved);
    const row=u=>{
      const self=u.email.toLowerCase()===me;
      return `<div class="au-row">
        <div class="au-who"><span class="au-mail">${esc(u.email)}</span>
          ${u.is_admin?'<span class="au-tag admin">admin</span>':''}
          ${self?'<span class="au-tag">you</span>':''}
          <span class="au-when">${u.approved?('approved '+esc((u.approved_at||'').slice(0,10))):('requested '+esc((u.requested_at||'').slice(0,10)))}</span>
        </div>
        <div class="au-act">
          ${u.approved
            ? `<button type="button" class="btn btn-danger-text" data-act="revoke" data-e="${esc(u.email)}"${self?' disabled title="You cannot revoke your own access"':''}>Revoke</button>`
            : `<button type="button" class="btn primary" data-act="approve" data-e="${esc(u.email)}">Approve</button>
               <button type="button" class="btn btn-danger-text" data-act="reject" data-e="${esc(u.email)}">Reject</button>`}
        </div>
      </div>`;
    };
    host.innerHTML=
      `<div class="au-sec">Pending (${pending.length})</div>`+
      (pending.length?pending.map(row).join(''):'<div class="db-empty">No pending requests</div>')+
      `<div class="au-sec">Approved (${active.length})</div>`+
      (active.length?active.map(row).join(''):'<div class="db-empty">Nobody approved yet</div>');
    host.querySelectorAll('button[data-act]').forEach(b=>b.onclick=async()=>{
      const email=b.dataset.e, act=b.dataset.act;
      if(act==='reject'&&!(await confirmModal('Reject and remove the request from '+email+'? They can apply again later.',{title:'Reject request',okText:'Reject',danger:true}))) return;
      if(act==='revoke'&&!(await confirmModal('Revoke access for '+email+'? They will be locked out immediately.',{title:'Revoke access',okText:'Revoke',danger:true}))) return;
      b.disabled=true;
      try{
        if(act==='approve'){
          const {error}=await sb.from('allowed_users').update({approved:true,approved_at:nowISO(),approved_by:getCurrentUser()}).eq('email',email);
          if(error) throw error;
          toast('Approved '+email,'success');
        }else if(act==='revoke'){
          const {error}=await sb.from('allowed_users').update({approved:false,approved_at:null,approved_by:getCurrentUser()}).eq('email',email);
          if(error) throw error;
          toast('Access revoked for '+email,'success');
        }else{
          const {error}=await sb.from('allowed_users').delete().eq('email',email);
          if(error) throw error;
          toast('Request rejected','success');
        }
      }catch(e){ toast(e.message||e,'error',5000); }
      draw();
    });
  };
  draw();
}



async function doLogin(){
  if(loginBusy) return;
  if(!sb){setLoginMsg('System not ready. Please refresh the page.','');return;}
  const email=(document.getElementById('login-email')||{}).value||'';
  const pass=(document.getElementById('login-pass')||{}).value||'';
  if(!email.trim()||!pass){setLoginMsg('Please enter your Email and password.','');return;}
  const remember=(document.getElementById('remember-creds')||{}).checked===true;
  const btn=document.getElementById('login-btn');
  loginBusy=true;
  if(btn){btn.disabled=true;btn.textContent='Signing in…';}
  setLoginMsg('Verifying account…','busy');
  try{
    const {data,error}=await sb.auth.signInWithPassword({email:email.trim(),password:pass});
    if(error) throw error;
    const {data:{session}}=await sb.auth.getSession();
    if(!session) throw new Error('Login succeeded but session could not be saved. Please disable private/incognito mode and allow local storage.');
    try{
      if(remember) localStorage.setItem(LOGIN_EMAIL_KEY,email.trim());
      else localStorage.removeItem(LOGIN_EMAIL_KEY);
      purgeStoredPassword();
      localStorage.setItem(REMEMBER_CREDS_KEY,remember?'1':'0');
    }catch(e){}
    setCurrentLoginEmail(email.trim());
    setLoginMsg('Login successful, loading data…','ok');
    const _ts=Date.now().toString();
    localStorage.setItem('aclab_login_at',_ts);
    sessionStorage.setItem('aclab_login_at',_ts);
    if(!(await enterAppIfApproved(email.trim()))){ setLoginMsg('',''); return; }
    showApp();
    startIdleTimer();
    initSwipeBack();
    await load();
  }catch(e){
    setLoginMsg(loginErrorMessage(e),'');
    console.error('login failed',e);
  }finally{
    loginBusy=false;
    if(btn){btn.disabled=false;btn.textContent='Sign In';}
  }
}



async function doLogout(){
  localStorage.removeItem('aclab_login_at');
  sessionStorage.removeItem('aclab_login_at');
  await sb.auth.signOut();
  setCurrentLoginEmail('');
  showLogin();
}




// ========== 註冊流程 ==========
const ALLOWED_EMAIL_DOMAIN='@pal-labs.com';



let regEmail='';



function setRegMsg(text,kind){
  const el=document.getElementById('reg-err');
  if(!el) return;
  el.textContent=text||'';
  el.className=text?('login-err'+(kind==='ok'?' ok':kind==='busy'?' busy':' err')):'login-err';
}



function showRegister(){
  document.querySelector('#login-screen .login-card').style.display='none';
  document.getElementById('register-card').style.display='';
  // reset to step 1
  document.getElementById('reg-step-email').style.display='';
  document.getElementById('reg-step-otp').style.display='none';
  document.getElementById('reg-step-pass').style.display='none';
  setRegMsg('','');
}



function showLoginPanel(){
  document.getElementById('register-card').style.display='none';
  const pc=document.getElementById('pending-card'); if(pc) pc.style.display='none';
  document.querySelector('#login-screen .login-card').style.display='';
}



async function sendRegisterOTP(){
  if(!sb){setRegMsg('System not ready. Please refresh.','');return;}
  const email=(document.getElementById('reg-email')||{}).value.trim().toLowerCase();
  if(!email){setRegMsg('Please enter your email.','');return;}
  if(!email.endsWith(ALLOWED_EMAIL_DOMAIN)){
    setRegMsg('Please use your company email address.','');return;
  }
  const btn=document.getElementById('reg-otp-btn');
  if(btn){btn.disabled=true;btn.textContent='Sending…';}
  setRegMsg('Sending verification code…','busy');
  try{
    const {error}=await sb.auth.signInWithOtp({
      email:email,
      options:{shouldCreateUser:true}
    });
    if(error) throw error;
    regEmail=email;
    document.getElementById('reg-step-email').style.display='none';
    document.getElementById('reg-step-otp').style.display='';
    setRegMsg('Code sent! Check your inbox (and spam folder).','ok');
  }catch(e){
    setRegMsg(e?.message||'Failed to send code.','');
    console.error('OTP send failed',e);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Send Verification Code';}
  }
}



async function verifyRegisterOTP(){
  if(!sb){setRegMsg('System not ready. Please refresh.','');return;}
  const code=(document.getElementById('reg-otp')||{}).value.trim();
  if(!code){setRegMsg('Please enter the verification code.','');return;}
  const btn=document.getElementById('reg-verify-btn');
  if(btn){btn.disabled=true;btn.textContent='Verifying…';}
  setRegMsg('Verifying…','busy');
  try{
    const {error}=await sb.auth.verifyOtp({
      email:regEmail,
      token:code,
      type:'email'
    });
    if(error) throw error;
    document.getElementById('reg-step-otp').style.display='none';
    document.getElementById('reg-step-pass').style.display='';
    setRegMsg('Verified! Please set your password.','ok');
  }catch(e){
    setRegMsg(e?.message||'Invalid or expired code.','');
    console.error('OTP verify failed',e);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Verify Code';}
  }
}



async function completeRegister(){
  if(!sb){setRegMsg('System not ready. Please refresh.','');return;}
  const p1=(document.getElementById('reg-pass')||{}).value||'';
  const p2=(document.getElementById('reg-pass2')||{}).value||'';
  if(p1.length<6){setRegMsg('Password must be at least 6 characters.','');return;}
  if(p1!==p2){setRegMsg('Passwords do not match.','');return;}
  const btn=document.getElementById('reg-complete-btn');
  if(btn){btn.disabled=true;btn.textContent='Saving…';}
  setRegMsg('Creating account…','busy');
  try{
    // 此時 OTP 已驗證，使用者已登入，直接設定密碼
    const {error}=await sb.auth.updateUser({password:p1});
    if(error) throw error;
    setCurrentLoginEmail(regEmail);
    const _ts=Date.now().toString();
    localStorage.setItem('aclab_login_at',_ts);
    sessionStorage.setItem('aclab_login_at',_ts);
    await requestApproval(regEmail);          // file the request for an admin to review
    if(!(await enterAppIfApproved(regEmail))){ setRegMsg('',''); return; }
    setRegMsg('Account created! Loading…','ok');
    showApp();
    startIdleTimer();
    initSwipeBack();
    await load();
  }catch(e){
    setRegMsg(e?.message||'Failed to create account.','');
    console.error('register complete failed',e);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Complete Registration';}
  }
}



const SESSION_MAX_MIN=8*60;        // 關閉分頁後多久內免重新登入



const IDLE_TIMEOUT_MS=20*60*1000;  // 20 分鐘閒置登出



let idleTimer=null;



function resetIdleTimer(){
  clearTimeout(idleTimer);
  const _ts=Date.now().toString();
  localStorage.setItem('aclab_login_at',_ts);
  sessionStorage.setItem('aclab_login_at',_ts);
  idleTimer=setTimeout(()=>{
    sb.auth.signOut();
    showLogin();
    localStorage.removeItem('aclab_login_at');
    sessionStorage.removeItem('aclab_login_at');
  },IDLE_TIMEOUT_MS);
}



function startIdleTimer(){
  ['mousemove','keydown','click','scroll','touchstart'].forEach(e=>{
    document.addEventListener(e,resetIdleTimer,{passive:true});
  });
  resetIdleTimer();
}





function initSwipeBack(){
  let startX=0,startY=0,tracking=false;
  let indicator=null;

  function getIndicator(){
    if(!indicator){
      indicator=document.createElement('div');
      indicator.style.cssText='position:fixed;left:0;top:50%;transform:translateY(-50%);width:4px;height:60px;background:#3b82f6;border-radius:0 4px 4px 0;opacity:0;transition:opacity .15s;z-index:9999;pointer-events:none';
      document.body.appendChild(indicator);
    }
    return indicator;
  }

  document.addEventListener('touchstart',e=>{
    startX=e.touches[0].clientX;
    startY=e.touches[0].clientY;
    // 從畫面左側 15~120px 開始才追蹤（避開瀏覽器系統手勢區 < 15px）
    tracking=(startX>=15&&startX<=120)&&!!curProjectId;
  },{passive:true});

  document.addEventListener('touchmove',e=>{
    if(!tracking) return;
    const dx=e.touches[0].clientX-startX;
    const dy=e.touches[0].clientY-startY;
    if(dx>0&&Math.abs(dx)>Math.abs(dy)){
      // 顯示藍色指示條
      const ind=getIndicator();
      ind.style.opacity=Math.min(dx/80,1).toFixed(2);
      ind.style.width=Math.min(4+dx/10,16)+'px';
    }
  },{passive:true});

  document.addEventListener('touchend',e=>{
    if(indicator) indicator.style.opacity='0';
    if(!tracking) return;
    tracking=false;
    const dx=e.changedTouches[0].clientX-startX;
    const dy=e.changedTouches[0].clientY-startY;
    if(dx>70&&Math.abs(dx)>Math.abs(dy)*1.5){
      if(curProjectId) backToProjectList();
    }
  },{passive:true});
}



function onRememberToggle(checked){
  try{
    localStorage.setItem(REMEMBER_CREDS_KEY,checked?'1':'0');
    if(!checked) localStorage.removeItem(LOGIN_EMAIL_KEY);
  }catch(e){}
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  ALLOWED_EMAIL_DOMAIN, IDLE_TIMEOUT_MS, SESSION_MAX_MIN, allowedUserNames, completeRegister,
  doLogin, doLogout, ensureAllowedUsers, enterAppIfApproved, fetchAllowedUsers,
  identityFieldHtml, identityOptions, idleTimer, initSwipeBack, loadMyApproval, loginBusy,
  loginErrorMessage, manageUsers, onRememberToggle, readIdentity, recheckApproval, regEmail,
  requestApproval, resetIdleTimer, sendRegisterOTP, setLoginMsg, setRegMsg, showApp,
  showLogin, showLoginPanel, showPendingScreen, showRegister, startIdleTimer,
  testSupabaseConnection, updateAdminBtn, updateLoginFileWarn, verifyRegisterOTP
};
