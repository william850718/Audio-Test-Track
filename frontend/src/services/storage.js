import { fileState, imgState, sb } from '../state.js';

/* ===== Image attachments (Supabase Storage) ===== */
const ATTACH_BUCKET='attachments';


const TOTAL_IMG_BYTES=5*1024*1024; // 5MB total across all images in one record / log


const MAX_IMG_COUNT=5;             // up to 5 images per record / log


function imgPublicUrl(path){
  try{ return sb.storage.from(ATTACH_BUCKET).getPublicUrl(path).data.publicUrl; }catch(e){ return ''; }
}


// Delete a set of images {path} from Storage (best-effort; used when a record/log is removed)
async function deleteStoredImages(images){
  const paths=(images||[]).map(im=>im&&im.path).filter(Boolean);
  if(!paths.length) return;
  try{ await sb.storage.from(ATTACH_BUCKET).remove(paths); }catch(e){ console.warn('Image cleanup failed',e); }
}


function sanitizeImgName(n){ return String(n||'image').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-60); }


// Uploads new files, deletes removed existing ones, returns final images array [{path,name}]
async function commitImages(scope){
  const finalList=[];
  for(const im of imgState.list){
    if(im.kind==='existing'){ finalList.push({path:im.path,name:im.name,size:im.size||0,disp:im.disp||'md'}); continue; }
    const path=`${scope}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${sanitizeImgName(im.name)}`;
    const {error}=await sb.storage.from(ATTACH_BUCKET).upload(path,im.file,{contentType:im.file.type,upsert:false});
    if(error) throw new Error('Image upload failed: '+(error.message||error));
    finalList.push({path,name:im.name,size:im.file.size,disp:im.disp||'md'});
  }
  const kept=new Set(finalList.map(f=>f.path));
  const removed=(imgState.original||[]).filter(im=>!kept.has(im.path)).map(im=>im.path);
  if(removed.length){ try{ await sb.storage.from(ATTACH_BUCKET).remove(removed); }catch(e){ console.warn('Image cleanup failed',e); } }
  return finalList;
}


const CARD_THUMB_MAX=3;   // how many screenshots a list card previews before folding the rest


/* ===== File attachments (Excel / PDF / Word … — Supabase Storage) ===== */
const MAX_FILE_BYTES=10*1024*1024;    // 10MB per file


const TOTAL_FILE_BYTES=25*1024*1024;  // 25MB total across all files in one record / log


const MAX_FILE_COUNT=10;


const ALLOWED_FILE_EXTS=['pdf','xlsx','xls','docx','doc','pptx','ppt','csv','txt','zip'];


function fileExt(name){ const m=String(name||'').toLowerCase().match(/\.([a-z0-9]+)$/); return m?m[1]:''; }


function fileIcon(ext){
  return ({pdf:'ti-file-type-pdf',xlsx:'ti-file-type-xls',xls:'ti-file-type-xls',csv:'ti-file-type-csv',
    docx:'ti-file-type-doc',doc:'ti-file-type-doc',pptx:'ti-file-type-ppt',ppt:'ti-file-type-ppt',
    txt:'ti-file-type-txt',zip:'ti-file-type-zip'})[ext]||'ti-file';
}


function fileIconColor(ext){
  return ({pdf:'#f87171',xlsx:'#34d399',xls:'#34d399',csv:'#34d399',docx:'#60a5fa',doc:'#60a5fa',
    pptx:'#fb923c',ppt:'#fb923c',txt:'#9ca3af',zip:'#c4b5fd'})[ext]||'#9ca3af';
}

// fileState.list items: {kind:'existing',path,name,size,ext} | {kind:'new',file,name,size,ext}


// Uploads new files, deletes removed existing ones, returns final files array [{path,name,size,ext}]
async function commitFiles(scope){
  const finalList=[];
  for(const f of fileState.list){
    if(f.kind==='existing'){ finalList.push({path:f.path,name:f.name,size:f.size||0,ext:f.ext||fileExt(f.name)}); continue; }
    const path=`${scope}/files/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${sanitizeImgName(f.name)}`;
    const {error}=await sb.storage.from(ATTACH_BUCKET).upload(path,f.file,{contentType:f.file.type||'application/octet-stream',upsert:false});
    if(error) throw new Error('File upload failed: '+(error.message||error));
    finalList.push({path,name:f.name,size:f.file.size,ext:f.ext||fileExt(f.name)});
  }
  const kept=new Set(finalList.map(f=>f.path));
  const removed=(fileState.original||[]).filter(f=>!kept.has(f.path)).map(f=>f.path);
  if(removed.length){ try{ await sb.storage.from(ATTACH_BUCKET).remove(removed); }catch(e){ console.warn('File cleanup failed',e); } }
  return finalList;
}


/* ===== Client-side image compression (keeps images legible) ===== */
function loadImageEl(file){ return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>{URL.revokeObjectURL(img.src);res(img);}; img.onerror=rej; img.src=URL.createObjectURL(file); }); }


async function compressImage(file){
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;   // skip gif/svg/unknown
  if(file.size < 400*1024) return file;                          // already small
  try{
    const img=await loadImageEl(file);
    const maxDim=1600, scale=Math.min(1, maxDim/Math.max(img.width,img.height));
    if(scale===1 && file.size < 1.2*1024*1024) return file;      // fine as-is
    const w=Math.round(img.width*scale), h=Math.round(img.height*scale);
    const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
    cv.getContext('2d').drawImage(img,0,0,w,h);
    const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.82));
    if(!blob||blob.size>=file.size) return file;                 // no real gain
    return new File([blob], file.name.replace(/\.(png|webp|jpeg)$/i,'.jpg'), {type:'image/jpeg'});
  }catch(e){ return file; }
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  ALLOWED_FILE_EXTS, ATTACH_BUCKET, CARD_THUMB_MAX, MAX_FILE_BYTES, MAX_FILE_COUNT,
  MAX_IMG_COUNT, TOTAL_FILE_BYTES, TOTAL_IMG_BYTES, commitFiles, commitImages, compressImage,
  deleteStoredImages, fileExt, fileIcon, fileIconColor, imgPublicUrl, loadImageEl,
  sanitizeImgName
};
