/* Viewport gestures never modify the document or its rendering resolution. */
(function(global){
  'use strict';
  const bindings=new WeakMap();
  function bind({surface,content,handButton}){
    if(!surface||!content)return null;
    if(bindings.has(surface))return bindings.get(surface);
    const desktop=matchMedia('(min-width:1000px) and (min-height:600px)');
    const initialTouch=surface.style.touchAction;
    handButton?.classList.add('studio-hand-tool');
    let hand=false,space=false,drag=null,clickGuard=null,previousSelection='';
    const visible=()=>desktop.matches&&surface.getClientRects().length>0&&!document.querySelector('dialog[open]');
    function refresh(){
      const enabled=visible()&&(hand||space);
      surface.classList.toggle('studio-pan-mode',enabled);
      surface.classList.toggle('studio-panning',!!drag);
      surface.style.touchAction=enabled?'none':initialTouch;
      if(handButton){handButton.setAttribute('aria-pressed',String(hand));handButton.title=hand?'Выключить перемещение просмотра':'Перемещать просмотр · пробел или средняя кнопка мыши';}
    }
    function stop(cancel=false){
      if(!drag)return;
      const old=drag;drag=null;
      if(cancel){surface.scrollLeft=old.scrollX;surface.scrollTop=old.scrollY;}
      clickGuard={x:old.lastX,y:old.lastY,until:Date.now()+400};
      document.body.style.userSelect=previousSelection;
      try{if(surface.hasPointerCapture(old.id))surface.releasePointerCapture(old.id);}catch(_){}
      refresh();
    }
    function down(event){
      if(!visible()||drag)return;
      const middle=event.pointerType!=='touch'&&event.button===1;
      if(!middle&&!(event.button===0&&(hand||space)))return;
      const rect=surface.getBoundingClientRect();
      // Leave native scrollbars draggable even while the hand tool is selected.
      if(event.clientX>=rect.left+surface.clientWidth||event.clientY>=rect.top+surface.clientHeight)return;
      event.preventDefault();event.stopImmediatePropagation();
      previousSelection=document.body.style.userSelect;document.body.style.userSelect='none';
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,scrollX:surface.scrollLeft,scrollY:surface.scrollTop};
      try{surface.setPointerCapture(event.pointerId);}catch(_){}
      refresh();
    }
    function move(event){
      if(!drag||event.pointerId!==drag.id)return;
      event.preventDefault();event.stopImmediatePropagation();
      drag.lastX=event.clientX;drag.lastY=event.clientY;
      surface.scrollLeft=drag.scrollX-(event.clientX-drag.x);surface.scrollTop=drag.scrollY-(event.clientY-drag.y);
    }
    function up(event){if(drag&&event.pointerId===drag.id){event.preventDefault();event.stopImmediatePropagation();stop(event.type==='pointercancel');}}
    function lost(event){if(drag&&event.pointerId===drag.id)stop();}
    function click(event){
      const guard=clickGuard&&Date.now()<clickGuard.until&&Math.hypot(event.clientX-clickGuard.x,event.clientY-clickGuard.y)<5;
      if(visible()&&(hand||space||guard)){event.preventDefault();event.stopImmediatePropagation();clickGuard=null;}
    }
    function keydown(event){
      if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||!visible())return;
      if(event.key==='Escape'&&drag){event.preventDefault();stop(true);space=false;refresh();return;}
      if(event.target.closest?.('input,textarea,select,button,a,summary,[role=separator],[contenteditable]'))return;
      if(event.code==='Space'){event.preventDefault();if(!event.repeat){space=true;refresh();}}
    }
    function keyup(event){if(event.code==='Space'){space=false;refresh();}}
    function blur(){space=false;stop();refresh();}
    function media(){space=false;hand=false;stop();refresh();}
    function toggle(){hand=!hand;refresh();}
    surface.addEventListener('pointerdown',down,true);surface.addEventListener('pointermove',move,true);
    surface.addEventListener('pointerup',up,true);surface.addEventListener('pointercancel',up,true);surface.addEventListener('lostpointercapture',lost,true);
    surface.addEventListener('click',click,true);surface.addEventListener('auxclick',click,true);
    document.addEventListener('keydown',keydown);document.addEventListener('keyup',keyup);global.addEventListener('blur',blur);
    handButton?.addEventListener('click',toggle);
    if(desktop.addEventListener)desktop.addEventListener('change',media);else desktop.addListener(media);
    const controller=Object.freeze({refresh,isPanning:()=>!!drag,destroy(){
      stop();surface.classList.remove('studio-pan-mode','studio-panning');surface.style.touchAction=initialTouch;
      for(const [type,fn]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['lostpointercapture',lost],['click',click],['auxclick',click]])surface.removeEventListener(type,fn,true);
      document.removeEventListener('keydown',keydown);document.removeEventListener('keyup',keyup);global.removeEventListener('blur',blur);handButton?.removeEventListener('click',toggle);
      if(desktop.removeEventListener)desktop.removeEventListener('change',media);else desktop.removeListener(media);bindings.delete(surface);
    }});
    bindings.set(surface,controller);refresh();return controller;
  }
  global.StudioCanvas=Object.freeze({bind});
})(window);
