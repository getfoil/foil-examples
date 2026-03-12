// Simulated knowledge base articles for the support agent
const articles = [
  {
    id: 'kb-001',
    title: 'Return Policy',
    category: 'returns',
    content: `Our return policy allows returns within 30 days of delivery for a full refund. Items must be in original packaging and unused condition. Defective items can be returned within 90 days. Digital products are non-refundable once activated. Shipping costs for returns are covered by us for defective items; otherwise the customer pays return shipping. Refunds are processed within 5-7 business days after we receive the item.`,
  },
  {
    id: 'kb-002',
    title: 'Shipping Information',
    category: 'shipping',
    content: `We offer three shipping tiers: Standard (5-7 business days, free over $50), Express (2-3 business days, $9.99), and Next-Day ($19.99). We ship to the US and Canada. International shipping to EU is available for $24.99 flat rate, 10-14 business days. Orders placed before 2 PM ET ship same day. Tracking numbers are emailed within 1 hour of shipment.`,
  },
  {
    id: 'kb-003',
    title: 'Warranty Coverage',
    category: 'warranty',
    content: `All electronics come with a 1-year manufacturer warranty covering defects in materials and workmanship. Our extended protection plan ($14.99/yr) adds accidental damage coverage including drops, spills, and cracked screens. Warranty claims require the original order number. We offer advance replacements for Gold and Platinum loyalty members — we ship the replacement before receiving the defective item.`,
  },
  {
    id: 'kb-004',
    title: 'Loyalty Program',
    category: 'account',
    content: `Our loyalty program has four tiers: Standard (0-4 orders), Silver (5-14 orders), Gold (15-29 orders), and Platinum (30+ orders). Benefits increase per tier: Silver gets 5% discount and early access to sales. Gold adds free express shipping and priority support. Platinum adds a dedicated account manager, 10% discount, and advance replacements on warranty claims. Points expire after 12 months of inactivity.`,
  },
  {
    id: 'kb-005',
    title: 'Payment Methods & Billing',
    category: 'billing',
    content: `We accept Visa, Mastercard, Amex, Discover, PayPal, Apple Pay, and Google Pay. For orders over $200, we offer 4 interest-free installments via Affirm. Gift cards can be combined with other payment methods. If a charge is disputed, we will put the account on hold until resolved. Invoices are available in the account dashboard under Order History.`,
  },
  {
    id: 'kb-006',
    title: 'Troubleshooting: Device Not Turning On',
    category: 'troubleshooting',
    content: `If your device won't turn on: 1) Hold the power button for 10 seconds for a hard reset. 2) Try a different charging cable and power adapter. 3) Check if the charging port has debris — clean gently with compressed air. 4) If the device was exposed to water, let it dry for 48 hours in rice. 5) If none of these work, the device may need warranty service — contact us with your order number.`,
  },
];

function searchArticles(query) {
  const q = query.toLowerCase();
  const scored = articles.map((a) => {
    let score = 0;
    const fields = [a.title, a.category, a.content];
    for (const field of fields) {
      const words = q.split(/\s+/);
      for (const word of words) {
        if (word.length > 2 && field.toLowerCase().includes(word)) score++;
      }
    }
    return { ...a, score };
  });
  return scored
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function getArticleById(id) {
  return articles.find((a) => a.id === id) || null;
}

module.exports = { articles, searchArticles, getArticleById };
