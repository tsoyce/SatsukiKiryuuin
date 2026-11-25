(function(global){
  'use strict';
  const MAX_SHEETS=100,MAX_COPIES=99,MAX_BATCH_PAGES=100;
  const modes=['single','auto-duplex','manual-duplex','two-printers'];
  const layers=['all','inkjet','laser'];
  const fail=message=>{throw new Error(message);};
  function integer(value,min,max,label){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)fail(label+': укажите целое число от '+min+' до '+max+'.');return n;}
  function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}
  function parseRange(value,sheetCount,currentSheet=0){
    const total=integer(sheetCount,1,MAX_SHEETS,'Число исходных листов');
    if(value===undefined||value===null||value===''||value==='all')return Array.from({length:total},(_,i)=>i);
    if(value==='current')return[integer(currentSheet,0,total-1,'Текущий лист')];
    const selected=new Set();
    const parts=Array.isArray(value)?value:String(value).trim().replace(/[–—]/g,'-').replace(/\s*-\s*/g,'-').split(/[,;\s]+/);
    if(!parts.length)fail('Укажите номера листов, например 1–3, 5.');
    for(const part of parts){
      const match=/^(\d+)(?:-(\d+))?$/.exec(String(part));
      if(!match)fail('Неверный диапазон листов. Пример: 1–3, 5.');
      const first=integer(match[1],1,total,'Номер листа'),last=match[2]===undefined?first:integer(match[2],1,total,'Номер листа');
      if(last<first)fail('В диапазоне сначала укажите меньший номер листа.');
      for(let n=first;n<=last;n++)selected.add(n-1);
    }
    if(!selected.size)fail('Выберите хотя бы один лист.');
    return [...selected].sort((a,b)=>a-b);
  }
  function validateProfile(input={}){
    if(!input||typeof input!=='object'||Array.isArray(input))fail('Неверные настройки принтера.');
    const text=(value,fallback,max)=>typeof value==='string'?value.trim().slice(0,max):fallback;
    const choice=(value,values,fallback)=>values.includes(value)?value:fallback;
    const offset=(value,label)=>{const n=value===undefined?0:Number(value);if(!Number.isFinite(n)||n < -10||n > 10)fail(label+': укажите значение от −10 до 10 мм.');return Math.round(n*100)/100;};
    const printFace=choice(input.printFace??input.face,['up','down'],'unknown'),topEdge=choice(input.topEdge,['first','last'],'unknown');
    const backOrder=choice(input.backOrder,['same','reverse'],'unknown');
    const firstSheet=choice(input.firstSheet,['top','bottom'],'unknown'),outputFirst=choice(input.outputFirst,['top','bottom'],'unknown');
    return deepFreeze({id:text(input.id,'',160),name:text(input.name,'Принтер',100),tray:text(input.tray,'',100),printFace,topEdge,
      feedTested:input.feedTested===true&&printFace!=='unknown'&&topEdge!=='unknown',backOrder,
      orderTested:input.orderTested===true&&backOrder!=='unknown',firstSheet,outputFirst,
      stackTested:input.stackTested===true&&firstSheet!=='unknown'&&outputFirst!=='unknown',offsetX:offset(input.offsetX,'Сдвиг по горизонтали'),offsetY:offset(input.offsetY,'Сдвиг по вертикали')});
  }
  function feedGuide(input,options={}){
    const profile=validateProfile(input||{}),side=options.side==='back'?'back':options.side==='duplex'?'duplex':'front',flip=options.flip==='short'?'short':'long';
    const known=profile.feedTested,orderKnown=profile.stackTested||profile.orderTested,lines=[],warnings=[];
    const frontTopFeedsFirst=known?(side==='back'&&flip==='short'?profile.topEdge==='last':profile.topEdge==='first'):null;
    if(side==='duplex'){
      lines.push('В окне печати включите двустороннюю печать: переворот по '+(flip==='long'?'длинной':'короткой')+' стороне.');
      lines.push('Страницы уже идут парами: лицо листа 1, оборот листа 1, лицо листа 2, оборот листа 2.');
    }else if(known){
      lines.push('Сторона, на которой сейчас нужно печатать, — '+(profile.printFace==='up'?'вверх.':'вниз.'));
      lines.push('Край, помеченный «ВЕРХ ЛИЦА», входит '+(frontTopFeedsFirst?'первым.':'последним.'));
      if(side==='back')lines.push(flip==='long'?'Верх оборота находится у того же физического края, что и верх лица. Переворот — как у книги, вокруг длинного края А4.':'Верх оборота находится у противоположного края от верха лица. Переворот — как у календаря, вокруг короткого края А4.');
    }else{
      lines.push('Подача для этого принтера и лотка ещё не проверена.');
      warnings.push('Проверьте подачу на одном помеченном листе. Положение печатной стороны и верхнего края зависит от принтера и лотка.');
    }
    if(Number(options.sheetCount)>1&&side!=='duplex'){
      lines.push('Подавайте физические листы в порядке, указанном для этого прохода. Сохраните пары «лицо — оборот».');
      if(profile.stackTested){
        lines.push('Первый лист этого прохода положите '+(profile.firstSheet==='top'?'сверху стопки.':'снизу стопки.'));
        lines.push('На выходе первая напечатанная страница окажется '+(profile.outputFirst==='top'?'сверху стопки.':'снизу стопки.')+' Перед следующим проходом сверьте порядок листов.');
      }
      if(!orderKnown)warnings.push('Порядок стопки не проверен. Для начала используйте один лист или проведите пробу на двух листах; не выбирайте обратный порядок наугад.');
    }
    return deepFreeze({known,orderKnown,profile,side,flip,frontTopFeedsFirst,topReference:'front-top',lines,warnings});
  }
  function calibrationProbe(options={}){
    const count=options.sheetCount===2?2:1,name=typeof options.printerName==='string'?options.printerName.trim().slice(0,100):'Принтер';
    const pages=Array.from({length:count},(_,i)=>({number:i+1,label:String.fromCharCode(65+i),title:'ПРОБА ПОДАЧИ · '+(i+1),top:'ВЕРХ ИЗОБРАЖЕНИЯ ↑',printerName:name,rulerMm:50,pageWidth:210,pageHeight:297}));
    return deepFreeze({pages,steps:[
      'Возьмите чистый лист А4. Карандашом подпишите видимую сторону буквой A; нарисуйте стрелку к краю, который войдёт в принтер первым.',
      'Загрузите лист пометкой A вверх и отмеченным краем вперёд. Запомните выбранный лоток.',
      'Напечатайте пробу: один экземпляр, односторонняя печать, А4, масштаб 100%, без подгонки.',
      'Укажите, появилась ли печать на стороне A, и находится ли напечатанный верх у отмеченного края. Эти наблюдения определят подачу; модель принтера её не подставляет.'
    ],orderSteps:count===2?[
      'Для проверки стопки подпишите два листа A и B. Положите A сверху, B снизу и напечатайте страницы 1 и 2 одним заданием.',
      'Отметьте, какой физический лист получил страницу 1 и какая страница оказалась сверху на выходе. После переворота проверяйте соответствие по номерам, прежде чем запускать весь тираж.'
    ]:[]});
  }
  function build(input={}){
    const sheetCount=integer(input.sheetCount,1,MAX_SHEETS,'Число исходных листов'),copies=integer(input.copies===undefined?1:input.copies,1,MAX_COPIES,'Экземпляры тиража');
    const mode=modes.includes(input.mode)?input.mode:input.mode===undefined?'single':fail('Неизвестный способ печати.');
    if(input.side!==undefined&&!['front','back','duplex'].includes(input.side))fail('Неизвестная сторона для печати.');
    if(input.layer!==undefined&&!layers.includes(input.layer))fail('Неизвестный слой печати.');
    if(input.flip!==undefined&&!['long','short'].includes(input.flip))fail('Неизвестный переворот листа.');
    const side=input.side===undefined?(mode==='single'?'front':'duplex'):input.side,layer=input.layer===undefined?'all':input.layer,flip=input.flip==='short'?'short':'long';
    if(input.availableBack===false&&side!=='front')fail('У этого материала нет оборотной стороны. Выберите печать лица.');
    if(mode==='single'&&side==='duplex')fail('Для двух сторон выберите автоматическую или ручную двустороннюю печать.');
    const selection=parseRange(input.range,sheetCount,input.currentSheet),physicalSheets=[];
    for(let copyIndex=0;copyIndex<copies;copyIndex++)for(const sheetIndex of selection)physicalSheets.push({id:'s'+(sheetIndex+1)+'-c'+(copyIndex+1),sheetIndex,copyIndex});
    const profiles={};for(const printer of ['main','inkjet','laser'])profiles[printer]=validateProfile(input.profiles?.[printer]||{});
    const recipes=[];
    const add=(printer,paint,face)=>recipes.push({id:printer+'-'+face,printer,layer:paint,side:face});
    if(mode==='two-printers'){
      for(const printer of ['inkjet','laser']){if(side!=='back')add(printer,printer,'front');if(side!=='front')add(printer,printer,'back');}
    }else if(mode==='auto-duplex'&&side==='duplex')add('main',layer,'duplex');
    else{if(side!=='back')add('main',layer,'front');if(side!=='front')add('main',layer,'back');}
    const isReverse=id=>Array.isArray(input.reversePasses)?input.reversePasses.includes(id):input.reversePasses?.[id]===true;
    const passes=recipes.map((recipe,index)=>{
      const reverse=isReverse(recipe.id),sheets=reverse?[...physicalSheets].reverse():[...physicalSheets];
      const pages=sheets.flatMap(sheet=>(recipe.side==='duplex'?['front','back']:[recipe.side]).map(face=>({sheetIndex:sheet.sheetIndex,copyIndex:sheet.copyIndex,side:face,sheetId:sheet.id,pageId:sheet.id+'-'+face})));
      const batches=[];for(let i=0;i<pages.length;i+=MAX_BATCH_PAGES)batches.push(pages.slice(i,i+MAX_BATCH_PAGES));
      const printerName=recipe.printer==='inkjet'?'Струйный':recipe.printer==='laser'?'Лазерный':profiles.main.name;
      const label=printerName+' · '+(recipe.side==='duplex'?'лицо и оборот':recipe.side==='back'?'обороты':'лица');
      return{...recipe,index,flip,reverse,label,sheets,pages,batches,profile:profiles[recipe.printer],guide:feedGuide(profiles[recipe.printer],{side:recipe.side,flip,sheetCount:sheets.length})};
    });
    return deepFreeze({version:1,mode,side,layer,flip,copies,sheetCount,selection,physicalSheets,physicalSheetCount:physicalSheets.length,selectedSheetCount:selection.length,
      printPageCount:passes.reduce((n,pass)=>n+pass.pages.length,0),passes,profiles,
      dialogSettings:['Масштаб 100% / «Фактический размер».','Отключите подгонку к странице, несколько страниц на листе и автоматическое увеличение.','В окне принтера оставьте один экземпляр: тираж уже включён в подготовленные страницы.'],
      stackOrderAutomatic:false});
  }
  global.PrintPlan=Object.freeze({build,parseRange,validateProfile,feedGuide,calibrationProbe,MAX_SHEETS,MAX_COPIES,MAX_BATCH_PAGES});
})(typeof window==='undefined'?globalThis:window);
