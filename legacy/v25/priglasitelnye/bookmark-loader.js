(function (global) {
  'use strict';
  const groups={
    seed:{files:['bookmark-seed.js'],ready:()=>!!global.BOOKMARK_SEED},
    raster:{files:['bookmark-raster-portraits.js'],ready:()=>!!global.BookmarkRasterPortraits},
    docx:{files:['vendor/pako-inflate.min.js','bookmark-import.js'],ready:()=>!!global.BookmarkImport},
    pdf:{files:['vendor/pdf-lib.min.js'],ready:()=>!!global.PDFLib?.PDFDocument},
    themes:{files:['bookmark-theme-assets.js','brand/bookmark-brand.js','bookmark-themes.js'],ready:()=>!!global.BookmarkThemes&&!!global.BookmarkThemeAssets&&!!global.BookmarkBrand}
  };
  const pending=new Map(),base=new URL('.',document.currentScript?.src||global.location.href);
  function executeInline(node){
    const script=document.createElement('script');script.textContent=node.textContent;
    document.head.append(script);script.remove();
  }
  async function loadFile(group,file){
    if(file==='vendor/pako-inflate.min.js'&&global.pako?.inflateRaw)return;
    const inline=Array.from(document.querySelectorAll('script[type="application/x-bookmark-script"]')).find(node=>node.dataset.bookmarkAsset===group&&node.dataset.bookmarkFile===file);
    if(inline){executeInline(inline);return;}
    await new Promise((resolve,reject)=>{
      const version=file==='bookmark-themes.js'?20:['bookmark-seed.js','bookmark-import.js','bookmark-raster-portraits.js'].includes(file)?23:13;
      const script=document.createElement('script');script.src=new URL(file+'?v='+version,base).href;script.async=false;
      script.onload=()=>{script.remove();resolve();};
      script.onerror=()=>{script.remove();reject(new Error('Не удалось загрузить '+file+'. Проверьте, что на хостинг загружена вся папка редактора.'));};
      document.head.append(script);
    });
  }
  function ensure(name){
    const group=groups[name];
    if(!group)return Promise.reject(new Error('Неизвестный модуль редактора: '+name+'.'));
    if(group.ready())return Promise.resolve();
    if(pending.has(name))return pending.get(name);
    const task=(async()=>{for(const file of group.files)await loadFile(name,file);if(!group.ready())throw new Error('Модуль '+name+' не запустился. Обновите страницу и повторите действие.');})();
    pending.set(name,task);
    task.catch(()=>{if(pending.get(name)===task)pending.delete(name);});
    return task;
  }
  global.BookmarkAssets=Object.freeze({ensure,isReady:name=>!!groups[name]?.ready()});
})(window);
