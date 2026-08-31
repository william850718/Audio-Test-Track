// Pull the first version-like number (e.g. 6.2.210) out of a value string
function extractVersion(s){ const m=String(s||'').match(/(\d+(?:\.\d+){1,4})/); return m?m[1]:''; }

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function qv(id){ return (document.getElementById(id)||{}).value||''; }

// Login names come from the email local part; show them as names, without rewriting stored data
function fmtUser(u){
  return String(u||'').split(/[._-]+/).filter(Boolean)
    .map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ')||String(u||'');
}
/* Closed items stop being listed after this many days, but are never deleted.
   This is internal test-method history - "when did we change the sequence, and
   why" is a question that gets asked years later, and a KPI tool built in 2027
   can only count what still exists. Archiving is derived from closedAt rather
   than stored: nothing to migrate, and no write traffic the moment an item
   crosses the line. Hard deletion is an admin doing it on purpose. */


function fmtDist(d){return d?(String(d).endsWith('m')?d:d+'m'):'';}


function fmtMB(b){ return (b/1048576).toFixed(2)+'MB'; }

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  esc, extractVersion, fmtDist, fmtMB, fmtUser, qv
};
