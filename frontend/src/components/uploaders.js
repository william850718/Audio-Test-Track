import { toast } from './ui.js';
import { ALLOWED_FILE_EXTS, CARD_THUMB_MAX, MAX_FILE_BYTES, MAX_FILE_COUNT, MAX_IMG_COUNT, TOTAL_FILE_BYTES, TOTAL_IMG_BYTES, compressImage, fileExt, fileIcon, fileIconColor, imgPublicUrl } from '../services/storage.js';
import { fileState, imgState, setFileState, setImgState } from '../state.js';
import { esc, fmtMB } from '../utils/format.js';

function imgItemBytes(im){ return im.kind==='new'?(im.file?.size||0):(im.size||0); }



function currentImgBytes(){ return imgState.list.reduce((s,im)=>s+imgItemBytes(im),0); }

// imgState.list items: {kind:'existing',path,name,size} | {kind:'new',file,name,url(objectURL)}



function initImageUploader(existing){
  const arr=Array.isArray(existing)?existing:[];
  setImgState({list:arr.map(im=>({kind:'existing',path:im.path,name:im.name||'image',size:im.size||0,disp:im.disp||'md'})),original:arr.slice()});
  renderImageUploader();
}



function renderImageUploader(){
  const wrap=document.getElementById('img-uploader');
  if(!wrap) return;
  const thumbs=imgState.list.map((im,i)=>{
    const url=im.kind==='new'?im.url:imgPublicUrl(im.path);
    const d=im.disp||'md';
    return `<div class="img-thumb">
      <img src="${url}" alt="${esc(im.name)}" onclick="openImageLightbox('${url.replace(/'/g,"\\'")}')">
      <button type="button" class="rm" title="Remove" onclick="removeUploadImage(${i})"><i class="ti ti-x" aria-hidden="true"></i></button>
      <select class="img-size" title="Display size on the card" onchange="setImgDisp(${i},this.value)">
        <option value="sm" ${d==='sm'?'selected':''}>S</option>
        <option value="md" ${d==='md'?'selected':''}>M</option>
        <option value="lg" ${d==='lg'?'selected':''}>L</option>
      </select>
    </div>`;
  }).join('');
  const canAdd=imgState.list.length<MAX_IMG_COUNT;
  wrap.innerHTML=`<div class="img-thumbs">${thumbs}
    ${canAdd?`<label class="img-add-btn"><i class="ti ti-camera-plus" aria-hidden="true"></i><span>Add image</span>
      <input type="file" accept="image/*" multiple hidden onchange="onPickImages(this)"></label>`:''}
  </div>
  <div class="img-hint"><i class="ti ti-info-circle" aria-hidden="true"></i> Large photos are auto-compressed — but please avoid very large files. Up to ${MAX_IMG_COUNT} images · ${fmtMB(currentImgBytes())} / ${fmtMB(TOTAL_IMG_BYTES)} total used</div>`;
}



