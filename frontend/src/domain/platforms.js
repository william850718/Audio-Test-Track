/* samples: 該平台/分類可選的 Sample Type。
   - 放在平台層 = 該平台所有分類共用
   - 放在分類層 = 只有該分類適用（優先於平台層）
   - 兩層都沒有 = 該組合不需要 Sample Type，表單不顯示這一段 */
const PLATFORMS={
  Teams:{
    color:'teams',pfx:'TM',label:'Teams',
    samples:[
      {v:'personal-hs-usb',l:'Personal - Headset (USB)'},
      {v:'personal-hs-dongle',l:'Personal - Headset (Dongle)'},
      {v:'personal-hs-nbt-classic',l:'Personal - Headset (NBT-Classic)'},
      {v:'personal-hs-nbt-lea',l:'Personal - Headset (NBT-LE Audio)'},
      {v:'personal-speakerphone',l:'Personal - Speakerphone'},
      {v:'personal-deskphone',l:'Personal - Deskphone'},
      {v:'personal-laptop',l:'Personal - Laptop'},
      /* Three, not two: a shared speakerphone may carry no system of its own and
         connect like a peripheral, which is the case the plain entry covers and the
         one existing records already use. MTRoW/MTRoA name the built-in system the
         same way Project Log does. */
      {v:'shared-speakerphone',l:'Shared - Speakerphone'},
      {v:'shared-speakerphone-mtrow',l:'Shared - Speakerphone (MTRoW)'},
      {v:'shared-speakerphone-mtroa',l:'Shared - Speakerphone (MTRoA)'}
    ],
    categories:[
      {v:'Audio',l:'Audio'},
      {v:'Function',l:'Function',children:[
        {v:'ASP HID',l:'ASP HID'},
        {v:'Telemetry',l:'Telemetry'},
        {v:'UCQ',l:'UCQ'},
        {v:'NBT Function',l:'NBT Function'}
      ]},
      {v:'RTC',l:'RTC (Real-time Communication)'}
    ]
  },
  'Microsoft HDE':{
    color:'cortana',pfx:'CO',label:'Microsoft HDE',
    categories:[
      {v:'Cortana',l:'Cortana',children:[
        {v:'HWKWS',l:'HWKWS'},
        {v:'SWKWS',l:'SWKWS'}
      ],samples:[
        {v:'hde-headset',l:'Headset'},
        {v:'hde-laptop',l:'Laptop'},
        {v:'hde-center-of-room',l:'Center of room'},
        {v:'hde-edge-of-room',l:'Edge of room'}
      ]},
      // Talk Analysis Suite 只有筆電，不需要 Sample Type
      {v:'Talk Analysis Suite',l:'Talk Analysis Suite'}
    ]
  },
  Zoom:{
    color:'zoom',pfx:'ZM',label:'Zoom',
    categories:[
      {v:'Audio',l:'Audio',samples:[
        {v:'zoom-meeting',l:'Zoom Meeting'},
        {v:'zoom-rooms',l:'Zoom Rooms'}
      ]},
      {v:'AIO',l:'AIO (Function)',samples:[
        {v:'zoom-zrc',l:'ZRC'},
        {v:'zoom-zrp',l:'ZRP'},
        {v:'zoom-fw-aio',l:'FW&AIO'}
      ]}
    ]
  },
  Intel:{
    color:'intel',pfx:'IN',label:'Intel',
    categories:[
      {v:'SPET',l:'SPET',samples:[
        {v:'intel-lnl',l:'LNL'},
        {v:'intel-ptl',l:'PTL'}
      ]},
      {v:'BT Audio',l:'BT Audio'}
    ]
  },
  Google:{
    color:'google',pfx:'GG',label:'Google',
    categories:[
      {v:'Fastpair',l:'Fastpair'},
      {v:'ART',l:'ART (GRT)'},
      {v:'BART',l:'BART (BGRT)'},
      {v:'SASS',l:'SASS'},
      {v:'FindMyDevices',l:'FindMyDevices'},
      {v:'Chrome Audio',l:'Chrome Audio',samples:[
        {v:'google-chromebox',l:'Chromebox'},
        {v:'google-chromebook-system',l:'Chromebook system'},
        {v:'google-alos-system',l:'ALOS system'},
        {v:'google-soundcheck-v20',l:'Soundcheck v.20'},
        {v:'google-soundcheck-v21',l:'Soundcheck v.21'}
      ]}
    ]
  },
  Lenovo:{
    color:'lenovo',pfx:'LN',label:'Lenovo',
    samples:[
      {v:'lenovo-soundcheck-v20',l:'Soundcheck v.20'},
      {v:'lenovo-soundcheck-v21',l:'Soundcheck v.21'},
      {v:'lenovo-winbg',l:'WinBG'},
      {v:'lenovo-sweep',l:'Sweep'},
      {v:'lenovo-pink-noise',l:'Pink noise'}
    ],
    categories:[
      {v:'LNV',l:'LNV'},
      {v:'HWF',l:'HWF'}
    ]
  }
};

