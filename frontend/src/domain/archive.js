import { sortedLogs } from './certification.js';
import { migrateRecords } from './records.js';
import { daysSince, todayISO } from '../utils/dates.js';

function recordStatus(r){return r?.status==='pending'?'in-progress':(r?.status||'in-progress');}

const ARCHIVE_AFTER_DAYS=30;


function applyStatusOnRecord(r,status){
  r.status=status;
  r.updated=todayISO();
  if(status==='closed'){
    if(!r.closedAt) r.closedAt=todayISO();
  }else{
    delete r.closedAt;
  }
}

/* closedAt is the real field; the other two are fallbacks for rows closed before
   it existed. An item with no date at all reads as not archived - daysSince gives
   0 for a missing date, and guessing "old" would hide it the moment it is closed. */
function recordClosedAt(r){ return r.closedAt||r.updated||r.created||''; }

function isRecordArchived(r){
  return recordStatus(r)==='closed'&&daysSince(recordClosedAt(r))>=ARCHIVE_AFTER_DAYS;
}

/* Records get closedAt backfilled at load (see migrateRecords); projects never did,
   so a project closed before the field existed has to be dated from something else.

   Deliberately not p.updated: saveProjectRow and submitLog both stamp it with
   today, so it means "last touched" and every log filed against a closed project
   would push its archive date forward again. The newest log is when work actually
   stopped, which is the question being asked. Falling back to created keeps a
   closed project with no logs at all from sitting in the list forever. */
function projectClosedAt(p){
  if(p.closedAt) return p.closedAt;
  const last=sortedLogs(p.logs)[0];
  return (last&&last.date)||p.created||'';
}

function isProjectArchived(p){
  return p.status==='closed'&&daysSince(projectClosedAt(p))>=ARCHIVE_AFTER_DAYS;
}

function closeDaysOf(r){
  const end=r.closedAt||r.updated;
  if(!r.created||!end) return null;
  const d=Math.round((new Date(end)-new Date(r.created))/86400000);
  return d>=0?d:null;
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  ARCHIVE_AFTER_DAYS, applyStatusOnRecord, closeDaysOf, isProjectArchived, isRecordArchived,
  projectClosedAt, recordClosedAt, recordStatus
};
