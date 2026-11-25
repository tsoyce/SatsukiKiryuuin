(function(global){
  'use strict';
  const body=document.body,tool=body.dataset.studioTool;
  if(!tool)return;
  const desktop=global.matchMedia('(min-width:1000px) and (min-height:600px)');
  const key='print-studio-workspace-v1:'+new URL('.',location.href).pathname+tool;
  let saved;try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
  const size=(value,side)=>typeof value==='number'&&Number.isFinite(value)?Math.round(Math.max(side==='left'?180:240,Math.min(side==='left'?360:440,value))):null;
  const state={left:saved?.left!==false,right:saved?.right!==false,focus:saved?.focus===true,leftSize:size(saved?.leftSize,'left'),rightSize:size(saved?.rightSize,'right')};
  let persisted=JSON.stringify(saved);
  function remember(){const value=JSON.stringify(state);if(value===persisted)return;try{localStorage.setItem(key,value);persisted=value;}catch(_){}}
  function apply(persist=true,reason='panels'){
    if(reason!=='size'){
    body.classList.toggle('studio-left-hidden',!state.left);body.classList.toggle('studio-right-hidden',!state.right);body.classList.toggle('studio-focus-mode',state.focus);
    for(const button of document.querySelectorAll('[data-studio-toggle]')){
      const name=button.dataset.studioToggle,active=name==='focus'?state.focus:state[name]&&!state.focus;
      button.setAttribute('aria-pressed',String(active));
      if(name!=='focus'){
        const panel=document.querySelector('[data-studio-panel="'+name+'"]');
        if(panel){if(!panel.id)panel.id='studio-'+name+'-panel';button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-expanded',String(active));}
      }
    }
    // CSS hides docked panels only on desktop. Existing loading locks and mobile
    // section state own inert/hidden; workspace preferences never override them.
    if(desktop.matches){const current=document.activeElement,panel=current?.closest('[data-studio-panel]');if(panel&&(state.focus||!state[panel.dataset.studioPanel])){const canvas=document.querySelector('[data-studio-canvas]');if(canvas){if(!canvas.hasAttribute('tabindex'))canvas.tabIndex=-1;canvas.focus({preventScroll:true});}}}
    }
    if(persist)remember();
    global.dispatchEvent(new CustomEvent('studio:layout',{detail:{...state,desktop:desktop.matches,reason}}));
  }
  function toggle(name){if(name==='focus')state.focus=!state.focus;else if(name==='left'||name==='right'){if(state.focus){state.focus=false;state[name]=true;}else state[name]=!state[name];}apply();}
  function showPanel(name){if(name!=='left'&&name!=='right'||state[name]&&!state.focus)return;state.focus=false;state[name]=true;apply();}
  document.addEventListener('click',event=>{const tab=event.target.closest?.('[data-tab]');if(tab&&document.querySelector('[data-studio-panel=right]')?.contains(tab))showPanel('right');},true);
  document.addEventListener('click',event=>{const button=event.target.closest('[data-studio-toggle]');if(button&&!button.disabled)toggle(button.dataset.studioToggle);});
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.repeat||event.ctrlKey||event.metaKey||event.altKey||!desktop.matches||document.querySelector('dialog[open]'))return;
    const editing=event.target.closest?.('input,textarea,select,[contenteditable=true]');if(editing)return;
    if(event.shiftKey&&event.key.toLowerCase()==='f'){event.preventDefault();toggle('focus');}
    else if(event.key==='Escape'&&state.focus){event.preventDefault();state.focus=false;apply();}
  });
  if(desktop.addEventListener)desktop.addEventListener('change',()=>apply(false));else desktop.addListener(()=>apply(false));
  global.StudioWorkspace=Object.freeze({toggle,showPanel,setSize:(side,value,persist=true)=>{if(side!=='left'&&side!=='right')return;const next=size(value,side);if(state[side+'Size']===next){if(persist)remember();return;}state[side+'Size']=next;apply(persist,'size');},setSizes:(values,persist=true)=>{let changed=false;for(const side of ['left','right'])if(Object.prototype.hasOwnProperty.call(values,side)){const next=size(values[side],side);if(state[side+'Size']!==next){state[side+'Size']=next;changed=true;}}if(changed)apply(persist,'size');else if(persist)remember();},reset:()=>{Object.assign(state,{left:true,right:true,focus:false,leftSize:null,rightSize:null});apply();},getState:()=>({...state})});
  apply(false);
})(window);

