const SUPABASE_URL='https://ygoywjqgatkwboepxaaz.supabase.co';


const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlnb3l3anFnYXRrd2JvZXB4YWF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NzQ0MTAsImV4cCI6MjA5NTM1MDQxMH0.cpnejjVh8s9mHQl1MwUAPQXl8tipUGJSWSuPO5cFmiw';


const authStorage={
  getItem(key){
    try{return localStorage.getItem(key);}catch(e){}
    try{return sessionStorage.getItem(key);}catch(e){}
    return null;
  },
  setItem(key,val){
    try{localStorage.setItem(key,val);return;}catch(e){}
    try{sessionStorage.setItem(key,val);}catch(e){}
    throw new Error('Browser cannot save login state. Please disable private/InPrivate mode or allow this site to use local storage.');
  },
  removeItem(key){
    try{localStorage.removeItem(key);}catch(e){}
    try{sessionStorage.removeItem(key);}catch(e){}
  }
};



function setSyncStatus(state,msg){
  const el=document.getElementById('sync-lbl');
  if(!el) return;
  el.className=state==='ok'?'ok':state==='err'?'err':'';
  const map={loading:'Syncing…',saving:'Saving…',ok:'Synced',err:'Sync failed',offline:'Local backup only'};
  el.textContent=msg||(map[state]||'—');
}


function bumpId(id){
  const m=String(id||'').match(/^(.*?)(\d+)\s*$/);
  if(!m) return id+'-2';
  return m[1]+String(parseInt(m[2],10)+1).padStart(m[2].length,'0');
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  SUPABASE_ANON_KEY, SUPABASE_URL, authStorage, bumpId, setSyncStatus
};
