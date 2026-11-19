(function(){
  function refresh(){
    for(const id of ['marks-fill','marks-stroke']){
      const input=document.getElementById(id),label=input?.closest('label')?.querySelector('span');
      if(!input||!label)continue;
      let output=label.querySelector('output');
      if(!output){output=document.createElement('output');output.htmlFor=id;label.append(output);}
      output.value=input.value+'%';input.title=input.value+'%';
    }
  }
  function stopCheckbox(id){
    const el=document.getElementById(id);
    if(el?.checked){el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  function activate(mode){
    if(mode!=='areas')stopCheckbox('marks-enabled');
    if(mode!=='fog')stopCheckbox('fog-draw');
    const wall=document.getElementById('edit-environment');
    if(mode!=='walls'&&wall?.classList.contains('is-on'))wall.click();
    window.Board3D?.requestSync?.();
  }
  document.addEventListener('input',event=>{
    if(['marks-fill','marks-stroke'].includes(event.target.id))refresh();
  });
  document.addEventListener('change',event=>{
    if(event.target.id==='marks-enabled'&&event.target.checked)activate('areas');
    if(event.target.id==='fog-draw'&&event.target.checked)activate('fog');
  });
  document.addEventListener('click',event=>{
    if(event.target.closest('#edit-environment, #add-wall, #remove-wall')&&document.getElementById('edit-environment')?.classList.contains('is-on'))activate('walls');
    if(event.target.closest('#marks-toolbar [data-tool], #marks-pin-tool')){
      const input=document.getElementById('marks-enabled');
      if(input&&!input.checked){input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}
      activate('areas');
    }
  });
  window.MapToolsUI={refresh};
})();
