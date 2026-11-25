(function(global){
  'use strict';
  // Bundled WOFF1 fonts only. Decode once: fontkit's WOFF reader inflates glyf repeatedly.
  // Container rules: https://www.w3.org/TR/WOFF/#WOFFHeader and #TableDirectory.
  function woffToSfnt(input,pako){
    const fail=reason=>{throw new Error('Повреждён встроенный шрифт: '+reason+'.');};
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
    const limit=32*1024*1024,pad=n=>Math.ceil(n/4)*4;
    if(bytes.length<44||bytes.length>limit)fail('размер WOFF');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u32=n=>view.getUint32(n),u16=n=>view.getUint16(n);
    if(u32(0)!==0x774f4646)fail('подпись WOFF');
    const flavor=u32(4),count=u16(12),size=u32(16),directoryEnd=44+20*count;
    if(![0x00010000,0x4f54544f,0x74727565].includes(flavor))fail('тип sfnt');
    if(u32(8)!==bytes.length||u16(14)!==0||!count||count>256||directoryEnd>bytes.length||size>limit||size<12+16*count||size%4)fail('заголовок WOFF');
    const entries=[],ranges=[],optional=[[u32(24),u32(28),u32(32)],[u32(36),u32(40),null]];
    let expected=12+16*count,lastTag=-1;
    function range(offset,length,label){if(offset%4||offset<directoryEnd||offset+length>bytes.length)fail('границы '+label);if(length)ranges.push([offset,offset+length,label]);}
    for(const [offset,length,original]of optional){if(!offset||!length){if(offset||length||original)fail('дополнительный блок');}else{if(original===0)fail('длина метаданных');range(offset,length,'дополнительного блока');}}
    for(let i=0;i<count;i++){
      const at=44+20*i,tag=u32(at),offset=u32(at+4),compressed=u32(at+8),length=u32(at+12),checksum=u32(at+16);
      if(tag<=lastTag||compressed>length||length>limit)fail('каталог таблиц');
      for(let j=0;j<4;j++){const c=bytes[at+j];if(c<32||c>126)fail('имя таблицы');}
      range(offset,compressed,'таблицы');
      if(pad(offset+compressed)>bytes.length)fail('выравнивание таблицы');
      for(let j=offset+compressed;j<pad(offset+compressed);j++)if(bytes[j])fail('заполнение таблицы');
      entries.push({tag,offset,compressed,length,checksum});lastTag=tag;expected+=pad(length);
      if(expected>limit)fail('размер sfnt');
    }
    if(expected!==size)fail('длина sfnt');
    ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)if(ranges[i][0]<ranges[i-1][1])fail('пересечение блоков');
    const result=new Uint8Array(size),sfnt=new DataView(result.buffer),sum=(data,head=false)=>{
      const words=new DataView(data.buffer,data.byteOffset,data.byteLength);let value=0,at=0;
      for(;at+4<=data.length;at+=4)if(!head||at!==8)value=(value+words.getUint32(at))>>>0;
      if(at<data.length){let word=0;for(let j=0;j<4;j++)word=(word*256+(data[at+j]||0))>>>0;value=(value+word)>>>0;}
      return value;
    };
    sfnt.setUint32(0,flavor);sfnt.setUint16(4,count);const selector=Math.floor(Math.log2(count)),search=16*2**selector;
    sfnt.setUint16(6,search);sfnt.setUint16(8,selector);sfnt.setUint16(10,count*16-search);
    let offset=12+16*count,headOffset=-1;
    for(let i=0;i<count;i++){
      const table=entries[i],packed=bytes.subarray(table.offset,table.offset+table.compressed);let data=packed;
      if(table.compressed<table.length){
        if(!pako?.Inflate)fail('не загружен распаковщик');
        const inflater=new pako.Inflate({chunkSize:Math.min(65536,Math.max(1024,table.length))}),chunks=[];let produced=0;
        inflater.onData=chunk=>{produced+=chunk.length;if(produced>table.length)fail('распакованная таблица слишком велика');chunks.push(chunk);};
        try{inflater.push(packed,true);}catch(e){fail('сжатая таблица');}
        if(inflater.err||!inflater.ended||inflater.strm.avail_in||produced!==table.length)fail('длина распакованной таблицы');
        data=new Uint8Array(table.length);let pos=0;for(const chunk of chunks){data.set(chunk,pos);pos+=chunk.length;}
      }
      const head=table.tag===0x68656164;
      if(data.length!==table.length||(head&&data.length<12)||sum(data,head)!==table.checksum)fail('контрольная сумма таблицы');
      const at=12+i*16;sfnt.setUint32(at,table.tag);sfnt.setUint32(at+4,table.checksum);sfnt.setUint32(at+8,offset);sfnt.setUint32(at+12,table.length);result.set(data,offset);
      if(head){headOffset=offset;sfnt.setUint32(offset+8,0);}offset+=pad(table.length);
    }
    if(headOffset<0)fail('нет таблицы head');
    sfnt.setUint32(headOffset+8,(0xb1b0afba-sum(result))>>>0);
    if(sum(result)!==0xb1b0afba)fail('контрольная сумма sfnt');
    return result;
  }
  if(typeof module==='object'&&module.exports)module.exports=woffToSfnt;
  else global.BookmarkFontUnpack=woffToSfnt;
})(typeof window==='object'?window:globalThis);