(function(global){
  'use strict';
  const workspace=document.querySelector('.studio-workspace'),api=global.StudioWorkspace;
  if(!workspace||!api)return;
  const desktop=matchMedia('(min-width:1000px) and (min-height:600px)'),panels={},handles={},minimum={left:180,right:240},maximum={left:360,right:440};
  let drag=null,frame=0,dragFrame=0,effective={left:232,right:304};
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  for(const side of ['left','right']){
    panels[side]=document.querySelector('[data-studio-panel="'+side+'"]');if(!panels[side])continue;
    const handle=document.createElement('div');handle.className='studio-resizer';handle.dataset.studioResize=side;handle.tabIndex=0;
    handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label',side==='left'?'Ширина левой панели':'Ширина панели свойств');handle.setAttribute('aria-controls',panels[side].id);
    handle.title='Перетащите границу. Стрелки — 10 px, Shift — 1 px. Двойной щелчок или Enter — сброс.';
    workspace.append(handle);handles[side]=handle;
    handle.addEventListener('pointerdown',event=>{
      if(!desktop.matches||event.button!==0||drag||handle.hidden)return;
      event.preventDefault();event.stopPropagation();handle.focus({preventScroll:true});
      const state=api.getState();drag={side,id:event.pointerId,x:event.clientX,lastX:event.clientX,width:effective[side],left:state.leftSize,right:state.rightSize,cursor:document.body.style.cursor,selection:document.body.style.userSelect};
      document.body.style.cursor='col-resize';document.body.style.userSelect='none';document.body.classList.add('studio-resizing');handle.classList.add('is-resizing');
      try{handle.setPointerCapture(event.pointerId);}catch(_){}
    });
    handle.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();drag.lastX=event.clientX;if(!dragFrame)dragFrame=requestAnimationFrame(updateDrag);});
    handle.addEventListener('pointerup',event=>{if(drag?.id===event.pointerId)finish(false);});
    handle.addEventListener('pointercancel',event=>{if(drag?.id===event.pointerId)finish(true);});
    handle.addEventListener('lostpointercapture',event=>{if(drag?.id===event.pointerId)finish(true);});
    handle.addEventListener('dblclick',()=>api.setSize(side,null));
    handle.addEventListener('keydown',event=>{
      if(drag&&event.key==='Escape'){event.preventDefault();finish(true);return;}
      const step=event.shiftKey?1:10,sign=side==='left'?1:-1;
      let next;
      if(event.key==='ArrowLeft')next=effective[side]-step*sign;
      else if(event.key==='ArrowRight')next=effective[side]+step*sign;
      else if(event.key==='Home')next=minimum[side];else if(event.key==='End')next=bound(side);
      else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();api.setSize(side,null);return;}else return;
      event.preventDefault();event.stopPropagation();api.setSize(side,clamp(next,minimum[side],bound(side)));
    });
  }
  function active(side,state=api.getState()){return state[side]&&!state.focus;}
  function focusDocument(){const canvas=document.querySelector('[data-studio-canvas]'),target=canvas?.getClientRects().length?canvas:workspace;if(!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true});}
  function bound(side){const other=side==='left'?'right':'left';return Math.max(minimum[side],Math.min(maximum[side],workspace.clientWidth-400-(active(other)?effective[other]:0)));}
  function styleSize(node,side,value){const key='--studio-'+side+'-size';if(node.style.getPropertyValue(key)===value)return;if(value)node.style.setProperty(key,value);else node.style.removeProperty(key);}
  function updateDrag(){dragFrame=0;if(!drag)return;const side=drag.side,delta=(drag.lastX-drag.x)*(side==='left'?1:-1);api.setSize(side,clamp(Math.round(drag.width+delta),minimum[side],bound(side)),false);}
  function layout(){
    frame=0;const state=api.getState();
    if(!desktop.matches){if(drag)finish(true);for(const side of ['left','right']){styleSize(workspace,side,'');styleSize(document.body,side,'');if(handles[side]){if(document.activeElement===handles[side])focusDocument();handles[side].hidden=true;}}return;}
    const width=workspace.clientWidth,defaults={left:232,right:304};
    // Responsive defaults have their own tokens: reading them never removes user widths.
    const style=getComputedStyle(workspace);
    for(const side of ['left','right']){
      const css=parseFloat(style.getPropertyValue('--studio-'+side+'-default'));if(css>0)defaults[side]=css;
      effective[side]=clamp(state[side+'Size']??defaults[side],minimum[side],maximum[side]);
    }
    const visible=['left','right'].filter(side=>active(side,state)),budget=Math.max(0,width-400),sum=visible.reduce((total,side)=>total+effective[side],0);
    if(sum>budget){const minimumSum=visible.reduce((total,side)=>total+minimum[side],0),room=Math.max(0,budget-minimumSum),extra=sum-minimumSum;for(const side of visible)effective[side]=Math.floor(minimum[side]+(extra>0?(effective[side]-minimum[side])*room/extra:0));}
    for(const side of ['left','right']){
      // Sizes and visibility are distinct variables, so a remembered size cannot reopen a collapsed dock.
      const value=state[side+'Size']!==null||sum>budget?effective[side]+'px':'';styleSize(workspace,side,value);styleSize(document.body,side,value);
    }
    const box=workspace.getBoundingClientRect(),rects={};
    for(const side of visible)if(panels[side])rects[side]=panels[side].getBoundingClientRect();
    for(const side of ['left','right']){
      const handle=handles[side],panel=panels[side];if(!handle)continue;const hidden=!active(side,state);if(hidden&&document.activeElement===handle)focusDocument();handle.hidden=hidden;
      if(handle.hidden)continue;const rect=rects[side];
      handle.style.left=(side==='left'?rect.right-box.left:rect.left-box.left)+'px';
      handle.setAttribute('aria-valuemin',String(minimum[side]));handle.setAttribute('aria-valuemax',String(bound(side)));handle.setAttribute('aria-valuenow',String(Math.round(rect.width)));handle.setAttribute('aria-valuetext',Math.round(rect.width)+' пикселей');
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(layout);}
  function finish(cancel){
    if(!drag)return;if(dragFrame){cancelAnimationFrame(dragFrame);dragFrame=0;if(!cancel)updateDrag();}const old=drag;drag=null;document.body.style.cursor=old.cursor;document.body.style.userSelect=old.selection;document.body.classList.remove('studio-resizing');handles[old.side].classList.remove('is-resizing');
    try{if(handles[old.side].hasPointerCapture(old.id))handles[old.side].releasePointerCapture(old.id);}catch(_){}
    if(cancel)api.setSizes({left:old.left,right:old.right});else api.setSize(old.side,api.getState()[old.side+'Size']);
  }
  global.addEventListener('studio:layout',layout);global.addEventListener('resize',schedule);global.addEventListener('blur',()=>finish(true));
  document.addEventListener('keydown',event=>{if(drag&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(true);}},true);
  layout();
})(window);
