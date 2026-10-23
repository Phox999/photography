import test from 'node:test';
import assert from 'node:assert/strict';
import { homepageSeriesSlugs, selectHomepageSeries } from '../src/lib/home-featured-series.js';
const item = slug => ({ slug, title: slug, images: [`/${slug}.webp`] });
test('Homepage displays three distinct preferred series without changing source order', () => {
  const collections = ['other', ...homepageSeriesSlugs].map(item);
  assert.deepEqual(selectHomepageSeries(collections).map(row => row.slug), homepageSeriesSlugs);
  assert.equal(collections[0].slug, 'other');
});
test('Unpublished series are replaced by distinct published records', () => {
  const collections = [item('new-a'), item(homepageSeriesSlugs[1]), item('new-b')];
  assert.deepEqual(selectHomepageSeries(collections).map(row => row.slug), [homepageSeriesSlugs[1], 'new-a', 'new-b']);
});
test('Insufficient data never repeats a series or invents an image', () => {
  assert.equal(selectHomepageSeries([item('one'), item('one'), {slug:'empty',images:[]}]).length, 1);
  assert.deepEqual(selectHomepageSeries([]), []);
});
