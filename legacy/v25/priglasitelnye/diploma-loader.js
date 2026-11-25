(function(global){
  'use strict';
  const groups={pdf:{files:['vendor/pdf-lib.min.js'],ready:()=>!!global.PDFLib},frost:{files:['diploma-theme-assets.js','brand/bookmark-brand.js'],ready:()=>!!global.DiplomaThemeAssets&&!!global.BookmarkBrand},sociology:{files:['diploma-preset-sociology.js'],ready:()=>!!global.DiplomaSociologyPreset}};
  const pending=new Map(),base=new URL('.',document.currentScript?.src||location.href);
  async function file(group,name){
    const inline=[...document.querySelectorAll('script[type="application/x-diploma-script"]')].find(n=>n.dataset.diplomaAsset===group&&n.dataset.diplomaFile===name);
    if(inline){const script=document.createElement('script');script.textContent=inline.textContent;document.head.append(script);script.remove();return;}
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL(name+'?v=25',base).href;script.onload=()=>{script.remove();resolve();};script.onerror=()=>{script.remove();reject(new Error(group==='sociology'?'Шаблон Дня социолога не установлен. Можно продолжить с нейтральным оформлением.':'Не удалось загрузить '+name+'. Проверьте файлы приложения и повторите.'));};document.head.append(script);});
  }
  function ensure(name){const group=groups[name];if(!group)return Promise.reject(new Error('Неизвестный модуль дипломов.'));if(group.ready())return Promise.resolve();if(pending.has(name))return pending.get(name);const task=(async()=>{for(const asset of group.files)await file(name,asset);if(!group.ready())throw new Error('Модуль не запустился. Обновите страницу.');})();pending.set(name,task);task.catch(()=>pending.delete(name));return task;}
  global.DiplomaAssets=Object.freeze({ensure,isReady:name=>!!groups[name]?.ready()});
})(window);
