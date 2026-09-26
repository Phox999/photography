import { faqItems } from '../data/site';
import { supportTopics, supportContactLinks, type SupportTopic } from '../data/supportKnowledge';

export type PublishedFAQ = { question: string; answer: string };

const simplified: Record<string, string> = {
  费: '費', 钱: '錢', 价: '價', 预: '預', 约: '約', 联: '聯', 络: '絡', 时: '時', 间: '間', 长: '長', 摄: '攝',
  图: '圖', 备: '備', 档: '檔', 这: '這', 个: '個', 为: '為', 么: '麼', 会: '會', 摆: '擺',
  势: '勢', 经: '經', 验: '驗', 给: '給', 几: '幾', 传: '傳', 选: '選', 询: '詢', 处: '處',
  报: '報', 后: '後', 来: '來', 请: '請', 张: '張', 数: '數', 隐: '隱', 权: '權', 问: '問', 题: '題',
  吗: '嗎', 还: '還', 说: '說', 话: '話', 发: '發', 现: '現', 关: '關', 别: '別', 临: '臨', 边: '邊',
  灵: '靈', 点: '點', 区: '區', 场: '場', 业: '業', 标: '標', 注: '註', 实: '實', 买: '買', 紧: '緊',
};

export function normalizeSupportText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/(.)/gu, (char) => simplified[char] ?? char)
    .replace(/礼拜/g, '禮拜').replace(/星期/g, '週').replace(/周/g, '週')
    .replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 240);
}

function hasKeyword(raw: string, keyword: string): boolean {
  if (/^[a-z]+$/i.test(keyword)) return new RegExp(`\\b${keyword}\\b`, 'i').test(raw.normalize('NFKC'));
  return normalizeSupportText(raw).includes(normalizeSupportText(keyword));
}

export function topicMatches(query: string, topics: SupportTopic[] = supportTopics): SupportTopic[] {
  return topics.filter((topic) => topic.keywords.some((keyword) => hasKeyword(query, keyword)));
}

export function buildSupportKnowledge(faqs: PublishedFAQ[] = faqItems): SupportTopic[] {
  return supportTopics.map((topic) => {
    if (!topic.faq) return topic;
    const matches = faqs.filter((faq) => {
      const candidates = topicMatches(faq.question).filter((candidate) => candidate.faq);
      return candidates.length === 1 && candidates[0].id === topic.id;
    });
    return matches.length === 1
      ? { ...topic, answer: matches[0].answer }
      : {
          ...topic,
          answer: '目前沒有可唯一對應的公開說明。可以先填寫合作意向，或透過 Instagram、Email 確認。',
          links: supportContactLinks,
        };
  });
}

export type SupportMatch =
  | { kind: 'answer'; topic: SupportTopic }
  | { kind: 'choices'; prompt: string; topics: SupportTopic[] }
  | { kind: 'unknown' };

export function matchSupportQuestion(query: string, faqs: PublishedFAQ[] = faqItems): SupportMatch {
  const normalized = normalizeSupportText(query);
  if (!normalized) return { kind: 'unknown' };
  const knowledge = buildSupportKnowledge(faqs);
  const exactFAQ = faqs.find((faq) => normalizeSupportText(faq.question) === normalized);
  if (exactFAQ) return {
    kind: 'answer',
    topic: { id: `faq:${normalized}`, label: exactFAQ.question, keywords: [], answer: exactFAQ.answer, links: [] },
  };

  let matches = topicMatches(query, knowledge);
  if (matches.length > 1) matches = matches.filter((topic) => topic.id !== 'contact');
  if (!matches.some((topic) => topic.id === 'duration' || topic.id === 'delivery') && /多久|時間|耗時/.test(normalized)) {
    const timeTopics = knowledge.filter((topic) => topic.id === 'duration' || topic.id === 'delivery');
    if (matches.length === 0) return { kind: 'choices', prompt: '你想了解的是拍攝需要多久，還是拍完後多久交件？', topics: timeTopics };
    if (/多久|耗時/.test(normalized)) matches = [...matches, ...timeTopics];
  }
  if (matches.length === 1) return { kind: 'answer', topic: matches[0] };
  if (matches.length > 1) return { kind: 'choices', prompt: '你的問題可能包含幾個主題，想先了解哪一項？', topics: matches.slice(0, 6) };
  return { kind: 'unknown' };
}
