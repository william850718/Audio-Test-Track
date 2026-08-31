import { DEFAULT_TEST_SOFTWARE } from './domain/platforms.js';

/* The mutable state that more than one module touches.

   Exported bindings are live: another module that imports `records` sees every
   later value, so every read stays a plain `records`. What an importer cannot do
   is assign to one - that is a TypeError - so each of these has a setter, and the
   assignment sites (there are 33) call it. Reads, which are the other three
   hundred, did not have to change at all.

   Only what actually crosses a module boundary is here. State that belongs to one
   module - curLab, editId, the _lab* drafts, the search debounce timers - stays a
   plain let where it is used; moving it here would claim it is shared. */

export let sb = null;                  // Supabase client, built during initApp
export let currentLoginEmail = '';

export let records = [];
export let projects = [];
export let labInstruments = {};
export let appConfig = { testSoftware: DEFAULT_TEST_SOFTWARE.slice() };

export let curP = 'all';               // platform tab
export let viewMode = 'platform';      // platform | project | lab
export let curProjectId = null;

/* Who is signed in and what they may do. Read by permissions, by the guards on
   every destructive control and by the login screen, so it crosses everything. */
export let myApproval = { approved: false, isAdmin: false, known: false };
export let allowedUsersCache = null;   // filled once per session for the admin picker

export let imgState  = { list: [], original: [] };
export let fileState = { list: [], original: [] };

export function setSb(v){ sb = v; }
/* Named ...Value because setCurrentLoginEmail already exists and does more:
   it is the app-level action, and it calls this. */
export function setCurrentLoginEmailValue(v){ currentLoginEmail = v; }
export function setRecords(v){ records = v; }
export function setProjects(v){ projects = v; }
export function setLabInstruments(v){ labInstruments = v; }
export function setAppConfig(v){ appConfig = v; }
export function setCurP(v){ curP = v; }
export function setViewMode(v){ viewMode = v; }
export function setCurProjectId(v){ curProjectId = v; }
export function setImgState(v){ imgState = v; }
export function setFileState(v){ fileState = v; }
export function setMyApproval(v){ myApproval = v; }
export function setAllowedUsersCache(v){ allowedUsersCache = v; }
