import { toast } from './ui.js';
import { sampleOptsFor, sampleTypesFor } from '../domain/platforms.js';
import { BUILT_IN_OS, CHROME_FEATURES, CHROME_MIC, CHROME_OS, EARPIECE, HEADSET_CONN, PERSONAL_FEATURES, PRODUCT_TYPE_MAP, SELF_HOSTED_TYPES, TEST_DISTANCES, headsetConnValues, platformUsesExtra, productTypesFor, usesProductType } from '../domain/products.js';
import { esc } from '../utils/format.js';

function platformExtraHtml(platform,p){
  if(platform!=='Google') return '';
  const f=p.chromeFeatures||{};
  return `<div style="margin-bottom:12px">
      <label>OS Type *</label>
      ${segHtml('pf-cros',CHROME_OS,p.chromeOs||'chromeos')}
    </div>
    <div style="margin-bottom:12px">
      <label>Microphones *</label>
      ${segHtml('pf-cmic',CHROME_MIC,p.chromeMic||'mic1')}
    </div>
    <label style="margin-bottom:6px">Product Features (check all that apply)</label>
    <div class="check-row">${CHROME_FEATURES.map(x=>
      `<label class="chk-lbl"><input type="checkbox" id="pf-cf-${x.k}" ${f[x.k]?'checked':''}> ${x.l}</label>`
    ).join('')}</div>`;
}



function readChromeFields(){
  const o={chromeOs:segValue('pf-cros','chromeos'),chromeMic:segValue('pf-cmic','mic1'),chromeFeatures:{}};
  CHROME_FEATURES.forEach(x=>{o.chromeFeatures[x.k]=!!document.getElementById('pf-cf-'+x.k)?.checked;});
  return o;
}



function connectionChecks(selected){
  const sel=new Set(selected||[]);
  return HEADSET_CONN.map(c=>
    `<label class="chk-lbl"><input type="checkbox" class="pf-conn-cb" value="${c.v}" ${sel.has(c.v)?'checked':''}> ${c.l}</label>`
  ).join('');
}



function readConnectionsFromForm(){
  return Array.from(document.querySelectorAll('.pf-conn-cb:checked')).map(c=>c.value);
}



function distanceOpts(sel){
  return '<option value="">— Select —</option>'+TEST_DISTANCES.map(d=>
    `<option value="${d}" ${sel===d?'selected':''}>${d}m</option>`
  ).join('');
}



function noteSampleChecks(selected,plat,cat){
  const sel=new Set(selected||[]);
  return sampleTypesFor(plat,cat,selected).map(t=>
    `<label class="sample-chk"><input type="checkbox" class="f-sample-cb" value="${t.v}" ${sel.has(t.v)?'checked':''}><span>${esc(t.l)}</span></label>`
  ).join('');
}

/* ===== Test Software list (shared, in-app manageable) ===== */




// Only what this platform actually offers. A selection the new platform does not
// have is dropped rather than carried across wearing a label saying so — the
// product type has to be re-picked, which is the honest outcome of changing platform.
function productTypeOpts(sel,platform){
  return '<option value="">— Select product type —</option>'+productTypesFor(platform).map(t=>
    `<option value="${t.v}" ${sel===t.v?'selected':''}>${t.l}</option>`
  ).join('');
}



function readPersonalFeaturesFromForm(){
  const o={};
  PERSONAL_FEATURES.forEach(f=>{o[f.k]=!!document.getElementById('pf-f-'+f.k)?.checked;});
  return o;
}



function readProductTypeDraft(){
  const v=(document.getElementById('pf-type')||{}).value||'';
  const t=PRODUCT_TYPE_MAP[v];
  const d={productType:v};
  if(SELF_HOSTED_TYPES.includes(v)){
    if(t?.group==='shared'){
      d.micDistanceM=(document.getElementById('pf-mic-m')||{}).value||'';
      d.spkDistanceM=(document.getElementById('pf-spk-m')||{}).value||'';
    }
    d.os=(document.getElementById('pf-os')||{}).value||'';
    d.connectionTypes=readConnectionsFromForm();
    d.personalFeatures=readPersonalFeaturesFromForm();
    d.hasControls=!!(document.getElementById('pf-controls')||{}).value;
  }else if(v==='personal-hs'){
    d.connectionTypes=readConnectionsFromForm();
    d.personalFeatures=readPersonalFeaturesFromForm();
    d.earpiece=segValue('pf-ear','dual');
  }else if(t?.group==='other'){
    d.productTypeOther=(document.getElementById('pf-type-other')||{}).value||'';
  }
  return d;
}



