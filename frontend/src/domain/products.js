import { fmtDist } from '../utils/format.js';

const PRODUCT_TYPES=[
  {v:'shared-sp',l:'Shared Space - Speakerphone',group:'shared'},
  {v:'shared-sb',l:'Shared Space - SoundBar',group:'shared'},
  {v:'personal-sp',l:'Personal - Speakerphone',group:'personal'},
  {v:'personal-hs',l:'Personal - Headset',group:'personal'},
  // Laptop is deliberately absent: Microsoft does not certify it. Platform
  // Tracking still lists one as a Sample Type, and that is fine — the two modules
  // are independent and only ever borrowed each other's vocabulary for reference.
  {v:'personal-dp',l:'Personal - Deskphone',group:'personal'},
  {v:'zoom-meeting',l:'Zoom Meeting',group:'device'},
  {v:'zoom-rooms',l:'Zoom Rooms',group:'device'},
  // Lenovo and Chromebook only ever put a laptop on the bench. Named plainly
  // rather than reusing the Teams entry, because each platform names the same
  // device its own way — the reason Sample Types are per-platform too.
  {v:'laptop',l:'Laptop',group:'device'},
  {v:'other',l:'Other',group:'other'}
];

const PRODUCT_TYPE_MAP=Object.fromEntries(PRODUCT_TYPES.map(t=>[t.v,t]));

/* Which product types each certification platform offers. PRODUCT_TYPES above stays
   the full catalogue so a value stored under one platform still renders its label
   after the project is moved to another — only the picker narrows.
   Chrome Audio and Lenovo get no list at all: those two are kept purely as a record
   of what was tested, so asking for a product type would be a required field with
   nothing riding on it. */
const PRODUCT_TYPES_BY_PLATFORM={
  Teams:['shared-sp','shared-sb','personal-sp','personal-hs','personal-dp','other'],
  Zoom:['zoom-meeting','zoom-rooms','other'],
  Google:[],
  Lenovo:[]
};

function productTypesFor(platform){
  const keys=PRODUCT_TYPES_BY_PLATFORM[platform]||PRODUCT_TYPES_BY_PLATFORM.Teams;
  return keys.map(k=>PRODUCT_TYPE_MAP[k]).filter(Boolean);
}

function usesProductType(platform){ return productTypesFor(platform).length>0; }


/* Chromebook does not fit the Product Type dropdown the other platforms use: what
   matters is the OS it runs and which transducers it has, so it gets its own pair
   of fields hung off the platform rather than a product type. */
const CHROME_OS=[{v:'chromeos',l:'Chrome OS'},{v:'alos',l:'ALOS'}];

// Mic count is one answer, not three independent ones — a device cannot be both
// single-mic and dual-mic — so it is its own field rather than three checkboxes.
const CHROME_MIC=[{v:'mic1',l:'Single mic'},{v:'mic2',l:'Dual mic'},{v:'mic3',l:'Third mic'}];

const CHROME_FEATURES=[
  {k:'speaker',l:'Speaker'},{k:'hsIn',l:'Headset in'},{k:'hsOut',l:'Headset out'}
];

function platformUsesExtra(platform){ return platform==='Google'; }

function chromeSummary(p){
  // A project saved before these fields existed has neither; claiming Chrome OS
  // for it would be inventing data
  if(!p.chromeOs&&!p.chromeMic&&!Object.values(p.chromeFeatures||{}).some(Boolean)) return '';
  const os=(CHROME_OS.find(o=>o.v===(p.chromeOs||'chromeos'))||{}).l||'';
  const mic=(CHROME_MIC.find(m=>m.v===(p.chromeMic||'mic1'))||{}).l||'';
  const feats=CHROME_FEATURES.filter(x=>p.chromeFeatures?.[x.k]).map(x=>x.l);
  return [os,mic,feats.join(', ')].filter(Boolean).join(' · ');
}

const TEST_DISTANCES=['1.5','2.3','3.5','4.5','7.5'];

