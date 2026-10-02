import assert from 'node:assert/strict';
import test from 'node:test';
import { publicFaqView } from '../src/lib/faq-state.js';

test('成功回傳空 FAQ 時不保留靜態項目並隱藏區塊', () => {
  assert.deepEqual(publicFaqView([]), { items: [], visible: false });
});

test('有 FAQ 時保留項目並顯示區塊', () => {
  const faqs = [{ question: '測試問題', answer: '測試回答' }];
  assert.deepEqual(publicFaqView(faqs), { items: faqs, visible: true });
});