const PLAT_NAMES=Object.keys(PLATFORMS);

const PLAT_COLOR=Object.fromEntries(PLAT_NAMES.map(p=>[p,PLATFORMS[p].color]));

const PLAT_PFX=Object.fromEntries(PLAT_NAMES.map(p=>[p,PLATFORMS[p].pfx]));

/* ===== Lab Instruments ===== */
// The lab roster (note = what the lab is used for). Instrument data lives in Supabase.
const LABS=[
  {id:'A1',note:'TAS'},
  {id:'A2',note:''},
  {id:'A3',note:'Zoom'},
  {id:'A4',note:''},
  {id:'A5',note:''},
  {id:'A6',note:'Zoom AIO'},
  {id:'A7',note:''},
  {id:'A8',note:'203 Cortana'},
  {id:'A9',note:'Stylus'},
  {id:'A10',note:'202 SPET/DNS'}
];

function catDef(plat){return PLATFORMS[plat]?.categories?.[0]?.v||'';}

function catLbl(plat,v){
  const c=PLATFORMS[plat]?.categories?.find(x=>x.v===v);
  return c?c.l:v;
}

function catDisplay(r){
  if(!r.category) return '';
  let s=catLbl(r.platform,r.category);
  if(r.subCategory) s+=' · '+r.subCategory;
  return s;
}

function catHasChildren(plat,cat){
  return !!PLATFORMS[plat]?.categories?.find(x=>x.v===cat)?.children?.length;
}

/* ===== Category / Type filter menus =====
   Native <select> cannot nest, so these two filters are custom menus with a
   fly-out for the one level of children (Function/Cortana, and Update). The
   hidden q-cat / q-subcat / q-type / q-subtype-update selects stay the source
   of truth, so every existing filter/export path keeps reading them unchanged. */
const UPDATE_SUBTYPES=[
  {v:'spec',l:'Spec'},{v:'sequence',l:'Sequence'},
  {v:'firmware',l:'Firmware'},{v:'test-tool',l:'Test Tool'}
];

const STATUSES=[
  {v:'in-progress',lbl:'In progress',cls:'b-inprog'},
  {v:'closed',lbl:'Closed',cls:'b-closed'}
];

const STATUS_MAP=Object.fromEntries(STATUSES.map(s=>[s.v,s]));

const STATUS_NEXT={
  'in-progress':'closed',
  'closed':'in-progress'
};

const STATUS_NEXT_LBL={
  'in-progress':'→ Closed',
  'closed':'↺ In progress'
};


const TYPES=[
  {v:'issue',lbl:'ISSUE',cls:'b-issue'},
  {v:'acqua-fw',lbl:'ACQUA FW Update',cls:'b-acqua-fw'},
  {v:'test-seq',lbl:'Test SEQ Update',cls:'b-test-seq'},
  {v:'spec',lbl:'Spec Update',cls:'b-spec'},
  {v:'hw-cal',lbl:'Hardware Calibration/Maint.',cls:'b-hw-cal'}
];

const TYPE_MAP=Object.fromEntries(TYPES.map(t=>[t.v,t]));


const TYPES_ALT=[
  {v:'issue',lbl:'ISSUE',cls:'b-issue'},
  {v:'note',lbl:'Note',cls:'b-spec'},
  {v:'spec',lbl:'Spec Update',cls:'b-spec'},
  {v:'hw-update',lbl:'Hardware Update',cls:'b-hw-cal'}
];

const TYPES_ALT_MAP=Object.fromEntries(TYPES_ALT.map(t=>[t.v,t]));


const TYPES_AUDIO=[
  {v:'note',lbl:'Note',cls:'b-spec'},
  {v:'issue',lbl:'Issue',cls:'b-issue'},
  {v:'update',lbl:'Update',cls:'b-test-seq'},
  {v:'hw-cal',lbl:'Hardware Calibration/Maint.',cls:'b-hw-cal'}
];

const TYPES_AUDIO_MAP=Object.fromEntries(TYPES_AUDIO.map(t=>[t.v,t]));


