import { CERT_SINGLE_GROUPS, GAUGE_SEGS, certItemDone, certItemsFor, certProgress, hasProgressBar } from '../domain/certification.js';
import { curProjectId } from '../state.js';
import { esc } from '../utils/format.js';
import { getProject } from '../views/projectLog.js';

// Ramp the filled ticks from deep to bright so the leading edge reads as "now"
function gaugeMix(k){
  const a=[13,120,90], b=[74,222,128];
  return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*k).toString(16).padStart(2,'0')).join('');
}



function certGaugeHtml(p,size,pulse){
  const pr=hasProgressBar(p)?certProgress(p):null;
  if(!pr) return '';
  const filled=Math.round(pr.pct/100*GAUGE_SEGS);
  let segs='';
  for(let i=0;i<GAUGE_SEGS;i++){
    const on=i<filled;
    // Chunky ticks: 7.6 wide against ~11.5 of arc per segment leaves a gap about
    // half the tick, which is what gives the dial its solid look
    // fill goes in the style attribute, not the fill attribute: a CSS rule beats a
    // presentation attribute, so .gseg's own fill would win and every tick stay grey
    segs+=`<rect class="gseg${on?' on':''}${on&&i===filled-1?' lead':''}" x="46.2" y="3" width="7.6" height="16" rx="3.2"
      transform="rotate(${i*(360/GAUGE_SEGS)} 50 50)"
      ${on?`style="fill:${gaugeMix(filled>1?i/(filled-1):1)};--d:${i*22}ms"`:''}></rect>`;
  }
  // Nothing is in progress at 0 or 100, so the frontier tick has nothing to mark
  const beat=pulse&&filled>0&&filled<GAUGE_SEGS;
  return `<div class="cert-gauge${beat?' pulse':''}" style="width:${size}px;height:${size}px"
      role="img" aria-label="Certification progress ${pr.pct}%">
    <svg viewBox="0 0 100 100">${segs}</svg>
    <div class="gauge-num${pr.pct<25?' is-early':''}" style="font-size:${Math.round(size*0.33)}px"
      data-pct="${pr.pct}">0<small>%</small></div>
  </div>`;
}



/* The number counts up once per render. data-done stops a re-render of the same
   list (a filter change, say) from replaying it on cards already on screen. */
function animateCertGauges(root){
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  (root||document).querySelectorAll('.gauge-num[data-pct]').forEach(el=>{
    const target=Number(el.dataset.pct)||0;
    const write=v=>{ el.firstChild.nodeValue=v; };
    if(reduce||el.dataset.done==='1'){ write(target); el.dataset.done='1'; return; }
    el.dataset.done='1';
    const dur=680, t0=performance.now();
    const step=now=>{
      const k=Math.min(1,(now-t0)/dur);
      write(Math.round(target*(1-Math.pow(1-k,3))));
      if(k<1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}



function certListHtml(p){
  const pr=hasProgressBar(p)?certProgress(p):null;
  if(!pr) return '';
  // No per-item weight: how the total is apportioned is our arithmetic, not
  // something the reader acts on. The dial already gives the number that matters.
  const row=(lbl,done,ref,note)=>`<div class="cert-row${done?' done':''}">
      <i class="ti ti-circle${done?'-check':''}" aria-hidden="true"></i>
      <span>${esc(lbl)}</span>
      ${ref?'<span class="cert-ref">reference</span>':''}
      ${note?`<span class="cert-note">${esc(note)}</span>`:''}
    </div>`;
  return `<div class="cert-list" style="margin-top:0">
    ${pr.hasDebug?row('Debug',true):''}
    ${pr.items.map(i=>row(i.l,pr.closed||certItemDone(p,i),i.ref,i.note)).join('')}
  </div>
  ${pr.closed?'<div style="font-size:12px;color:var(--text-secondary);margin-top:8px"><i class="ti ti-lock" aria-hidden="true"></i> Closed — counted as complete</div>':''}`;
}



/* Several items often get covered in one sitting — USB and Dongle Function on the
   same day, for instance — so this is a multi-select grouped the way the checklist
   reads, not a single dropdown. */
function certItemChecksHtml(p,selected){
  const items=certItemsFor(p);
  if(!items.length) return '';
  const sel=new Set(selected||[]);
  const groups=[];
  items.forEach(i=>{
    const g=groups.find(x=>x.name===i.group);
    (g||groups[groups.push({name:i.group,rows:[]})-1]).rows.push(i);
  });
  return `<label style="margin-bottom:6px">Certification Items</label>
    <div style="margin-bottom:10px">${groups.map(g=>{
      const one=CERT_SINGLE_GROUPS.includes(g.name);
      return `<div style="margin-bottom:8px">
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">${esc(g.name)}${
          one?' <span style="opacity:.75">(one only)</span>':''}</div>
        <div class="check-row">${g.rows.map(i=>
          `<label class="chk-lbl"><input type="checkbox" class="lf-item-cb" value="${i.v}"
            data-group="${esc(g.name)}" ${sel.has(i.v)?'checked':''}
            onchange="onCertItemChange(this)"> ${esc(i.l)}</label>`
        ).join('')}</div>
      </div>`;}).join('')}</div>`;
}



function readCertItemsFromForm(){
  return Array.from(document.querySelectorAll('.lf-item-cb:checked')).map(c=>c.value);
}



// A reference item only records that it was tested, so pass/fail is only asked for
// when something in the selection actually depends on it.
function onCertItemChange(cb){
  const p=getProject(curProjectId);
  const wrap=document.getElementById('lf-result-wrap');
  if(!p||!wrap) return;
  // Audio takes a full session per mode, so a single log can only carry one of them
  if(cb&&cb.checked&&CERT_SINGLE_GROUPS.includes(cb.dataset.group)){
    document.querySelectorAll(`.lf-item-cb[data-group="${cb.dataset.group}"]`)
      .forEach(o=>{ if(o!==cb) o.checked=false; });
  }
  // Result only appears when something in the selection is actually scored on it
  const picked=readCertItemsFromForm();
  wrap.style.display=certItemsFor(p).some(i=>picked.includes(i.v)&&!i.ref)?'':'none';
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  animateCertGauges, certGaugeHtml, certItemChecksHtml, certListHtml, gaugeMix,
  onCertItemChange, readCertItemsFromForm
};