async function onPickImages(input){
  const files=Array.from(input.files||[]);
  input.value='';
  for(let f of files){
    if(imgState.list.length>=MAX_IMG_COUNT){ toast('You can attach at most '+MAX_IMG_COUNT+' images.','warn'); break; }
    if(!/^image\//.test(f.type)){ toast('"'+f.name+'" is not an image file.','warn'); continue; }
    const origSize=f.size;
    f=await compressImage(f);   // shrink large images (keeps them legible)
    // Remind the user when a large photo was picked (it is auto-compressed, but flag it)
    if(origSize>=3*1024*1024){
      toast('"'+f.name+'" was large ('+fmtMB(origSize)+') — auto-compressed to '+fmtMB(f.size)+'. Please keep uploads reasonably small.','info',4200);
    }
    if(currentImgBytes()+f.size>TOTAL_IMG_BYTES){
      toast('"'+f.name+'" ('+fmtMB(f.size)+') would exceed the '+fmtMB(TOTAL_IMG_BYTES)+' total limit. Used: '+fmtMB(currentImgBytes())+' / '+fmtMB(TOTAL_IMG_BYTES)+'.','warn',4200);
      continue;
    }
    imgState.list.push({kind:'new',file:f,name:f.name,size:f.size,disp:'md',url:URL.createObjectURL(f)});
  }
  renderImageUploader();
}



function setImgDisp(i,v){ if(imgState.list[i]) imgState.list[i].disp=v; }



function removeUploadImage(i){
  const im=imgState.list[i];
  if(im&&im.kind==='new'&&im.url) URL.revokeObjectURL(im.url);
  imgState.list.splice(i,1);
  renderImageUploader();
}



// compact: fixed-size thumbnails for list cards. The full-size view (which honours each
// image's S/M/L setting) is what the record view and the lightbox show.
function imagesDisplayHtml(images,compact){
  if(!Array.isArray(images)||!images.length) return '';
  const open=u=>`event.stopPropagation();openImageLightbox('${u.replace(/'/g,"\\'")}')`;
  if(!compact){
    return '<div class="rec-images">'+images.map(im=>{
      const url=imgPublicUrl(im.path);
      return `<img class="sz-${im.disp||'md'}" src="${url}" alt="${esc(im.name||'')}" loading="lazy" onclick="${open(url)}">`;
    }).join('')+'</div>';
  }
  const shown=images.slice(0,CARD_THUMB_MAX), extra=images.length-shown.length;
  return '<div class="rec-thumbs">'+shown.map((im,i)=>{
    const url=imgPublicUrl(im.path);
    const more=(extra>0&&i===shown.length-1)?`<span class="thumb-more">+${extra}</span>`:'';
    return `<span class="thumb" onclick="${open(url)}" title="${esc(im.name||'Screenshot')}">
      <img src="${url}" alt="${esc(im.name||'')}" loading="lazy">${more}</span>`;
  }).join('')+'</div>';
}



function openImageLightbox(url){
  if(!url) return;
  const ov=document.createElement('div');
  ov.className='img-lightbox';
  const close=()=>{ document.removeEventListener('keydown',onKey,true); ov.remove(); };
  // Capture phase + stopPropagation so Escape closes the image, not the record view behind it
  function onKey(e){ if(e.key==='Escape'){ e.stopPropagation(); close(); } }
  ov.onclick=close;
  ov.innerHTML=`<img src="${url}" alt=""><button type="button" class="lb-close" title="Close"><i class="ti ti-x" aria-hidden="true"></i></button>`;
  document.body.appendChild(ov);
  document.addEventListener('keydown',onKey,true);
}




function initFileUploader(existing){
  const arr=Array.isArray(existing)?existing:[];
  setFileState({list:arr.map(f=>({kind:'existing',path:f.path,name:f.name||'file',size:f.size||0,ext:f.ext||fileExt(f.name)})),original:arr.slice()});
  renderFileUploader();
}



function fileItemBytes(f){ return f.kind==='new'?(f.file?.size||0):(f.size||0); }



function currentFileBytes(){ return fileState.list.reduce((s,f)=>s+fileItemBytes(f),0); }



function renderFileUploader(){
  const wrap=document.getElementById('file-uploader');
  if(!wrap) return;
  const rows=fileState.list.map((f,i)=>{
    const ext=f.ext||fileExt(f.name);
    return `<div class="file-chip">
      <i class="ti ${fileIcon(ext)}" style="color:${fileIconColor(ext)}" aria-hidden="true"></i>
      <span class="file-name" title="${esc(f.name)}">${esc(f.name)}</span>
      <span class="file-size">${fmtMB(fileItemBytes(f))}</span>
      <button type="button" class="file-rm" title="Remove" onclick="removeUploadFile(${i})"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>`;
  }).join('');
  const canAdd=fileState.list.length<MAX_FILE_COUNT;
  wrap.innerHTML=`<div class="file-list">${rows}</div>
    ${canAdd?`<label class="file-add-btn"><i class="ti ti-paperclip" aria-hidden="true"></i><span>Add file</span>
      <input type="file" accept="${ALLOWED_FILE_EXTS.map(e=>'.'+e).join(',')}" multiple hidden onchange="onPickFiles(this)"></label>`:''}
    <div class="img-hint">Up to ${MAX_FILE_COUNT} files · max ${fmtMB(MAX_FILE_BYTES)} each · ${fmtMB(currentFileBytes())} / ${fmtMB(TOTAL_FILE_BYTES)} total used · allowed: ${ALLOWED_FILE_EXTS.join(', ')}</div>`;
}



function onPickFiles(input){
  const files=Array.from(input.files||[]);
  input.value='';
  for(const f of files){
    if(fileState.list.length>=MAX_FILE_COUNT){ toast('You can attach at most '+MAX_FILE_COUNT+' files.','warn'); break; }
    const ext=fileExt(f.name);
    if(!ALLOWED_FILE_EXTS.includes(ext)){ toast('"'+f.name+'": file type not allowed. Allowed: '+ALLOWED_FILE_EXTS.join(', '),'warn',4600); continue; }
    if(f.size>MAX_FILE_BYTES){ toast('"'+f.name+'" ('+fmtMB(f.size)+') exceeds the '+fmtMB(MAX_FILE_BYTES)+' per-file limit. Please attach a smaller file.','warn',4600); continue; }
    if(currentFileBytes()+f.size>TOTAL_FILE_BYTES){ toast('"'+f.name+'" ('+fmtMB(f.size)+') would exceed the '+fmtMB(TOTAL_FILE_BYTES)+' total. Used: '+fmtMB(currentFileBytes())+'.','warn',4600); continue; }
    fileState.list.push({kind:'new',file:f,name:f.name,size:f.size,ext});
  }
  renderFileUploader();
}



function removeUploadFile(i){ fileState.list.splice(i,1); renderFileUploader(); }



function filesDisplayHtml(files){
  if(!Array.isArray(files)||!files.length) return '';
  return '<div class="rec-files">'+files.map(f=>{
    const ext=f.ext||fileExt(f.name);
    const url=imgPublicUrl(f.path);
    return `<a class="file-dl" href="${url}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="${esc(f.name)} (${fmtMB(f.size||0)})">
      <i class="ti ${fileIcon(ext)}" style="color:${fileIconColor(ext)}" aria-hidden="true"></i>
      <span class="file-name">${esc(f.name)}</span>
      <span class="file-size">${fmtMB(f.size||0)}</span>
      <i class="ti ti-download dl-ic" aria-hidden="true"></i>
    </a>`;
  }).join('')+'</div>';
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  currentFileBytes, currentImgBytes, fileItemBytes, filesDisplayHtml, imagesDisplayHtml,
  imgItemBytes, initFileUploader, initImageUploader, onPickFiles, onPickImages,
  openImageLightbox, removeUploadFile, removeUploadImage, renderFileUploader,
  renderImageUploader, setImgDisp
};
