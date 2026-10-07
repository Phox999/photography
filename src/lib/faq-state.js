export function publicFaqView(faqs) {
  const items = Array.isArray(faqs) ? faqs : [];
  return { items, visible: items.length > 0 };
}

export function faqPageSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
}
