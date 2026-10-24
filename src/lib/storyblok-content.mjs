import localPages from '../data/pages.json';

const preview = import.meta.env.STORYBLOK_PREVIEW_MODE === '1';
const token = preview ? import.meta.env.STORYBLOK_PREVIEW_TOKEN : import.meta.env.STORYBLOK_PUBLIC_TOKEN;
const version = preview ? 'draft' : 'published';
const enabled = Boolean(token);
const endpoints = {
  eu: 'https://api.storyblok.com/v2/cdn',
  us: 'https://api-us.storyblok.com/v2/cdn',
  ca: 'https://api-ca.storyblok.com/v2/cdn',
  ap: 'https://api-ap.storyblok.com/v2/cdn',
  cn: 'https://app.storyblokchina.cn/v2/cdn',
};
const endpoint = import.meta.env.STORYBLOK_API_BASE_URL || endpoints[import.meta.env.STORYBLOK_REGION || 'eu'];
let allPagesPromise;
const homePromises = new Map();

async function apiGet(path, params = {}) {
  if (!endpoint) throw new Error('Unsupported STORYBLOK_REGION');
  const url = new URL(`${endpoint}/${path}`);
  url.search = new URLSearchParams({ token, version, ...params }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (response.status === 404) {
    const error = new Error(`Storyblok story not found: ${path}`);
    error.status = 404;
    throw error;
  }
  if (!response.ok) throw new Error(`Storyblok API ${response.status}: ${path}`);
  return response.json();
}

function imageUrl(asset, fallback = '') {
  const url = asset?.filename || fallback || '';
  return url.startsWith('//') ? `https:${url}` : url;
}

function cmsBlock(block) {
  if (block.component === 'content_heading') return { type: 'heading', text: block.text || '', cmsBlok: block };
  if (block.component === 'content_paragraph') return { type: 'paragraph', text: block.text || '', cmsBlok: block };
  if (block.component === 'content_item') return { type: 'item', text: block.text || '', cmsBlok: block };
  if (block.component === 'content_image') return {
    type: 'image', src: imageUrl(block.image, block.image_url), alt: block.alt || '', cmsBlok: block
  };
  throw new Error(`Unknown Storyblok body block: ${block.component}`);
}

function articleEntry(story) {
  const route = story.full_slug.replace(/\/$/, '');
  const segments = route.split('/');
  const locale = segments[0] === 'ru' ? 'ru' : 'en';
  if (!/^((ru\/)?news\/)[^/]+$/.test(route)) {
    throw new Error(`News story has an unexpected route: ${route}`);
  }
  const original = localPages.find((page) => page.route === route);
  const content = story.content;
  if (content.component !== 'news_article' || !content.title?.trim()) {
    throw new Error(`News story is missing its content type or title: ${route}`);
  }
  return {
    ...original,
    route,
    locale,
    section: 'news',
    slug: segments.at(-1),
    depth: segments.length,
    title: content.title,
    description: content.summary || '',
    featured: content.feature_on_home === true,
    cardLabel: content.card_label || '',
    publishedAt: content.publication_date || story.published_at || '',
    seoTitle: content.seo_title || '',
    seoDescription: content.seo_description || '',
    hero: imageUrl(content.hero_image, content.hero_url),
    blocks: (content.body || []).map(cmsBlock),
    links: (content.links || []).filter((item) => item.component === 'content_link' && item.url)
      .map((item) => ({ label: item.label || item.url, href: item.url })),
    cmsBlok: content,
  };
}

function sitePageEntry(story) {
  const content = story.content;
  if (content.component !== 'site_page' || !content.route?.trim()) {
    throw new Error(`Site page is missing its route or content type: ${story.full_slug}`);
  }
  const original = localPages.find((page) => page.route === content.route);
  if (!original) throw new Error(`Storyblok page route is unknown: ${content.route}`);
  return {
    ...original,
    title: content.title || original.title,
    description: content.summary || '',
    seoTitle: content.seo_title || '',
    seoDescription: content.seo_description || '',
    hero: imageUrl(content.hero_image, content.hero_url),
    blocks: (content.body || []).map(cmsBlock),
    links: (content.links || []).filter((item) => item.component === 'content_link' && item.url)
      .map((item) => ({ label: item.label || item.url, href: item.url })),
    cmsBlok: content,
  };
}

async function fetchAllByType(contentType) {
  const stories = [];
  for (let page = 1; page <= 10; page++) {
    const data = await apiGet('stories', {
      content_type: contentType, per_page: 100, page,
    });
    const batch = data.stories || [];
    stories.push(...batch);
    if (batch.length < 100) return stories;
  }
  throw new Error(`Storyblok ${contentType} pagination exceeded 1,000 entries`);
}

export function getAllPages() {
  if (!allPagesPromise) allPagesPromise = (async () => {
    if (!enabled) return localPages;
    const merged = new Map(localPages.map((page) => [page.route, page]));
    for (const story of await fetchAllByType('news_article')) {
      const entry = articleEntry(story);
      merged.set(entry.route, entry);
    }
    for (const story of await fetchAllByType('site_page')) {
      const entry = sitePageEntry(story);
      merged.set(entry.route, entry);
    }
    return [...merged.values()];
  })();
  return allPagesPromise;
}

export function getHomeContent(locale) {
  if (!enabled) return Promise.resolve(null);
  if (!homePromises.has(locale)) homePromises.set(locale, (async () => {
    const slug = locale === 'ru' ? 'ru/site-home' : 'site-home';
    try {
      const data = await apiGet(`stories/${slug}`);
      const content = data.story?.content;
      if (content?.component !== 'home_page') throw new Error(`Unexpected home content type: ${slug}`);
      return content;
    } catch (error) {
      if (error?.response?.status === 404 || error?.status === 404) return null;
      throw error;
    }
  })());
  return homePromises.get(locale);
}
