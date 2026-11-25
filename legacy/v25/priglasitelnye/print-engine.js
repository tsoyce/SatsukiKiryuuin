(function (global) {
  'use strict';
  const MM_PER_INCH=25.4, EPS=.000001, MAX_PAGES=100, MAX_PIXELS=120000000, MAX_VECTOR_BYTES=80*1024*1024;
  let activeJob=null;

  function dimension(value,label) {
    const n=Number(value);
    if(!Number.isFinite(n)||n<10||n>2000)throw new Error(label+': укажите размер от 10 до 2000 мм.');
    return n;
  }
  function calculateLayout(input={}) {
    const cardWidth=dimension(input.cardWidth,'Ширина макета'),cardHeight=dimension(input.cardHeight,'Высота макета');
    const paper=['a4','a5','card'].includes(input.paper)?input.paper:'a4';
    const orientation=['portrait','landscape','auto'].includes(input.orientation)?input.orientation:'auto';
    const margin=Number(input.margin==null?0:input.margin);
    if(!Number.isFinite(margin)||margin<0||margin>50)throw new Error('Поля листа: укажите от 0 до 50 мм.');
    const one=input.layout==='one',allowFit=input.fit===true;
    const sheet=paper==='a5'?[148,210]:paper==='card'?[cardWidth,cardHeight]:[210,297];
    const portrait=[Math.min(...sheet),Math.max(...sheet)],landscape=[Math.max(...sheet),Math.min(...sheet)];
    const sheets=orientation==='portrait'?[portrait]:orientation==='landscape'?[landscape]:[portrait,landscape];
    const candidates=[];
    for(const [pageWidth,pageHeight] of sheets) {
      const usableWidth=pageWidth-margin*2,usableHeight=pageHeight-margin*2;
      if(usableWidth<=0||usableHeight<=0)continue;
      for(const rotation of [0,90]) {
        const rawWidth=rotation?cardHeight:cardWidth,rawHeight=rotation?cardWidth:cardHeight;
        let scale=1,columns=Math.floor((usableWidth+EPS)/rawWidth),rows=Math.floor((usableHeight+EPS)/rawHeight);
        if(!columns||!rows) {
          if(!allowFit)continue;
          scale=Math.min(1,usableWidth/rawWidth,usableHeight/rawHeight);
          if(scale<=0)continue;
          columns=1;rows=1;
        }
        if(one){columns=1;rows=1;}
        const capacity=columns*rows;
        candidates.push({pageWidth,pageHeight,columns,rows,capacity,rotation,scale,slotWidth:rawWidth*scale,slotHeight:rawHeight*scale});
      }
    }
    candidates.sort((a,b)=>b.capacity-a.capacity||b.scale-a.scale||a.rotation-b.rotation||(a.pageWidth>a.pageHeight?1:0)-(b.pageWidth>b.pageHeight?1:0));
    const best=candidates[0];
    if(!best)throw new Error('Макет '+cardWidth+' × '+cardHeight+' мм не помещается на выбранном листе с этими полями. Выберите больший лист, уменьшите поля или включите «Уместить на листе».');
    if(best.capacity>10000)throw new Error('Слишком много карточек на одном листе.');
    const gridWidth=best.columns*best.slotWidth,gridHeight=best.rows*best.slotHeight,left=(best.pageWidth-gridWidth)/2,top=(best.pageHeight-gridHeight)/2,slots=[];
    for(let row=0;row<best.rows;row++)for(let column=0;column<best.columns;column++)slots.push({x:left+column*best.slotWidth,y:top+row*best.slotHeight,width:best.slotWidth,height:best.slotHeight,rotation:best.rotation});
    const warnings=[];
    if(best.scale<1-EPS)warnings.push('Макет уменьшен до '+Math.round(best.scale*1000)/10+'%. Для исходного размера выберите больший лист или меньшие поля.');
    if(margin===0)warnings.push('Поля листа отключены. Для печати до края нужен режим принтера без полей; текст внутри макета не должен попадать в непечатаемую область.');
    return {paper,paperLabel:paper==='a4'?'А4':paper==='a5'?'А5':'По размеру макета',pageWidth:best.pageWidth,pageHeight:best.pageHeight,orientation:best.pageWidth>best.pageHeight?'landscape':'portrait',cardWidth,cardHeight,cardRotation:best.rotation,scale:best.scale,margin,columns:best.columns,rows:best.rows,capacity:best.capacity,slots,warnings,grid:{x:left,y:top,width:gridWidth,height:gridHeight}};
  }
  function drawMarks(context,layout,pxPerMm,options={}) {
    if(!context||!Number.isFinite(pxPerMm)||pxPerMm<=0)return;
    const cuts=options.cuts!==false,registration=options.registration===true;
    context.save();context.strokeStyle=options.color||'#444';context.lineWidth=Math.max(1,pxPerMm*.12);
    if(cuts) {
      const x=[...new Set(layout.slots.flatMap(s=>[s.x,s.x+s.width]).map(v=>Math.round(v*100000)/100000))];
      const y=[...new Set(layout.slots.flatMap(s=>[s.y,s.y+s.height]).map(v=>Math.round(v*100000)/100000))];
      context.setLineDash([pxPerMm*2,pxPerMm*1.3]);context.beginPath();
      for(const value of x){context.moveTo(value*pxPerMm,layout.grid.y*pxPerMm);context.lineTo(value*pxPerMm,(layout.grid.y+layout.grid.height)*pxPerMm);}
      for(const value of y){context.moveTo(layout.grid.x*pxPerMm,value*pxPerMm);context.lineTo((layout.grid.x+layout.grid.width)*pxPerMm,value*pxPerMm);}
      context.stroke();
    }
    if(registration&&layout.margin>=3) {
      context.setLineDash([]);const d=Math.min(2,layout.margin/3),inset=layout.margin/2;
      context.beginPath();
      for(const [x,y] of [[inset,inset],[layout.pageWidth-inset,inset],[inset,layout.pageHeight-inset],[layout.pageWidth-inset,layout.pageHeight-inset]]) {
        context.moveTo((x-d)*pxPerMm,y*pxPerMm);context.lineTo((x+d)*pxPerMm,y*pxPerMm);
        context.moveTo(x*pxPerMm,(y-d)*pxPerMm);context.lineTo(x*pxPerMm,(y+d)*pxPerMm);
      }
      context.stroke();
    }
    context.restore();
  }
  function createJob(options={}) {
    if(!global.document||!global.document.body)throw new Error('Печать доступна после открытия редактора в браузере.');
    if(activeJob)activeJob.close();
    const document=global.document,previousFocus=document.activeElement,frame=document.createElement('iframe'),urls=[],pages=[],pendingLoads=new Set();
    let closed=false,printed=false,totalPixels=0,totalVectorBytes=0,cleanupTimer=null;
    frame.className='invitation-print-frame';frame.title='Печать пригласительных';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
    Object.assign(frame.style,{position:'fixed',left:'-10000px',top:'0',width:'1px',height:'1px',opacity:'0',border:'0',pointerEvents:'none'});
    document.body.append(frame);
    const view=frame.contentWindow,doc=frame.contentDocument;
    if(!view||!doc){frame.remove();throw new Error('Браузер не открыл область печати. Попробуйте обычный браузер Safari или Chrome.');}
    doc.open();doc.write('<!doctype html><html lang="ru"><head><meta charset="utf-8"></head><body></body></html>');doc.close();
    doc.title=String(options.title||'Пригласительные');
    const style=doc.createElement('style');doc.head.append(style);
    style.textContent='html,body{margin:0;padding:0;background:#fff}.print-page{display:block;position:relative;margin:0;padding:0;overflow:hidden;break-after:page;page-break-after:always}.print-page:last-child{break-after:auto;page-break-after:auto}.print-page img{display:block;width:100%;height:100%;margin:0;padding:0;border:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}';
    function assertOpen(){if(closed)throw new Error('Область печати закрыта. Запустите печать ещё раз.');}
    function close() {
      if(closed)return;closed=true;
      if(cleanupTimer!=null)global.clearTimeout(cleanupTimer);
      for(const cancel of pendingLoads)cancel();pendingLoads.clear();
      view.removeEventListener('afterprint',afterPrint);global.removeEventListener?.('afterprint',afterPrint);
      const restoreFocus=document.activeElement===frame;
      frame.remove();urls.forEach(url=>global.URL.revokeObjectURL(url));urls.length=0;pages.length=0;
      if(restoreFocus&&previousFocus?.isConnected&&!previousFocus.disabled)previousFocus.focus?.();
      if(activeJob===job)activeJob=null;
    }
    function afterPrint(){if(printed&&!closed&&cleanupTimer==null)cleanupTimer=global.setTimeout(close,1000);}
    view.addEventListener('afterprint',afterPrint);global.addEventListener?.('afterprint',afterPrint);
    async function addPage(source,imageOptions={}) {
      assertOpen();if(printed)throw new Error('Эта очередь печати уже отправлена.');
      if(pages.length>=MAX_PAGES)throw new Error('За один раз можно подготовить до '+MAX_PAGES+' листов. Печатайте большой список частями.');
      let url,blob;
      if(source&&typeof source.toBlob==='function') {
        const mime=imageOptions.mime==='image/png'?'image/png':'image/jpeg',quality=Number.isFinite(imageOptions.quality)?Math.max(.5,Math.min(1,imageOptions.quality)):.98;
        blob=await new Promise((resolve,reject)=>source.toBlob(value=>value?resolve(value):reject(new Error('Не удалось подготовить изображение для печати.')),mime,quality));
      } else if(source&&typeof source.arrayBuffer==='function')blob=source;
      else if(typeof source==='string'&&/^data:image\/(?:png|jpeg|webp);base64,/i.test(source))url=source;
      else throw new Error('Не удалось прочитать лист для печати.');
      assertOpen();
      if(blob) {
        if(blob.type&&!/^image\/(?:png|jpeg|webp|svg\+xml)$/i.test(blob.type))throw new Error('Для печати нужна подготовленная страница изображения.');
        if(blob.type==='image/svg+xml'){if(totalVectorBytes+blob.size>MAX_VECTOR_BYTES)throw new Error('Этот тираж слишком велик для печати из браузера. Печатайте его частями или сохраните PDF.');totalVectorBytes+=blob.size;}
        url=global.URL.createObjectURL(blob);urls.push(url);
      }
      const page=doc.createElement('section'),image=doc.createElement('img');page.className='print-page';image.alt='Лист '+(pages.length+1);image.loading='eager';image.decoding='sync';page.append(image);doc.body.append(page);
      try {
        await new Promise((resolve,reject)=>{
          let complete=false,timer;
          const cancel=()=>finish(new Error('Подготовка печати отменена.'));
          function finish(error){if(complete)return;complete=true;global.clearTimeout(timer);image.onload=null;image.onerror=null;pendingLoads.delete(cancel);error?reject(error):resolve();}
          timer=global.setTimeout(()=>finish(new Error('Лист не успел подготовиться к печати. Повторите попытку.')),30000);
          pendingLoads.add(cancel);
          image.onload=()=>finish();
          image.onerror=()=>finish(new Error('Браузер не прочитал изображение листа.'));
          image.src=url;
        });
        assertOpen();
        const pixels=image.naturalWidth*image.naturalHeight;
        if(!pixels)throw new Error('У листа для печати нет размера.');
        if(totalPixels+pixels>MAX_PIXELS)throw new Error('Слишком большой тираж для памяти браузера. Уменьшите число листов или разрешение печати.');
        totalPixels+=pixels;pages.push({page,image,width:image.naturalWidth,height:image.naturalHeight});return pages.length;
      }catch(error){page.remove();throw error;}
    }
    async function print(size={}) {
      assertOpen();if(printed)throw new Error('Эта очередь печати уже отправлена.');if(!pages.length)throw new Error('Нет листов для печати.');
      const pageWidth=dimension(size.pageWidth,'Ширина листа'),pageHeight=dimension(size.pageHeight,'Высота листа'),ratio=pageWidth/pageHeight;
      if(pages.some(p=>Math.abs(p.width/p.height/ratio-1)>.015))throw new Error('Размер изображения не совпадает с размером листа. Подготовьте печать ещё раз.');
      const sizeRule='@page{size:'+pageWidth+'mm '+pageHeight+'mm;margin:0}html,body{width:'+pageWidth+'mm}.print-page{width:'+pageWidth+'mm;height:'+pageHeight+'mm}';
      style.textContent+=sizeRule;
      if(size.title)doc.title=String(size.title);
      // Generated SVG pages carry their vector lettering and embedded fonts.
      // They load through img.decode/onload without external font downloads.
      // FontFaceSet.ready can wait for layout in hidden tabs.
      // requestAnimationFrame is also suspended in some background browsers.
      // Give paint a chance without making native printing depend on a frame.
      await new Promise(resolve=>{
        let settled=false,timer;
        const finish=()=>{if(settled)return;settled=true;global.clearTimeout(timer);resolve();};
        timer=global.setTimeout(finish,120);
        if(typeof global.requestAnimationFrame==='function'){
          try{global.requestAnimationFrame(()=>global.requestAnimationFrame(finish));}catch(_){finish();}
        }else finish();
      });
      assertOpen();
      if(typeof view.print!=='function')throw new Error('Этот браузер не поддерживает печать. Откройте редактор в Safari или Chrome.');
      printed=true;view.focus();view.print();
      // afterprint normally closes the iframe. Some mobile browsers do not fire
      // it; retain the ready document until the next print, explicit close or unload.
      return {pages:pages.length,pageWidth,pageHeight,printed:true};
    }
    const job=Object.freeze({addPage,print,close,get pageCount(){return pages.length;},get closed(){return closed;},get printed(){return printed;}});
    activeJob=job;return job;
  }
  global.InvitePrint=Object.freeze({calculateLayout,drawMarks,createJob,MAX_PAGES,MAX_PIXELS,MM_PER_INCH});
})(typeof window==='undefined'?globalThis:window);

