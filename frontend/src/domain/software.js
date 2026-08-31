import { DEFAULT_TEST_SOFTWARE } from './platforms.js';
import { appConfig } from '../state.js';
import { esc } from '../utils/format.js';

function testSoftwareList(){ return (appConfig.testSoftware&&appConfig.testSoftware.length)?appConfig.testSoftware:DEFAULT_TEST_SOFTWARE; }


function softwareOpts(sel){
  return '<option value="">— Select test software —</option>'+
    testSoftwareList().map(s=>`<option value="${esc(s)}" ${sel===s?'selected':''}>${esc(s)}</option>`).join('')+
    `<option value="__other__" ${sel==='__other__'?'selected':''}>Other…</option>`;
}


function recordSoftwareLabel(r){
  if(!r.testSoftware) return '';
  return r.testSoftware==='__other__'?(r.testSoftwareOther||'Other'):r.testSoftware;
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  recordSoftwareLabel, softwareOpts, testSoftwareList
};
