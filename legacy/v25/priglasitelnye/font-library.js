(function (global) {
  'use strict';
  const providers = [
    {id:'google',name:'Google Fonts',url:'https://fonts.google.com/'},
    {id:'fontsource',name:'Fontsource · jsDelivr',url:'https://fontsource.org/'}
  ];
  const catalog = [
    ['Roboto','Без засечек'],['Open Sans','Без засечек'],['Montserrat','Без засечек'],['Inter','Без засечек'],
    ['PT Sans','Без засечек'],['PT Serif','С засечками'],['Lora','С засечками'],['Merriweather','С засечками'],
    ['Playfair Display','С засечками'],['Cormorant Garamond','С засечками'],['Roboto Slab','Брусковый'],
    ['Oswald','Узкий'],['Russo One','Акцидентный'],['Comfortaa','Округлый'],['Marck Script','Рукописный'],['Caveat','Рукописный']
  ].map(([name,category]) => ({name,category,provider:'google'}));
  // Pinned, verified releases. No package manager is used by the editor.
  catalog.push(...[
    ['PT Sans','pt-sans','Без засечек'],['PT Serif','pt-serif','С засечками'],['Fira Sans','fira-sans','Без засечек'],
    ['IBM Plex Sans','ibm-plex-sans','Без засечек'],['IBM Plex Serif','ibm-plex-serif','С засечками'],['Manrope','manrope','Геометрический'],
    ['Philosopher','philosopher','Акцидентный'],['Bad Script','bad-script','Рукописный'],['Lobster','lobster','Рукописный'],
    ['Neucha','neucha','Рукописный'],['Amatic SC','amatic-sc','Узкий рукописный'],['Ubuntu','ubuntu','Без засечек']
  ].map(([name,id,category])=>({name,id,category,provider:'fontsource',version:'5.3.0',license:id==='ubuntu'?'UFL-1.0':'OFL-1.1'})));
  const externalLibraries = [
    {name:'Fontsource',url:'https://fontsource.org/',hint:'Каталог и файлы шрифтов'},
    {name:'Font Squirrel',url:'https://www.fontsquirrel.com/',hint:'Скачайте TTF/OTF и загрузите файл в проект'},
    {name:'ParaType',url:'https://www.paratype.ru/',hint:'Каталог производителя; лицензия зависит от шрифта'}
  ];
  function providerName(id) {return providers.find(provider=>provider.id===id)?.name||'Библиотека шрифтов';}
  async function get(url,kind='blob',provider='google') {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(url, {signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if (!response.ok) {const error=new Error([400,404].includes(response.status)?'Шрифт не найден в '+providerName(provider)+'. Проверьте название семейства.':providerName(provider)+' сейчас недоступен: '+response.status);error.fontResponse=true;throw error;}
      return kind==='text'?await response.text():await response.blob();
    } catch (error) {if(error.fontResponse)throw error;throw new Error(error.name==='AbortError'?'Загрузка шрифта заняла слишком много времени.':'Не удалось загрузить шрифт. Проверьте подключение к '+providerName(provider)+'.');}
    finally {clearTimeout(timer);}
  }
  function dataURL(blob) {
    return new Promise((resolve,reject) => {const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Не удалось прочитать шрифт.'));reader.readAsDataURL(blob);});
  }
  function definitions(css,cssURL,provider,allowedPrefix) {
    const faces=[];
    for(const match of css.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
      const sources=[...match[1].matchAll(/url\(\s*['"]?([^\s)'";]+)['"]?\s*\)/g)];
      const source=sources.find(item=>/\.woff2(?:$|\?)/i.test(item[1]))||sources[0];
      if(!source)continue;
      let url;try{url=new URL(source[1],cssURL);}catch(_){continue;}
      const trusted=provider==='google'?url.protocol==='https:'&&url.hostname==='fonts.gstatic.com':url.href.startsWith(allowedPrefix)&&url.protocol==='https:'&&url.hostname==='cdn.jsdelivr.net';
      if(!trusted)continue;
      const range=match[1].match(/unicode-range:\s*([^;]+);/i);
      faces.push({url:url.href,unicodeRange:range?range[1].trim():'U+0-10FFFF'});
    }
    return faces;
  }
  async function download(name,onProgress,provider='google') {
    name=String(name).trim();
    if(!providers.some(item=>item.id===provider))throw new Error('Неизвестная библиотека шрифтов.');
    if(!/^[A-Za-z0-9 ._-]{1,100}$/.test(name))throw new Error('Введите название семейства, например Roboto Condensed.');
    let cssURL,sourceURL,allowedPrefix='',license='',fontName=name;
    if(provider==='fontsource') {
      const selected=catalog.find(font=>font.provider==='fontsource'&&(font.name.toLowerCase()===name.toLowerCase()||font.id===name.toLowerCase()));
      if(!selected)throw new Error('Выберите шрифт Fontsource из списка.');
      allowedPrefix='https://cdn.jsdelivr.net/npm/@fontsource/'+selected.id+'@'+selected.version+'/';
      cssURL=allowedPrefix+'400.css';sourceURL='https://fontsource.org/fonts/'+selected.id;fontName=selected.name;license=selected.license;
    } else {
      const url=new URL('https://fonts.googleapis.com/css2');url.searchParams.set('family',name+':wght@400');url.searchParams.set('display','swap');
      cssURL=url.href;sourceURL='https://fonts.google.com/specimen/'+encodeURIComponent(name);
    }
    const css=await get(cssURL,'text',provider),parts=definitions(css,cssURL,provider,allowedPrefix);
    if(!parts.length||parts.length>30)throw new Error(providerName(provider)+' вернул неизвестный формат шрифта.');
    const faces=[];let total=0;
    for(let i=0;i<parts.length;i++) {
      const blob=await get(parts[i].url,'blob',provider);total+=blob.size;
      if(!blob.size)throw new Error('Библиотека вернула пустой файл шрифта.');
      if(total>10*1024*1024)throw new Error('Файлы этого шрифта превышают 10 МБ.');
      faces.push({data:await dataURL(blob),unicodeRange:parts[i].unicodeRange});
      if(onProgress)onProgress(i+1,parts.length);
    }
    return {name:fontName,source:providerName(provider),provider,sourceURL,license,data:faces[0].data,faces};
  }
  global.InviteFonts=Object.freeze({catalog,providers,externalLibraries,download});
})(window);
