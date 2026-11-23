// Native modal focus, Escape and validation for campaign actions.
(function(){
  'use strict';
  function ask({title,message='',label='',value='',confirmLabel='Продолжить',danger=false,notice=false}){
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='room-dialog';
      const heading=document.createElement('h2');heading.id='room-dialog-title';heading.textContent=title;dialog.setAttribute('aria-labelledby',heading.id);
      const description=document.createElement('p');description.textContent=message;
      const form=document.createElement('form');form.method='dialog';form.append(heading,description);
      let input;if(label){const field=document.createElement('label');field.textContent=label;input=document.createElement('input');input.name='name';input.value=value;input.required=true;input.maxLength=120;input.autocomplete='off';field.append(input);form.append(field);}
      const actions=document.createElement('footer'),cancel=document.createElement('button'),submit=document.createElement('button');
      cancel.type='button';cancel.textContent='Отмена';cancel.onclick=()=>dialog.close();
      submit.type='submit';submit.textContent=confirmLabel;submit.className=danger?'room-action-danger':'room-action-primary';
      if(!notice)actions.append(cancel);actions.append(submit);form.append(actions);dialog.append(form);document.body.append(dialog);
      form.addEventListener('submit',event=>{if(input&&!input.value.trim()){event.preventDefault();input.setCustomValidity('Введите название сохранения');input.reportValidity();}});
      input?.addEventListener('input',()=>input.setCustomValidity(''));
      dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='ok';const result=input?.value.trim()||true;dialog.remove();resolve(accepted?result:null);},{once:true});
      submit.value='ok';dialog.showModal();(input||(!notice&&danger?cancel:submit)).focus();input?.select();
    });
  }
  window.RoomDialogs={
    prompt:options=>ask(options),
    confirm:options=>ask({...options,danger:true}),
    notice:(message,title='Кампания')=>ask({title,message,confirmLabel:'Понятно',notice:true})
  };
})();
