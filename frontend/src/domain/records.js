import { recordStatus } from './archive.js';
import { todayISO } from '../utils/dates.js';

const STORAGE_KEY='aclab_v5';

const LEGACY_KEYS=['aclab_v4','aclab_v3'];


function migrateRecords(list){
  const typeMap={update:'acqua-fw',teststatus:'test-seq'};
  return list.map(r=>{
    let x={...r};
    if(x.platform==='Chrome') x={...x,platform:'Google',category:x.category||'Chrome Audio'};
    if(x.platform==='Other') x={...x,platform:'Google',category:x.category||''};
    if(x.status==='pending') x={...x,status:'in-progress'};
    if(typeMap[x.type]) x={...x,type:typeMap[x.type]};
    if(recordStatus(x)==='closed'&&!x.closedAt) x.closedAt=x.updated||x.created||todayISO();
    return x;
  });
}

// Combined image + file asset paths for a record/log (used when deleting to clean Storage)
function recordAssets(o){ return [...((o&&o.images)||[]),...((o&&o.files)||[])]; }


/* ===== Version history =====
   A changelog, not snapshots: each entry records what changed when the record was
   bumped to that version. Attachments are not kept per version — the record always
   carries the current ones. versions[] holds v2 onwards; v1 is the original. */
function recordVersionNo(r){ return 1+((r&&r.versions)||[]).length; }

function stripLogs(p){ const {logs,...pd}=p; return pd; }

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  LEGACY_KEYS, STORAGE_KEY, migrateRecords, recordAssets, recordVersionNo, stripLogs
};
