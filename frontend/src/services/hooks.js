/* The data layer used to call render() and the fill*Filter() pair directly. Once
   it lives in frontend/src/services that is services -> views -> services, so it
   is handed these instead and main wires them up. The bodies are the same if/else
   that used to sit inline in both callers; nothing about what is drawn changed.

   One callback, not an event bus: this is a single decision about what "the data
   changed" means, and splitting it across three view files would mean opening all
   three to answer that question. If a second, independent subscriber ever appears
   - a notification badge, say - this becomes on('data:changed', ...) and the call
   sites do not move. */
let redraw = () => {};

let showLoadingPlaceholder = () => {};

function setRedraw(fn){ redraw = fn; }

function setLoadingPlaceholder(fn){ showLoadingPlaceholder = fn; }

/* Everything this module declares. These are internal modules rather than a public
   API, so exporting the lot removes a whole class of "forgot to export it" error;
   the import side is generated too, and over-importing costs nothing. */
export {
  redraw, setLoadingPlaceholder, setRedraw, showLoadingPlaceholder
};
