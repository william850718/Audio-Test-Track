import { toast } from './ui.js';
import { OWN_DELETE_DAYS, canDelete } from '../domain/permissions.js';
import { getCurrentEmail } from '../services/auth.js';
import { myApproval } from '../state.js';

function requireDelete(item,what){
  if(canDelete(item)) return true;
  const me=getCurrentEmail();
  const mine=!!(item&&item.createdBy&&String(item.createdBy).trim().toLowerCase()===me);
  toast(mine
    ? `You can only delete a ${what} you filed within ${OWN_DELETE_DAYS} days. Ask an admin.`
    : `Only an admin, or whoever filed it, can delete this ${what}.`,'warn',4500);
  return false;
}



function requireAdmin(why){
  if(myApproval.isAdmin) return true;
  toast(why||'Admins only.','warn',4000);
  return false;
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  requireAdmin, requireDelete
};
