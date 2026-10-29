const dialog=document.querySelector('.lightbox');
if(dialog){
 const thumbs=[...dialog.querySelectorAll('[data-thumb]')];let active=0;let opener;
 const show=(index)=>{active=(index+thumbs.length)%thumbs.length;const image=dialog.querySelector('[data-full-photo]');image.src=thumbs[active].querySelector('img').src;image.alt='作品照片 '+(active+1);dialog.querySelector('[data-photo-count]').textContent=String(active+1).padStart(2,'0')+' / '+String(thumbs.length).padStart(2,'0');thumbs.forEach((t,i)=>t.setAttribute('aria-current',String(i===active)));thumbs[active].scrollIntoView({block:'nearest',inline:'center'});};
 document.querySelectorAll('[data-photo]').forEach(button=>button.addEventListener('click',()=>{opener=button;dialog.showModal();show(Number(button.dataset.photo));}));
 dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
 dialog.querySelector('[data-prev]').addEventListener('click',()=>show(active-1));
 dialog.querySelector('[data-next]').addEventListener('click',()=>show(active+1));
 thumbs.forEach((t,i)=>t.addEventListener('click',()=>show(i)));
 dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();show(active-1);}if(e.key==='ArrowRight'){e.preventDefault();show(active+1);}});
 dialog.addEventListener('close',()=>opener?.focus());
 let startX=0;dialog.querySelector('[data-full-photo]').addEventListener('touchstart',e=>{startX=e.changedTouches[0].clientX;},{passive:true});
 dialog.querySelector('[data-full-photo]').addEventListener('touchend',e=>{const delta=e.changedTouches[0].clientX-startX;if(Math.abs(delta)>50)show(active+(delta<0?1:-1));},{passive:true});
}
document.querySelectorAll('[data-preview-form]').forEach(form=>{
 const selected=new Set();const today=new Date();let month=new Date(today.getFullYear(),today.getMonth(),1);const calendar=form.querySelector('[data-calendar]');
 const format=d=>d.getFullYear()+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0');
 const render=()=>{form.querySelector('[data-month-title]').textContent=month.getFullYear()+' / '+String(month.getMonth()+1).padStart(2,'0');calendar.replaceChildren();const offset=(month.getDay()+6)%7;for(let i=0;i<offset;i++)calendar.append(document.createElement('span'));const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();for(let day=1;day<=count;day++){const date=new Date(month.getFullYear(),month.getMonth(),day);const key=format(date);const button=document.createElement('button');button.type='button';button.textContent=day;button.setAttribute('aria-label',key);button.setAttribute('aria-pressed',String(selected.has(key)));button.disabled=date<new Date(today.getFullYear(),today.getMonth(),today.getDate());button.addEventListener('click',()=>{if(selected.has(key))selected.delete(key);else selected.add(key);render();});calendar.append(button);}form.querySelector('[data-dates]').textContent=selected.size?'偏好日期：'+[...selected].sort().join('、'):'選擇偏好日期（選填，可複選）';};
 form.querySelectorAll('[data-month]').forEach(b=>b.addEventListener('click',()=>{month=new Date(month.getFullYear(),month.getMonth()+Number(b.dataset.month),1);render();}));render();
 const files=form.querySelector('[data-files]');files.addEventListener('change',()=>{const valid=files.files.length<=3&&[...files.files].every(f=>['image/jpeg','image/png','image/webp'].includes(f.type)&&f.size<=4*1024*1024);files.setCustomValidity(valid?'':'請選擇最多 3 張 JPG、PNG 或 WebP，每張小於 4 MB。');form.querySelector('[data-file-status]').textContent=valid?([...files.files].map(f=>f.name).join('、')||'尚未選擇照片'):files.validationMessage;});
 form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;const values=new FormData(form);const lines=['姓名：'+values.get('name'),'合作類型：'+values.get('type'),'主題：'+(values.getAll('topic').join('、')||'一起討論'),'希望日期：'+([...selected].sort().join('、')||'一起討論'),'聯絡方式：'+values.get('contactMethod')+' / '+values.get('contact'),'想法：'+(values.get('idea')||'稍後討論'),'此為本機確認摘要，資料尚未送出。'];const summary=form.querySelector('[data-summary]');form.querySelector('[data-summary-text]').textContent=lines.join('\n');summary.hidden=false;summary.scrollIntoView({behavior:'smooth',block:'center'});});
 form.querySelector('[data-edit]').addEventListener('click',()=>{form.querySelector('[data-summary]').hidden=true;form.querySelector('[name=name]').focus();});
});
