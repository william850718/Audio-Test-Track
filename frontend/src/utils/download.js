/* Not downloadTextFile: that one prepends a BOM so Excel reads CSV as UTF-8, and a
   BOM in front of JSON breaks JSON.parse and the json module in Python alike. */
function downloadJson(name,obj){
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  downloadJson
};
