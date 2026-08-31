import { toast } from '../components/ui.js';
import { getCurrentUser } from './auth.js';
import { currentLoginEmail, sb } from '../state.js';

/* ===== Web Push notifications ===== */
const VAPID_PUBLIC_KEY='BNKyIJE2ed7ZmDD2s5aNdmw56400S6rz-NoN0-HKPbVL9dis1gxXkPJY-ES0FapIb4PUpztXmL_j6PoD-phV8J0';


function pushSupported(){ return ('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window); }


function urlB64ToUint8Array(b64){
  const pad='='.repeat((4-b64.length%4)%4);
  const base64=(b64+pad).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64), arr=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) arr[i]=raw.charCodeAt(i);
  return arr;
}


async function registerSW(){
  if(!('serviceWorker' in navigator)) return null;
  try{ return await navigator.serviceWorker.register('./sw.js'); }catch(e){ console.warn('SW register failed',e); return null; }
}


async function enableNotifications(){
  if(!pushSupported()){ toast('This browser does not support notifications.','warn'); return; }
  if(!VAPID_PUBLIC_KEY){ toast('Push is not configured yet (VAPID key missing).','warn',4200); return; }
  const reg=await registerSW();
  if(!reg){ toast('Could not start the notification service.','error'); return; }
  const perm=await Notification.requestPermission();
  if(perm!=='granted'){ toast('Notifications are blocked. Allow them in your browser settings.','warn',4200); return; }
  try{
    let sub=await reg.pushManager.getSubscription();
    if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64ToUint8Array(VAPID_PUBLIC_KEY)});
    await savePushSubscription(sub);
    updateNotifyBtn(true);
    toast('Notifications enabled on this device','success');
  }catch(e){ console.error(e); toast('Could not enable notifications: '+(e.message||e),'error',4200); }
}


async function savePushSubscription(sub){
  const j=sub.toJSON();
  if(!(sb&&(await sb.auth.getSession()).data.session)) return;
  const {error}=await sb.from('push_subscriptions').upsert({
    endpoint:j.endpoint, p256dh:j.keys.p256dh, auth:j.keys.auth,
    user_email:currentLoginEmail||getCurrentUser(), updated_at:new Date().toISOString()
  },{onConflict:'endpoint'});
  if(error) console.warn('save subscription failed',error);
}


async function updateNotifyBtn(known){
  const btn=document.getElementById('notify-toggle'); if(!btn) return;
  let on=known;
  if(known===undefined){
    try{ const reg=await navigator.serviceWorker.getRegistration(); const sub=reg&&await reg.pushManager.getSubscription(); on=!!sub&&Notification.permission==='granted'; }catch(e){ on=false; }
  }
  btn.classList.toggle('active',!!on);
  btn.title=on?'Notifications on for this device':'Enable notifications';
}
if(pushSupported()) registerSW();

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  VAPID_PUBLIC_KEY, enableNotifications, pushSupported, registerSW, savePushSubscription,
  updateNotifyBtn, urlB64ToUint8Array
};
