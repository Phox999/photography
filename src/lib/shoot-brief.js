// Generated from submitted facts and the current published confirmation only.
const clean=value=>typeof value==='string'?value.replace(/\r/g,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim():'';
const field=(name,value)=>`${name}：${clean(value)||'待雙方確認'}`;
export function shootBrief(progress) {
 if(!progress?.summary || typeof progress.reference!=='string') throw new Error('invalid_progress');
 const s=progress.summary,c=progress.confirmation;
 const lines=['拍攝 Brief',`收件編號：${clean(progress.reference)}`,`整理時間：${new Date().toISOString()}`,'',field('姓名／暱稱',s.name),field('合作方式',s.collaborationType),field('希望日期',s.preferredDate),'','拍攝方向',clean(s.description)||'待雙方確認','','參考連結',...(s.referenceLinks||[]).map(clean),'','作品 Moodboard',...(progress.favorites||[]).map(f=>`${clean(f.title)} #${f.number} — ${new URL(f.image,'https://phox999.com').href}`),'','拍攝安排'];
 if(c) lines.push(field('開始',c.startsAt),field('結束',c.endsAt),field('集合',c.location),field('地圖',c.mapUrl),field('服裝',c.wardrobe),field('攜帶物品',c.bring),field('雨備',c.rainPlan),field('交件',c.deliveryNote),field('公開方式',c.publicationNote),`確認單版本：${c.version}`);
 else lines.push('尚未發布拍攝確認單；申請與暫留檔期不等於預約成立。');
 if(progress.center?.hold)lines.push(field('暫留到期',progress.center.hold.expiresAt));
 if(progress.center?.changeRequest)lines.push('','待處理的調整請求',clean(progress.center.changeRequest));
 if(progress.center?.cancelledAt)lines.push('','本次已取消。');
 lines.push('','未填寫的交付、費用或公開約定均需另行確認。此摘要不新增任何合作承諾。');
 return lines.join('\n')+'\n';
}
