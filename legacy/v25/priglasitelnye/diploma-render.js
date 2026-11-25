(function (global) {
  'use strict';
  const MM=72/25.4,W=210,H=297;
  const INK='#263f58',PALE='#92a9bd',RULE='#53677a';
  const defaults=Object.freeze({theme:'classic',heading:'ДИПЛОМ',recipientLabel:'Награждается',eventName:'',eventSubtitle:'',date:'',city:'',showEvent:true,showEventSubtitle:true,showDate:true,showCity:true,showLogo:true,showReason:true,signatureMode:'department',departmentRole:'Руководитель кафедры',departmentName:'',committeeRole:'Оргкомитет',committeeName:'',fontSize:16,nameSize:28,printLayer:'all',laserBlack:true});
  const fontNames={montserrat:'Diploma Montserrat',montserratBold:'Diploma Montserrat SemiBold'},fontBytes={},fontObjects={},fontFormats={},widths=new Map(),images=new Map(),paths=new Map();
  let readyPromise;
  const segmenter=global.Intl?.Segmenter?new Intl.Segmenter('ru',{granularity:'grapheme'}):null;
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const clamp=(v,min,max,fallback)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
  const backgroundSource=()=>global.DiplomaThemeAssets?.background||global.BookmarkThemeAssets?.background;
  function ready(){
    if(readyPromise)return readyPromise;
    readyPromise=(async()=>{
      if(!global.fontkit||!global.BookmarkFontData)throw new Error('Не загружены шрифты дипломов. Проверьте, что скопирована вся папка приложения.');
      await Promise.all(Object.keys(fontNames).map(async key=>{
        const binary=atob(global.BookmarkFontData[key]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
        const woff=bytes[0]===119&&bytes[1]===79&&bytes[2]===70&&bytes[3]===70;fontFormats[key]=woff?'woff':'truetype';
        if(woff&&(!global.BookmarkFontUnpack||!global.pako?.Inflate))throw new Error('Не загружен распаковщик шрифтов дипломов. Обновите всю папку редактора.');
        fontBytes[key]=woff?global.BookmarkFontUnpack(bytes,global.pako):bytes;fontObjects[key]=global.fontkit.create(fontBytes[key]);
        const face=new FontFace(fontNames[key],bytes.buffer);await face.load();document.fonts.add(face);
      }));
    })().catch(error=>{readyPromise=null;throw error;});return readyPromise;
  }
  async function prepareTheme(s){
    if(s.theme!=='frost')return;
    if((!backgroundSource()||!global.BookmarkBrand)&&global.DiplomaAssets)await global.DiplomaAssets.ensure('frost');
    if(!backgroundSource()||!global.BookmarkBrand?.department||!global.BookmarkBrand?.university)throw new Error('Материалы оформления «Первый иней» не загружены. Повторите выбор оформления или выберите «Классический».');
  }
  function settingsFor(input={}){const s={...defaults,...input};s.theme=s.theme==='frost'?'frost':'classic';s.signatureMode=['committee','both'].includes(s.signatureMode)?s.signatureMode:'department';s.fontSize=clamp(s.fontSize,13,20,16);s.nameSize=clamp(s.nameSize,20,34,28);return s;}
  function measured(text,key,size){
    const signature=key+'|'+size+'|'+text;if(widths.has(signature))return widths.get(signature);const f=fontObjects[key];if(!f)throw new Error('Шрифты диплома ещё загружаются.');
    // Disabling kerning and ligatures in all three exporters keeps line endings identical.
    const units=f.layout(text,[]).glyphs.reduce((sum,g)=>sum+g.advanceWidth,0),width=units/f.unitsPerEm*size/MM;
    if(widths.size>12000)widths.clear();widths.set(signature,width);return width;
  }
  function metrics(key,size){const f=fontObjects[key];if(!f)throw new Error('Шрифты диплома ещё загружаются.');const scale=size/MM/f.unitsPerEm;return{ascent:f.ascent*scale,descent:-f.descent*scale,height:(f.ascent-f.descent)*scale};}
  function wrap(value,key,size,width){
    const lines=[];
    for(const paragraph of String(value).replace(/\r\n?/g,'\n').split('\n')){
      if(!paragraph){lines.push('');continue;}
      let line='';const words=paragraph.match(/\s+|\S+/gu)||[];
      for(const word of words){
        if(measured(line+word,key,size)<=width+.0001){line+=word;continue;}
        if(line){lines.push(line.trimEnd());line='';}
        if(/^\s+$/u.test(word))continue;
        if(measured(word,key,size)<=width+.0001){line=word;continue;}
        const chars=segmenter?[...segmenter.segment(word)].map(x=>x.segment):Array.from(word);
        for(const char of chars){if(line&&measured(line+char,key,size)>width+.0001){lines.push(line);line='';}line+=char;}
      }
      if(line)lines.push(line.trimEnd());
    }
    return lines;
  }
  function fit(value,key,size,min,width,height){
    let result;
    for(let current=size;current>=min-.001;current=Math.max(min,current-.5)){
      const lines=wrap(value,key,current,width),m=metrics(key,current),step=Math.max(current/MM*1.23,m.height),h=lines.length?m.height+(lines.length-1)*step:0;
      result={lines,key,size:current,metrics:m,step,height:h,overflow:h>height+.001||lines.some(line=>measured(line,key,current)>width+.001)};
      if(!result.overflow||current===min)break;
    }
    return result;
  }
  function layout(entry={},input={}){
    const s=settingsFor(input),text=[],rules=[],decorations=[],logos=[],errors=[],blocks={};
    const rect=(x,y,w,h,stroke,pt=.5,fill)=>decorations.push({kind:'rect',x,y,w,h,stroke,pt,fill});
    const line=(x1,y1,x2,y2,stroke=INK,pt=.45)=>decorations.push({kind:'line',x1,y1,x2,y2,stroke,pt});
    const path=(d,stroke=INK,pt=.45,fill)=>decorations.push({kind:'path',d,stroke,pt,fill});
    const rule=(x1,y1,x2,y2=y1)=>rules.push({kind:'line',x1,y1,x2,y2,stroke:RULE,pt:.55});
    function block(name,value,x,y,w,h,size,min,key='montserrat',color=INK,align='center'){
      if(!String(value))return null;
      const b=fit(String(value),key,size,min,w,h);blocks[name]={...b,x,y,w,h};if(b.overflow)errors.push('Поле «'+name+'» не помещается. Сократите текст или уменьшите размер.');
      const top=y+Math.max(0,(h-b.height)/2);
      for(let i=0;i<b.lines.length;i++){const content=b.lines[i];text.push({kind:'text',text:content,key,size:b.size,x:x+(align==='center'?(w-measured(content,key,b.size))/2:align==='right'?w-measured(content,key,b.size):0),y:top+b.metrics.ascent+i*b.step,color,field:name});}
      return b;
    }
    rect(10,10,190,277,INK,.75);rect(12.4,12.4,185.2,272.2,PALE,.3);
    for(const [x,y,a,b]of [[10,10,1,1],[200,10,-1,1],[10,287,1,-1],[200,287,-1,-1]]){
      // Small geometric corners stay within ordinary printer margins.
      path(`M${x+a*2.4} ${y+b*11}L${x+a*2.4} ${y+b*2.4}L${x+a*11} ${y+b*2.4}`,INK,.85);
      path(`M${x+a*4.4} ${y+b*7.2}L${x+a*7.2} ${y+b*4.4}L${x+a*10} ${y+b*7.2}L${x+a*7.2} ${y+b*10}Z`,INK,.4);
    }
    if(s.theme==='frost'){
      // The supplied photographic texture is confined to the border; the text stays on white.
      if(s.showLogo!==false&&global.BookmarkBrand){
        for(const [art,x,w]of [['department',26,48],['university',147,35]]){const brand=global.BookmarkBrand[art];if(brand)logos.push({kind:'logo',art,x,y:20,w,h:w*brand.viewBox[3]/brand.viewBox[2]});}
      }
    }else{
      const y=29;line(77,y,98,y,PALE,.45);line(112,y,133,y,PALE,.45);path(`M105 ${y-2.2}L107.2 ${y}L105 ${y+2.2}L102.8 ${y}Z`,INK,.6);
    }
    block('Заголовок',s.heading,25,45,160,23,42,20,'montserratBold');
    if(s.showEvent!==false&&s.eventName)block('Мероприятие',s.eventName,29,73,152,15,15.5,10.5,'montserratBold');
    if(s.showEventSubtitle!==false&&s.eventSubtitle)block('Подзаголовок',s.eventSubtitle,31,89,148,9,11.5,9.5);
    block('Обращение',s.recipientLabel,28,102,154,9,12.5,10);
    const handwritingRecipient=entry.handRecipient===true||!String(entry.recipient||'').trim();
    if(handwritingRecipient){rule(32,128,178);rule(32,143,178);}
    else block('Получатель',entry.recipient,25,115,160,37,s.nameSize,16,'montserratBold');
    if(entry.place==='hand'){
      block('Место', 'Место',47,163,32,9,14,12);rule(84,170,163);
    }else if(['1','2','3'].includes(entry.place)){
      const roman={1:'I',2:'II',3:'III'}[entry.place];
      block('Место',roman+' место',32,160,146,19,26,22,'montserratBold');
    }
    // An empty reason is an intentional blank for handwriting; showReason hides it entirely.
    if(s.showReason!==false){
      const top=entry.place==='none'||!entry.place?168:187,height=entry.place==='none'||!entry.place?61:42;
      if(entry.handReason===true||!String(entry.reason||'').trim())for(let i=0;i<3;i++)rule(32,top+10+i*13,178);
      else block('Основание',entry.reason,30,top,150,height,s.fontSize,11);
    }
    line(86,235,124,235,PALE,.5);
    const modes=s.signatureMode==='both'?['department','committee']:[s.signatureMode],signatureBoxes=[];
    modes.forEach((mode,index)=>{
      const x=modes.length===2?26+index*84:53,w=modes.length===2?74:104,role=s[mode+'Role'],name=s[mode+'Name'];
      block(mode==='department'?'Должность кафедры':'Должность оргкомитета',role,x,242,w,13,11,9);
      rule(x,263,x+w); // Required in every supported signature mode, even with a printed name.
      if(name)block(mode==='department'?'Подписант кафедры':'Подписант оргкомитета',name,x,266,w,12,11.5,9.5);
      signatureBoxes.push({mode,x,y:242,w,h:36,lineY:263});
    });
    const footer=[s.showCity!==false?s.city:'',s.showDate!==false?s.date:''].filter(Boolean).join(' · ');
    if(footer)block('Город и дата',footer,28,278.5,154,7,10.5,9);
    for(const item of text){const f=fontObjects[item.key];if(typeof f.hasGlyphForCodePoint==='function'){for(const char of item.text){if(!/\s/u.test(char)&&!f.hasGlyphForCodePoint(char.codePointAt(0))){errors.push('Шрифт не содержит символ «'+char+'» в поле «'+item.field+'».');break;}}}}
    return{geometry:{width:W,height:H,pageWidth:W,pageHeight:H},settings:s,text,lines:text,rules,decorations,logos,signatureBoxes,blocks,handwritingRecipient,handwritingReason:s.showReason!==false&&(entry.handReason===true||!String(entry.reason||'').trim()),overflow:errors.length>0,errors:[...new Set(errors)]};
  }
  function paintOptions(input,options={}){
    const layer=options.layer??input.printLayer??'all';if(!['all','inkjet','laser'].includes(layer))throw new Error('Неизвестный слой печати диплома.');
    const offset={};for(const axis of ['X','Y']){const raw=options['offset'+axis],v=raw==null?0:Number(raw);if(!Number.isFinite(v)||Math.abs(v)>10)throw new Error('Смещение по '+axis+': укажите число от −10 до 10 мм.');offset[axis.toLowerCase()]=v;}
    return{layer,black:(options.black??options.laserBlack??input.laserBlack)!==false,offset};
  }
  function colorFor(color,paint){return paint.layer==='laser'&&paint.black?'#000000':color;}
  function selectedNodes(l,paint){return[...(paint.layer==='laser'?[]:[...l.decorations,...l.logos]),...(paint.layer==='inkjet'?[]:[...l.rules,...l.text])];}
  function assertFits(l){if(l.overflow)throw new Error(l.errors.join('\n'));}
  async function loadedImage(src){if(images.has(src))return images.get(src);const im=new Image();im.src=src;await im.decode();images.set(src,im);return im;}
  function pathFor(d){if(!paths.has(d))paths.set(d,new Path2D(d));return paths.get(d);}
  async function draw(canvas,entry,input={},dpi=110,options={}){
    const s=settingsFor(input);await Promise.all([ready(),prepareTheme(s)]);const l=layout(entry,s),paint=paintOptions(s,options),scale=clamp(dpi,40,600,110)/25.4;
    canvas.width=Math.round(W*scale);canvas.height=Math.round(H*scale);const ctx=canvas.getContext('2d');ctx.save();
    if(paint.layer!=='laser'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);}
    ctx.translate(paint.offset.x*scale,paint.offset.y*scale);ctx.scale(scale,scale);
    if(s.theme==='frost'&&paint.layer!=='laser'){const im=await loadedImage(backgroundSource());ctx.save();ctx.beginPath();ctx.rect(10,10,190,277);ctx.clip();ctx.globalAlpha=.42;ctx.drawImage(im,10,10,190,277);ctx.restore();ctx.fillStyle='#fff';ctx.fillRect(18,17,174,262);}
    for(const n of selectedNodes(l,paint)){
      ctx.save();
      if(n.kind==='text'){ctx.font=(n.size/MM)+'px "'+fontNames[n.key]+'"';ctx.fontKerning='none';ctx.textBaseline='alphabetic';ctx.fillStyle=colorFor(n.color,paint);ctx.fillText(n.text,n.x,n.y);}
      else if(n.kind==='logo'){const art=global.BookmarkBrand[n.art];ctx.translate(n.x,n.y);ctx.scale(n.w/art.viewBox[2],n.h/art.viewBox[3]);for(const p of art.paths){if(p.fill){ctx.fillStyle=p.fill;ctx.fill(pathFor(p.d));}if(p.stroke){ctx.strokeStyle=p.stroke;ctx.lineWidth=p.strokeWidth||1;ctx.lineCap=p.lineCap||'butt';ctx.lineJoin=p.lineJoin||'miter';ctx.stroke(pathFor(p.d));}}}
      else{ctx.lineWidth=n.pt/MM;ctx.strokeStyle=colorFor(n.stroke||INK,paint);if(n.kind==='line'){ctx.beginPath();ctx.moveTo(n.x1,n.y1);ctx.lineTo(n.x2,n.y2);ctx.stroke();}else if(n.kind==='rect'){if(n.fill){ctx.fillStyle=n.fill;ctx.fillRect(n.x,n.y,n.w,n.h);}if(n.stroke)ctx.strokeRect(n.x,n.y,n.w,n.h);}else if(n.kind==='path'){if(n.fill){ctx.fillStyle=n.fill;ctx.fill(pathFor(n.d));}if(n.stroke)ctx.stroke(pathFor(n.d));}}
      ctx.restore();
    }
    ctx.restore();return l;
  }
  async function svg(entry,input={},options={}){
    const s=settingsFor(input);await Promise.all([ready(),prepareTheme(s)]);const l=layout(entry,s);assertFits(l);const paint=paintOptions(s,options),body=[],used=new Set();
    if(paint.layer!=='laser')body.push('<rect width="210" height="297" fill="#ffffff"/>');
    if(s.theme==='frost'&&paint.layer!=='laser')body.push(`<image x="10" y="10" width="190" height="277" preserveAspectRatio="none" opacity=".42" href="${backgroundSource()}"/><rect x="18" y="17" width="174" height="262" fill="#ffffff"/>`);
    for(const n of selectedNodes(l,paint)){
      if(n.kind==='text'){used.add(n.key);body.push(`<text x="${n.x}" y="${n.y}" font-family="${fontNames[n.key]}" font-size="${n.size/MM}" fill="${colorFor(n.color,paint)}" style="font-kerning:none;font-variant-ligatures:none">${esc(n.text)}</text>`);}
      else if(n.kind==='line')body.push(`<line x1="${n.x1}" y1="${n.y1}" x2="${n.x2}" y2="${n.y2}" stroke="${colorFor(n.stroke,paint)}" stroke-width="${n.pt/MM}"/>`);
      else if(n.kind==='rect')body.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${n.fill||'none'}" stroke="${n.stroke||'none'}" stroke-width="${n.pt/MM}"/>`);
      else if(n.kind==='path')body.push(`<path d="${esc(n.d)}" fill="${n.fill||'none'}" stroke="${n.stroke||'none'}" stroke-width="${n.pt/MM}"/>`);
      else if(n.kind==='logo'){const art=global.BookmarkBrand[n.art];body.push(`<g transform="translate(${n.x} ${n.y}) scale(${n.w/art.viewBox[2]} ${n.h/art.viewBox[3]})">`+art.paths.map(p=>`<path d="${esc(p.d)}" fill="${p.fill||'none'}" stroke="${p.stroke||'none'}" stroke-width="${p.strokeWidth||1}" stroke-linecap="${p.lineCap||'butt'}" stroke-linejoin="${p.lineJoin||'miter'}"/>`).join('')+'</g>');}
    }
    const fonts=[...used].map(key=>`@font-face{font-family:"${fontNames[key]}";src:url(data:font/${fontFormats[key]==='woff'?'woff':'ttf'};base64,${global.BookmarkFontData[key]}) format("${fontFormats[key]}");font-weight:normal}`).join('');
    return new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297"><defs><style>${fonts}</style></defs><g transform="translate(${paint.offset.x} ${paint.offset.y})">${body.join('')}</g></svg>`],{type:'image/svg+xml'});
  }
  function rgb(hex){return global.PDFLib.rgb(...hex.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)/255));}
  function expandedEntries(entries){
    if(!Array.isArray(entries)||!entries.length||entries.length>200)throw new Error('Выберите от 1 до 200 дипломов для экспорта.');
    const out=[];for(const entry of entries){if(!entry||typeof entry!=='object')throw new Error('Неверная структура диплома.');const count=entry.copies===undefined?1:entry.copies;if(!Number.isInteger(count)||count<1||count>100)throw new Error('Тираж диплома: целое число от 1 до 100.');for(let i=0;i<count;i++)out.push(entry);if(out.length>200)throw new Error('За один раз можно экспортировать до 200 экземпляров дипломов.');}return out;
  }
  async function pdf(entries,input={},options={}){
    const s=settingsFor(input),expanded=expandedEntries(entries);await Promise.all([ready(),prepareTheme(s)]);
    if(!global.PDFLib)throw new Error('Не загружен модуль экспорта PDF. Обновите папку редактора.');
    const layouts=expanded.map(e=>layout(e,s));layouts.forEach(assertFits);const paint=paintOptions(s,options),P=global.PDFLib,doc=await P.PDFDocument.create(),used=new Set(),fonts={};
    doc.registerFontkit(global.fontkit);doc.setTitle(options.title||'Дипломы');doc.setCreator('Редактор дипломов');
    if(paint.layer!=='inkjet')for(const l of layouts)for(const t of l.text)if(t.text)used.add(t.key);
    for(const key of used)fonts[key]=await doc.embedFont(fontBytes[key],{subset:true});
    let background;if(s.theme==='frost'&&paint.layer!=='laser'){const src=backgroundSource();background=/^data:image\/png;/i.test(src)?await doc.embedPng(src):await doc.embedJpg(src);}
    for(let index=0;index<layouts.length;index++){
      const l=layouts[index],page=doc.addPage([W*MM,H*MM]);page.pushOperators(P.pushGraphicsState(),P.translate(paint.offset.x*MM,-paint.offset.y*MM));
      if(paint.layer!=='laser')page.drawRectangle({x:0,y:0,width:W*MM,height:H*MM,color:P.rgb(1,1,1)});
      if(background){page.drawImage(background,{x:10*MM,y:10*MM,width:190*MM,height:277*MM,opacity:.42});page.drawRectangle({x:18*MM,y:18*MM,width:174*MM,height:262*MM,color:P.rgb(1,1,1)});}
      for(const n of selectedNodes(l,paint)){
        if(n.kind==='text'&&n.text)page.drawText(n.text,{x:n.x*MM,y:(H-n.y)*MM,size:n.size,font:fonts[n.key],color:rgb(colorFor(n.color,paint)),features:[]});
        else if(n.kind==='line')page.drawLine({start:{x:n.x1*MM,y:(H-n.y1)*MM},end:{x:n.x2*MM,y:(H-n.y2)*MM},thickness:n.pt,color:rgb(colorFor(n.stroke,paint))});
        else if(n.kind==='rect')page.drawRectangle({x:n.x*MM,y:(H-n.y-n.h)*MM,width:n.w*MM,height:n.h*MM,...(n.fill?{color:rgb(n.fill)}:{}),borderColor:n.stroke?rgb(n.stroke):undefined,borderWidth:n.pt});
        else if(n.kind==='path')page.drawSvgPath(n.d,{x:0,y:H*MM,scale:MM,...(n.fill?{color:rgb(n.fill)}:{}),...(n.stroke?{borderColor:rgb(n.stroke),borderWidth:n.pt/MM}:{})});
        else if(n.kind==='logo'){const art=global.BookmarkBrand[n.art],scale=n.w*MM/art.viewBox[2];for(const p of art.paths)page.drawSvgPath(p.d,{x:n.x*MM,y:(H-n.y)*MM,scale,...(p.fill?{color:rgb(p.fill)}:{}),...(p.stroke?{borderColor:rgb(p.stroke),borderWidth:p.strokeWidth||1,borderLineCap:p.lineCap==='round'?P.LineCapStyle.Round:P.LineCapStyle.Butt}:{})});}
      }
      page.pushOperators(P.popGraphicsState());if(options.onProgress)options.onProgress(index+1,layouts.length);await tick();
    }
    return new Blob([await doc.save()],{type:'application/pdf'});
  }
  global.DiplomaRender=Object.freeze({defaults,geometry:()=>({width:W,height:H,pageWidth:W,pageHeight:H}),ready,layout,svg,pdf,draw,settingsFor,expandedEntries});
})(window);
