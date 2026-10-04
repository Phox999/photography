import {requestAdmin,adminErrorMessage} from './admin-client';
import {centerFromResponse,type CenterProgress} from './cooperation-center';
import {formatShootTime} from './inquiry-workflow';
import {shootBrief} from './shoot-brief.js';
export function initializeAdminCenter() {
 const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 let id='',generation=0,data:CenterProgress|null=null,busy=false;
 function disable(value:boolean){$('admin-center').querySelectorAll<HTMLButtonElement|HTMLSelectElement>('button,select').forEach(el=>el.disabled=value);}
 async function load(nextId=id) {
 id=nextId;const current=++generation;data=null;disable(true);$('admin-center-preview').textContent='';$('admin-center-change').hidden=true;$('admin-center-resolve').hidden=true;$('admin-center-summary').textContent='';$('admin-center-notifications').textContent='';
 if(!id)return;$('admin-center-status').textContent='正在讀取預約後續…';
 try {
 const [result,galleries]=await Promise.all([requestAdmin<{item:unknown;galleryId:string|null;notificationCounts:{pending:number;failed:number;sent:number};notificationServices:string[]}>(`/api/admin/inquiries/${encodeURIComponent(id)}/center`),requestAdmin<{galleries:{id:string;title:string;status:string}[]}>('/api/admin/galleries')]);
 if(current!==generation)return;
 if(!result.item){$('admin-center-status').textContent='這份舊申請沒有私人回條，請沿用原聯絡方式。';return;}
 const parsed=centerFromResponse(result.item);if(!parsed)throw new Error('資料格式異常。');data=parsed;
 const c=data.center;$('admin-center-summary').textContent=c.cancelledAt?'對方已取消本次合作，請勿重新發布確認單。':`${c.hold?`暫留時段 ${formatShootTime(c.hold.startsAt)}，到期 ${formatShootTime(c.hold.expiresAt)}。`:'目前無客戶暫留時段。'} 準備清單 ${Object.values(c.checklist).filter(Boolean).length} / 6 項。`;
 $('admin-center-change').hidden=!c.changeRequest;$('admin-center-change').textContent=c.changeRequest||'';$('admin-center-resolve').hidden=!c.changeRequest;
 $('admin-center-preview').textContent=shootBrief(data);
 const select=$<HTMLSelectElement>('admin-center-gallery');select.replaceChildren(new Option('不連結相簿',''));
 for(const g of galleries.galleries)select.add(new Option(`${g.title} · ${{draft:'草稿',proofing:'選片中',delivered:'已交件'}[g.status]||g.status}`,g.id));
 // Older-than-100 gallery can still be kept; show its ID rather than silently unlinking.
 if(result.galleryId && !Array.from(select.options).some(o=>o.value===result.galleryId))select.add(new Option(`既有相簿 ${result.galleryId}`,result.galleryId));
 select.value=result.galleryId||'';
 const counts=result.notificationCounts;$('admin-center-notifications').textContent=`已設定通知通道：${result.notificationServices.join('、')||'尚未設定'}；客戶啟用：${[c.notifications.email?'Email':'',c.notifications.line?'LINE':''].filter(Boolean).join('、')||'未啟用'}。${counts?`待寄 ${counts.pending}、已寄 ${counts.sent}、失敗 ${counts.failed}。`:''}`;
 $('admin-center-status').textContent='已更新。';disable(false);if(c.cancelledAt){$<HTMLButtonElement>('admin-center-gallery-save').disabled=true;select.disabled=true;}
 }catch(error){if(current===generation){$('admin-center-status').textContent=adminErrorMessage(error);$<HTMLButtonElement>('admin-center-reload').disabled=false;}}
 }
 async function save(action:string) {
 if(!data||busy)return;busy=true;disable(true);const current=generation,original=id;
 try{await requestAdmin(`/api/admin/inquiries/${encodeURIComponent(id)}/center`,{method:'PATCH',body:{action,version:data.center.version,...(action==='gallery'?{galleryId:$<HTMLSelectElement>('admin-center-gallery').value||null}:{})}});if(current===generation)await load(original);}catch(e){if(current===generation){$('admin-center-status').textContent=adminErrorMessage(e);disable(false);}}finally{busy=false;}
 }
 $('admin-center-gallery-save').addEventListener('click',()=>void save('gallery'));
 $('admin-center-resolve').addEventListener('click',()=>{if(window.confirm('請先完成聯繫、必要的改期與確認單更新，再將請求標為已處理。確定已完成？'))void save('resolveChange');});
 $('admin-center-reload').addEventListener('click',()=>void load());
 $('admin-center-brief').addEventListener('click',()=>{if(!data)return;const url=URL.createObjectURL(new Blob([shootBrief(data)],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${data.reference}-brief.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 return {load,reset:()=>{id='';generation++;data=null;disable(true);}};
}
