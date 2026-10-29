export const asset = (file: string) => '/assets/design-preview/' + file.replace(/\.png$/, '.webp');
export const photos = ["a1a68.png","9945e.png","ec55a.png","1764e.png","9b79b.png","429c8.png","5d4bc.png","f0549.png","35de8.png","ba37d.png","3948b.png","02984.png","63874.png","d9404.png","f95bd.png","877b7.png","a3b67.png","32ba5.png","32a1e.png","26761.png"];
const covers = ['5ee0e.png','f00af.png','6a552.png','c9f96.png','69d3d.png','4e24a.png','2d051.png','60069.png',...photos.slice(6,18)];
const titles = ['晴空之下','放課後','晴日同行','海風來信','靜白日常','海岸片刻','光影之間','綠蔭午後','僵尸偶像棚拍'];
export const collections = covers.map((image,i)=>({id:i,title:titles[i] || '作品 ' + String(i+1).padStart(2,'0') + '（示意）',image,photos:i>=8?photos:[image]}));
export const steps = [
['01 / INQUIRY','提出想法','選擇想拍的主題與希望日期，留下聯絡方式。','送出意向，不等於預約成立。'],
['02 / CONFIRM','確認合作','一起確認主題、日期、費用與照片公開範圍。','一般互惠不收攝影費；棚租、妝髮等另行討論。'],
['03 / SHOOT','一起拍攝','一般拍攝約 2–3 小時，準備 1–2 套服裝。','第一次拍攝也歡迎；主題企劃另行討論。'],
['04 / DELIVERY','照片交付','一般約 40–80 張照片，約 2–3 週交付。','實際張數、修圖及交付時間於合作前確認。']];
export const topics = ['JK 制服','棒球少女','麥當勞','純愛','百合','奇幻夢核'];
