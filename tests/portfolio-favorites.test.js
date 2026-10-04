import assert from 'node:assert/strict';
import test from 'node:test';
import { createFavoriteStore, FAVORITES_LIMIT, normalizeFavorites, normalizeFavoriteImage, favoriteHref, toggleFavorite } from '../src/lib/portfolio-favorites.js';
import { validateFavoriteReferences, resolveFavoriteReferences } from '../server/portfolio-favorites.js';
import { normalizeInquiryDraft, buildInquiryPayload, validateInquiryDraft } from '../src/lib/inquiry-form.js';
import { prepareSubmission } from '../server/inquiry-workflow.js';
import { signedInquiryReferences } from '../server/inquiry-references.js';
const image = '/assets/portfolio/中文作品/01.webp';
const favorite = { slug: '中文作品', title: '中文作品', image, number: 1 };

test('收藏以作品與圖片辨識，支援中文編碼、切換與十二張上限', () => {
  assert.deepEqual(normalizeFavorites([favorite, { ...favorite, image: encodeURI(image) }]), [favorite]);
  let items = toggleFavorite([], favorite).items;
  assert.equal(items.length, 1);
  assert.deepEqual(toggleFavorite(items, favorite).items, []);
  items = Array.from({ length: FAVORITES_LIMIT }, (_, index) => ({ ...favorite, image: `/assets/portfolio/中文作品/${index + 1}.webp`, number: index + 1 }));
  assert.equal(toggleFavorite(items, { ...favorite, image: '/assets/portfolio/中文作品/13.webp', number: 13 }).error, '最多收藏 12 張，請先移除部分照片。');
  assert.equal(toggleFavorite(items, items[0]).items.length, 11);
  assert.match(favoriteHref(favorite), /^\/portfolio\/.*\/\?photo=/);
});

test('拒絕私有相簿、任意外站、認證資訊與非法收藏；API 不截斷錯誤', () => {
  for (const value of ['javascript:alert(1)', '//evil.example/a.webp', '/assets/portfolio/../../secret.webp', '/client/a.webp', 'https://evil.example/01.webp', 'https://fake.supabase.co/storage/v1/object/sign/site-portfolio/a.webp?token=x']) assert.equal(normalizeFavoriteImage(value), null);
  assert.throws(() => validateFavoriteReferences([favorite, favorite]), /格式/);
  assert.throws(() => validateFavoriteReferences(Array(13).fill(favorite)), /12/);
  assert.throws(() => validateFavoriteReferences([{ ...favorite, image: '/client/01.webp' }]), /格式/);
  assert.deepEqual(normalizeFavorites([{ ...favorite, slug: '..' }, { ...favorite, number: 0 }, favorite]), [favorite]);
});

test('收藏可保存、恢復、跨分頁同步；儲存失效仍保留目前頁面資料', () => {
  let saved = null;
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  const store = createFavoriteStore(() => storage);
  store.save([favorite]);
  assert.deepEqual(createFavoriteStore(() => storage).read(), [favorite]);
  store.sync('[]'); assert.deepEqual(store.read(), []);
  store.sync(JSON.stringify([favorite])); assert.deepEqual(store.read(), [favorite]);
  const failed = createFavoriteStore(() => { throw new Error('denied'); });
  assert.deepEqual(failed.save([favorite]), [favorite]); assert.equal(failed.persistent(), false);
  assert.deepEqual(createFavoriteStore(() => ({ getItem: () => '{broken' })).read(), []);
});

test('表單只收藏作品仍可送出，與自由描述及三個參考連結互不侵占', () => {
  const form = { get: key => ({ name: '小蔡', contact_method: 'Instagram', contact_account: '@photo', collaboration_type: '主題合作', consent: 'on', reference_links: 'https://a.example\nhttps://b.example\nhttps://c.example' })[key] };
  const draft = normalizeInquiryDraft(form, [], [favorite]);
  assert.equal(validateInquiryDraft(draft), null);
  const payload = buildInquiryPayload(draft);
  assert.deepEqual(payload.portfolio_favorites, [favorite]); assert.equal(payload.reference_links.length, 3);
  assert.equal(payload.description, '以已收藏的作品作為拍攝參考。');
  assert.equal(Object.hasOwn(buildInquiryPayload(normalizeInquiryDraft(form)), 'portfolio_favorites'), false);
});

test('後端核對公開清單，以伺服器標題及目前順序儲存，拒絕已下架照片', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => {
    assert.equal(url, 'https://project.supabase.co/rest/v1/rpc/get_public_portfolio_content'); calls++;
    return new Response(JSON.stringify({ version: 1, collections: [{ slug: favorite.slug, title: '更新後名稱', category: '外拍', description: '', cover: `static:${image}`, images: ['static:/assets/portfolio/中文作品/02.webp', `static:${image}`], totalImages: 2 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const config = { url: 'https://project.supabase.co', key: 'sb_secret_test' };
    assert.deepEqual(await resolveFavoriteReferences(config, [favorite]), [{ ...favorite, title: '更新後名稱', number: 2 }]);
    await assert.rejects(resolveFavoriteReferences(config, [{ ...favorite, image: '/assets/portfolio/中文作品/missing.webp' }]), /下架/);
    assert.deepEqual(await resolveFavoriteReferences(config, []), []); assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test('送出摘要包含收藏選擇；改選照片改變重試識別，舊資料不新增欄位', async () => {
  const body = { submission_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', receipt_token: 'a'.repeat(64) };
  const payload = { name: '小蔡', description: 'test', consent: true };
  const original = await prepareSubmission(body, payload, []);
  const withFavorite = await prepareSubmission(body, { ...payload, portfolio_favorites: [favorite] }, []);
  const other = await prepareSubmission(body, { ...payload, portfolio_favorites: [{ ...favorite, image: '/assets/portfolio/中文作品/02.webp' }] }, []);
  assert.notEqual(original.requestHash, withFavorite.requestHash);
  assert.notEqual(withFavorite.requestHash, other.requestHash);
  assert.equal(withFavorite.requestHash, (await prepareSubmission(body, { ...payload, portfolio_favorites: [{ ...favorite, title: '新名稱', number: 3 }] }, [])).requestHash);
  assert.equal(original.requestHash, (await prepareSubmission(body, { ...payload, portfolio_favorites: [] }, [])).requestHash);
});

test('後台參考資料回傳收藏縮圖，舊申請預設空清單', async () => {
  assert.deepEqual((await signedInquiryReferences({}, { portfolio_favorites: [favorite] })).portfolio_favorites, [favorite]);
  assert.deepEqual((await signedInquiryReferences({}, {})).portfolio_favorites, []);
});
