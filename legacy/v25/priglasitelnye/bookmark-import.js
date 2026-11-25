(function (global) {
  'use strict';
  // DOCX is read only in this browser. External relationships are never fetched.
  const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const MAX_FILE=64*1024*1024,MAX_ENTRY=32*1024*1024,MAX_TOTAL=160*1024*1024;
  const utf8=new TextDecoder('utf-8');
  const mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',bmp:'image/bmp'};
  const crcTable=Array.from({length:256},(_,i)=>{for(let k=0;k<8;k++)i=i&1?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
  function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
  function error(message){return new Error(message);}
  function uid(prefix){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);}
  function zipEntries(buffer) {
    const b=new Uint8Array(buffer),v=new DataView(b.buffer,b.byteOffset,b.byteLength);let eocd=-1;
    if(b.length>MAX_FILE)throw error('DOCX больше 64 МБ. Разделите документ на несколько файлов.');
    for(let p=b.length-22;p>=Math.max(0,b.length-65557);p--)if(v.getUint32(p,true)===0x06054b50&&p+22+v.getUint16(p+20,true)===b.length){eocd=p;break;}
    if(eocd<0)throw error('Не удалось прочитать DOCX. Нужен документ Word .docx, а не .doc или PDF.');
    const count=v.getUint16(eocd+10,true),dirSize=v.getUint32(eocd+12,true),start=v.getUint32(eocd+16,true);
    if(v.getUint16(eocd+4,true)||v.getUint16(eocd+6,true)||count===65535||count>2048||start+dirSize>eocd)throw error('Этот архив DOCX не поддерживается. Пересохраните документ в Word.');
    const entries=new Map();let p=start,total=0;
    for(let i=0;i<count;i++){
      if(p+46>eocd||v.getUint32(p,true)!==0x02014b50)throw error('Повреждён каталог DOCX.');
      const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),crc=v.getUint32(p+16,true),compressed=v.getUint32(p+20,true),size=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),offset=v.getUint32(p+42,true);
      if(p+46+nl+el+cl>eocd)throw error('Повреждён каталог DOCX.');
      const name=utf8.decode(b.subarray(p+46,p+46+nl));p+=46+nl+el+cl;
      if(flags&1)throw error('Документ защищён паролем. Сохраните копию DOCX без шифрования.');
      if(size>MAX_ENTRY||(total+=size)>MAX_TOTAL)throw error('В DOCX слишком много данных. Уменьшите изображения или разделите документ.');
      if(entries.has(name))throw error('В DOCX найдены повторяющиеся пути файлов. Пересохраните документ.');
      entries.set(name,{name,size,compressed,crc,method,offset});
    }
    function read(name){
      const e=entries.get(name);if(!e)return null;
      if(e.offset+30>b.length||v.getUint32(e.offset,true)!==0x04034b50)throw error('Повреждён файл внутри DOCX.');
      const from=e.offset+30+v.getUint16(e.offset+26,true)+v.getUint16(e.offset+28,true),to=from+e.compressed;
      if(to>start||from>to)throw error('Повреждён файл внутри DOCX.');
      let out;
      if(e.method===0)out=b.slice(from,to);
      else if(e.method===8){
        if(!global.pako?.Inflate)throw error('Модуль распаковки DOCX не загрузился. Обновите страницу.');
        const chunks=[],inflater=new global.pako.Inflate({raw:true,chunkSize:65536});let length=0;
        inflater.onData=chunk=>{length+=chunk.length;if(length>e.size||length>MAX_ENTRY)throw error('Распакованный файл превышает допустимый размер.');chunks.push(chunk);};
        inflater.push(b.subarray(from,to),true);
        if(inflater.err||!inflater.ended)throw error('Не удалось распаковать файл внутри DOCX.');
        out=new Uint8Array(length);let at=0;for(const chunk of chunks){out.set(chunk,at);at+=chunk.length;}
      }else throw error('В DOCX используется неподдерживаемое сжатие. Пересохраните документ в Word.');
      if(out.length!==e.size||crc32(out)!==e.crc)throw error('Файл DOCX повреждён: не совпадает контрольная сумма.');
      return out;
    }
    return{entries,read};
  }
  function parseXML(bytes,label){
    if(!bytes)throw error('В DOCX отсутствует '+label+'.');
    const xml=utf8.decode(bytes);
    if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw error('DOCX содержит неподдерживаемую XML-разметку.');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    if(doc.getElementsByTagName('parsererror').length)throw error('Не удалось прочитать '+label+' в DOCX.');
    return doc;
  }
  function normalizePath(target){
    let path=target.replace(/\\/g,'/');try{path=decodeURIComponent(path);}catch(_){}
    const parts=(path.startsWith('/')?path.slice(1):'word/'+path).split('/'),out=[];
    for(const part of parts){if(part==='..')out.pop();else if(part!=='.'&&part)out.push(part);}
    return out.join('/');
  }
  function textOf(p){
    let text='';
    function walk(node){for(const child of node.childNodes){if(child.nodeType!==1)continue;if(child.namespaceURI===W&&child.localName==='t')text+=child.textContent;else if(child.namespaceURI===W&&['tab','br','cr'].includes(child.localName))text+=child.localName==='tab'?'\t':'\n';else if(!(child.namespaceURI===W&&child.localName==='del'))walk(child);}}
    walk(p);return text;
  }
  // The shared catalogue owns author names. Only the author span is normalized;
  // quote characters are always sliced from the original, unmodified paragraph.
  const names=global.BookmarkAuthors;
  if(!names)throw error('Не загружен справочник авторов. Обновите все файлы редактора и перезагрузите страницу.');
  function authorPattern(value){
    return Array.from(value.normalize('NFC').replace(/[\u0300\u0301]/g,'')).map(char=>{
      if(/\s/u.test(char))return '[\\s\\u00a0]+';
      if(char==='.')return '\\.?\\s*';
      if(/[еёЕЁ]/u.test(char))return '[её][\\u0300\\u0301]*';
      const escaped=char.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      return escaped+(/[а-яА-ЯЁё]/u.test(char)?'[\\u0300\\u0301]*':'');
    }).join('');
  }
  const AUTHORS=names.markers.map(name=>{const p=authorPattern(name);return{whole:new RegExp('^('+p+')[.,]?$','iu'),prefix:new RegExp('^('+p+')\\s*(?:[-—–](?:\\.)?|:)\\s*','iu'),suffix:new RegExp('('+p+')[\\s.,)]*$','iu')};});
  function authorPart(rawName,quote,extra){
    const original=rawName.trim(),entry=names.resolve(original),name=entry?entry.name:original;
    return{name,quote,...(entry&&name!==original?{sourceName:original}:{}),...extra};
  }
  const NAME_WORD='(?:[А-ЯЁA-Z][а-яёa-zА-ЯЁA-Z\\u0300-\\u036f-]+|[А-ЯЁA-Z]\\.)';
  const NAME_RE=new RegExp('^(?:'+NAME_WORD+'(?:\\s+(?:фон\\s+)?'+NAME_WORD+'){1,5})[.,]?$','u');
  function plausibleName(value){return value.length<100&&NAME_RE.test(value)&&!/[«»“”„"!?;:]/.test(value);}
  function splitText(value){
    const raw=value.trim();
    for(const patterns of AUTHORS){
      const whole=raw.match(patterns.whole);if(whole)return authorPart(raw,'',{authorOnly:true,certain:true});
      const before=raw.match(patterns.prefix);if(before)return authorPart(before[1],raw.slice(before[0].length),{certain:true});
      const after=raw.match(patterns.suffix);
      if(after&&after.index>0){
        let quote=raw.slice(0,after.index).replace(/\s*[-—–]\s*$/u,'').trimEnd();
        if(quote.endsWith('('))quote=quote.slice(0,-1).trimEnd();
        return authorPart(after[1],quote,{certain:true,authorOnly:!quote});
      }
    }
    const before=raw.match(/^(.{3,99}?)\s*(?:[-—–]|:)\s+([\s\S]+)$/u);
    if(before&&plausibleName(before[1]))return{name:before[1],quote:before[2],certain:false};
    const after=raw.match(/^([\s\S]+[»”"“.)])\s*(?:[-—–]\s*)?([^«»“”„"!?;:]{3,100})$/u);
    if(after&&plausibleName(after[2]))return{name:after[2].replace(/[.,]$/,''),quote:after[1],certain:false};
    if(plausibleName(raw.replace(/^[-—–]\s*/,'')))return{name:raw.replace(/^[-—–]\s*/,'').replace(/[.,]$/,''),quote:'',authorOnly:true,certain:false};
    return{name:'',quote:raw,certain:false};
  }
  function cardsFromParagraphs(paragraphs){
    const cards=[],warnings=[];let current=null,orphanPunctuation=0;
    function make(part,index){
      const card={id:uid('card'),name:part.name,quote:part.quote,...(part.sourceName!==undefined?{sourceName:part.sourceName}:{}),photoId:'',copies:1,crop:{x:50,y:50,zoom:1},overrides:{},sourceParagraph:index};
      if(!part.name||!part.certain)card.review='Проверьте разделение имени и цитаты.';
      card._candidates=[];cards.push(card);return card;
    }
    for(const p of paragraphs){
      const raw=p.text.trim();
      if(raw&&/^(?:цитат[аы](?:\s+(?:уч[её]н[оы]го|уч[её]ных))?|ко дню социолога|день социолога)$/iu.test(raw))continue;
      if(raw&&/^[«»“”„".,:;—–-]+$/u.test(raw)){orphanPunctuation++;continue;}
      if(raw){
        const part=splitText(p.text);
        if(part.authorOnly&&current&&!current.name){current.name=part.name;if(part.sourceName!==undefined)current.sourceName=part.sourceName;if(part.certain)delete current.review;else current.review='Проверьте имя автора.';}
        else if(part.authorOnly){current=make({...part,quote:'',certain:false},p.index);current.review='Автор без цитаты: добавьте текст или удалите карточку.';}
        else if(!part.name&&current&&!current.name&&current.quote&&!current._candidates.length){current.quote+='\n'+part.quote;}
        else current=make(part,p.index);
      }
      if(p.photos.length&&current){
        for(const id of p.photos)if(!current._candidates.includes(id))current._candidates.push(id);
        if(raw)current._sameParagraph=true;
      }
    }
    for(const card of cards){
      const ids=card._candidates;
      if(ids.length===1)card.photoId=ids[0];
      else if(ids.length>1){if(card._sameParagraph)card.photoId=ids[0];card.review=[card.review,'Рядом с цитатой несколько изображений: выберите фотографию.'].filter(Boolean).join(' ');card.photoCandidates=ids.slice();}
      else card.review=[card.review,'Фотография не найдена: выберите её из галереи или загрузите файл.'].filter(Boolean).join(' ');
      delete card._candidates;delete card._sameParagraph;
    }
    if(orphanPunctuation)warnings.push('Отдельные абзацы только со знаками препинания не превращены в карточки: '+orphanPunctuation+'.');
    return{cards,warnings};
  }
  async function dataURL(bytes,type){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(error('Не удалось прочитать изображение.'));reader.readAsDataURL(new Blob([bytes],{type}));});}
  async function readDocx(file){
    if(!file||typeof file.arrayBuffer!=='function')throw error('Выберите файл DOCX.');
    if(file.size>MAX_FILE)throw error('DOCX больше 64 МБ. Разделите документ на несколько файлов.');
    const zip=zipEntries(await file.arrayBuffer()),doc=parseXML(zip.read('word/document.xml'),'текст документа');
    const relBytes=zip.read('word/_rels/document.xml.rels'),relations=new Map(),warnings=[],images=[],byPath=new Map(),raster=global.BookmarkRasterQuotes,recognized=new Map();
    if(relBytes){const rels=parseXML(relBytes,'связи изображений');for(const rel of rels.getElementsByTagNameNS('*','Relationship'))if(rel.getAttribute('TargetMode')!=='External')relations.set(rel.getAttribute('Id'),normalizePath(rel.getAttribute('Target')||''));}
    for(const [name]of zip.entries){
      if(!name.startsWith('word/media/'))continue;
      const ext=name.split('.').pop().toLowerCase(),type=mime[ext];
      if(!type){warnings.push('Изображение '+name.split('/').pop()+' не поддерживается браузером. Загрузите его как PNG или JPEG.');continue;}
      const id='docx-'+images.length,bytes=zip.read(name);images.push({id,name:name.split('/').pop(),dataUrl:await dataURL(bytes,type)});byPath.set(name,id);
      if(raster){const match=await raster.identify(bytes);if(match)recognized.set(id,match);}
    }
    const paragraphs=Array.from(doc.getElementsByTagNameNS(W,'p')).map((p,index)=>{
      const photos=[];for(const element of p.getElementsByTagName('*')){
        const rel=element.getAttributeNS(R,'embed')||element.getAttributeNS(R,'id');
        const id=byPath.get(relations.get(rel));if(id&&!photos.includes(id))photos.push(id);
      }
      return{index,text:textOf(p),photos};
    });
    // Known quote posters are separate cards, not portraits of the preceding author.
    const parsed=cardsFromParagraphs(paragraphs.map(p=>({...p,photos:p.photos.filter(id=>!recognized.has(id))})));warnings.push(...parsed.warnings);
    if(recognized.size){
      const positions=new Map();for(const p of paragraphs)for(const id of p.photos){const entry=recognized.get(id);if(entry&&!positions.has(entry.id))positions.set(entry.id,p.index);}
      await raster.ready();const additions=raster.prepare({cards:parsed.cards,images},{ids:[...positions.keys()]});
      for(const card of additions.cards){card.id=uid('card');card.sourceParagraph=positions.get(card.sourceQuoteId);parsed.cards.push(card);}
      images.push(...additions.images);parsed.cards.sort((a,b)=>a.sourceParagraph-b.sourceParagraph);
      warnings.push('Из известных картинок исходного набора добавлены редактируемые цитаты: '+additions.cards.length+'. Уже представлено в тексте: '+additions.skipped+'. Пояснения и студенческие комментарии не приписаны авторам цитат.');
    }
    if(!parsed.cards.length)warnings.push('В DOCX не найден редактируемый текст цитат. Изображения доступны в галерее; текст внутри картинок нужно ввести вручную.');
    if(images.length)warnings.push('Встроенные изображения извлечены в галерею. Проверенные цитаты из 12 известных картинок этого набора добавляются по исходному изображению; произвольный текст внутри других картинок не распознаётся. Проверьте соответствие фотографий авторам.');
    return{cards:parsed.cards,images,warnings};
  }
  global.BookmarkImport=Object.freeze({readDocx,splitText,cardsFromParagraphs});
})(window);
