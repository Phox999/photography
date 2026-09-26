import { siteConfig } from './site';

export type SupportLink = { label: string; href: string };
export type SupportTopic = {
  id: string;
  label: string;
  keywords: string[];
  answer: string;
  links: SupportLink[];
  faq?: boolean;
};

export const supportContactLinks: SupportLink[] = [
  { label: '填寫合作意向', href: siteConfig.inquiryUrl },
  { label: 'Instagram', href: siteConfig.instagramUrl },
  { label: 'Email', href: siteConfig.mailtoUrl },
];

// FAQ-backed topics use the same published answers as the FAQ section.
export const supportTopics: SupportTopic[] = [
  {
    id: 'price', label: '合作費用', faq: true, answer: '',
    keywords: ['費用', '價錢', '價格', '多少錢', '收費', '付費', '報價', '免費', '互惠費', 'price', 'cost', 'fee'],
    links: [{ label: '查看合作方式', href: '/cooperation/' }],
  },
  {
    id: 'pose', label: '第一次拍攝', faq: true, answer: '',
    keywords: ['姿勢', '擺拍', '表情', '引導', '第一次', '新手', '沒經驗', '沒有經驗', '不會拍', '不會擺', '緊張', 'pose', 'posing'],
    links: [{ label: '認識小蔡', href: '/about/' }],
  },
  {
    id: 'delivery', label: '交件時間', faq: true, answer: '',
    keywords: ['交件', '交付', '交期', '拿到照片', '收到照片', '拿照片', '等照片', '出片', '幾週', '多久給', 'delivery'],
    links: [{ label: '瀏覽作品', href: '/portfolio/' }],
  },
  {
    id: 'reschedule', label: '改期與下雨', faq: true, answer: '',
    keywords: ['改期', '取消', '臨時有事', '下雨', '雨天', '颱風', '天氣', '延期', 'reschedule', 'cancel'],
    links: [{ label: 'Instagram', href: siteConfig.instagramUrl }],
  },
  {
    id: 'apply', label: '如何合作', faq: true, answer: '',
    keywords: ['申請', '如何合作', '怎麼合作', '想合作', '合作流程', '填表', '表單', '報名', '預約', '預訂', 'booking'],
    links: [{ label: '填寫合作意向', href: siteConfig.inquiryUrl }],
  },
  {
    id: 'duration', label: '拍攝時長', answer: '拍攝時間會依主題與合作安排確認；填寫合作意向時，可以先提供偏好的時長與拍攝方向。',
    keywords: ['拍多久', '拍多長', '拍攝多久', '拍攝時間', '拍照多久', '拍攝時長', '幾小時', '拍幾個小時', '拍攝耗時', 'duration'],
    links: [{ label: '查看合作方式', href: '/cooperation/' }],
  },
  {
    id: 'availability', label: '近期檔期', answer: '實際可拍攝日期需要本人確認。填寫合作意向時，可提供兩個方便的日期與時段；送出意向不代表預約成立。',
    keywords: ['檔期', '有空', '空檔', '這週', '下週', '週末', '平日', '禮拜', '週六', '週日', '哪天', '哪一天', '幾號', '日期', 'schedule'],
    links: [{ label: '查看近期檔期', href: '/cooperation/#availability' }, { label: '填寫合作意向', href: siteConfig.inquiryUrl }],
  },
  {
    id: 'preparation', label: '服裝與準備', answer: '先整理喜歡的照片與原因，再討論服裝、配件與道具。服裝不必特別購買；是否需要妝髮、換裝及額外支出，都可以在拍攝前一起確認。',
    keywords: ['準備', '服裝', '穿搭', '衣服', '配件', '道具', '化妝', '妝髮', '帶什麼', 'outfit'],
    links: [{ label: '瀏覽拍攝花絮', href: '/behind-scenes/' }],
  },
  {
    id: 'location', label: '拍攝地點', answer: '地點會依主題、光線與雙方交通安排討論。請先提供方便的地區；場地開放時間、拍攝許可、預約及相關費用都需要另外確認。',
    keywords: ['地點', '地區', '在哪', '哪裡', '場地', '攝影棚', '外拍', '棚拍', '交通', '集合', 'location'],
    links: [{ label: '填寫合作意向', href: siteConfig.inquiryUrl }],
  },
  {
    id: 'rights', label: '照片公開與使用', answer: '照片是否公開、使用平台、標註方式與使用範圍，需要在個別合作中確認。若有不希望公開的內容，請在拍攝前提出；新的用途也請先再次討論。',
    keywords: ['公開', '隱私', '授權', '使用權', '版權', '著作權', '商用', '商業', '標註', '發表', '肖像', 'privacy'],
    links: [{ label: '查看合作方式', href: '/cooperation/' }],
  },
  {
    id: 'retouching', label: '張數與修圖', answer: '成片張數、修圖範圍、是否提供其他檔案與修改流程，會依個別合作確認。可以在合作意向中寫下期待，我會再回覆可安排的內容。',
    keywords: ['修圖', '精修', '調色', '照片數', '張數', '幾張', '原檔', 'raw', '底片', 'retouch'],
    links: [{ label: '填寫合作意向', href: siteConfig.inquiryUrl }],
  },
  {
    id: 'comfort', label: '拍攝界線與休息', answer: '姿勢、服裝、場景與互動方式，都可以事先說明偏好或界線。現場如果不自在、需要休息或改變想法，可以直接提出，再一起調整拍攝方式。',
    keywords: ['不舒服', '界線', '休息', '不想拍', '拒絕', '安全', '自在'],
    links: [{ label: '認識小蔡', href: '/about/' }],
  },
  {
    id: 'contact', label: '聯絡方式', answer: '以下方式都可以聯絡小蔡；若要討論合作內容，也可以直接填寫合作意向。',
    keywords: ['聯絡', '真人', '攝影師', '人工', '客服', 'email', '信箱', 'ig', 'instagram', '留言', '你好', '您好', 'hello'],
    links: supportContactLinks,
  },
];

export const supportQuickTopics = ['price', 'pose', 'delivery', 'apply'];