// hs:true marks the ones that only describe a headset, so a speakerphone is not
// asked about its boom mic.
const PERSONAL_FEATURES=[
  {k:'boomMic',l:'Boom Mic',hs:true},{k:'ancButton',l:'ANC Button',hs:true},
  {k:'superWideband',l:'Super Wideband'},{k:'openOfficeHeadset',l:'Open Office Headset',hs:true},
  // Decides whether ASP is part of Function, on every Teams device
  {k:'teamsButton',l:'Teams Button'}
];

// Earpiece count is its own field, not a feature checkbox: the two options are
// mutually exclusive, and it has to stand alone to be filterable.
const EARPIECE=[{v:'dual',l:'Dual'},{v:'mono',l:'Mono'}];

// Speakerphones and SoundBars sometimes ship with their own OS. When they do there
// is no connection mode to speak of, and the checklist comes from the OS instead.
const BUILT_IN_OS=[{v:'',l:'None'},{v:'Windows',l:'Windows (MTRoW)'},{v:'Android',l:'Android (MTRoA)'}];

const SELF_HOSTED_TYPES=['shared-sp','shared-sb','personal-sp'];

const HEADSET_CONN=[
  {v:'usb-wired',l:'USB Wired'},
  {v:'usb-dongle',l:'USB Dongle'},
  {v:'bt-classic',l:'Native Bluetooth(Classic)'},
  {v:'bt-lea',l:'Native Bluetooth(LEA)'}
];

const HEADSET_CONN_MAP=Object.fromEntries(HEADSET_CONN.map(c=>[c.v,c]));

// Backward-compatible: new projects use connectionTypes[], older ones had connectionType (string)
function headsetConnValues(p){
  if(Array.isArray(p&&p.connectionTypes)) return p.connectionTypes;
  return (p&&p.connectionType)?[p.connectionType]:[];
}

function headsetConnLabels(p){
  return headsetConnValues(p).map(v=>(HEADSET_CONN_MAP[v]||{}).l||v).filter(Boolean);
}

function productTypeSummary(p){
  if(!p) return '';
  if(p.platform==='Google') return chromeSummary(p)||p.dut||'';
  const t=PRODUCT_TYPE_MAP[p.productType];
  if(!t) return p.dut||'';
  if(SELF_HOSTED_TYPES.includes(p.productType)){
    const parts=[t.l];
    if(t.group==='shared'){
      const mic=p.micDistanceM,spk=p.spkDistanceM;
      if(mic||spk) parts[0]+=` (Mic ${fmtDist(mic)||'—'} / SPK ${fmtDist(spk)||'—'})`;
    }
    if(p.os) parts.push(p.os==='Windows'?'MTRoW':'MTRoA');
    else{
      const conns=headsetConnLabels(p);
      if(conns.length) parts.push(conns.join(' + '));
    }
    const feats=PERSONAL_FEATURES.filter(f=>p.personalFeatures?.[f.k]).map(f=>f.l);
    if(feats.length) parts.push(feats.join(', '));
    return parts.join(' · ');
  }
  if(p.productType==='personal-hs'){
    const parts=[t.l];
    const conns=headsetConnLabels(p);
    if(conns.length) parts.push(conns.join(' + '));
    if(p.earpiece) parts.push((EARPIECE.find(e=>e.v===p.earpiece)||{}).l||p.earpiece);
    const feats=PERSONAL_FEATURES.filter(f=>p.personalFeatures?.[f.k]).map(f=>f.l);
    if(feats.length) parts.push(feats.join(', '));
    return parts.join(' · ');
  }
  if(p.productType==='personal-dp') return t.l+' · MTRoA';
  if(t.group==='personal') return t.l;
  if(t.group==='other') return p.productTypeOther||p.dut||'Other';
  return t.l;
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  BUILT_IN_OS, CHROME_FEATURES, CHROME_MIC, CHROME_OS, EARPIECE, HEADSET_CONN,
  HEADSET_CONN_MAP, PERSONAL_FEATURES, PRODUCT_TYPES, PRODUCT_TYPES_BY_PLATFORM,
  PRODUCT_TYPE_MAP, SELF_HOSTED_TYPES, TEST_DISTANCES, chromeSummary, headsetConnLabels,
  headsetConnValues, platformUsesExtra, productTypeSummary, productTypesFor, usesProductType
};
