import { centerFromResponse,checklistLabels,type CenterProgress } from './cooperation-center';
import { formatShootTime } from './inquiry-workflow';
import { favoriteHref } from './portfolio-favorites.js';
import { shootBrief } from './shoot-brief.js';
export function initializeCenter(getData:()=>CenterProgress|null,getToken:()=>string,onChange:(value:CenterProgress)=>void,onRefresh:()=>Promise<void>) {
 const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 let busy=false;let initializedReference='';let loadedSlots=false;
 const note=(value:string)=>{ $('center-status').textContent=value; };
 const form=$<HTMLFormElement>('center-change-form');
 function lock(value:boolean) {
 const data=getData();const cancelled=Boolean(data?.center.cancelledAt);
 document.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement|HTMLTextAreaElement>('.center-card button,.center-card input,.center-card textarea,.center-card select').forEach(el=>el.disabled=value || cancelled && !['center-brief','center-notifications-stop'].includes(el.id));
 $<HTMLSelectElement>('center-slot').disabled=value||cancelled||!loadedSlots;
 $<HTMLButtonElement>('center-hold-save').disabled=value||cancelled||Boolean(data?.confirmation)||!loadedSlots;
 }
 function render(data:CenterProgress) {
 const c=data.center;
 $('center-summary').textContent=c.cancelledAt?'本次已取消，檔期已釋放。':data.status==='closed'?'本次合作意向已結束。':data.confirmation?'拍攝安排已確認，可以開始行前準備。':c.hold?'已暫留時段，請留意到期時間並等待確認。':'已收到申請，可選擇檔期、準備參考與等待聯繫。';
 $('center-hold-form').hidden=Boolean(data.confirmation)||Boolean(c.cancelledAt)||data.status==='closed';
 $('center-hold').textContent=c.hold?`暫留時段：${formatShootTime(c.hold.startsAt)} — ${formatShootTime(c.hold.endsAt)}\n到期：${formatShootTime(c.hold.expiresAt)}（台北時間）；到期自動釋放。`:data.confirmation?'正式安排以本次確認單為準。':c.cancelledAt?'本次已取消。':'目前沒有暫留時段。';
 $('center-hold-release').hidden=!c.hold;
 if(initializedReference!==data.reference) {
 $<HTMLInputElement>('center-date').value=data.summary.preferredDate;
 $<HTMLTextAreaElement>('center-description').value=data.summary.description;initializedReference=data.reference;
 }
 $('center-change-request').hidden=!c.changeRequest;$('center-change-request').textContent=c.changeRequest?`等待攝影師處理的調整：\n${c.changeRequest}`:'';
 document.querySelectorAll<HTMLInputElement>('[data-center-check]').forEach(el=>el.checked=c.checklist[el.dataset.centerCheck!]);
 $('center-check-count').textContent=`已準備 ${Object.values(c.checklist).filter(Boolean).length} / ${Object.keys(checklistLabels).length} 項`;
 $('center-gallery').hidden=!c.gallery || Boolean(c.cancelledAt);
 $('center-gallery-info').textContent=c.gallery?`${c.gallery.title} · ${c.gallery.status==='delivered'?'成品已開放':'可以開始選片'}${c.gallery.selectedCount!==null?` · 已確認 ${c.gallery.selectedCount} 張`:''}`:'相簿尚未開放，開放後入口會顯示在這裡。';
 $<HTMLButtonElement>('center-gallery').textContent=c.gallery?.status==='delivered'?'查看與下載成品':'進入私人選片相簿';
 const services=data.notificationServices;
 $('center-email-form').hidden=!services?.email || c.notifications.email;
 $('center-email-verify-form').hidden=!services?.email || !c.notifications.emailPending;
 $('center-line-wrap').hidden=!services?.line || c.notifications.line;
 if(services?.lineUrl && /^https:\/\/line\.me\//.test(services.lineUrl)) $<HTMLAnchorElement>('center-line-link').href=services.lineUrl;
 $('center-notification-info').textContent=[c.notifications.email?'Email 通知已啟用。':services?.email?'驗證 Email 後可接收本次狀態更新。':'Email 通知尚未啟用；請留意原聯絡方式。',c.notifications.line?'LINE 通知已啟用。':services?.line?'可綁定 LINE 接收通知。':''].filter(Boolean).join(' ');
 $('center-notifications-stop').hidden=!c.notifications.email && !c.notifications.emailPending && !c.notifications.line;
 const list=$('center-favorites');list.replaceChildren();
 for(const item of data.favorites) {const li=document.createElement('li'),a=document.createElement('a'),img=document.createElement('img');a.href=favoriteHref(item);a.target='_blank';a.rel='noopener noreferrer';img.src=item.image;img.alt=`${item.title} 第 ${item.number} 張`;img.loading='lazy';a.append(img,document.createTextNode(`${item.title} #${item.number}`));li.append(a);list.append(li);}
 lock(busy);
 }
 async function mutate(action:string,input:Record<string,unknown>={}) {
 const data=getData();if(busy||!data||!getToken())return;
 busy=true;lock(true);note('正在儲存…');
 try {
 const response=await fetch('/api/cooperation/center',{method:'POST',headers:{'Content-Type':'application/json','X-Phox-Request':'1',Authorization:`Bearer ${getToken()}`},body:JSON.stringify({action,version:data.center.version,input}),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});
 if(!response.ok) {const error=await response.json().catch(()=>null);throw new Error(response.status===409?'資料或檔期已更新，請按上方「更新進度」後確認再試。':response.status===401||response.status===403?'操作憑證已失效，請更新進度後再試。':error?.code==='notifications_unavailable'?'通知服務尚未啟用，請使用原聯絡方式。':'暫時無法完成操作，內容仍保留，請稍後再試。');}
 const result=centerFromResponse(await response.json());if(!result)throw new Error('資料格式異常，請更新進度後確認。');
 result.notificationServices??=data.notificationServices;onChange(result);
 if(action==='gallery' && result.galleryUrl) {window.location.assign(result.galleryUrl);return;}
 if(action==='lineLink' && result.lineCode) { $('center-line-code').textContent=`請複製並傳送下列文字給官方 LINE（20 分鐘內有效）：\n${result.lineCode}`; }
 note(action==='verifyEmail'&&!result.center.notifications.email?'驗證碼不正確、已到期或已超過 5 次，請稍後重新申請。':action==='email'?'驗證信已排入寄送，請稍後查看收件匣並輸入驗證碼。':action==='cancel'?'本次已取消。':action==='change'&&result.center.changeRequest?'調整請求已送出，原安排維持有效。':'已儲存。');
 } catch(error) {note(error instanceof Error?error.message:'暫時無法完成，請稍後再試。');}
 finally {busy=false;const data=getData();if(data)render(data);else lock(false);}
 }
 async function slots() {
 if(busy)return;busy=true;lock(true);note('正在讀取開放時段…');
 try {
 const date=new Date();const from=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);const to=new Date(Date.parse(from+'T00:00:00Z')+59*86400000).toISOString().slice(0,10);
 const response=await fetch(`/api/availability?from=${from}&to=${to}`,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('檔期暫時無法讀取，請稍後再試。');
 const result=await response.json();if(!Array.isArray(result.slots))throw new Error('檔期資料異常。');
 const select=$<HTMLSelectElement>('center-slot');select.replaceChildren(new Option('請選擇時段',''));
 for(const slot of result.slots)if(slot.status==='open'&&Date.parse(slot.startsAt)>Date.now()&&/^[a-f0-9-]{36}$/i.test(slot.id)){select.add(new Option(`${formatShootTime(slot.startsAt)} — ${formatShootTime(slot.endsAt)}`,slot.id));}
 loadedSlots=select.options.length>1;note(loadedSlots?'選擇時段後，可暫留 24 小時。':'目前沒有已公布的開放時段，可先提出偏好日期。');
 }catch(e){note(e instanceof Error?e.message:'讀取失敗。');}finally{busy=false;lock(false);}
 }
 $('center-slot-refresh').addEventListener('click',()=>void slots());
 $('center-hold-form').addEventListener('submit',e=>{e.preventDefault();const slotId=$<HTMLSelectElement>('center-slot').value;if(slotId)void mutate('hold',{slotId});});
 $('center-hold-release').addEventListener('click',()=>void mutate('releaseHold'));
 form.addEventListener('submit',e=>{e.preventDefault();if(form.reportValidity())void mutate('change',{preferredDate:$<HTMLInputElement>('center-date').value,description:$<HTMLTextAreaElement>('center-description').value});});
 $('center-cancel').addEventListener('click',()=>{if(!$<HTMLInputElement>('center-cancel-consent').checked){note('請先勾選確認取消。');return;}if(window.confirm('確認取消本次合作並釋放檔期？'))void mutate('cancel',{confirm:true});});
 document.querySelectorAll<HTMLInputElement>('[data-center-check]').forEach(el=>el.addEventListener('change',()=>void mutate('checklist',{checklist:Object.fromEntries(Array.from(document.querySelectorAll<HTMLInputElement>('[data-center-check]')).map(input=>[input.dataset.centerCheck!,input.checked]))})));
 $('center-email-form').addEventListener('submit',e=>{e.preventDefault();if($<HTMLFormElement>('center-email-form').reportValidity())void mutate('email',{email:$<HTMLInputElement>('center-email').value});});
 $('center-email-verify-form').addEventListener('submit',e=>{e.preventDefault();if($<HTMLFormElement>('center-email-verify-form').reportValidity())void mutate('verifyEmail',{code:$<HTMLInputElement>('center-email-code').value});});
 $('center-line').addEventListener('click',()=>void mutate('lineLink'));
 $('center-notifications-stop').addEventListener('click',()=>void mutate('stopNotifications'));
 $('center-gallery').addEventListener('click',()=>void mutate('gallery'));
 $('center-brief').addEventListener('click',()=>{const data=getData();if(!data)return;const url=URL.createObjectURL(new Blob([shootBrief(data)],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${data.reference}-brief.txt`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);});
 return {render,isBusy:()=>busy};
}
