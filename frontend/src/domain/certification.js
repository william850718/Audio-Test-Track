import { PLATFORMS } from './platforms.js';
import { SELF_HOSTED_TYPES, headsetConnValues } from './products.js';

const PHASES=[
  {v:'debug',lbl:'Debug',cls:'b-debug'},
  {v:'pretest',lbl:'Pre-test',cls:'b-pretest'},
  {v:'qualification',lbl:'Qualification',cls:'b-qual'},
  {v:'requal',lbl:'Re-Qualification',cls:'b-requal'}
];

const PHASE_MAP=Object.fromEntries(PHASES.map(p=>[p.v,p]));


/* ===== Certification plans =====
   Deliberately NOT derived from PLATFORMS. The certification checklist and the
   Platform Tracking categories only look similar: Cortana belongs to a different
   platform there, Loop Latency does not exist there at all, and Google needs one
   of its six categories. Tying the two together would mean changing PLATFORMS —
   and that would reach into every record already filed under it.

   progress:true  → the project shows a percentage bar
   derive         → checklist computed from the device rather than a fixed list
   ref:true       → only records whether it was tested; pass/fail is not the point */
const CERT_PLANS={
  Teams:{progress:true,derive:teamsCertItems},
  Zoom:{progress:true,items:[
    {v:'audio',l:'Audio',group:'Audio'},
    {v:'aio',l:'AIO (Function)',group:'Function'}
  ]},
  // No checklist: every log on a Chromebook project is Chrome Audio by definition,
  // so a lone tick would record nothing. The entry itself stays — CERT_PLATFORMS is
  // built from these keys, and removing it would drop Chromebook from the picker.
  Google:{progress:false,items:[]},
  Lenovo:{progress:false,items:[
    {v:'lnv',l:'LNV',group:'LNV'},
    {v:'hwf',l:'HWF',group:'HWF'}
  ]}
};

// Groups where one log can only cover a single entry
const CERT_SINGLE_GROUPS=['Audio'];

/* Phases where a waiver means something. A failed debug run is just a failed
   debug run — there is nothing for a customer to waive. */
const CERT_PHASES=['qualification','requal'];

const TEAMS_FN_SUB=[
  {k:'hid',l:'HID',needsCtl:true},
  {k:'asp',l:'ASP',needsBtn:true},
  {k:'telemetry',l:'Telemetry'},
  {k:'ucq',l:'UCQ'}
];

/* The Teams checklist is not a fixed list — it falls out of what the device is and
   how it connects. Two rules drive most of it:
     · USB carries no Audio or Cortana unless it is the only mode available
     · a device with its own OS has no connection modes, so the OS decides instead */
function teamsCertItems(p){
  const t=p.productType||'', os=p.os||'';
  const items=[];
  const add=(v,l,group,ref)=>items.push({v,l,group,ref:!!ref});
  const selfHosted=t==='personal-dp'||(SELF_HOSTED_TYPES.includes(t)&&os);

  if(selfHosted){
    // Deskphone is only ever certified on Android today
    const android=t==='personal-dp'||os==='Android';
    add('audio','Audio','Audio');
    if(android){
      add('loop-latency','Loop Latency','Loop Latency');
    }else{
      // MTRoW always tests HID, with or without physical controls. The controls
      // flag is kept as device information rather than a gate here.
      items.push({v:'fn:hid',l:'Function',group:'Function',ref:false,note:'HID'});
      add('cortana','Cortana','Cortana',true);
    }
    return items;
  }

  const c=headsetConnValues(p);
  const has={usb:c.includes('usb-wired'),dongle:c.includes('usb-dongle'),
             nbt:c.includes('bt-classic'),lea:c.includes('bt-lea')};
  const onlyUsb=has.usb&&!has.dongle&&!has.nbt&&!has.lea;
  // Audio and Cortana turn out to follow the same rule, so derive the modes once
  const modes=onlyUsb?[['usb','USB']]:[
    has.dongle&&['dongle','Dongle'],has.nbt&&['nbt','NBT'],has.lea&&['lea','BT-LE']
  ].filter(Boolean);

  modes.forEach(([k,l])=>add('audio:'+k,`Audio (${l})`,'Audio'));

  // Function is one item per mode, not one per sub-test: HID, ASP, Telemetry and
  // UCQ are run together in practice, so splitting the percentage across them
  // would only make the bar move in steps nobody works in.
  const btn=!!(p.personalFeatures||{}).teamsButton;
  // A headset always has something to press, so HID is a given there. A
  // speakerphone or SoundBar might not, which is what the controls flag answers.
  const askCtl=SELF_HOSTED_TYPES.includes(t);
  // A Teams Button is itself a physical control, so it implies one is present —
  // "no controls but has a Teams Button" is not a state a device can be in.
  const ctl=!!p.hasControls||btn;
  const sub=TEAMS_FN_SUB.filter(s=>
    (!s.needsBtn||btn) && (!s.needsCtl||!askCtl||ctl)
  ).map(s=>s.l).join(' / ');
  [['usb','USB',has.usb],['dongle','Dongle',has.dongle]].forEach(([k,l,on])=>{
    if(on) items.push({v:'fn:'+k,l:`Function (${l})`,group:'Function',ref:false,note:sub});
  });
  // Classic is only labelled as such when LE Audio sits beside it
  if(has.nbt) add('fn:nbt','NBT Function'+(has.lea?' (Classic)':''),'Function');
  if(has.lea) add('fn:lea','NBT Function (LE)','Function');

  modes.forEach(([k,l])=>add('cortana:'+k,`Cortana (${l})`,'Cortana',true));
  return items;
}

