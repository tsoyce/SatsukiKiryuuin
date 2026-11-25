(function () {
  'use strict';
  const $=id=>document.getElementById(id),Store=window.BookmarkStore,Render=window.BookmarkRender;
  const history=window.InviteHistory.create({limit:30,mergeWindow:800});
  let project,dirty=false,revision=0,saveTimer,saveQueue=Promise.resolve(),pageIndex=0,cardView=true,previewSerial=0,renderTimer,busy=false,imported=null,confirmResolve,toastTimer,previewTask=null,previewPending=false,previewSide='front',backgroundTarget='front';
  const listNodes=new Map();let imageIndex=new Map(),imageIndexSource=null,queuedRevision=-1,queuedProjectId='';
  const compactMedia=window.matchMedia('(max-width:999px), (max-height:599px)'),reducedMotion=window.matchMedia('(prefers-reduced-motion:reduce)');
  const sections=[['bmCardsPanel','bmCardsTab','bmCardsHeading'],['bmEditorPanel','bmEditorTab','bmEditorHeading'],['bmPreviewPanel','bmPreviewTab','bmPreviewHeading']];
  let activeSection='bmPreviewPanel',presetsExpanded=false,navigating=false,checkingTitle=false,inspectorTab='card',fitFrame=0,compactOptionsMode=null;
  let zoomMode='fit',zoomActual=1,previewPhysical={width:140,height:65},zoomAnchor=null,handBinding,previewViewport=null;
  const zoomSteps=[50,75,100,125,150,200,300],screenPixelsPerMM=96/25.4;
  const blankProject=()=>({title:'Новые закладки',settings:{footer:false,backText:''}});
  const common={bmSize:'size',bmDirection:'direction',bmDesign:'design',bmFont:'font',bmFontSize:'fontSize',bmNameSize:'nameSize',bmPhotoWidth:'photoWidth',bmPhotoHeight:'photoHeight',bmLineHeight:'lineHeight',bmQuoteAlign:'quoteAlign',bmShowPhoto:'showPhoto',bmFrame:'frame',bmFooter:'footer',bmAccent:'accent',bmCuts:'cuts',bmBackgroundFit:'backgroundFit',bmBackBackgroundFit:'backBackgroundFit',bmBackTextColor:'backTextColor',bmBackDesign:'backDesign',bmPrintSide:'printSide',bmDuplexFlip:'duplexFlip',bmPrintLayer:'printLayer',bmLaserBlack:'laserBlack',bmTheme:'theme',bmBackTemplate:'backTemplate',bmSeriesGroup:'seriesGroup',bmBrandVisible:'brandVisible'};
  const individual={bmCardDirection:'direction',bmCardFont:'font',bmCardFontSize:'fontSize',bmCardNameSize:'nameSize',bmCardPhotoWidth:'photoWidth',bmCardPhotoHeight:'photoHeight',bmCardShowPhoto:'showPhoto',bmCardFooter:'footer',bmCardAccent:'accent'};
  const assets=name=>window.BookmarkAssets.ensure(name);
  const themeAssets=settings=>settings.theme&&settings.theme!=='custom'?assets('themes'):Promise.resolve();
  const renderSettings=value=>({...value.settings,themeCardOrder:value.cards.map(card=>card.id)});
  function images(){if(imageIndexSource!==project.images){imageIndexSource=project.images;imageIndex=new Map(project.images.map(i=>[i.id,i]));}return imageIndex;}
  const selected=()=>project?.cards.find(c=>c.id===project.selectedId);
  function scrollTo(el){el.scrollIntoView({behavior:reducedMotion.matches?'auto':'smooth',block:'start'});}
  function syncSections(){
    const compact=compactMedia.matches,nav=document.querySelector('.bm-mobile-nav');
    if(compactOptionsMode!==compact){for(const id of ['bmViewOptions','bmCheckDetails'])if($(id))$(id).open=!compact;compactOptionsMode=compact;}
    if(compact)nav.setAttribute('role','tablist');else nav.removeAttribute('role');
    for(const [panelId,tabId,headingId]of sections){const panel=$(panelId),tab=$(tabId),current=panelId===activeSection;
      panel.hidden=compact&&!current;panel.setAttribute('aria-labelledby',compact?tabId:headingId);
      if(compact){panel.setAttribute('role','tabpanel');tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(current));tab.tabIndex=current?0:-1;}
      else{panel.removeAttribute('role');tab.removeAttribute('role');tab.removeAttribute('aria-selected');tab.tabIndex=0;}
    }
    $('bmPresetToggle').hidden=!compact;$('bmPresetToggle').setAttribute('aria-expanded',String(presetsExpanded));$('bmDesignPresets').hidden=compact&&!presetsExpanded;
  }
  function revealInspector(){if(compactMedia.matches)return;if(document.body.classList.contains('studio-focus-mode')||document.body.classList.contains('studio-focus'))document.querySelector('[data-studio-toggle="focus"]')?.click();if(document.body.classList.contains('studio-right-hidden'))document.querySelector('[data-studio-toggle="right"]')?.click();}
  function showInspector(tab,{focus=false}={}){if(!['card','design','print'].includes(tab))return;inspectorTab=tab;for(const button of document.querySelectorAll('[data-bm-inspector]')){const current=button.dataset.bmInspector===tab;button.setAttribute('aria-selected',String(current));button.tabIndex=current?0:-1;$(button.getAttribute('aria-controls')).hidden=!current;}if(tab==='design')$('bmDesignSettings').open=true;revealInspector();if(focus)document.querySelector('[data-bm-inspector="'+tab+'"]').focus();}
  function showSection(id,{focus=false,scroll=false}={}){if(!sections.some(item=>item[0]===id))return;activeSection=id;syncSections();const panel=$(id);if(id==='bmEditorPanel')revealInspector();if(scroll)scrollTo(compactMedia.matches?document.querySelector('.bm-mobile-nav'):panel);if(focus)panel.focus({preventScroll:true});queueFit();}
  function queueFit(){cancelAnimationFrame(fitFrame);fitFrame=requestAnimationFrame(fitPreview);}
  function previewAnchor(){const wrap=$('bmCanvasWrap'),canvas=$('bmCanvas'),r=wrap.getBoundingClientRect(),c=canvas.getBoundingClientRect();if(!c.width||!c.height)return null;return{x:Math.max(0,Math.min(1,(r.left+wrap.clientWidth/2-c.left)/c.width)),y:Math.max(0,Math.min(1,(r.top+wrap.clientHeight/2-c.top)/c.height))};}
  function setZoom(mode){if(mode!=='fit'&&!zoomSteps.includes(Number(mode)))return;zoomAnchor=previewAnchor();zoomMode=String(mode);$('bmViewZoom').value=zoomMode;queueFit();}
  function stepZoom(direction){const percent=zoomActual*100,steps=direction>0?zoomSteps:zoomSteps.slice().reverse(),value=steps.find(step=>direction>0?step>percent+.1:step<percent-.1);if(value!==undefined)setZoom(value);}
  function previewDimensions(element,width,height,{floor=false}={}){for(const [property,value]of [['width',width],['height',height]]){const next=Number((floor?Math.floor(value*1000)/1000:value).toFixed(3))+'px';if(element.style[property]!==next)element.style[property]=next;}}
  function fitPreview(){
    const canvas=$('bmCanvas'),wrap=$('bmCanvasWrap'),stage=$('bmCanvasStage');if(!canvas||!wrap||!stage)return;
    if(compactMedia.matches){canvas.style.removeProperty('width');canvas.style.removeProperty('height');stage.style.removeProperty('width');stage.style.removeProperty('height');wrap.scrollLeft=0;wrap.scrollTop=0;zoomAnchor=null;handBinding?.refresh?.();return;}
    // clientWidth/clientHeight round fractional content boxes up at browser zoom.
    // Writing that larger size creates scrollbars, whose ResizeObserver event
    // would fit the smaller box, remove the bars, and repeat on every frame.
    const style=getComputedStyle(wrap),width=previewViewport?.width??wrap.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),height=previewViewport?.height??wrap.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);if(width<1||height<1)return;
    const physicalWidth=previewPhysical.width*screenPixelsPerMM,physicalHeight=previewPhysical.height*screenPixelsPerMM;
    zoomActual=zoomMode==='fit'?Math.min(width/physicalWidth,height/physicalHeight):Number(zoomMode)/100;
    const scaledWidth=physicalWidth*zoomActual,scaledHeight=physicalHeight*zoomActual;
    previewDimensions(canvas,scaledWidth,scaledHeight,{floor:zoomMode==='fit'});
    previewDimensions(stage,Math.max(width,scaledWidth),Math.max(height,scaledHeight),{floor:true});
    if(zoomMode==='fit'){wrap.scrollLeft=0;wrap.scrollTop=0;}else if(zoomAnchor){const r=wrap.getBoundingClientRect(),c=canvas.getBoundingClientRect();wrap.scrollLeft+=c.left+c.width*zoomAnchor.x-r.left-wrap.clientWidth/2;wrap.scrollTop+=c.top+c.height*zoomAnchor.y-r.top-wrap.clientHeight/2;}
    zoomAnchor=null;$('bmZoomOut').disabled=zoomActual<=.5+.001;$('bmZoomIn').disabled=zoomActual>=3-.001;$('bmZoomFit').setAttribute('aria-pressed',String(zoomMode==='fit'));handBinding?.refresh?.();
  }
  function snapshot(){return {...project,settings:{...project.settings},images:project.images.slice(),warnings:project.warnings.slice(),cards:project.cards.map(c=>({...c,crop:{...c.crop},overrides:{...c.overrides}}))};}
  function toast(message,error=false){clearTimeout(toastTimer);$('bmToast').textContent=message;$('bmToast').classList.toggle('error',error);$('bmToast').hidden=false;toastTimer=setTimeout(()=>$('bmToast').hidden=true,error?8500:4000);}
  function error(message){$('bmError').textContent=message;$('bmError').hidden=!message;}
  function safe(fn){return async event=>{if(busy)return;try{await fn(event);}catch(e){console.error(e);toast(e.message||'Не удалось выполнить действие.',true);}};}
  function status(message,isError=false){$('bmSaveStatus').textContent=message;$('bmSaveStatus').classList.toggle('error',isError);}
  function updateHistory(){$('bmUndo').disabled=busy||!history.canUndo;$('bmRedo').disabled=busy||!history.canRedo;}
  function updateRasterQuotes(){
    const button=$('bmAddRasterQuotes'),library=window.BookmarkRasterQuotes,available=!!project&&typeof library?.countMissing==='function'&&typeof library?.prepare==='function',missing=available?library.countMissing(project):0;
    button.disabled=busy||!available||!missing;button.textContent=available&&!missing?'Цитаты с картинок уже добавлены':'Добавить цитаты с картинок'+(missing?' ('+missing+')':'');
    button.title=available?(missing?'Добавить в конец списка только отсутствующие цитаты из исходного Word.':'Все цитаты из картинок уже есть в этом проекте.'):'Обновите файлы приложения, чтобы добавить цитаты из картинок.';
  }
  async function refreshProjects(){
    try{const list=await Store.list();if(!project)return;$('bmProjects').replaceChildren();
      if(!list.some(item=>item.id===project.id))list.unshift({id:project.id,title:project.title});
      for(const item of list){const option=new Option(item.title||'Без названия',item.id);$('bmProjects').add(option);}$('bmProjects').value=project.id;
    }catch(e){if(project){$('bmProjects').replaceChildren(new Option(project.title||'Без названия',project.id));}throw e;}
  }
  function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush().catch(()=>{}),500);}
  async function flush(){
    clearTimeout(saveTimer);if(!project)return;const id=project.id,currentRevision=revision;
    if(!dirty)return saveQueue;
    if(queuedProjectId===id&&queuedRevision===currentRevision)return saveQueue;
    const copy=snapshot();status('Сохранение…');
    const task=saveQueue.catch(()=>{}).then(()=>Store.save(copy));saveQueue=task;queuedProjectId=id;queuedRevision=currentRevision;
    try{const saved=await task;
      if(project.id===id){project.updatedAt=saved.updatedAt;if(revision===currentRevision){dirty=false;error('');status('Сохранено на этом устройстве');}else queueSave();await refreshProjects();}
    }catch(e){if(queuedProjectId===id&&queuedRevision===currentRevision)queuedRevision=-1;if(project?.id===id){status('Не сохранено · скачайте проект',true);error(e.message);}throw e;}
  }
  function changed(key='',record=true){revision++;dirty=true;error('');status('Изменения…');if(record)history.record(snapshot(),{mergeKey:key});updateHistory();queueSave();updateList();schedulePreview();}
  function pages(value=project){const copies=[];for(const card of value.cards)for(let i=0;i<card.copies;i++)copies.push(card);const result=[];for(let i=0;i<copies.length;i+=6)result.push(copies.slice(i,i+6));return result;}
  function jumpToCard(){const card=selected();if(!card)return;let position=0;for(const c of project.cards){if(c.id===card.id)break;position+=c.copies;}pageIndex=Math.floor(position/6);}
  function updateCardState(row,card){const state=[row.button.classList.contains('has-error')?'Не помещается':'',card.review?'Проверить':''].filter(Boolean).join(' · ');row.state.textContent=state;row.state.hidden=!state;row.button.setAttribute('aria-label',`${row.position}. ${card.name||'Без имени'}. Экземпляров: ${card.copies}${state?'. '+state:''}`);}
  function updateList(){
    const filter=$('bmSearch').value.toLocaleLowerCase('ru'),visible=[],live=new Set();
    project.cards.forEach((card,index)=>{if(filter&&!`${card.name} ${card.quote}`.toLocaleLowerCase('ru').includes(filter))return;
      let row=listNodes.get(card.id);if(!row){const button=document.createElement('button');button.className='bm-listitem';button.dataset.id=card.id;const count=document.createElement('span');count.className='bm-listnumber';const text=document.createElement('span');text.className='bm-listtext';const name=document.createElement('strong'),quote=document.createElement('small'),state=document.createElement('span');state.className='bm-liststatus';state.hidden=true;text.append(name,quote,state);const copies=document.createElement('span');copies.className='bm-listcopies';button.append(count,text,copies);row={button,count,name,quote,copies,state};listNodes.set(card.id,row);}
      const {button,count,name,quote,copies}=row;button.classList.toggle('active',card.id===project.selectedId);button.classList.toggle('needs-review',!!card.review);button.setAttribute('aria-pressed',String(card.id===project.selectedId));
      row.position=index+1;updateCardState(row,card);button.setAttribute('aria-describedby','bmCardKeyboardHint');button.tabIndex=-1;
      const values=[[count,String(index+1).padStart(2,'0')],[name,card.name||'Без имени'],[quote,card.quote||'Введите цитату'],[copies,'×'+card.copies]];for(const [node,value]of values)if(node.textContent!==value)node.textContent=value;visible.push(button);live.add(card.id);
    });
    const host=$('bmCardList');for(const [id,row]of listNodes)if(!live.has(id)){row.button.remove();listNodes.delete(id);}visible.forEach((button,index)=>{if(host.children[index]!==button)host.insertBefore(button,host.children[index]||null);});$('bmCardCount').textContent=project.cards.length;
    const tabStop=visible.find(button=>button.dataset.id===project.selectedId)||visible[0];if(tabStop)tabStop.tabIndex=0;
    $('bmSearchStatus').hidden=!filter;$('bmSearchStatus').textContent=filter?`Найдено: ${visible.length} из ${project.cards.length}`:'';
    $('bmListEmpty').hidden=!!visible.length;$('bmListEmptyText').textContent=filter?'Ничего не найдено. Попробуйте другое имя или слова из цитаты.':'Добавьте первую карточку или импортируйте документ Word.';$('bmClearSearch').hidden=!filter;
    const total=project.cards.reduce((n,c)=>n+c.copies,0);$('bmTotals').textContent=`Карточек: ${project.cards.length} · Экземпляров: ${total} · Листов А4: ${Math.ceil(total/6)}`;
    updateRasterQuotes();
  }
  function setField(id,value){const el=$(id);if(el.type==='checkbox')el.checked=!!value;else el.value=value;}
  function fillEditor(){
    const card=selected();$('bmTitle').value=project.title;for(const [id,key]of Object.entries(common))setField(id,project.settings[key]);fillBackgrounds();fillThemes();$('bmBackText').value=project.settings.backText;updatePrintInfo();
    const g=Render.geometry(project.settings);$('bmGeometry').textContent=`3 × 2 на А4. Поля: ${g.left.toLocaleString('ru-RU')} мм по бокам, ${g.top.toLocaleString('ru-RU')} мм сверху и снизу. Без промежутков.`;
    $('bmEmpty').hidden=!!card;$('bmCardEditor').hidden=!card;if(!card)return;
    $('bmName').value=card.name;$('bmQuote').value=card.quote;$('bmCopies').value=card.copies;$('bmCardPosition').textContent=`${project.cards.indexOf(card)+1} / ${project.cards.length}`;
    $('bmCharCount').textContent=card.quote.length+' знаков';$('bmReview').hidden=!card.review;$('bmReviewText').textContent=card.review||'';
    const image=images().get(card.photoId);$('bmPhoto').hidden=!image;if(image){if($('bmPhoto').getAttribute('src')!==image.dataUrl)$('bmPhoto').src=image.dataUrl;}else $('bmPhoto').removeAttribute('src');
    $('bmRemovePhoto').disabled=!image;$('bmCropControls').hidden=!image;fillCrop();
    const hasOverrides=Object.keys(card.overrides).length>0;$('bmOverride').checked=hasOverrides;$('bmIndividualFields').hidden=!hasOverrides;
    const effective={...project.settings,...card.overrides};for(const [id,key]of Object.entries(individual))setField(id,effective[key]);
    $('bmUp').disabled=project.cards.indexOf(card)===0;$('bmDown').disabled=project.cards.indexOf(card)===project.cards.length-1;
  }
  function fillThemes(){
    const s=project.settings,themed=s.theme!=='custom',series=themed&&s.backTemplate==='series';
    $('bmThemeOptions').hidden=!themed;$('bmSeriesGroupField').hidden=!series;$('bmSeriesHint').hidden=!series||s.seriesGroup!==0;
    $('bmOrnamentStrength').value=Math.round(s.ornamentStrength*100);$('bmOrnamentStrengthValue').textContent=$('bmOrnamentStrength').value+'%';
    $('bmThemeHint').textContent=themed?'Макет оборота, орнамент и логотипы можно изменить ниже.':'Белая бумага или загруженный фон. Настройки текста и фото сохраняются при выборе дизайна.';
    for(const button of document.querySelectorAll('[data-bm-preset]')){
      const key=button.dataset.bmPreset,active=key==='custom'?!themed:key==='frost'?s.theme==='frost'&&s.backTemplate==='department':key==='series'?s.theme==='frost'&&s.backTemplate==='series':s.theme==='cards'&&s.backTemplate==='ornament';
      button.setAttribute('aria-pressed',String(active));
    }
    const preset=document.querySelector('[data-bm-preset][aria-pressed=true]'),presetName=preset?.querySelector('span:last-child')?.firstChild?.textContent.trim()||'Выбрать дизайн';$('bmPresetToggle').textContent=presetName;$('bmPresetToggle').setAttribute('aria-label','Готовые дизайны: '+presetName);syncSections();
    $('bmFrontSettings').hidden=themed;$('bmBackSettings').hidden=themed&&s.backTemplate!=='text';
    for(const el of [$('bmBackBackground').parentElement,$('bmUploadBackBackground').parentElement,$('bmBackBackgroundFit').closest('label'),$('bmBackBackgroundOpacity').closest('label')])el.hidden=themed;
  }
  async function applyPreset(key){
    if(busy||key==='custom'&&project.settings.theme==='custom')return;const projectId=project.id;
    if(key!=='custom')await withBusy('Загрузка дизайнов…',()=>assets('themes'));
    if(project.id!==projectId)return;
    history.breakMerge();
    if(key==='custom')Object.assign(project.settings,{theme:'custom',backTemplate:'text'});
    else Object.assign(project.settings,{theme:key==='cards'?'cards':'frost',backTemplate:key==='series'?'series':key==='cards'?'ornament':'department',seriesGroup:0,ornamentStrength:.4,brandVisible:true,direction:'horizontal',design:'editorial',frame:true,footer:false,font:'montserrat',fontSize:12,minFontSize:9,nameSize:12,photoWidth:25,photoHeight:30,accent:'#354b65',backDesign:'plain',printSide:'duplex'});
    previewSide=key==='custom'?'front':'back';presetsExpanded=false;changed();fillEditor();showSection('bmPreviewPanel',{focus:compactMedia.matches,scroll:compactMedia.matches});
  }
  function fillCrop(){const c=selected()?.crop;if(!c)return;for(const [id,key]of [['bmCropX','x'],['bmCropY','y'],['bmZoom','zoom']])$(id).value=c[key];$('bmCropXValue').textContent=c.x+'%';$('bmCropYValue').textContent=c.y+'%';$('bmZoomValue').textContent=c.zoom.toFixed(2)+'×';const img=$('bmPhoto');img.style.objectPosition=`${c.x}% ${c.y}%`;}
  function fillBackgrounds(){for(const side of ['front','back']){const front=side==='front',prefix=front?'bmFront':'bmBack',key=front?'backgroundId':'backBackgroundId',image=images().get(project.settings[key]),img=$(prefix+'Background');img.hidden=!image;$(prefix+'BackgroundEmpty').hidden=!!image;if(image){if(img.getAttribute('src')!==image.dataUrl)img.src=image.dataUrl;}else img.removeAttribute('src');$(front?'bmRemoveFrontBackground':'bmRemoveBackBackground').disabled=!image;const opacityKey=front?'backgroundOpacity':'backBackgroundOpacity',id=front?'bmBackgroundOpacity':'bmBackBackgroundOpacity';$(id).value=Math.round(project.settings[opacityKey]*100);$(id+'Value').textContent=$(id).value+'%';}}
  function layerOptions(value=project){return{layer:value.settings.printLayer||'all',laserBlack:value.settings.laserBlack!==false};}
  function layerName(layer=project.settings.printLayer){return layer==='inkjet'?'струйный слой':layer==='laser'?'лазерный слой':'всё вместе';}
  function updateLayerInfo(){const layer=project.settings.printLayer||'all',black=project.settings.laserBlack!==false,themed=project.settings.theme!=='custom';$('bmLayerInfo').textContent=layer==='inkjet'?(themed?'Фон, фото, логотипы и графика дизайна. Текст и линии реза — на лазерном слое.':'Фон, фото, логотипы и цветные элементы. Текст и линии реза — на лазерном слое.'):layer==='laser'?(themed?(black?'Текст и линии реза — чистым чёрным. Графика дизайна, фото и логотипы — на струйном слое.':'Текст и линии реза с сохранением их цвета. Графика дизайна, фото и логотипы — на струйном слое.'):(black?'Текст и чёрные/серые линии, выведенные чистым чёрным. Фон, фото и логотипы — на струйном слое.':'Текст и чёрные/серые линии с сохранением их цвета. Фон, фото и логотипы — на струйном слое.')):'Весь макет в исходных цветах — в предпросмотре, PDF и печати.';$('bmCuts').disabled=layer==='inkjet';$('bmCutsLabel').textContent=layer==='inkjet'?'Линии реза — на лазерном слое':'Линии реза';}
  function updatePrintInfo(){const mode=project.settings.printSide,flip=project.settings.duplexFlip;$('bmDuplexFlip').disabled=mode==='front';$('bmDuplexInfo').textContent='Обороты совмещаются при перевороте листа А4 по '+(flip==='long'?'длинному':'короткому')+' краю. Пустые места сохраняются. Поворот закладки для чтения не меняет выбранный край А4. В окне печати можно выбрать ручной переворот, дуплекс или два принтера.';updateLayerInfo();}

  function setPreviewSide(side){if(busy||!['front','back'].includes(side))return;previewSide=side;schedulePreview();}
  function selectCard(id,{reveal=true}={}){if(busy)return;history.breakMerge();project.selectedId=id;jumpToCard();changed('',false);fillEditor();schedulePreview();if(reveal){showInspector('card');if(compactMedia.matches)showSection('bmEditorPanel',{focus:true,scroll:true});}}
  function schedulePreview(){previewSerial++;clearTimeout(renderTimer);renderTimer=setTimeout(()=>refreshPreview().catch(e=>error(e.message)),100);}
  function refreshPreview(){previewPending=true;if(previewTask)return previewTask;previewTask=(async()=>{while(previewPending&&!busy){previewPending=false;await renderPreviewOnce();}})().finally(()=>{previewTask=null;});return previewTask;}
  async function renderPreviewOnce(){
    if(!project)return;const serial=++previewSerial,copy=snapshot(),allPages=pages();pageIndex=Math.max(0,Math.min(pageIndex,allPages.length-1));const currentPage=pageIndex;
    await themeAssets(copy.settings);if(serial!==previewSerial||project.id!==copy.id)return;const settings=renderSettings(copy);
    const layouts=copy.cards.map(card=>{const front=Render.layout(card,settings),back=Render.layout(card,settings,{side:'back'});return {card,layout:previewSide==='back'?back:front,front,back};});
    for(const item of layouts){const row=listNodes.get(item.card.id),button=row?.button;if(button){const bad=item.front.overflow||item.back.overflow;button.classList.toggle('has-error',bad);button.title=bad?'Текст не помещается на '+(item.front.overflow?'лицевой стороне':'обороте'):item.card.review||'';updateCardState(row,item.card);}}
    const card=copy.cards.find(c=>c.id===copy.selectedId),layout=layouts.find(i=>i.card.id===card?.id)?.layout;
    if(layout){const front=layouts.find(item=>item.card.id===card.id).front;$('bmFitStatus').textContent=front.overflow?'Не помещается':`Помещается · ${front.fontSize.toLocaleString('ru-RU')} пт`;$('bmFitStatus').className=front.overflow?'bad':'good';$('bmQuote').setAttribute('aria-invalid',String(!!front.overflow));}
    const invalid=layouts.filter(i=>(copy.settings.printSide!=='back'&&(i.front.overflow||!i.card.name.trim()||!i.card.quote.trim()))||(copy.settings.printSide!=='front'&&i.back.overflow));const review=copy.cards.filter(c=>c.review);
    if($('bmCheckDetails'))$('bmCheckDetails').hidden=!invalid.length&&!review.length;
    if($('bmCheckSummary'))$('bmCheckSummary').textContent=[invalid.length?'Исправить карточки: '+invalid.length:'',review.length?'Проверить импорт: '+review.length:''].filter(Boolean).join(' · ');
    $('bmSheetIssues').replaceChildren();$('bmSheetIssues').hidden=!invalid.length&&!review.length;$('bmSheetIssues').classList.toggle('is-review',!invalid.length);
    if(invalid.length){const caption=document.createElement('span');caption.textContent='Исправьте карточки ('+invalid.length+'): ';$('bmSheetIssues').append(caption);invalid.slice(0,5).forEach((item,index)=>{const button=document.createElement('button');button.textContent=item.card.name||'Карточка '+(copy.cards.indexOf(item.card)+1);button.addEventListener('click',()=>{selectCard(item.card.id);showSection('bmEditorPanel',{focus:true,scroll:true});});$('bmSheetIssues').append(button,index<Math.min(5,invalid.length)-1?', ':'.');});}
    if(review.length){const span=document.createElement('span');span.textContent=(invalid.length?'\n':'')+'Проверьте импорт ('+review.length+'): ';$('bmSheetIssues').append(span);review.slice(0,3).forEach((card,index)=>{const button=document.createElement('button');button.textContent=card.name||'Без имени';button.addEventListener('click',()=>{selectCard(card.id);showSection('bmEditorPanel',{focus:true,scroll:true});});$('bmSheetIssues').append(button,index<Math.min(3,review.length)-1?', ':'.');});}
    $('bmPdf').disabled=busy||!allPages.length||!!invalid.length;$('bmPrint').disabled=$('bmPdf').disabled;$('bmPrintWizard').disabled=busy||!allPages.length;
    const pageInvalid=(allPages[currentPage]||[]).some(c=>invalid.some(i=>i.card.id===c.id));$('bmPdfPage').disabled=busy||!allPages.length||pageInvalid;$('bmPrintPage').disabled=$('bmPdfPage').disabled;
    $('bmPage').replaceChildren();for(let i=0;i<allPages.length;i++)$('bmPage').add(new Option(String(i+1),String(i)));$('bmPage').value=String(currentPage);$('bmPagesTotal').textContent='из '+allPages.length;$('bmPrevPage').disabled=!currentPage;$('bmNextPage').disabled=currentPage>=allPages.length-1;
    $('bmViewSheet').setAttribute('aria-pressed',String(!cardView));$('bmViewCard').setAttribute('aria-pressed',String(cardView));$('bmFaceFront').setAttribute('aria-pressed',String(previewSide==='front'));$('bmFaceBack').setAttribute('aria-pressed',String(previewSide==='back'));const horizontal=(card?.overrides.direction||copy.settings.direction)==='horizontal';$('bmCanvasWrap').classList.toggle('card-view',cardView);$('bmCanvasWrap').classList.toggle('horizontal',horizontal);const geometry=layout?.geometry||Render.geometry(copy.settings);$('bmPageSize').textContent=cardView?`${geometry.width} × ${geometry.height} мм`:'210 × 297 мм';$('bmPreviewHint').textContent=cardView?(horizontal?'Текст вдоль длинной стороны':'Текст вдоль короткой стороны'):previewSide==='back'?'Обороты расположены для совмещения при печати':'6 закладок на А4 · поворот текста сохраняет размер';
    const canvas=document.createElement('canvas');if(cardView&&card)await Render.drawCard(canvas,card,settings,copy.images,300,{side:previewSide,...layerOptions(copy)});else await Render.drawSheet(canvas,allPages[currentPage]||[],settings,copy.images,150,{side:previewSide,flip:copy.settings.duplexFlip,...layerOptions(copy)});
    if(serial!==previewSerial||project.id!==copy.id)return;previewPhysical=cardView&&card?{width:geometry.width,height:geometry.height}:{width:210,height:297};const target=$('bmCanvas');target.width=canvas.width;target.height=canvas.height;target.getContext('2d').drawImage(canvas,0,0);target.setAttribute('aria-label',cardView?`${previewSide==='back'?'Оборот':'Лицевая сторона'} закладки: ${card?.name||'пустая карточка'}. ${geometry.width} на ${geometry.height} мм. Слой: ${layerName(copy.settings.printLayer)}.`:`Лист А4 ${currentPage+1} из ${allPages.length}. ${previewSide==='back'?'Обороты':'Лицевые стороны'} закладок. Слой: ${layerName(copy.settings.printLayer)}.`);queueFit();
  }
  function syncProjectRoute(){try{const url=new URL(location.href);url.searchParams.set('project',project.id);url.searchParams.delete('new');window.history.replaceState(null,'',url);}catch(_){} }
  async function activate(value){project=Store.validate(value);revision++;dirty=false;pageIndex=0;previewSide='front';imageIndexSource=null;Render.clearCaches?.();history.reset(snapshot());Store.setLastId(project.id);syncProjectRoute();$('bmSearch').value='';activeSection=project.cards.length?'bmPreviewPanel':'bmCardsPanel';presetsExpanded=false;error('');fillEditor();updateList();updateHistory();await refreshProjects();await refreshPreview();status('Сохранено на этом устройстве');}
  async function createProject(seed){await flush();const value=Store.create(seed);await Store.save(value);await activate(value);}
  async function newProject(seed){await withBusy('Открытие проекта…',()=>createProject(seed));}
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function filename(s){return (s||'Закладки').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').slice(0,130)||'Закладки';}
  function confirm(title,message,yes='Продолжить'){return new Promise(resolve=>{confirmResolve=resolve;$('bmConfirmTitle').textContent=title;$('bmConfirmText').textContent=message;$('bmConfirmYes').textContent=yes;$('bmConfirm').showModal();if(yes.startsWith('Удалить'))$('bmConfirmNo').focus();});}
  async function withBusy(title,fn){
    if(busy)return;busy=true;previewSerial++;const previousFocus=document.activeElement;
    updateRasterQuotes();
    $('bmBusyTitle').textContent=title;$('bmBusyDetail').textContent='Материалы обрабатываются на этом устройстве.';$('bmBusy').hidden=false;
    const surfaces=[...document.querySelectorAll('.bm-header,.bm-projectbar,.bm-titlebar,.bm-design-picker,.bm-workspace,.bm-mobile-nav,.bm-documentstatus')].map(el=>[el,el.inert]);
    surfaces.forEach(([el])=>el.inert=true);document.querySelector('.bm-workspace').setAttribute('aria-busy','true');
    try{return await fn();}finally{
      busy=false;$('bmBusy').hidden=true;surfaces.forEach(([el,inert])=>el.inert=inert);document.querySelector('.bm-workspace').removeAttribute('aria-busy');
      if(document.activeElement===document.body&&previousFocus?.isConnected&&!previousFocus.closest('[hidden]'))previousFocus.focus({preventScroll:true});updateHistory();updateRasterQuotes();schedulePreview();
    }
  }
  function printAdapter(){
    if(!window.PrintCenter)throw new Error('Не загружен центр печати. Обновите все файлы приложения.');
    const descriptor=(data,page,pass)=>Render.sheetPlan([data.pages[page.sheetIndex]],{side:page.side,flip:pass.flip})[0];
    const options=(pass,data)=>({layer:pass.layer,laserBlack:data.project.settings.laserBlack!==false,offsetX:pass.profile.offsetX,offsetY:pass.profile.offsetY});
    return {
      describe:()=>({title:project.title,sheetCount:pages().length,currentSheet:pageIndex,availableBack:true,side:project.settings.printSide,layer:project.settings.printLayer,flip:project.settings.duplexFlip,width:210,height:297,paperLabel:'листов А4',counts:pages().map(page=>page.length),sheetLabels:pages().map(page=>page[0].name+(page.length>1?' — '+page[page.length-1].name:''))}),
      capture:async plan=>{
        await flush();const copy=snapshot(),all=pages(copy),settings=renderSettings(copy);await themeAssets(settings);await Render.ready();
        for(const index of plan.selection)for(const card of all[index])for(const side of plan.side==='duplex'?['front','back']:[plan.side]){
          if(side==='front'&&(!card.name.trim()||!card.quote.trim()))throw new Error('Заполните имя и цитату: '+(card.name||'пустая карточка')+'.');
          if(Render.layout(card,settings,{side}).overflow)throw new Error('Текст '+(side==='back'?'оборота ':'')+'не помещается: '+card.name+'. Исправьте карточку перед печатью.');
        }
        return {project:copy,pages:all,settings};
      },
      preview:async(data,pass)=>{const item=descriptor(data,pass.pages[0],pass);return Render.svgSheet(item.cards,data.settings,data.project.images,{...options(pass,data),side:item.side,flip:pass.flip,arranged:true});},
      print:async(data,pass,context)=>{
        const job=InvitePrint.createJob({title:data.project.title+' · '+pass.label});
        try{for(let i=0;i<pass.pages.length;i++){context.status('Подготовка листа '+(i+1)+' из '+pass.pages.length+'…');const item=descriptor(data,pass.pages[i],pass);await job.addPage(await Render.svgSheet(item.cards,data.settings,data.project.images,{...options(pass,data),side:item.side,flip:pass.flip,arranged:true}));}await job.print({pageWidth:210,pageHeight:297});}catch(e){job.close();throw e;}
      },
      pdf:async(data,pass,context)=>{context.status('Подготовка PDF…');await assets('pdf');const preparedPlan=pass.pages.map(page=>descriptor(data,page,pass));const blob=await Render.pdf([data.pages[pass.pages[0].sheetIndex]],data.settings,data.project.images,{...options(pass,data),preparedPlan,title:data.project.title+' · '+pass.label});download(blob,filename(data.project.title)+' _ '+pass.id+(pass.batchCount>1?' _ пакет '+pass.batch:'')+'.pdf');},
      onClose:()=>schedulePreview()
    };
  }
  function openPrintCenter(sheetOnly=false){if(busy)return;PrintCenter.open(printAdapter(),{current:sheetOnly});}
  async function quickOutput(kind,sheetOnly=false){if(busy)return;await withBusy(kind==='pdf'?'Подготовка PDF…':'Подготовка печати…',async()=>{const result=await PrintCenter[kind==='pdf'?'quickPDF':'quickPrint'](printAdapter(),{current:sheetOnly,onStatus:text=>{$('bmBusyDetail').textContent=text;}});toast(kind==='pdf'?'PDF подготовлен.':'Окно печати открыто.');return result;});}

  function addCard(){if(project.cards.length>=Store.MAX_CARDS)throw new Error('В проекте может быть до 300 карточек.');if(project.cards.reduce((n,c)=>n+c.copies,0)>=600)throw new Error('В проекте может быть до 600 экземпляров.');const card={id:Store.newId('card'),name:'',quote:'',photoId:'',copies:1,crop:{x:50,y:50,zoom:1},overrides:{}};project.cards.push(card);project.selectedId=card.id;jumpToCard();changed();fillEditor();showInspector('card');showSection('bmEditorPanel',{scroll:compactMedia.matches});$('bmName').focus({preventScroll:compactMedia.matches});}
  async function addRasterQuotes(){
    const library=window.BookmarkRasterQuotes;if(typeof library?.prepare!=='function'||typeof library?.ready!=='function')throw new Error('Не загружены цитаты из картинок. Обновите файлы приложения.');
    await withBusy('Добавление цитат с картинок…',async()=>{
      await library.ready();
      const additions=library.prepare(project);if(!additions.cards.length){updateRasterQuotes();toast('Все цитаты из картинок уже есть в этом проекте.');return;}
      const cardCount=project.cards.length,draft=snapshot();draft.images.push(...additions.images);draft.cards.push(...additions.cards.map(card=>({...card,id:Store.newId('card')})));
      // Check the entire append before changing any existing project data. Keep
      // the original objects, selection and settings; only new cards are normalized.
      const validated=Store.validate(draft),cards=validated.cards.slice(cardCount),addedImages=validated.images.slice(project.images.length);
      history.breakMerge();if(history.current()?.selectedId!==project.selectedId)history.record(snapshot());
      project.images=project.images.concat(addedImages);project.cards.push(...cards);changed();fillEditor();toast('Добавлено цитат с картинок: '+cards.length+'.');
    });
  }
  function gallery(purpose='photo'){if(!project.images.length){toast('В проекте пока нет изображений. Загрузите файл или импортируйте Word.');return;}$('bmGallery').querySelector('h2').textContent=purpose==='photo'?'Фотография автора':'Изображение для фона';$('bmGalleryList').replaceChildren();for(const image of project.images){const button=document.createElement('button'),img=document.createElement('img'),label=document.createElement('span');img.src=image.dataUrl;img.alt=image.name;img.loading='lazy';label.textContent=image.name;button.title=image.name;button.append(img,label);button.addEventListener('click',()=>{if(purpose==='photo'){const c=selected();if(c){c.photoId=image.id;c.crop={x:50,y:50,zoom:1};}}else project.settings[purpose==='front'?'backgroundId':'backBackgroundId']=image.id;changed();fillEditor();$('bmGallery').close();});$('bmGalleryList').append(button);}$('bmGallery').showModal();}
  async function photoFile(file,purpose='photo'){if(!file)return;if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error('Выберите JPEG, PNG или WebP.');if(file.size>20*1024*1024)throw new Error('Файл больше 20 МБ. Уменьшите его перед загрузкой.');
    const target=selected()?.id;if(purpose==='photo'&&!target)return;await withBusy(purpose==='photo'?'Загрузка фотографии…':'Загрузка фона…',async()=>{const raw=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Не удалось прочитать изображение.'));r.readAsDataURL(file);});const image=new Image();image.src=raw;await image.decode();if(image.width*image.height>100000000)throw new Error('Изображение слишком большое. Уменьшите его до 2400 пикселей по длинной стороне.');const canvas=document.createElement('canvas'),scale=Math.min(1,(purpose==='photo'?1600:2400)/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);const asset={id:Store.newId(purpose==='photo'?'photo':'background'),name:file.name,dataUrl:canvas.toDataURL('image/jpeg',.92)},draft=snapshot();draft.images.push(asset);if(purpose==='photo'){const card=draft.cards.find(c=>c.id===target);card.photoId=asset.id;card.crop={x:50,y:50,zoom:1};}else draft.settings[purpose==='front'?'backgroundId':'backBackgroundId']=asset.id;project=Store.validate(draft);imageIndexSource=null;changed();fillEditor();});
  }
  function attach(){
    for(const button of document.querySelectorAll('[data-bm-preset]'))button.addEventListener('click',safe(()=>applyPreset(button.dataset.bmPreset)));
    for(const el of document.querySelectorAll('[data-bm-close]'))el.addEventListener('click',()=>$(el.dataset.bmClose).close());
    for(const el of document.querySelectorAll('[data-bm-section]'))el.addEventListener('click',event=>showSection(el.dataset.bmSection,{focus:event.detail>0,scroll:true}));
    document.querySelector('.bm-mobile-nav').addEventListener('keydown',event=>{if(!compactMedia.matches||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const current=sections.findIndex(item=>item[0]===activeSection),index=event.key==='Home'?0:event.key==='End'?sections.length-1:(current+(event.key==='ArrowRight'?1:-1)+sections.length)%sections.length;showSection(sections[index][0]);$(sections[index][1]).focus();});
    compactMedia.addEventListener('change',()=>{syncSections();queueFit();});$('bmPresetToggle').onclick=()=>{presetsExpanded=!presetsExpanded;syncSections();};
    for(const button of document.querySelectorAll('[data-bm-inspector]'))button.onclick=()=>showInspector(button.dataset.bmInspector);
    document.querySelector('.bm-inspector-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=['card','design','print'],current=tabs.indexOf(inspectorTab),index=event.key==='Home'?0:event.key==='End'?2:(current+(event.key==='ArrowRight'?1:-1)+3)%3;showInspector(tabs[index],{focus:true});});
    window.addEventListener('studio:layout',queueFit);window.addEventListener('resize',queueFit);if(window.ResizeObserver)new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;if(previewViewport?.width===width&&previewViewport?.height===height)return;previewViewport={width,height};queueFit();}).observe($('bmCanvasWrap'));
    $('bmViewZoom').onchange=()=>setZoom($('bmViewZoom').value);$('bmZoomOut').onclick=()=>stepZoom(-1);$('bmZoomIn').onclick=()=>stepZoom(1);$('bmZoomFit').onclick=()=>setZoom('fit');
    handBinding=window.StudioCanvas?.bind({surface:$('bmCanvasWrap'),content:$('bmCanvas'),handButton:$('bmHandTool')});
    document.querySelector('.bm-skip-link').onclick=event=>{event.preventDefault();showSection('bmEditorPanel',{focus:true,scroll:true});};
    $('bmConfirmYes').onclick=()=>{$('bmConfirm').close();confirmResolve?.(true);confirmResolve=null;};$('bmConfirmNo').onclick=()=>{$('bmConfirm').close();confirmResolve?.(false);confirmResolve=null;};$('bmConfirm').addEventListener('cancel',()=>{confirmResolve?.(false);confirmResolve=null;});
    $('bmProjectMenu').addEventListener('click',e=>{if(e.target.closest('button'))$('bmProjectMenu').open=false;});document.addEventListener('click',e=>{if(!$('bmProjectMenu').contains(e.target))$('bmProjectMenu').open=false;});
    $('bmSearch').oninput=()=>{updateList();schedulePreview();};$('bmAdd').onclick=safe(addCard);
    $('bmClearSearch').onclick=()=>{$('bmSearch').value='';$('bmSearch').dispatchEvent(new Event('input'));$('bmSearch').focus();};
    $('bmCardList').addEventListener('click',event=>{const row=event.target.closest('.bm-listitem');if(row){selectCard(row.dataset.id);if(event.detail===0)showSection('bmEditorPanel',{focus:true,scroll:true});}});
    $('bmCardList').addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;const rows=Array.from($('bmCardList').children),current=rows.indexOf(event.target.closest('.bm-listitem'));if(current<0)return;event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,current+(event.key==='ArrowDown'?1:-1)));selectCard(rows[index].dataset.id,{reveal:false});rows[index].focus();});
    $('bmTitle').oninput=()=>{project.title=$('bmTitle').value;changed('title');};
    $('bmRenameProject').onclick=()=>{scrollTo($('bmTitle'));$('bmTitle').focus({preventScroll:true});$('bmTitle').select();};
    for(const [id,key]of [['bmName','name'],['bmQuote','quote']])$(id).addEventListener('input',()=>{if(!selected())return;selected()[key]=$(id).value;$('bmCharCount').textContent=selected().quote.length+' знаков';changed('card-'+selected().id+'-'+key);});
    $('bmCopies').onchange=safe(()=>{const card=selected(),value=Number($('bmCopies').value),others=project.cards.reduce((n,c)=>n+(c===card?0:c.copies),0);if(!Number.isInteger(value)||value<1||value>100||value+others>600){$('bmCopies').value=card.copies;throw new Error('Укажите от 1 до 100 экземпляров карточки; общий тираж — до 600.');}card.copies=value;changed();});
    for(const [id,offset]of [['bmUp',-1],['bmDown',1]])$(id).onclick=()=>{const index=project.cards.indexOf(selected()),next=index+offset;if(next<0||next>=project.cards.length)return;[project.cards[index],project.cards[next]]=[project.cards[next],project.cards[index]];jumpToCard();changed();fillEditor();};
    $('bmDuplicate').onclick=safe(()=>{const c=selected();if(!c)return;if(project.cards.length>=300||project.cards.reduce((n,c)=>n+c.copies,0)+c.copies>600)throw new Error('Лимит проекта: 300 карточек и 600 экземпляров.');const copy={...c,id:Store.newId('card'),crop:{...c.crop},overrides:{...c.overrides}};project.cards.splice(project.cards.indexOf(c)+1,0,copy);project.selectedId=copy.id;jumpToCard();changed();fillEditor();});
    $('bmDelete').onclick=safe(async()=>{const card=selected();if(!card||!await confirm('Удалить карточку?',card.name||'Карточка без имени','Удалить'))return;const index=project.cards.indexOf(card);project.cards.splice(index,1);project.selectedId=project.cards[Math.min(index,project.cards.length-1)]?.id||'';changed();fillEditor();if(!project.cards.length)showSection('bmCardsPanel',{focus:true,scroll:true});});
    $('bmReviewDone').onclick=()=>{delete selected().review;changed();fillEditor();};
    $('bmUploadPhoto').onclick=()=>$('bmPhotoFile').click();$('bmPhotoFile').onchange=safe(async()=>{const file=$('bmPhotoFile').files[0];$('bmPhotoFile').value='';await photoFile(file);});$('bmChoosePhoto').onclick=()=>gallery();$('bmRemovePhoto').onclick=()=>{selected().photoId='';changed();fillEditor();};
    for(const side of ['front','back']){const cap=side==='front'?'Front':'Back';$('bmUpload'+cap+'Background').onclick=()=>{backgroundTarget=side;$('bmBackgroundFile').click();};$('bm'+cap+'FromGallery').onclick=()=>gallery(side);$('bmRemove'+cap+'Background').onclick=()=>{project.settings[side==='front'?'backgroundId':'backBackgroundId']='';changed();fillBackgrounds();};}
    $('bmBackgroundFile').onchange=safe(async()=>{const file=$('bmBackgroundFile').files[0];$('bmBackgroundFile').value='';await photoFile(file,backgroundTarget);});
    for(const [id,key]of [['bmBackgroundOpacity','backgroundOpacity'],['bmBackBackgroundOpacity','backBackgroundOpacity']])$(id).oninput=()=>{project.settings[key]=Number($(id).value)/100;$(id+'Value').textContent=$(id).value+'%';changed(key);};
    $('bmBackText').oninput=()=>{project.settings.backText=$('bmBackText').value;changed('back-text');};
    document.querySelectorAll('[data-bm-back-token]').forEach(button=>button.addEventListener('click',()=>{const field=$('bmBackText'),token=button.dataset.bmBackToken,start=field.selectionStart,end=field.selectionEnd,next=field.value.slice(0,start)+token+field.value.slice(end);if(next.length>500){toast('Текст оборота: до 500 знаков.',true);return;}field.value=next;field.focus();field.setSelectionRange(start+token.length,start+token.length);field.dispatchEvent(new Event('input',{bubbles:true}));}));
    $('bmFaceFront').onclick=()=>setPreviewSide('front');$('bmFaceBack').onclick=()=>setPreviewSide('back');$('bmShowBack').onclick=()=>{setPreviewSide('back');showSection('bmPreviewPanel',{focus:true,scroll:true});};
    $('bmOpenDesign').onclick=()=>{showInspector('design');showSection('bmEditorPanel',{scroll:compactMedia.matches});$('bmTheme').focus({preventScroll:true});};
    $('bmOpenPrintSettings').onclick=safe(()=>openPrintCenter());$('bmConfigurePrint').onclick=safe(()=>openPrintCenter());
    for(const [id,key]of [['bmCropX','x'],['bmCropY','y'],['bmZoom','zoom']])$(id).oninput=()=>{selected().crop[key]=Number($(id).value);fillCrop();changed('crop-'+selected().id);};$('bmResetCrop').onclick=()=>{selected().crop={x:50,y:50,zoom:1};changed();fillEditor();};
    function styleChange(id,key,isIndividual){const el=$(id),target=isIndividual?selected().overrides:project.settings,value=el.type==='checkbox'?el.checked:el.type==='number'||key==='seriesGroup'?Number(el.value):el.value;if(el.type==='number'&&(!el.checkValidity()||!Number.isFinite(value))){el.value=({...project.settings,...(isIndividual?selected().overrides:{})})[key];throw new Error('Проверьте значение поля: '+el.closest('label').firstChild.textContent.trim());}if(key==='printLayer'||key==='laserBlack')history.breakMerge();target[key]=value;if(key==='printSide'&&value!=='duplex')previewSide=value;changed((isIndividual?'individual-':'style-')+key);if(key==='size')fillEditor();if(key==='theme'||key==='backTemplate'||key==='seriesGroup')fillThemes();if(['printSide','duplexFlip','printLayer','laserBlack'].includes(key))updatePrintInfo();}
    for(const [id,key]of Object.entries(common))$(id).addEventListener('change',safe(()=>styleChange(id,key,false)));
    for(const [id,key]of Object.entries(individual))$(id).addEventListener('change',safe(()=>styleChange(id,key,true)));
    $('bmOrnamentStrength').oninput=()=>{project.settings.ornamentStrength=Number($('bmOrnamentStrength').value)/100;$('bmOrnamentStrengthValue').textContent=$('bmOrnamentStrength').value+'%';changed('ornament-strength');};
    $('bmOverride').onchange=()=>{selected().overrides=$('bmOverride').checked?Object.fromEntries(Object.values(individual).map(key=>[key,project.settings[key]])):{};changed();fillEditor();};
    $('bmCompactCard').onclick=()=>{Object.assign(selected().overrides,{font:'compact',fontSize:10,nameSize:11,photoWidth:22,photoHeight:25});changed();fillEditor();};
    $('bmInkSaver').onclick=()=>{project.settings.accent='#000000';project.cards.forEach(c=>{if(c.overrides.accent)c.overrides.accent='#000000';});changed();fillEditor();};
    $('bmViewSheet').onclick=()=>{cardView=false;schedulePreview();};$('bmViewCard').onclick=()=>{cardView=true;schedulePreview();};$('bmPage').onchange=()=>{pageIndex=Number($('bmPage').value);cardView=false;schedulePreview();};$('bmPrevPage').onclick=()=>{pageIndex--;cardView=false;schedulePreview();};$('bmNextPage').onclick=()=>{pageIndex++;cardView=false;schedulePreview();};
    $('bmCanvas').onclick=e=>{if(cardView||busy)return;const canvas=$('bmCanvas'),r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*210,y=(e.clientY-r.top)/r.height*297,g=Render.geometry(project.settings);const col=Math.floor((x-g.left)/g.width),row=Math.floor((y-g.top)/g.height);if(col<0||col>2||row<0||row>1)return;const descriptor=Render.sheetPlan([pages()[pageIndex]||[]],{side:previewSide,flip:project.settings.duplexFlip})[0],card=descriptor?.cards[row*3+col];if(card)selectCard(card.id);};
    $('bmPdf').onclick=safe(()=>quickOutput('pdf'));$('bmPdfPage').onclick=safe(()=>quickOutput('pdf',true));$('bmPrint').onclick=safe(()=>quickOutput('print'));$('bmPrintPage').onclick=safe(()=>quickOutput('print',true));$('bmPrintWizard').onclick=safe(()=>openPrintCenter());
    $('bmProjects').onchange=safe(()=>withBusy('Открытие проекта…',async()=>{const id=$('bmProjects').value;try{await flush();const next=await Store.load(id);if(next)await activate(next);}catch(e){$('bmProjects').value=project.id;throw e;}}));
    $('bmNew').onclick=safe(()=>newProject(blankProject()));$('bmCopyProject').onclick=safe(()=>newProject({...snapshot(),title:project.title+' · копия'}));
    $('bmRestoreSeed').onclick=safe(()=>withBusy('Загрузка проекта…',async()=>{await assets('seed');await createProject(window.BOOKMARK_SEED);}));
    $('bmDeleteProject').onclick=safe(()=>withBusy('Удаление проекта…',async()=>{
      if(!await confirm('Удалить проект с этого устройства?',project.title+'\nПри необходимости сначала скачайте проект с фотографиями.','Удалить'))return;
      clearTimeout(saveTimer);await saveQueue.catch(()=>{});
      const id=project.id,list=await Store.list(),entry=list.find(item=>item.id!==id);
      const next=entry?await Store.load(entry.id):await Store.save(Store.create(blankProject()));
      if(!next)throw new Error('Не удалось открыть другой проект. Текущий проект не удалён.');
      await Store.remove(id);dirty=false;await activate(next);
    }));
    $('bmBackup').onclick=safe(()=>{const value=Store.validate(snapshot());download(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),filename(project.title)+' _ проект.json');toast('Проект скачан вместе с фотографиями.');});
    $('bmOpen').onclick=()=>$('bmProjectFile').click();$('bmProjectFile').onchange=safe(async()=>{const file=$('bmProjectFile').files[0];$('bmProjectFile').value='';if(file)await withBusy('Открытие проекта…',async()=>{const value=await Store.importFile(file);await createProject(value);toast('Проект открыт как отдельная копия.');});});
    $('bmImportDocx').onclick=()=>$('bmDocxFile').click();$('bmDocxFile').onchange=safe(async()=>{const file=$('bmDocxFile').files[0];$('bmDocxFile').value='';if(!file)return;await withBusy('Чтение документа Word…',async()=>{await assets('docx');imported={...await window.BookmarkImport.readDocx(file),title:file.name.replace(/\.docx$/i,'')};});$('bmImportInfo').textContent=`Найдено карточек: ${imported.cards.length}. Изображений: ${imported.images.length}.\n`+imported.warnings.join('\n');$('bmImportDialog').showModal();});
    $('bmAddRasterQuotes').onclick=safe(addRasterQuotes);
    $('bmImportNew').onclick=safe(async()=>{if(!imported)return;await withBusy('Открытие проекта…',async()=>{$('bmImportDialog').close();await createProject(imported);imported=null;});});
    $('bmImportAppend').onclick=safe(async()=>{if(!imported)return;const draft=snapshot(),ids=new Map();for(const image of imported.images){const id=Store.newId('photo');ids.set(image.id,id);draft.images.push({...image,id});}draft.cards.push(...imported.cards.map(c=>({...c,id:Store.newId('card'),photoId:ids.get(c.photoId)||''})));draft.warnings.push(...imported.warnings);project=Store.validate(draft);$('bmImportDialog').close();imported=null;changed();fillEditor();});
    $('bmCopiesAll').onclick=safe(async()=>{const input=document.createElement('input');input.type='number';input.min='1';input.max='100';input.value='1';input.id='bmBatchCount';const label=document.createElement('label');label.textContent='Экземпляров каждой карточки';label.append(input);const pending=confirm('Тираж для всех карточек','', 'Применить');$('bmConfirmText').append(label);input.focus();const yes=await pending;if(!yes)return;const count=Number(input.value);if(!Number.isInteger(count)||count<1||count>100||count*project.cards.length>600)throw new Error('Укажите от 1 до 100. Общий тираж — до 600 экземпляров.');project.cards.forEach(c=>c.copies=count);changed();fillEditor();});
    for(const [id,method]of [['bmUndo','undo'],['bmRedo','redo']])$(id).onclick=()=>{const restored=history[method]();if(restored){project={...restored,settings:{...restored.settings},images:restored.images.slice(),warnings:restored.warnings.slice(),cards:restored.cards.map(c=>({...c,crop:{...c.crop},overrides:{...c.overrides}}))};changed('',false);fillEditor();}};
    document.addEventListener('keydown',e=>{if(busy||document.querySelector('dialog[open]')||e.target.matches('input,textarea,select'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'bmRedo':'bmUndo').click();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();$('bmRedo').click();}});
    document.addEventListener('keydown',event=>{if(event.key!=='Escape'||document.querySelector('dialog[open]'))return;const menu=document.querySelector('#bmProjectMenu[open],.bm-export-options[open]');if(menu){event.preventDefault();menu.open=false;menu.querySelector('summary').focus();}else if(compactMedia.matches&&presetsExpanded){presetsExpanded=false;syncSections();$('bmPresetToggle').focus();}});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush().catch(()=>{});else refreshExternalTitle().catch(()=>{});});window.addEventListener('focus',()=>refreshExternalTitle().catch(()=>{}));window.addEventListener('beforeunload',e=>{if(dirty){flush().catch(()=>{});e.preventDefault();e.returnValue='';}});
  }
  async function refreshExternalTitle(){
    if(!project||dirty||busy||checkingTitle||document.activeElement===$('bmTitle'))return;
    checkingTitle=true;const id=project.id,currentRevision=revision;
    try{await saveQueue;const list=await Store.list(),entry=list.find(item=>item.id===id);if(entry&&project.id===id&&!dirty&&revision===currentRevision&&entry.title!==project.title){project.title=entry.title;project.updatedAt=entry.updatedAt;$('bmTitle').value=project.title;history.reset(snapshot());updateHistory();}await refreshProjects();}finally{checkingTitle=false;}
  }
  // Internal navigation must finish the pending IndexedDB transaction before unloading.
  document.addEventListener('click',event=>{
    const link=event.target.closest('.bm-header a[href],#bmStartupHome');if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.target||link.hasAttribute('download'))return;
    if(!project)return;event.preventDefault();if(navigating||busy)return;navigating=true;
    const href=link.href;link.setAttribute('aria-busy','true');
    withBusy('Сохранение перед переходом…',async()=>{
      await flush();
      // Keep the editor locked until this document actually leaves, including
      // slow navigation. A cached page is unlocked before it can be restored.
      await new Promise((resolve,reject)=>{const left=()=>resolve();window.addEventListener('pagehide',left,{once:true});try{location.assign(href);}catch(e){window.removeEventListener('pagehide',left);reject(e);}});
    }).catch(e=>{toast('Переход остановлен: '+(e.message||'проект не сохранён')+'. Скачайте проект через меню «Проект».',true);}).finally(()=>{navigating=false;link.removeAttribute('aria-busy');});
  });
  async function initialize(){
    if(!Store||!Render||!window.BookmarkAssets)throw new Error('Не все файлы редактора загружены. Обновите страницу или загрузите весь архив на хостинг.');
    const fontReady=Render.ready();fontReady.catch(()=>{});const params=new URL(location.href).searchParams,explicit=params.has('project'),requestedId=params.get('project'),newMode=params.get('new');let stored,storageFailure;
    if(explicit){stored=await Store.load(requestedId);if(!stored)throw new Error('Этот проект закладок не найден на этом устройстве. Откройте список проектов или импортируйте сохранённый файл.');}
    else if(newMode!=='1'&&newMode!=='seed'){try{const lastId=Store.lastId();if(lastId)stored=await Store.load(lastId);if(!stored){const list=await Store.list();if(list[0])stored=await Store.load(list[0].id);}}catch(e){storageFailure=e;}}
    if(!stored&&newMode!=='1')await assets('seed');await fontReady;project=stored||Store.create(newMode==='1'?blankProject():window.BOOKMARK_SEED);if(!stored&&!storageFailure){try{project=await Store.save(project);}catch(e){storageFailure=e;}}
    attach();try{await activate(project);}catch(e){storageFailure=storageFailure||e;fillEditor();updateList();updateHistory();await refreshPreview();}
    if(storageFailure){dirty=true;status('Не сохранено · скачайте проект',true);error(storageFailure.message);}
    for(const region of document.querySelectorAll('[data-bm-startup-lock]')){region.removeAttribute('inert');region.removeAttribute('aria-busy');}
    $('bmStartup').hidden=true;
    window.BookmarkApp=Object.freeze({getProject:()=>snapshot(),flush,refreshPreview});
  }
  $('bmStartupRetry').onclick=()=>location.reload();
  initialize().catch(e=>{console.error(e);status('Ошибка загрузки',true);error(e.message);$('bmStartupMessage').textContent=e.message||'Не удалось загрузить редактор.';$('bmStartupRetry').hidden=false;$('bmStartupHome').hidden=false;});
})();
