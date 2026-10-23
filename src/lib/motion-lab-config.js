export const MOTION_SCENES = [
  { id: 'opening', number: '01', label: '入鏡', start: 0, end: 0.12 },
  { id: 'idea', number: '02', label: '出框', start: 0.12, end: 0.3 },
  { id: 'frame', number: '03', label: '定格', start: 0.3, end: 0.43 },
  { id: 'gallery', number: '04', label: '展廊', start: 0.43, end: 0.64 },
  { id: 'style', number: '05', label: '風格', start: 0.64, end: 0.77 },
  { id: 'process', number: '06', label: '共創', start: 0.77, end: 0.9 },
  { id: 'invite', number: '07', label: '邀請', start: 0.9, end: 1 },
];

export const FX_DEFINITIONS = [
  { id: 'fx01', label: '人物跨幕平移', group: '核心' },
  { id: 'fx02', label: '前後景視差', group: '核心' },
  { id: 'fx03', label: '文字遮罩揭露', group: '核心' },
  { id: 'fx04', label: '背景色連續變化', group: '核心' },
  { id: 'fx05', label: '照片回框與展開', group: '核心' },
  { id: 'fx06', label: '3D 照片展廊', group: '核心', requiresWebgl: true },
  { id: 'fx07', label: '焦點跟隨游標', group: '核心', pointerOnly: true },
  { id: 'fx08', label: '磁吸 CTA', group: '核心', pointerOnly: true },
  { id: 'fx09', label: '卡片傾斜與反光', group: '核心', pointerOnly: true },
  { id: 'fx10', label: '跟隨聚光燈', group: '實驗', pointerOnly: true },
  { id: 'fx11', label: '游標影像殘影', group: '實驗', pointerOnly: true },
  { id: 'fx12', label: '深度圖視差', group: '實驗', unavailable: '尚無作品深度圖素材' },
  { id: 'fx13', label: '液態照片轉場', group: '實驗' },
  { id: 'fx14', label: '顆粒環境效果', group: '實驗', requiresWebgl: true },
  { id: 'fx15', label: '滑動速度拉伸', group: '實驗' },
  { id: 'fx16', label: '局部 RGB 色散', group: '實驗' },
  { id: 'fx17', label: '淺景深', group: '實驗', requiresWebgl: true },
  { id: 'fx18', label: '光圈遮罩轉場', group: '輔助' },
  { id: 'fx19', label: '動態字體寬度', group: '實驗', unavailable: '目前載入的字體未確認支援寬度軸' },
  { id: 'fx20', label: '底片顆粒', group: '輔助' },
  { id: 'fx21', label: '3D 光圈環', group: '加碼', requiresWebgl: true },
  { id: 'fx22', label: '球體作品排列', group: '加碼', requiresWebgl: true, unavailable: '目前主展廊沿鏡頭路徑前進，球體模式未接入。' },
];

export const MOTION_MODES = {
  cinematic: {
    label: 'Cinematic',
    effects: ['fx01', 'fx03', 'fx04', 'fx05', 'fx06', 'fx13'],
  },
  max: {
    label: 'Max',
    effects: ['fx01', 'fx02', 'fx03', 'fx04', 'fx05', 'fx06', 'fx07', 'fx08', 'fx09', 'fx10', 'fx11', 'fx15', 'fx17', 'fx18', 'fx20', 'fx21'],
  },
  lite: {
    label: 'Lite',
    effects: ['fx01', 'fx03', 'fx04', 'fx05'],
  },
  static: {
    label: 'Static',
    effects: [],
  },
};

export const SCENE_COLORS = [
  '#ffffff',
  '#effaff',
  '#e5f3fa',
  '#f7fcff',
  '#eaf6fc',
  '#ffffff',
  '#effaff',
];

export const DEFAULT_MODE = 'cinematic';

export const isMotionMode = (value) => Object.hasOwn(MOTION_MODES, value);
