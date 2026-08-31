import { ARCHIVE_AFTER_DAYS, isProjectArchived, isRecordArchived } from '../frontend/src/domain/archive.js';
import { CERT_PHASES, CERT_PLATFORMS, certItemsFor, certPlatLabel, certProgress, hasProgressBar, logCertItems, projOS, projPlatform, qualSampleClash } from '../frontend/src/domain/certification.js';
import { OWN_DELETE_DAYS, canDelete, ownedRecently } from '../frontend/src/domain/permissions.js';
import { headsetConnValues, productTypeSummary, productTypesFor, usesProductType } from '../frontend/src/domain/products.js';
import { allowedUsersCache, currentLoginEmail, myApproval, projects, sb, setAllowedUsersCache, setCurrentLoginEmailValue, setMyApproval } from '../frontend/src/state.js';
import { daysSince, isoDaysAgo, todayISO } from '../frontend/src/utils/dates.js';
import { fmtUser } from '../frontend/src/utils/format.js';
import { allowedUserNames, identityOptions } from '../frontend/src/views/login.js';

/* ===== Self-check =====
   Type runSelfCheck() in the console. Covers the certification rules, which are
   the part of this file where a change is most likely to break something that
   still looks fine on screen — a percentage is wrong quietly.

   Pure functions only: nothing here touches the DOM, the network or stored data,
   so it is safe to run at any time, including in production. */
