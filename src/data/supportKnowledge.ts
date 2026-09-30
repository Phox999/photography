import { siteConfig } from './site';

export type SupportLink = {
  label: string;
  href: string;
};

export type SupportTopic = {
  id: string;
  label: string;
  keywords: string[];
  answer: string;
  links: SupportLink[];
  faq?: boolean;
};

export const supportInquiryLink: SupportLink = {
  label: '填寫合作意向',
  href: siteConfig.inquiryUrl,
};

export const supportFallbackAnswer = '上面沒有你想問的嗎？把想了解的事寫在表單裡，我再回覆你。';

export const supportContactLinks: SupportLink[] = [
  supportInquiryLink,
  {
    label: 'Instagram',
    href: siteConfig.instagramUrl,
  },
];

// FAQ-backed topics 會沿用網站 FAQ 已發布的回答。
// faq: true 的項目可由既有 FAQ 資料補入 answer。
export const supportTopics: SupportTopic[] = [
  {
    id: 'price',
    label: '合作費用',
    faq: true,
    answer: '',
    keywords: [
      '費用',
      '價錢',
      '價格',
      '多少錢',
      '怎麼算',
      '怎麼收費',
      '收費',
      '報價',
      '付費拍攝',
      '互惠',
      '互惠費',
      '免費拍攝',
      'price',
      'cost',
      'fee',
    ],
    links: [
      {
        label: '查看合作方式',
        href: '/cooperation/',
      },
    ],
  },

  {
    id: 'apply',
    label: '如何合作',
    faq: true,
    answer: '',
    keywords: [
      '申請',
      '如何合作',
      '怎麼合作',
      '想合作',
      '合作流程',
      '合作方式',
      '怎麼預約',
      '如何預約',
      '預約拍攝',
      '預訂拍攝',
      '填表',
      '表單',
      '報名',
      'booking',
    ],
    links: [supportInquiryLink],
  },

  {
    id: 'availability',
    label: '近期檔期',
    answer: '',
    keywords: [
      '檔期',
      '有空嗎',
      '有沒有空',
      '最近有空',
      '近期有空',
      '空檔',
      '這週有空',
      '下週有空',
      '週末有空',
      '平日有空',
      '週六有空',
      '週日有空',
      '哪天有空',
      '哪一天可以',
      '幾號可以',
      '可拍日期',
      '拍攝日期',
      '什麼時候可以拍',
      '什麼時間可以拍',
      'schedule',
      'availability',
    ],
    links: [
      {
        label: '查看近期檔期',
        href: '/cooperation/#availability',
      },
    ],
  },

  {
    id: 'location',
    label: '拍攝地點',
    answer:
      '拍攝地點可以一起討論，會考慮主題、光線和交通。可以先告訴我方便前往的地區；如果需要租棚、借場地或申請拍攝許可，我會先和你確認安排與費用。',
    keywords: [
      '拍攝地點',
      '拍攝在哪',
      '在哪拍',
      '哪裡拍',
      '拍哪裡',
      '地點',
      '地區',
      '場地',
      '攝影棚',
      '棚拍',
      '外拍',
      '戶外拍攝',
      '室內拍攝',
      '交通',
      '集合地點',
      'location',
    ],
    links: [],
  },

  {
    id: 'pose',
    label: '第一次拍攝',
    faq: true,
    answer: '',
    keywords: [
      '第一次拍',
      '第一次拍攝',
      '第一次當模特',
      '沒有經驗',
      '沒經驗',
      '新手',
      '不會拍',
      '不會擺',
      '不會擺姿勢',
      '不會看鏡頭',
      '姿勢',
      '擺拍',
      '表情',
      '引導',
      '緊張',
      '怕尷尬',
      'pose',
      'posing',
    ],
    links: [],
  },

  {
    id: 'duration',
    label: '拍攝時長',
    answer:
      '拍多久會看主題和場景。填寫合作意向時，可以先告訴我希望拍多久，我們再一起討論。',
    keywords: [
      '拍多久',
      '拍多長',
      '拍攝多久',
      '拍攝時間',
      '拍照多久',
      '拍攝時長',
      '幾小時',
      '拍幾個小時',
      '拍攝耗時',
      '需要多久',
      'duration',
    ],
    links: [],
  },

  {
    id: 'preparation',
    label: '服裝與準備',
    answer:
      '拍攝前可以先挑幾張喜歡的照片，告訴我你喜歡的風格。服裝、配件、道具和妝髮，再依主題一起確認；不用為了拍攝特地買衣服。',
    keywords: [
      '要準備什麼',
      '需要準備什麼',
      '拍攝準備',
      '準備',
      '服裝',
      '穿什麼',
      '穿搭',
      '衣服',
      '配件',
      '道具',
      '化妝',
      '妝髮',
      '妝造',
      '帶什麼',
      'outfit',
    ],
    links: [],
  },

  {
    id: 'retouching',
    label: '張數與修圖',
    answer:
      '這次會交幾張、怎麼修圖，以及要不要提供其他檔案，都可以先談好。有特別期待的話，也可以寫在合作意向裡。',
    keywords: [
      '修圖',
      '精修',
      '調色',
      '照片數',
      '照片張數',
      '張數',
      '幾張',
      '會給幾張',
      '可以拿幾張',
      '原檔',
      '原圖',
      'raw',
      'raw檔',
      '底片',
      'retouch',
      'retouching',
    ],
    links: [],
  },

  {
    id: 'delivery',
    label: '交件時間',
    faq: true,
    answer: '',
    keywords: [
      '交件',
      '交付',
      '交期',
      '多久交件',
      '多久給照片',
      '什麼時候拿到照片',
      '拿到照片',
      '收到照片',
      '拿照片',
      '等照片',
      '出片',
      '幾週',
      '多久給',
      'delivery',
    ],
    links: [],
  },

  {
    id: 'reschedule',
    label: '改期與下雨',
    faq: true,
    answer: '',
    keywords: [
      '改期',
      '改時間',
      '改日期',
      '延期',
      '取消',
      '臨時有事',
      '下雨',
      '雨天',
      '下大雨',
      '颱風',
      '天氣不好',
      '天氣',
      '遇到下雨',
      'reschedule',
      'cancel',
    ],
    links: [
      {
        label: 'Instagram 聯絡',
        href: siteConfig.instagramUrl,
      },
    ],
  },

  {
    id: 'payment',
    label: '訂金與付款',
    answer:
      '訂金和付款方式要看這次拍攝怎麼安排。等內容、日期和費用都談好，我會再告訴你怎麼付款。',
    keywords: [
      '訂金',
      '定金',
      '要付訂金嗎',
      '付款',
      '怎麼付款',
      '付款方式',
      '付錢',
      '先付款',
      '先付錢',
      '匯款',
      '轉帳',
      '銀行轉帳',
      '現金',
      'payment',
      'deposit',
    ],
    links: [],
  },

  {
    id: 'late',
    label: '遲到與當天狀況',
    answer:
      '拍攝當天如果會晚到或臨時有狀況，盡早私訊我就好。我們再看要不要改集合時間或調整拍攝安排。',
    keywords: [
      '遲到',
      '會遲到',
      '晚到',
      '來不及',
      '趕不上',
      '塞車',
      '睡過頭',
      '臨時狀況',
      '當天有事',
      '晚一點到',
      '趕不到',
    ],
    links: [
      {
        label: 'Instagram 聯絡',
        href: siteConfig.instagramUrl,
      },
    ],
  },

  {
    id: 'rights',
    label: '照片公開與使用',
    answer:
      '照片會不會公開、要不要標註、可以用在哪裡，都會先和你確認。如果有不想公開的照片或平台，拍攝前告訴我就好；之後有其他用途，我也會先問你。',
    keywords: [
      '照片公開',
      '可以公開嗎',
      '不想公開',
      '不能公開',
      '隱私',
      '授權',
      '使用權',
      '版權',
      '著作權',
      '商業使用',
      '商業用途',
      '商用照片',
      '商用',
      '標註',
      '要標註嗎',
      '發表',
      '肖像',
      '肖像權',
      'privacy',
      'copyright',
    ],
    links: [],
  },

  {
    id: 'comfort',
    label: '拍攝界線與休息',
    answer:
      '拍攝前可以先告訴我不想拍的姿勢、服裝或場景。現場如果覺得不自在、想休息或改變主意，也直接跟我說，我們再一起調整。',
    keywords: [
      '不舒服',
      '不自在',
      '界線',
      '拍攝界線',
      '底線',
      '休息',
      '可以休息嗎',
      '不想拍',
      '不想繼續',
      '拒絕',
      '安全',
      '可以拒絕嗎',
      '不敢說',
    ],
    links: [],
  },

  {
    id: 'intimate',
    label: '內衣與尺度拍攝',
    answer:
      '如果拍泳裝、內衣或比較性感的主題，我會先和你確認服裝、動作、拍攝尺度和照片公開方式。每個安排都以雙方同意為前提；拍攝時如果不想繼續，也可以隨時跟我說。',
    keywords: [
      '內衣',
      '拍內衣',
      '內衣拍攝',
      '尺度',
      '尺度拍攝',
      '大尺度',
      '性感',
      '性感拍攝',
      '泳裝',
      '死庫水',
      '私房',
      '私房照',
      '私房拍攝',
      '裸露',
      '情趣',
      '束縛',
      '捆綁',
      '項圈',
    ],
    links: [],
  },

  {
    id: 'contact',
    label: '聯絡方式',
    answer:
      '想聊合作的話，可以填寫合作意向；也可以直接透過 Instagram 私訊我。',
    keywords: [
      '聯絡',
      '怎麼聯絡',
      '如何聯絡',
      '聯絡方式',
      '找你',
      '私訊',
      '私訊你',
      '真人',
      '人工',
      'email',
      '信箱',
      'ig',
      'instagram',
      'instagram私訊',
    ],
    links: supportContactLinks,
  },
];

// 首頁／客服視窗優先顯示的快速問題。
// 順序以「合作決策最常先確認的資訊」為主。
export const supportQuickTopics = [
  'price',
  'apply',
  'availability',
  'location',
];
