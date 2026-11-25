(function(global){
  'use strict';
  // This is a display name for the activity log, never an authentication claim.
  function refreshActor(){
    let name='';try{name=global.ProjectLibrary?.getActor()||'';}catch(_){}
    for(const link of document.querySelectorAll('[data-studio-actor]')){
      link.textContent=name||'Представиться';
      link.title=name?'Имя для истории: '+name:'Указать имя для истории';
    }
  }
  refreshActor();global.addEventListener('storage',refreshActor);global.addEventListener('pageshow',refreshActor);global.addEventListener('studio:identity',refreshActor);
  document.addEventListener('click',event=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const link=event.target.closest?.('.studio-app-nav a[aria-current=page]');if(link)event.preventDefault();},true);
})(window);
