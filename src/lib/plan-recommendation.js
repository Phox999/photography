export function recommendPlan({goal,preparation,time}) {
 if(!['portrait','story'].includes(goal)||!['exploring','ready'].includes(preparation)||!['short','flexible'].includes(time))return null;
 const themed=goal==='story'||preparation==='ready';
 return themed?{key:'theme',title:'主題企劃',value:'主題合作',reason:goal==='story'?'你希望完成有故事的主題，需要一起規劃服裝、場景與敘事。':'你已準備主題或造型，可以以企劃方式討論具體畫面。',timeNote:time==='short'?'時間較短，建議先聚焦一個場景與一套造型；實際安排再共同確認。':'拍攝時間、場景與交付數量依企劃確認。'}:{key:'general',title:'一般互惠',value:'標準方案(3hr)',reason:'你想先體驗合作、完成一組人像，可以從一般互惠開始。',timeNote:time==='short'?'目前一般互惠約 2–3 小時；若可用時間更短，請先在申請中說明。':'一般互惠約 2–3 小時，1–2 套服裝需事前確認。'};
}
