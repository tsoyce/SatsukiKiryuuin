(function(global){
  'use strict';
  const WHITE='#ffffff',INK='#354b65',PALE='#9aafc5';
  // Explicit composition, independent of archive/alphabetical asset order.
  // 3: Андрианова Елена Владимировна; 9: Ефимова Галина Зиновьевна.
  const departmentRows=Object.freeze({
    wide:Object.freeze([Object.freeze([5,2,10,4,1,7,8,14,15]),Object.freeze([11,12,13,9,3,16,17,18,19])]),
    tall:Object.freeze([Object.freeze([5,2,10,4,1,15]),Object.freeze([7,8,14,12,17,18]),Object.freeze([11,13,9,3,16,19])])
  });
  function active(s){return s.theme==='frost'||s.theme==='cards';}
  function groupFor(card,s){if(s.seriesGroup>0)return s.seriesGroup-1;const index=s.themeCardOrder?.indexOf(card?.id);return Math.max(0,index??0)%6;}
  const cache=new Map();
  function buildScene(card,s,g,side,l){
    if(!active(s))return[];
    if(!global.BookmarkThemeAssets||!global.BookmarkBrand)throw new Error('Не загружены материалы дизайна. Повторите выбор оформления.');
    const A=global.BookmarkThemeAssets,B=global.BookmarkBrand,nodes=[],W=g.width,H=g.height,wide=W>H,accent=s.accent||INK,strength=Math.max(0,Math.min(1,s.ornamentStrength??.4));
    const rect=(x,y,w,h,fill,opacity=1,stroke,pt=.3)=>nodes.push({kind:'rect',x,y,w,h,fill,opacity,stroke,pt});
    const line=(x1,y1,x2,y2,stroke=accent,pt=.3,opacity=1)=>nodes.push({kind:'line',x1,y1,x2,y2,stroke,pt,opacity});
    const text=(value,x,y,size=8,bold=false,align='left',color=accent)=>nodes.push({kind:'text',text:value,x,y,size,key:bold?'montserratBold':'montserrat',align,color});
    const diamond=(x,y,r,color=accent,opacity=1,pt=.3)=>nodes.push({kind:'path',d:`M${x} ${y-r}L${x+r} ${y}L${x} ${y+r}L${x-r} ${y}Z`,stroke:color,pt,opacity});
    function pattern(x,y,w,h,color=accent,opacity=.12,step=5.5){const cols=Math.floor(w/step),rows=Math.floor(h/step);for(let row=0;row<rows;row++)for(let col=0;col<cols;col++)diamond(x+(w-cols*step)/2+(col+.5)*step,y+(h-rows*step)/2+(row+.5)*step,step*.43,color,opacity*strength,.25);}
    function logo(art,x,y,w){if(!s.brandVisible)return;const data=B[art];nodes.push({kind:'logo',art,x,y,w,h:w*data.viewBox[3]/data.viewBox[2]});}
    function frame(){if(!s.frame)return;rect(2.6,2.6,W-5.2,H-5.2,null,1,accent,.42);if(s.theme==='cards'){rect(4,4,W-8,H-8,null,.75,accent,.22);const horizontal=Math.max(1,Math.floor((W-18)/4)),vertical=Math.max(1,Math.floor((H-18)/4));for(let i=0;i<=horizontal;i++){const x=(W-horizontal*4)/2+i*4;for(const y of [3.3,H-3.3])diamond(x,y,.32,accent,.65*strength,.22);}for(let i=0;i<=vertical;i++){const y=(H-vertical*4)/2+i*4;for(const x of [3.3,W-3.3])diamond(x,y,.32,accent,.65*strength,.22);}}else{for(const x of [4,W-4])for(const y of [4,H-4])diamond(x,y,.65,accent,.65*strength,.3);}}
    function texture(opacity=.45){if(s.theme==='frost')nodes.push({kind:'image',src:A.background,x:0,y:0,w:W,h:H,fit:'cover',opacity});}
    function person(id,cx,y,h){const person=A.staff.find(p=>p.id===id);if(!person)throw new Error('Отсутствует миниатюра участника '+id+'.');const w=h*person.width/person.height;nodes.push({kind:'image',personId:id,src:person.src,x:cx-w/2,y,w,h,opacity:1});}
    function years(cx,y){text('1986–2026',cx,y,8,false,'center');}
    rect(0,0,W,H,WHITE);
    if(side==='front'){
      texture(.16);const band=wide?(l.photo?l.photo.x+l.photo.width+3:Math.min(31,W*.24)):W;
      if(wide){rect(0,0,band,H,accent,s.theme==='cards'?.06:.025);rect(band,0,W-band,H,WHITE,.86);if(strength&&s.theme==='cards')pattern(5,H-16,band-10,10,accent,.2,4);line(band+1,8,band+1,H-8,accent,.3,.35);}
      if(s.brandVisible){const mark=B.mark,w=7.5,h=w*mark.viewBox[3]/mark.viewBox[2],cx=wide?(l.photo?l.photo.x+l.photo.width/2:17.5):W/2;logo('mark',cx-w/2,H-15,w);if(!s.footer)text('ДЕНЬ СОЦИОЛОГА · 2026',cx,H-5.7,wide?5.4:6,false,'center');}
      frame();return nodes;
    }
    const template=s.backTemplate||'text';
    if(template==='ornament'){
      const dark=s.theme==='cards';rect(5,5,W-10,H-10,accent,dark?1:.1);pattern(6,6,W-12,H-12,dark?WHITE:accent,dark?.65:.55,5.4);
      const panelW=wide?Math.min(88,W-28):W-16,panelH=wide?H-14:Math.min(100,H-24),px=(W-panelW)/2,py=(H-panelH)/2;
      rect(px,py,panelW,panelH,WHITE,1,accent,.5);rect(px+1.5,py+1.5,panelW-3,panelH-3,null,.65,accent,.2);
      const lw=Math.min(48,panelW-6),lh=lw*B.department.viewBox[3]/B.department.viewBox[2];
      logo('department',(W-lw)/2,py+3,lw);
      const offset=wide?(s.brandVisible?31:23):(s.brandVisible?Math.min(panelH*.48,lh+12):panelH*.3);
      text('40',W/2,py+offset,wide?24:36,true,'center');text('ЛЕТ ВМЕСТЕ',W/2,py+offset+5.2,8,true,'center');years(W/2,py+offset+11.4);text('ДЕНЬ СОЦИОЛОГА · ТЮМГУ',W/2,py+panelH-4.5,6.8,true,'center');
      if(wide)for(const x of [15,W-15])for(const r of [3,5,7])diamond(x,H/2,r,dark?WHITE:accent,.6,.35);
      frame();return nodes;
    }
    texture(.42);
    if(template==='series'){
      const ids=A.groups[groupFor(card,s)];
      if(wide){
        const sidebar=Math.min(57,W*.41),cx=sidebar/2+2;rect(5,5,sidebar-6,H-10,WHITE,.85);line(sidebar,8,sidebar,H-8,accent,.3,.4);
        text('ДЕНЬ СОЦИОЛОГА',8,11,9.5,true);text('ТЮМГУ · 2026',8,16,6.8,true);text('40',cx,29,30,true,'center');text('ЛЕТ ВМЕСТЕ',cx,34,7,true,'center');years(cx,40);
        const lw=43;logo('department',cx-lw/2,H-5-lw*B.department.viewBox[3]/B.department.viewBox[2],lw);
        const rw=W-sidebar-12,center=(sidebar+5+W-7)/2;pattern(sidebar+5,6,rw,H-13,accent,.16,6);
        for(let i=0;i<3;i++)person(ids[i],center+(i-1)*rw/3,8,Math.min(48,H-14));
      }else{
        text('ДЕНЬ СОЦИОЛОГА',W/2,11,9.5,true,'center');text('40 ЛЕТ ВМЕСТЕ',W/2,18,12,true,'center');years(W/2,24);
        const lw=Math.min(48,W-14);logo('department',(W-lw)/2,30,lw);
        const y=s.brandVisible?55:34,h=Math.min(60,H-y-16),maxWidth=Math.max(...ids.map(id=>{const p=A.staff.find(p=>p.id===id);return h*p.width/p.height;})),step=(W-12-maxWidth)/2;for(let i=0;i<3;i++)person(ids[i],W/2+(i-1)*step,y,h);
        text('ТЮМГУ · 2026',W/2,H-8,7,true,'center');
      }
      frame();return nodes;
    }
    if(template==='department'){
      if(wide){
        rect(5,5,W-10,21,WHITE,.85);text('ТЮМГУ · ДЕНЬ СОЦИОЛОГА',8,10,6.8,true);text('40 лет вместе',8,18,16,true);years(35,23.4);
        logo('department',W-56,6.5,48);
        const h=Math.min(24,H-39),step=(W-28)/8;
        for(let row=0;row<departmentRows.wide.length;row++)for(let i=0;i<9;i++)person(departmentRows.wide[row][i],14+i*step,row?32.4:27,h);
        rect(5,H-8.2,W-10,3.4,WHITE,.9);text('Кафедра общей и экономической социологии',W/2,H-5.7,6.5,false,'center');
      }else{
        text('40 лет вместе',W/2,12,15,true,'center');years(W/2,18);logo('department',(W-48)/2,23,48);
        const top=s.brandVisible?47:29,h=(H-top-18)/3+5,maxWidth=Math.max(...A.staff.map(p=>h*p.width/p.height)),step=(W-12-maxWidth)/5;
        for(let row=0;row<3;row++)for(let col=0;col<6;col++)person(departmentRows.tall[row][col],6+maxWidth/2+col*step,top+row*(h-5),h);
        text('ДЕНЬ СОЦИОЛОГА · ТЮМГУ · 2026',W/2,H-8,6.6,true,'center');
      }
      frame();return nodes;
    }
    if(s.theme==='cards')pattern(5,5,W-10,H-10,accent,.08,6);
    if(s.brandVisible)logo('mark',W/2-4,H-14,8);
    frame();return nodes;
  }
  function scene(card,s,g,side,l){const key=JSON.stringify([s.theme,s.backTemplate,s.seriesGroup,groupFor(card,s),s.accent,s.ornamentStrength,s.brandVisible,s.frame,s.footer,g.width,g.height,side,l.photo]);let value=cache.get(key);if(value)return value;value=buildScene(card,s,g,side,l);if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,value);return value;}
  global.BookmarkThemes=Object.freeze({active,scene,groupFor,departmentRows,clearCaches:()=>cache.clear()});
})(window);