function buildProductTypeExtra(p){
  const v=p.productType||'';
  const t=PRODUCT_TYPE_MAP[v];
  if(!t) return '';
  if(SELF_HOSTED_TYPES.includes(v)){
    const os=p.os||'';
    return `
    ${t.group==='shared'?`<div class="fg2" style="margin-bottom:10px">
      <div><label for="pf-mic-m">Mic Test Distance</label>
        <select id="pf-mic-m">${distanceOpts(p.micDistanceM||'')}</select></div>
      <div><label for="pf-spk-m">SPK Test Distance</label>
        <select id="pf-spk-m">${distanceOpts(p.spkDistanceM||'')}</select></div>
    </div>`:''}
    <div class="fg2" style="margin-bottom:0">
      <div>
        <label for="pf-os">Built-in System</label>
        <select id="pf-os" onchange="onProductTypeChange()">${
          BUILT_IN_OS.map(o=>`<option value="${o.v}" ${os===o.v?'selected':''}>${o.l}</option>`).join('')
        }</select>
      </div>
      <div>
        <label for="pf-controls">Buttons or Remote</label>
        <select id="pf-controls">
          <option value="" ${!p.hasControls?'selected':''}>No</option>
          <option value="1" ${p.hasControls?'selected':''}>Yes</option>
        </select>
      </div>
    </div>
    ${os===''?`
      <div style="margin-top:12px">
        <label>Connection Type * <span style="color:var(--text-secondary);font-weight:400">(select one or more)</span></label>
        <div class="check-row">${connectionChecks(headsetConnValues(p))}</div>
      </div>
      ${featureChecksHtml(p,false)}`:''}`;
  }
  if(v==='personal-dp') return `<div style="font-size:12px;color:var(--text-secondary)">
    <i class="ti ti-info-circle" aria-hidden="true"></i> Android only — no connection type to select.</div>`;
  if(v==='personal-hs'){
    return `
      <div style="margin-bottom:12px">
        <label>Connection Type * <span style="color:var(--text-secondary);font-weight:400">(select one or more)</span></label>
        <div class="check-row">${connectionChecks(headsetConnValues(p))}</div>
      </div>
      <div style="margin-bottom:12px">
        <label>Earpiece *</label>
        ${segHtml('pf-ear',EARPIECE,p.earpiece||'dual')}
      </div>
      ${featureChecksHtml(p)}`;
  }
  if(t.group==='other') return `
    <label for="pf-type-other">Product Type Description *</label>
    <input type="text" id="pf-type-other" placeholder="Describe the product type" value="${esc(p.productTypeOther||p.dut||'')}">`;
  return '';
}



function featureChecksHtml(p,headsetOnly){
  const feats=p.personalFeatures||{};
  const list=headsetOnly===false?PERSONAL_FEATURES.filter(f=>!f.hs):PERSONAL_FEATURES;
  return `<label style="margin-bottom:6px">Product Features (check all that apply)</label>
    <div class="check-row">${list.map(f=>`
      <label class="chk-lbl"><input type="checkbox" id="pf-f-${f.k}" ${feats[f.k]?'checked':''}
        ${f.k==='teamsButton'?'onchange="onTeamsButtonChange(this)"':''}> ${f.l}</label>
    `).join('')}</div>`;
}



// Keep the two from contradicting each other: a Teams Button is a physical control
function onTeamsButtonChange(cb){
  const ctl=document.getElementById('pf-controls');
  if(cb.checked&&ctl&&!ctl.value) ctl.value='1';
}



// A segmented control rather than a dropdown: two mutually exclusive options read
// faster as buttons, and only one can ever be active.
function segHtml(name,opts,sel){
  return `<div class="seg">${opts.map(o=>
    `<label class="seg-btn"><input type="radio" name="${name}" value="${o.v}" ${sel===o.v?'checked':''}><span>${o.l}</span></label>`
  ).join('')}</div>`;
}



function segValue(name,dflt){
  const el=document.querySelector(`input[name="${name}"]:checked`);
  return el?el.value:dflt;
}



function onProductTypeChange(){
  const wrap=document.getElementById('pf-type-extra');
  if(!wrap) return;
  const draft=readProductTypeDraft();
  wrap.innerHTML=buildProductTypeExtra(draft);
  wrap.style.display=wrap.innerHTML?'block':'none';
}



