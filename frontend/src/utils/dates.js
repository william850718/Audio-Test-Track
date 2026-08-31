// Days since an ISO date (null-safe)
/* There were two daysSince. This one shadowed the other by hoisting order alone;
   the dead one returned Infinity for a missing date and parsed a date-only string
   as UTC midnight, which is the timezone bug fixed in 8a5c59b. Modules turn that
   collision into a hard error instead of a silent override, which is how it was
   finally found. */

/* Local calendar day, not UTC. toISOString() reports the UTC date, which in Taipei
   is still yesterday between midnight and 08:00 - so anything closed or logged in
   that window was stamped a day early, and daysSince() reads the string back as
   local midnight, so the two have to agree on which day it is. Under the old timer
   that meant a record could be deleted a day before its thirty were up. */
function localISO(d){ return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }

function todayISO(){ return localISO(new Date()); }

function isoDaysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return localISO(d); }

function isoMonthsAhead(n){ const d=new Date(); d.setMonth(d.getMonth()+n); return localISO(d); }


function fmtDateShort(iso){
  if(!iso) return '';
  const p=iso.split('-');
  return p.length>=3?`${+p[1]}/${+p[2]}`:iso;
}


function daysSince(iso){
  if(!iso) return 0;
  return Math.floor((Date.now()-new Date(iso+'T00:00:00').getTime())/86400000);
}

function nowISO(){return new Date().toISOString();}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  daysSince, fmtDateShort, isoDaysAgo, isoMonthsAhead, localISO, nowISO, todayISO
};
