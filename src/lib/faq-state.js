export function publicFaqView(faqs) {
  const items = Array.isArray(faqs) ? faqs : [];
  return { items, visible: items.length > 0 };
}
