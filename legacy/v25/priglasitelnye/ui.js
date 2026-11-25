(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const desktop=matchMedia('(min-width:1000px) and (min-height:600px)');
  function revealProperties(){
    if(!desktop.matches)return;
    if(window.StudioWorkspace?.showPanel){StudioWorkspace.showPanel('right');return;}
    if(document.body.classList.contains('studio-focus-mode'))document.querySelector('[data-studio-toggle="focus"]')?.click();
    if(document.body.classList.contains('studio-right-hidden'))document.querySelector('[data-studio-toggle="right"]')?.click();
  }
  const open=id=>{const dialog=$(id);if(dialog&&!dialog.open){dialog.showModal();dialog.scrollTop=0;}};
  async function runPrint(method,blank=false){
    try{
      const studio=window.InvitationStudio;if(typeof studio?.[method]!=='function')throw new Error('Редактор ещё загружается. Дождитесь открытия проекта.');
      const scope=$('printScope');
      if(blank||$('guestCount')?.textContent.trim()==='0'){scope.value='blank';scope.dispatchEvent(new Event('change',{bubbles:true}));}
      await studio[method]();
    }catch(error){if(window.InvitationStudio?.notify)InvitationStudio.notify(error.message,true);else if($('saveStatus'))$('saveStatus').textContent=error.message;}
  }
  for(const id of ['openPrint','quickPrint'])$(id)?.addEventListener('click',()=>runPrint('openPrint'));
  for(const id of ['openPrintWizard','quickPrintWizard'])$(id)?.addEventListener('click',()=>runPrint('openPrintWizard'));
  $('openPrintSettings')?.addEventListener('click',()=>runPrint('openPrintSettings'));
  document.querySelectorAll('[data-section]').forEach(button=>button.addEventListener('click',()=>{const target=$(button.dataset.section);if(!target)return;target.tabIndex=-1;target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});target.focus({preventScroll:true});}));
  $('printBlanks')?.addEventListener('click',()=>runPrint('openPrint',true));
  $('showBlankPreview')?.addEventListener('click',()=>{const mode=$('previewMode');mode.value='blank';mode.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.preview-section')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});});
  $('openAdvanced')?.addEventListener('click',()=>open('advancedDialog'));
  $('advancedPreview')?.addEventListener('change',()=>{const mode=$('previewMode');mode.value=$('advancedPreview').value;mode.dispatchEvent(new Event('change',{bubbles:true}));});
  $('changeFormat')?.addEventListener('click',()=>{revealProperties();document.querySelector('[data-tab="template"]')?.click();$('cardFormat')?.focus();});
  window.StudioCanvas?.bind({surface:$('previewSurface'),content:$('paperStage'),handButton:$('invitationHandTool')});
  let fitFrame=0,lastAspect='';
  function physicalWidth(ratio){
    const presets={a6:[105,148],a5:[148,210],a4:[210,297],dl:[99,210],slim:[74,210]};
    const pair=presets[$('cardFormat')?.value]||[Number($('cardWidth')?.value)||105,Number($('cardHeight')?.value)||148];
    return ratio>=1?Math.max(...pair):Math.min(...pair);
  }
  function fitCanvas(){
    fitFrame=0;const stage=$('paperStage'),surface=$('previewSurface'),zoom=$('invitationZoom');if(!stage||!surface||!zoom)return;
    if(!desktop.matches){stage.style.removeProperty('width');return;}
    const aspect=stage.style.aspectRatio||getComputedStyle(stage).aspectRatio;
    const parts=aspect.split('/').map(Number),ratio=parts.length===2&&parts[1]>0?parts[0]/parts[1]:105/148;
    const style=getComputedStyle(surface),width=surface.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),height=surface.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
    if(width<=0||height<=0)return;
    // The viewport scale never changes canvas pixels, document millimetres or print output.
    let target=Math.floor(Math.min(width,height*ratio));
    if(zoom.value!=='fit'){
      const mm=physicalWidth(ratio);
      target=mm*96/25.4*Number(zoom.value)/100;
    }
    const value=Math.max(40,target).toFixed(2)+'px';if(stage.style.width!==value)stage.style.width=value;
    lastAspect=aspect;
  }
  function scheduleFit(){if(!fitFrame)fitFrame=requestAnimationFrame(fitCanvas);}
  $('invitationZoom')?.addEventListener('change',scheduleFit);
  $('fitInvitation')?.addEventListener('click',()=>{$('invitationZoom').value='fit';scheduleFit();$('previewSurface').scrollTo({left:0,top:0,behavior:'instant'});});
  window.addEventListener('resize',scheduleFit);
  window.addEventListener('studio:layout',scheduleFit);
  document.addEventListener('invitation:ready',scheduleFit);
  if(window.ResizeObserver&&$('previewSurface'))new ResizeObserver(scheduleFit).observe($('previewSurface'));
  if(window.MutationObserver&&$('paperStage'))new MutationObserver(()=>{if($('paperStage').style.aspectRatio!==lastAspect)scheduleFit();}).observe($('paperStage'),{attributes:true,attributeFilter:['style']});
  scheduleFit();
  $('projectMenu')?.addEventListener('click',event=>{if(event.target.closest('button'))$('projectMenu').open=false;});
  $('renameProject')?.addEventListener('click',()=>{$('projectMenu').open=false;$('projectTitle')?.focus();$('projectTitle')?.select();});
  document.addEventListener('click',async event=>{
    const link=event.target.closest('a[data-project-navigation]');if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    try{
      if(window.InvitationCloudUI?.beforeNavigate){if(!await InvitationCloudUI.beforeNavigate())return;}
      else if(window.InvitationStudio&&await InvitationStudio.saveLocal()===false)throw new Error('Браузер не сохранил правки. Скачайте проект перед переходом.');
      location.assign(link.href);
    }catch(error){window.InvitationStudio?.notify(error.message,true);}
  });
  document.addEventListener('click',event=>{const menu=$('projectMenu');if(menu?.open&&!menu.contains(event.target))menu.open=false;});
})();
