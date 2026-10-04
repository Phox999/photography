import { HttpError } from './auth.js';
import { publicProgress } from './inquiry-workflow.js';
import { normalizeFavorite } from '../src/lib/portfolio-favorites.js';
export const CHECKLIST = { wardrobe: '確認服裝與造型', route: '確認集合地點與交通', props: '準備道具與攜帶物品', weather: '確認天氣與雨備', rest: '休息與補充水分', publication: '確認交件與公開約定' };
const fail = () => { throw new HttpError(400, '請檢查欄位內容後再試。', 'invalid_input'); };
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export function centerInput(body) {
 const { action, version, input = {} } = body;
 if (Object.keys(body).some(k=>!['action','version','input'].includes(k)) || !Number.isInteger(version) || version<0 || version>2147483646 || !input || typeof input!=='object' || Array.isArray(input)) fail();
 const allowed={read:[],hold:['slotId'],releaseHold:[],change:['preferredDate','description'],cancel:['confirm'],checklist:['checklist'],email:['email'],verifyEmail:['code'],lineLink:[],stopNotifications:[],gallery:[]};
 if (!Object.hasOwn(allowed,action) || Object.keys(input).some(k=>!allowed[action].includes(k))) fail();
 if (action==='hold' && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.slotId||'')) fail();
 if (action==='cancel' && input.confirm!==true) fail();
 if (action==='change') for(const [k,max] of [['preferredDate',200],['description',2000]]) {
 if(typeof input[k]!=='string' || input[k].length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input[k]) || k==='description' && !input[k].trim()) fail(); input[k]=input[k].trim();
 }
 if (action==='email') { if(typeof input.email!=='string' || input.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || /[\r\n]/.test(input.email)) fail(); input.email=input.email.trim(); }
 if(action==='verifyEmail' && !/^\d{6}$/.test(input.code||'')) fail();
 if(action==='checklist' && (!input.checklist || typeof input.checklist!=='object' || Array.isArray(input.checklist) || Object.entries(input.checklist).some(([k,v])=>!Object.hasOwn(CHECKLIST,k)||typeof v!=='boolean'))) fail();
 return {action,version,input};
}
// Explicit projection prevents changes to RPC output leaking private credentials.
export function centerResult(data) {
 const progress=publicProgress(data); const c=data.center;
 if(!c || !Number.isInteger(c.version) || c.version<0 || !c.checklist || typeof c.checklist!=='object') throw new HttpError(503,'資料暫時無法讀取。','upstream_error');
 const timestamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
 const hold=c.hold && ['slotId','startsAt','endsAt','expiresAt'].every(k=>typeof c.hold[k]==='string') ? Object.fromEntries(['slotId','startsAt','endsAt','expiresAt'].map(k=>[k,c.hold[k]])):null;
 const gallery=c.gallery && ['proofing','delivered'].includes(c.gallery.status) && typeof c.gallery.title==='string'?{title:c.gallery.title.slice(0,160),status:c.gallery.status,selectedCount:Number.isInteger(c.gallery.selectedCount)?c.gallery.selectedCount:null}:null;
 return {...progress,center:{version:c.version,cancelledAt:timestamp(c.cancelledAt),changeRequest:typeof c.changeRequest==='string'?c.changeRequest.slice(0,2250):null,changeRequestedAt:timestamp(c.changeRequestedAt),checklist:Object.fromEntries(Object.keys(CHECKLIST).map(k=>[k,c.checklist[k]===true])),hold,gallery,notifications:{email:c.notifications?.email===true,emailPending:c.notifications?.emailPending===true,line:c.notifications?.line===true}},favorites:Array.isArray(data.favorites)?data.favorites.slice(0,12).map(normalizeFavorite).filter(Boolean):[]};
}
