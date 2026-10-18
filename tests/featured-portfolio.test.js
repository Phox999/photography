import assert from 'node:assert/strict';
import test from 'node:test';
import { featuredPortfolioSlugs, orderFeaturedPortfolio } from '../src/lib/featured-portfolio.js';

test('homepage features six chosen collections in the requested order', () => {
  const original = [{ slug: 'other' }, ...featuredPortfolioSlugs.slice().reverse().map((slug) => ({ slug })), { slug: 'another' }];
  const ordered = orderFeaturedPortfolio(original);
  assert.deepEqual(ordered.slice(0, 6).map(({ slug }) => slug), featuredPortfolioSlugs);
  assert.deepEqual(ordered.slice(6).map(({ slug }) => slug), ['other', 'another']);
  assert.equal(original[0].slug, 'other', 'published admin order must not be mutated');
});

test('missing featured collections are skipped without blank cards', () => {
  assert.deepEqual(orderFeaturedPortfolio([{ slug: 'other' }, { slug: featuredPortfolioSlugs[4] }]).map(({ slug }) => slug), [featuredPortfolioSlugs[4], 'other']);
});