function getTypesForPlat(plat,cat){ return TYPES_AUDIO; }

const TYPE_ICON={note:'ti-note',issue:'ti-alert-triangle',update:'ti-refresh','hw-cal':'ti-tool',
  'acqua-fw':'ti-refresh','test-seq':'ti-list-check',spec:'ti-file-text','hw-update':'ti-tool'};

const CERT_LBL={'teams-cert':'Teams Cert','uc-cert':'UC Cert','internal':'Internal'};

const CERT_CLS={'teams-cert':'b-teams-cert','uc-cert':'b-uc-cert','internal':'b-internal'};




/* ===== Note Sample Type (Platform Tracking) =====
   清單由「平台 + 平台分類」決定，定義在 PLATFORMS 的 samples 欄位 */
// 已停用、但可能存在於舊記錄的選項：只用於顯示名稱，不會再出現在表單
const LEGACY_SAMPLE_TYPES=[
  {v:'shared-deskphone',l:'Shared - Deskphone'}
];

// 所有出現過的 value -> label（徽章 / CSV / PDF 顯示舊記錄時查得到）
const NOTE_SAMPLE_TYPE_MAP=(()=>{
  const m={};
  LEGACY_SAMPLE_TYPES.forEach(t=>{m[t.v]=t;});
  PLAT_NAMES.forEach(p=>{
    const cfg=PLATFORMS[p];
    (cfg.samples||[]).forEach(t=>{m[t.v]=t;});
    (cfg.categories||[]).forEach(c=>(c.samples||[]).forEach(t=>{m[t.v]=t;}));
  });
  return m;
})();

// 該「平台+分類」可選的清單：分類層優先，其次平台層；都沒有 = 不需要 Sample Type
function sampleOptsFor(plat,cat){
  const cfg=PLATFORMS[plat];
  if(!cfg) return [];
  const c=cfg.categories?.find(x=>x.v===cat);
  if(c&&Array.isArray(c.samples)) return c.samples;
  return Array.isArray(cfg.samples)?cfg.samples:[];
}

// 表單用：可選清單 + 已勾選但不在清單內的舊值（避免編輯舊記錄時遺失資料）
function sampleTypesFor(plat,cat,selected){
  const opts=sampleOptsFor(plat,cat);
  const known=new Set(opts.map(t=>t.v));
  const extra=(selected||[]).filter(v=>!known.has(v)).map(v=>NOTE_SAMPLE_TYPE_MAP[v]||{v,l:v});
  return opts.concat(extra);
}

// Backward-compatible: new records use sampleTypes[] , old records used sampleType (string)
function recordSampleValues(r){
  return Array.isArray(r.sampleTypes)?r.sampleTypes:(r.sampleType?[r.sampleType]:[]);
}

function recordSampleLabels(r){
  return recordSampleValues(r).map(v=>(NOTE_SAMPLE_TYPE_MAP[v]&&NOTE_SAMPLE_TYPE_MAP[v].l)||v).filter(Boolean);
}


function legacyTypeLabel(type){
  const map={update:'ACQUA FW Update',teststatus:'Test SEQ Update'};
  return map[type]||type;
}

function recordTypeLabel(r){
  const to=TYPES_AUDIO_MAP[r.type]||TYPE_MAP[r.type]||TYPES_ALT_MAP[r.type];
  return to?to.lbl:legacyTypeLabel(r.type);
}

/* What the lab starts with before app_settings is read. It lives in the domain
   layer so the shared state can seed appConfig from it without state.js having
   to reach into a view. */
const DEFAULT_TEST_SOFTWARE=['ACQUA','Soundcheck','LabBGN','3Pass','SPET','IADK'];

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  CERT_CLS, CERT_LBL, DEFAULT_TEST_SOFTWARE, LABS, LEGACY_SAMPLE_TYPES, NOTE_SAMPLE_TYPE_MAP,
  PLATFORMS, PLAT_COLOR, PLAT_NAMES, PLAT_PFX, STATUSES, STATUS_MAP, STATUS_NEXT,
  STATUS_NEXT_LBL, TYPES, TYPES_ALT, TYPES_ALT_MAP, TYPES_AUDIO, TYPES_AUDIO_MAP, TYPE_ICON,
  TYPE_MAP, UPDATE_SUBTYPES, catDef, catDisplay, catHasChildren, catLbl, getTypesForPlat,
  legacyTypeLabel, recordSampleLabels, recordSampleValues, recordTypeLabel, sampleOptsFor,
  sampleTypesFor
};