function collectProductTypeFields(){
  const platform=(document.getElementById('pf-plat')||{}).value||'Teams';
  const v=(document.getElementById('pf-type')||{}).value||'';
  const t=PRODUCT_TYPE_MAP[v];
  // Platforms with no product type still carry their own fields
  if(!usesProductType(platform)) return {productType:'',micDistanceM:'',spkDistanceM:'',
    connectionTypes:[],connectionType:'',personalFeatures:{},productTypeOther:'',
    os:'',earpiece:'',hasControls:false,
    ...(platformUsesExtra(platform)?readChromeFields():{chromeOs:'',chromeMic:'',chromeFeatures:{}})};
  if(!v){toast('Please select a product type.','warn');return null;}
  const base={productType:v,micDistanceM:'',spkDistanceM:'',connectionTypes:[],connectionType:'',
              personalFeatures:{},productTypeOther:'',os:'',earpiece:'',hasControls:false};
  if(SELF_HOSTED_TYPES.includes(v)){
    if(t.group==='shared'){
      base.micDistanceM=(document.getElementById('pf-mic-m')||{}).value||'';
      base.spkDistanceM=(document.getElementById('pf-spk-m')||{}).value||'';
    }
    base.os=(document.getElementById('pf-os')||{}).value||'';
    base.hasControls=!!(document.getElementById('pf-controls')||{}).value;
    if(base.os===''){
      base.connectionTypes=readConnectionsFromForm();
      if(!base.connectionTypes.length){toast('Please select at least one connection type.','warn');return null;}
      base.personalFeatures=readPersonalFeaturesFromForm();
    }
    return base;
  }
  if(v==='personal-hs'){
    base.connectionTypes=readConnectionsFromForm();
    if(!base.connectionTypes.length){toast('Please select at least one connection type.','warn');return null;}
    base.personalFeatures=readPersonalFeaturesFromForm();
    base.earpiece=segValue('pf-ear','dual');
    return base;
  }
  if(v==='personal-dp') return base;
  if(t.group==='other'){
    const o=(document.getElementById('pf-type-other')||{}).value||'';
    if(!o.trim()){toast('Please describe the product type.','warn');return null;}
    base.productTypeOther=o.trim();
    return base;
  }
  return base;
}




// 依目前表單的 平台 / 分類 / 記錄類型 重建 Sample Type 區塊
function refreshSampleChecks(dropStale){
  const wrap=document.getElementById('f-sample-wrap');
  const box=wrap&&wrap.querySelector('.sample-checks');
  if(!wrap||!box) return;
  const plat=document.getElementById('f-plat')?.value||'Teams';
  const cat=document.getElementById('f-cat')?.value||'';
  const type=(document.getElementById('f-type')||{}).value||'';
  let cur=Array.from(document.querySelectorAll('.f-sample-cb:checked')).map(c=>c.value);
  if(dropStale){
    const known=new Set(sampleOptsFor(plat,cat).map(t=>t.v));
    cur=cur.filter(v=>known.has(v));
  }
  const list=sampleTypesFor(plat,cat,cur);
  box.innerHTML=noteSampleChecks(cur,plat,cat);
  // 該平台/分類沒有樣品類型時（如 Lenovo、Talk Analysis Suite）整段隱藏
  wrap.style.display=(type==='note'&&list.length)?'block':'none';
}



// Fields that belong to the platform itself, not to a product type
let chromeDraft=null;



function renderPlatformExtra(){
  const box=document.getElementById('pf-plat-extra');
  if(!box) return;
  // Snapshot before the box is torn down, so switching platform away and back
  // does not quietly discard what was already filled in
  if(document.querySelector('input[name="pf-cros"]')) chromeDraft=readChromeFields();
  const platform=(document.getElementById('pf-plat')||{}).value||'';
  box.innerHTML=platformExtraHtml(platform,chromeDraft||{});
  box.style.display=box.innerHTML?'':'none';
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  buildProductTypeExtra, chromeDraft, collectProductTypeFields, connectionChecks,
  distanceOpts, featureChecksHtml, noteSampleChecks, onProductTypeChange,
  onTeamsButtonChange, platformExtraHtml, productTypeOpts, readChromeFields,
  readConnectionsFromForm, readPersonalFeaturesFromForm, readProductTypeDraft,
  refreshSampleChecks, renderPlatformExtra, segHtml, segValue
};
