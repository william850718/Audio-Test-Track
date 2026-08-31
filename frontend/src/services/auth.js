import { currentLoginEmail, setCurrentLoginEmailValue } from '../state.js';

function getCurrentUser(){
  const em=currentLoginEmail||localStorage.getItem(LOGIN_EMAIL_KEY)||'';
  return em.includes('@')?em.split('@')[0]:em;
}


// Full address — getCurrentUser() is only the display name, so it must not be used as a key
function getCurrentEmail(){
  return (currentLoginEmail||localStorage.getItem(LOGIN_EMAIL_KEY)||'').trim().toLowerCase();
}


function setCurrentLoginEmail(email){
  setCurrentLoginEmailValue((email||'').trim());
}


const LOGIN_EMAIL_KEY='aclab_login_email';


/* Only ever deleted now. The app used to keep the account password here in plain
   text so it could refill the field; the browser's own password manager does that
   properly, encrypted and behind the OS. purgeStoredPassword() clears it on every
   start so the ones already saved go away without anyone having to be told. */
const LOGIN_PASS_KEY='aclab_login_pass';


/* Named "creds" from when it also covered the password. Renaming it would reset
   the checkbox for everyone currently ticked, for a key no one ever sees — so the
   name stays and this comment explains it. It means: remember the email. */
const REMEMBER_CREDS_KEY='aclab_remember_creds';


/* Runs on every start, whatever the checkbox says: the point is to remove what
   earlier versions saved, and those users have no reason to know it is there. */
function purgeStoredPassword(){
  try{ localStorage.removeItem(LOGIN_PASS_KEY); }catch(e){}
  try{ sessionStorage.removeItem(LOGIN_PASS_KEY); }catch(e){}
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  LOGIN_EMAIL_KEY, LOGIN_PASS_KEY, REMEMBER_CREDS_KEY, getCurrentEmail, getCurrentUser,
  purgeStoredPassword, setCurrentLoginEmail
};
