import { getCurrentEmail } from '../services/auth.js';
import { myApproval } from '../state.js';
import { daysSince } from '../utils/dates.js';

/* Filing a note in Platform Tracking when it belonged in Project Log is a mistake
   the person who made it should be able to clear up themselves. So deletion is not
   simply admin-only: you may also delete something you filed, for a few days.

   The window runs from created, never from updated - updated moves every time
   anyone saves, which would make the window reopen forever. Legacy rows carry no
   createdBy at all, so they stay admin-only; there is no way to tell whose they
   were, and guessing in the permissive direction is the wrong guess to make.

   None of this is a security boundary - the table is writable through the API by
   anyone signed in. It is here so a stale render or a mis-click cannot be the thing
   standing between fourteen people and a permanently deleted record. */
const OWN_DELETE_DAYS=7;



function ownedRecently(item){
  const me=getCurrentEmail();
  if(!me||!item||!item.createdBy||!item.created) return false;
  if(String(item.createdBy).trim().toLowerCase()!==me) return false;
  return daysSince(item.created)<=OWN_DELETE_DAYS;
}



function canDelete(item){ return myApproval.isAdmin||ownedRecently(item); }

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  OWN_DELETE_DAYS, canDelete, ownedRecently
};