function runSelfCheck(){
  const out=[]; let pass=0, fail=0;
  const eq=(name,got,want)=>{
    const ok=JSON.stringify(got)===JSON.stringify(want);
    ok?pass++:fail++;
    out.push(`${ok?'  ok  ':'  FAIL'}  ${name}`);
    if(!ok) out.push(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  };

  // --- builders -------------------------------------------------------------
  const hs=(conns,btn,logs)=>({platform:'Teams',productType:'personal-hs',
    connectionTypes:conns,personalFeatures:{teamsButton:!!btn},logs:logs||[]});
  const spk=(os,ctl,conns)=>({platform:'Teams',productType:'shared-sp',os,hasControls:!!ctl,
    connectionTypes:conns||[],personalFeatures:{},logs:[]});
  const names=p=>certItemsFor(p).map(i=>i.l);
  const pct=p=>certProgress(p).pct;
  const passLog=v=>({phase:'qualification',certItems:[v],result:'pass'});

  // --- Teams headset checklist, by connection mode --------------------------
  eq('headset: USB+Dongle+NBT', names(hs(['usb-wired','usb-dongle','bt-classic'],true)),
     ['Audio (Dongle)','Audio (NBT)','Function (USB)','Function (Dongle)','NBT Function',
      'Cortana (Dongle)','Cortana (NBT)']);
  eq('headset: all four modes', names(hs(['usb-wired','usb-dongle','bt-classic','bt-lea'],true)).length, 10);
  eq('headset: USB+Dongle', names(hs(['usb-wired','usb-dongle'],true)),
     ['Audio (Dongle)','Function (USB)','Function (Dongle)','Cortana (Dongle)']);
  eq('headset: USB alone still tests Audio', names(hs(['usb-wired'],true)),
     ['Audio (USB)','Function (USB)','Cortana (USB)']);
  eq('headset: NBT alone', names(hs(['bt-classic'],true)), ['Audio (NBT)','NBT Function','Cortana (NBT)']);
  eq('headset: Dongle alone', names(hs(['usb-dongle'],true)),
     ['Audio (Dongle)','Function (Dongle)','Cortana (Dongle)']);
  eq('headset: LE Audio names NBT Function Classic',
     names(hs(['bt-classic','bt-lea'],true)).includes('NBT Function (Classic)'), true);
  eq('no Teams Button drops ASP',
     certItemsFor(hs(['usb-wired'],false)).find(i=>i.v==='fn:usb').note, 'HID / Telemetry / UCQ');

  // --- Self-hosted speakerphone / SoundBar ----------------------------------
  eq('MTRoW', names(spk('Windows',true)), ['Audio','Function','Cortana']);
  eq('MTRoW without controls still tests HID', names(spk('Windows',false)), ['Audio','Function','Cortana']);
  eq('MTRoA', names(spk('Android',false)), ['Audio','Loop Latency']);
  eq('Deskphone is MTRoA', names({platform:'Teams',productType:'personal-dp',logs:[]}), ['Audio','Loop Latency']);
  eq('external speakerphone: no controls drops HID',
     certItemsFor(spk('',false,['usb-dongle'])).find(i=>i.v==='fn:dongle').note, 'Telemetry / UCQ');
  eq('SoundBar matches Speakerphone',
     names(spk('Windows',true)), names({...spk('Windows',true),productType:'shared-sb'}));

  // --- Scoring --------------------------------------------------------------
  const seven=['audio:dongle','audio:nbt','fn:usb','fn:dongle','fn:nbt','cortana:dongle','cortana:nbt'];
  const three=['usb-wired','usb-dongle','bt-classic'];
  eq('debug alone is 20%', pct(hs(three,true,[{phase:'debug'}])), 20);
  eq('all items + debug is 100%', pct(hs(three,true,[{phase:'debug'},...seven.map(passLog)])), 100);
  eq('no debug logged: items carry the full 100%', pct(hs(three,true,seven.map(passLog))), 100);
  eq('a fail does not count', pct(hs(three,true,[{phase:'debug'},
     {phase:'qualification',certItems:['fn:usb'],result:'fail'}])), 20);
  eq('a waived fail does count', pct(hs(three,true,[{phase:'debug'},
     {phase:'qualification',certItems:['fn:usb'],result:'fail',waived:true}])), 31);
  eq('reference item needs no result', pct(hs(three,true,[{certItems:['cortana:dongle']}])), 14);
  eq('one log can carry several items',
     pct(hs(three,true,[{phase:'qualification',certItems:['fn:usb','fn:dongle'],result:'pass'}])), 29);
  eq('closed project reads 100%', pct({...hs(three,true,[]),status:'closed'}), 100);
  eq('adding debug never lowers the total', (()=>{
    for(let k=0;k<=7;k++){
      const p=hs(three,true,seven.slice(0,k).map(passLog));
      const before=certProgress(p).pct;
      p.logs.push({phase:'debug'});
      if(certProgress(p).pct<before) return `dropped at k=${k}`;
    }
    return 'never';
  })(), 'never');

  // --- Platforms ------------------------------------------------------------
  eq('Zoom checklist', names({platform:'Zoom',logs:[]}), ['Audio','AIO (Function)']);
  eq('Chromebook has no checklist', names({platform:'Google',logs:[]}), []);
  eq('Lenovo checklist', names({platform:'Lenovo',logs:[]}), ['LNV','HWF']);
  eq('only Teams and Zoom show a bar',
     CERT_PLATFORMS.filter(k=>hasProgressBar({platform:k})), ['Teams','Zoom']);
  eq('Chromebook and Lenovo ask for no product type',
     [usesProductType('Google'),usesProductType('Lenovo')], [false,false]);
  eq('Teams product types', productTypesFor('Teams').length, 6);
  eq('platform labels', CERT_PLATFORMS.map(certPlatLabel), ['Teams','Zoom','Chromebook','Lenovo']);

  // --- Reading older records ------------------------------------------------
  eq('a project with no platform is Teams', projPlatform({}), 'Teams');
  eq('a headset has no OS', projOS({productType:'personal-hs',os:'Windows'}), '');
  eq('a Deskphone is always Android', projOS({productType:'personal-dp'}), 'Android');
  eq('a log may store one item or many',
     [logCertItems({certItem:'a'}),logCertItems({certItems:['a','b']}),logCertItems({})],
     [['a'],['a','b'],[]]);
  eq('a headset may store one connection or many',
     [headsetConnValues({connectionType:'usb-wired'}),headsetConnValues({connectionTypes:['a']})],
     [['usb-wired'],['a']]);
  eq('a Chromebook saved before the fields existed claims nothing',
     productTypeSummary({platform:'Google',dut:'old'}), 'old');

  // --- Other rules ----------------------------------------------------------
  eq('one PAL ID across qualification is fine',
     qualSampleClash({logs:[{phase:'qualification',sampleNo:'P1'},{phase:'qualification',sampleNo:'P1'}]}), null);
  eq('two PAL IDs are reported',
     qualSampleClash({logs:[{phase:'qualification',sampleNo:'P1'},{phase:'requal',sampleNo:'P2'}]}), ['P1','P2']);
  eq('debug may swap units freely',
     qualSampleClash({logs:[{phase:'debug',sampleNo:'P1'},{phase:'debug',sampleNo:'P9'}]}), null);
  eq('a waiver only applies to certification phases', CERT_PHASES, ['qualification','requal']);
  eq('login names read as names', fmtUser('mia_jan'), 'Mia Jan');

  // --- Archiving ------------------------------------------------------------
  // Derived from the date, so these need dates rather than a stored flag
  const ago=isoDaysAgo;
  const old=ago(ARCHIVE_AFTER_DAYS+1), fresh=ago(1), edge=ago(ARCHIVE_AFTER_DAYS);
  // The stamp and the comparison have to agree on today, or every boundary below
  // silently slides by a day and the off-by-one it is meant to catch gets through
  eq('todayISO and daysSince agree on today', daysSince(todayISO()), 0);
  eq('a day ago is one day ago', daysSince(ago(1)), 1);
  eq('the archive boundary is exactly the threshold', daysSince(edge), ARCHIVE_AFTER_DAYS);
  eq('an open record never archives, however old',
     isRecordArchived({status:'in-progress',closedAt:old}), false);
  eq('a recently closed record stays in the list',
     isRecordArchived({status:'closed',closedAt:fresh}), false);
  eq('a long-closed record archives',
     isRecordArchived({status:'closed',closedAt:old}), true);
  eq('the boundary day itself archives',
     isRecordArchived({status:'closed',closedAt:edge}), true);
  eq('the day before the boundary does not',
     isRecordArchived({status:'closed',closedAt:ago(ARCHIVE_AFTER_DAYS-1)}), false);
  eq('a record closed before closedAt existed falls back to updated',
     isRecordArchived({status:'closed',updated:old}), true);
  eq('a closed record with no date at all is not assumed old',
     isRecordArchived({status:'closed'}), false);
  eq('pending still counts as open',
     isRecordArchived({status:'pending',closedAt:old}), false);
  eq('projects archive on the same rule',
     [isProjectArchived({status:'closed',closedAt:old}),
      isProjectArchived({status:'closed',closedAt:fresh}),
      isProjectArchived({status:'open',closedAt:old})],
     [true,false,false]);
  // The bug this pins: p.updated is stamped with today by every save, so a legacy
  // project without closedAt never aged and never left the list
  eq('a legacy project is dated by its newest log, not by when it was last touched',
     isProjectArchived({status:'closed',updated:todayISO(),
                        logs:[{date:old,id:'a'},{date:ago(200),id:'b'}]}), true);
  eq('a recent log keeps a closed project in the list',
     isProjectArchived({status:'closed',updated:todayISO(),logs:[{date:fresh,id:'a'}]}), false);
  eq('an explicit closedAt still wins over the logs',
     isProjectArchived({status:'closed',closedAt:fresh,logs:[{date:old,id:'a'}]}), false);
  eq('a closed project with no logs falls back to created',
     [isProjectArchived({status:'closed',created:old,logs:[]}),
      isProjectArchived({status:'closed',created:fresh,logs:[]})], [true,false]);
  eq('a closed project with no dates at all is not assumed old',
     isProjectArchived({status:'closed',logs:[]}), false);

  // --- Who may delete -------------------------------------------------------
  const savedEmail=currentLoginEmail;
  setCurrentLoginEmailValue('alex.kim@example.com');
  const savedAdmin=myApproval;
  setMyApproval({approved:true,isAdmin:false,known:true});
  const mine=(d,by)=>({createdBy:by===undefined?'alex.kim@example.com':by,created:ago(d)});
  eq('you may delete something you filed today', ownedRecently(mine(0)), true);
  eq('and on the last day of the window', ownedRecently(mine(OWN_DELETE_DAYS)), true);
  eq('but not the day after', ownedRecently(mine(OWN_DELETE_DAYS+1)), false);
  eq('never somebody elses, however recent',
     ownedRecently(mine(0,'robin_ng@example.com')), false);
  eq('case and padding in the stored address do not matter',
     ownedRecently(mine(0,'  Alex.Kim@Example.com  ')), true);
  eq('a legacy row with no createdBy stays admin-only', ownedRecently(mine(0,'')), false);
  eq('a row with no created date is not treated as filed today',
     ownedRecently({createdBy:'alex.kim@example.com'}), false);
  eq('nothing at all is not deletable', [ownedRecently(null),ownedRecently({})], [false,false]);
  // The window must run from created, not updated: an item edited today but filed
  // long ago is exactly the case a moving window would silently reopen
  eq('editing does not reopen the window',
     ownedRecently({createdBy:'alex.kim@example.com',created:ago(90),updated:todayISO()}), false);
  setMyApproval({approved:true,isAdmin:true,known:true});
  eq('an admin may delete anything, including legacy rows',
     [canDelete(mine(999,'someone.else@example.com')), canDelete({})], [true,true]);
  setMyApproval(savedAdmin);
  setCurrentLoginEmailValue(savedEmail);

  // --- Identity -------------------------------------------------------------
  // The picker must never silently reassign a record to somebody else
  // Invented accounts on example.com: this repo is public, so no real colleague
  // and no company domain goes in a fixture
  const savedUsers=allowedUsersCache;
  setAllowedUsersCache([{email:'alex.kim@example.com',approved:true},
                     {email:'robin_ng@example.com',approved:true},
                     {email:'not.yet@example.com',approved:false}]);
  eq('only approved accounts are offered', allowedUserNames(), ['alex.kim','robin_ng']);
  eq('a legacy free-text name survives as its own option',
     identityOptions('Old Name').includes('value="Old Name"'), true);
  eq('the current value is the one selected',
     (identityOptions('robin_ng').match(/value="robin_ng" selected/)||[]).length, 1);
  eq('a known name is not duplicated',
     (identityOptions('alex.kim').match(/value="alex.kim"/g)||[]).length, 1);
  setAllowedUsersCache(savedUsers);

  console.log(`Self-check: ${pass} ok, ${fail} failed\n`+out.join('\n'));
  return {pass,fail};
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  runSelfCheck
};
