/** Independent concept images may be supplied later; never crop a reference board. */
export interface DirectionImage {
  src: string;
  alt: string;
  position: string;
  width: number;
  height: number;
}
export const visualDirection: { title: string; description: string; nature: string; images: DirectionImage[] } = {
  title: '日常裡的另一種可能',
  description: '從光線、角色與場景，尋找下一次創作的方向。',
  nature: 'AI 概念參考・尚未實拍',
  images: [],
};
