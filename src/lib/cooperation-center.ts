import { progressFromResponse, type CooperationProgress } from './inquiry-workflow';
import { normalizeFavorites } from './portfolio-favorites.js';
import type { Favorite } from './portfolio-favorites-client';
export const checklistLabels={wardrobe:'確認服裝與造型',route:'確認集合地點與交通',props:'準備道具與攜帶物品',weather:'確認天氣與雨備',rest:'休息與補充水分',publication:'確認交件與公開約定'};
export type CenterProgress=CooperationProgress & {favorites:Favorite[];center:{version:number;cancelledAt:string|null;changeRequest:string|null;changeRequestedAt:string|null;checklist:Record<string,boolean>;hold:{slotId:string;startsAt:string;endsAt:string;expiresAt:string}|null;gallery:{title:string;status:'proofing'|'delivered';selectedCount:number|null}|null;notifications:{email:boolean;emailPending:boolean;line:boolean}};sessionToken?:string;galleryUrl?:string;lineCode?:string;notificationServices?:{email:boolean;line:boolean;lineUrl:string|null}};
export function centerFromResponse(value:unknown):CenterProgress|null {
 const progress=progressFromResponse(value);const raw=value as CenterProgress;
 if(!progress || !raw.center || !Number.isInteger(raw.center.version) || raw.center.version<0 || !raw.center.checklist || typeof raw.center.checklist!=='object' || !raw.center.notifications) return null;
 if(raw.sessionToken!==undefined&&!/^[a-f0-9]{64}$/.test(raw.sessionToken))return null;
 if(raw.galleryUrl!==undefined&&!/^\/client\/#token=[a-f0-9]{64}$/.test(raw.galleryUrl))return null;
 if(raw.center.hold && (['startsAt','endsAt','expiresAt'].some(k=>!Number.isFinite(Date.parse(raw.center.hold![k as 'startsAt']))) || typeof raw.center.hold.slotId!=='string'))return null;
 return {...progress,center:raw.center,favorites:normalizeFavorites(raw.favorites??[]),sessionToken:raw.sessionToken,galleryUrl:raw.galleryUrl,lineCode:raw.lineCode,notificationServices:raw.notificationServices};
}
