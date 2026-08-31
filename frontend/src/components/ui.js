import { esc } from '../utils/format.js';

/* ===== Toast notifications + custom confirm dialog ===== */
function toast(msg,type,ms){
  type=type||'info'; ms=ms||3200;
  let host=document.getElementById('toast-host');
  if(!host){ host=document.createElement('div'); host.id='toast-host'; document.body.appendChild(host); }
  const el=document.createElement('div');
  el.className='toast toast-'+type;
  const icon={info:'ti-info-circle',success:'ti-circle-check',warn:'ti-alert-triangle',error:'ti-alert-circle'}[type]||'ti-info-circle';
  el.innerHTML=`<i class="ti ${icon}" aria-hidden="true"></i><span>${esc(msg)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),260); }, ms);
}


function confirmModal(message,opts){
  opts=opts||{};
  return new Promise(resolve=>{
    const ov=document.createElement('div');
    ov.className='modal-overlay';
    const danger=!!opts.danger;
    ov.innerHTML=`<div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-title">${esc(opts.title||(danger?'Confirm deletion':'Please confirm'))}</div>
      <div class="modal-msg">${esc(message)}</div>
      <div class="modal-actions">
        <button class="btn" data-act="cancel">${esc(opts.cancelText||'Cancel')}</button>
        <button class="btn ${danger?'danger-solid':'primary'}" data-act="ok">${esc(opts.okText||'OK')}</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    const close=val=>{ ov.classList.remove('show'); setTimeout(()=>ov.remove(),200); document.removeEventListener('keydown',onKey); resolve(val); };
    function onKey(e){ if(e.key==='Escape') close(false); else if(e.key==='Enter') close(true); }
    ov.addEventListener('click',e=>{ if(e.target===ov) close(false); });
    ov.querySelector('[data-act=cancel]').onclick=()=>close(false);
    ov.querySelector('[data-act=ok]').onclick=()=>close(true);
    document.addEventListener('keydown',onKey);
    requestAnimationFrame(()=>{ ov.classList.add('show'); ov.querySelector('[data-act=ok]').focus(); });
  });
}


function toggleDropdown(e,btn){
  e.stopPropagation();
  const dd=btn.closest('.dropdown');
  const wasOpen=dd.classList.contains('open');
  document.querySelectorAll('.dropdown.open').forEach(d=>d.classList.remove('open'));
  if(!wasOpen) dd.classList.add('open');
}
document.addEventListener('click',()=>document.querySelectorAll('.dropdown.open').forEach(d=>d.classList.remove('open')));

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  confirmModal, toast, toggleDropdown
};
