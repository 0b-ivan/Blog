const { glossaryEntries } = require('./glossary');
const { topicDomains } = require('../config/blog-statistics.json');

function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
}

function glossaryUsage(posts, entries = glossaryEntries) {
  const used = new Set();
  for (const post of posts) {
    const html = String(post.html || '');
    for (const entry of entries) {
      const key = String(entry.key || '');
      if (key && html.includes(`data-glossary-key="${key.replace(/"/g, '&quot;')}"`)) {
        used.add(key);
      }
    }
  }
  return used.size;
}

function publicationDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value || '').trim();
  const direct = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function aggregateBlogStatistics(posts) {
  const safePosts = Array.isArray(posts) ? posts : [];
  const categoryCounts = new Map();
  const tags = new Set();
  const publicationDays = new Map();
  const publicationMonths = new Map();
  const topicCounts = new Map(topicDomains.map((domain) => [domain.label, 0]));

  for (const post of safePosts) {
    const category = String(post.category || 'IT').trim() || 'IT';
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    normalizeTags(post.tags).forEach((tag) => tags.add(tag.toLocaleLowerCase('de')));
    const labels = new Set([category, ...normalizeTags(post.tags)].map((label) => label.toLocaleLowerCase('de')));
    for (const domain of topicDomains) {
      if (domain.signals.some((signal) => labels.has(signal.toLocaleLowerCase('de')))) {
        topicCounts.set(domain.label, topicCounts.get(domain.label) + 1);
      }
    }
    const day = publicationDate(post.publishedAt || post.date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      publicationDays.set(day, (publicationDays.get(day) || 0) + 1);
      const month = day.slice(0, 7);
      publicationMonths.set(month, (publicationMonths.get(month) || 0) + 1);
    }
  }

  const words = safePosts.reduce((sum, post) => sum + (Number(post.wordCount) || 0), 0);
  const readingMinutes = safePosts.reduce((sum, post) => sum + (Number(post.readingTime) || 0), 0);

  return {
    articles: safePosts.length,
    words,
    readingMinutes,
    averageWords: safePosts.length ? Math.round(words / safePosts.length) : 0,
    glossaryTerms: glossaryUsage(safePosts),
    categories: categoryCounts.size,
    tags: tags.size,
    busiestMonth: [...publicationMonths.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || '',
    topicDistribution: topicDomains.map((domain) => ({ label: domain.label, value: topicCounts.get(domain.label) || 0 })),
    publicationDays: [...publicationDays.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((left, right) => left.date.localeCompare(right.date))
  };
}

module.exports = { aggregateBlogStatistics, glossaryUsage };