const CERT_PLATFORMS=Object.keys(CERT_PLANS);

// Project Log talks about Chromebook where Platform Tracking says Google. Same key,
// different label, so records filed under Google are unaffected.
const CERT_PLAT_LABEL={Google:'Chromebook'};

function certPlatLabel(k){ return CERT_PLAT_LABEL[k]||PLATFORMS[k]?.label||k; }

const DEBUG_WEIGHT=0.2;   // Debug is worth 20%; the checklist splits the other 80%


// Projects created before this feature carry no platform. They were all Teams, so
// read them that way rather than rewriting stored rows.
function projPlatform(p){ return (p&&p.platform)||'Teams'; }

// OS belongs to the device, not the project: a headset has none, a Deskphone is
// always Android, and only a self-hosted Speakerphone/SoundBar gets to choose.
function projOS(p){
  if(!p) return '';
  if(p.productType==='personal-dp') return 'Android';
  return SELF_HOSTED_TYPES.includes(p.productType)?(p.os||''):'';
}

function certItemsFor(p){
  const plan=CERT_PLANS[projPlatform(p)];
  if(!plan) return [];
  return plan.derive?plan.derive(p):(plan.items||[]);
}

function certItemLabel(p,v){
  return (certItemsFor(p).find(i=>i.v===v)||{}).l||v;
}

function hasProgressBar(p){
  return !!(CERT_PLANS[projPlatform(p)]||{}).progress;
}

/* A checklist entry is satisfied by the logs themselves, so there is no separate
   tick to keep in sync. A reference item counts once it has been tested at all;
   everything else needs a passing log, which is what makes a failed qualification
   simply not count until it is re-run. */
// Newer logs cover several items at once; older ones stored a single certItem
function logCertItems(l){
  if(Array.isArray(l&&l.certItems)) return l.certItems;
  return (l&&l.certItem)?[l.certItem]:[];
}

// A waived item counts as done. The failure is kept on the log rather than
// rewritten to a pass, so the record still shows what actually happened and who
// let it through.
function logCounts(l){ return l.result==='pass'||l.waived===true; }

function certItemDone(p,item){
  return (p.logs||[]).some(l=>
    logCertItems(l).includes(item.v) && (item.ref ? true : logCounts(l))
  );
}

/* Some customers come straight to qualification and never debug at all. Rather
   than ask up front — a project that fails qualification often goes back to
   debug, and any answer given at the start would then be wrong — Debug only
   counts once a debug log exists. Adding one later cannot pull the number down:
   it contributes 20 while diluting the items by at most 20, so the total never
   drops. */
function certProgress(p){
  const items=certItemsFor(p);
  if(!items.length) return null;
  const hasDebug=(p.logs||[]).some(l=>l.phase==='debug');
  const debugW=hasDebug?DEBUG_WEIGHT:0;
  const share=Math.round((1-debugW)/items.length*1000)/10;
  // A closed project counts as finished whatever the logs say. Items do get
  // missed in practice, and back-filling a checklist after the fact to make a
  // bar reach 100% is busywork that teaches people to distrust the number.
  if(p.status==='closed'){
    return {pct:100,closed:true,hasDebug,debugDone:true,done:items.length,total:items.length,items,share};
  }
  const done=items.filter(i=>certItemDone(p,i));
  const pct=debugW+done.length*(1-debugW)/items.length;
  return {pct:Math.round(pct*100),closed:false,hasDebug,debugDone:hasDebug,done:done.length,total:items.length,items,share};
}


function sortedLogs(logs){
  return [...(logs||[])].sort((a,b)=>new Date(b.date)-new Date(a.date)||(b.id||'').localeCompare(a.id||''));
}

/* Qualification is supposed to run on one unit, so more than one PAL ID across
   those logs is worth surfacing. Debug is exempt — swapping units while debugging
   is normal. The stored key stays sampleNo; renaming it would strand anything
   already filed under the old name for nothing but tidiness. */
function qualSampleClash(proj){
  const nos=[...new Set((proj.logs||[])
    .filter(l=>(l.phase==='qualification'||l.phase==='requal')&&l.sampleNo)
    .map(l=>l.sampleNo.trim()))];
  return nos.length>1?nos:null;
}

function latestFw(proj){
  const l=sortedLogs(proj.logs).find(x=>x.fwVersion);
  return l?l.fwVersion:'';
}


const GAUGE_SEGS=24;

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  CERT_PHASES, CERT_PLANS, CERT_PLATFORMS, CERT_PLAT_LABEL, CERT_SINGLE_GROUPS, DEBUG_WEIGHT,
  GAUGE_SEGS, PHASES, PHASE_MAP, TEAMS_FN_SUB, certItemDone, certItemLabel, certItemsFor,
  certPlatLabel, certProgress, hasProgressBar, latestFw, logCertItems, logCounts, projOS,
  projPlatform, qualSampleClash, sortedLogs, teamsCertItems
};
