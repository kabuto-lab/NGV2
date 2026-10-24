import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { loadEnv } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = loadEnv('', root, 'STORYBLOK_');
const localPages = JSON.parse(readFileSync(new URL('../src/data/pages.json', import.meta.url), 'utf8'));
const homepageSource = readFileSync(new URL('../src/components/Home.astro', import.meta.url), 'utf8');
const apply = process.argv.includes('--apply');

function homeCopy(locale) {
  const start = homepageSource.indexOf('const copy = ru ?');
  const end = homepageSource.indexOf('if (cms) {', start);
  if (start < 0 || end < 0) throw new Error('Cannot find homepage copy in Home.astro');
  const expression = homepageSource.slice(start + 'const copy = '.length, end).trim().replace(/;$/, '');
  return runInNewContext(expression, { ru: locale === 'ru' }, { timeout: 1000 });
}

function archivedUrl(value = '') {
  return (value || '').replace('__SITE_ASSETS__', '/site/assets/');
}

function bodyBlok(block) {
  const base = { _uid: randomUUID() };
  if (block.type === 'heading') return { ...base, component: 'content_heading', text: block.text };
  if (block.type === 'paragraph') return { ...base, component: 'content_paragraph', text: block.text };
  if (block.type === 'item') return { ...base, component: 'content_item', text: block.text };
  if (block.type === 'image') return {
    ...base, component: 'content_image', image_url: archivedUrl(block.src), alt: block.alt || ''
  };
  throw new Error(`Unknown archive block type: ${block.type}`);
}

const homeLabels = {
  h1a: 'Заголовок — строка 1', h1b: 'Заголовок — строка 2', h1c: 'Заголовок — строка 3',
  heroBody: 'Первый экран — описание', worldsTitle: 'Игры — заголовок',
  worldsIntro: 'Игры — вступление', studioBody: 'Студия — описание',
  newsTitle: 'Новости — заголовок', newsIntro: 'Новости — вступление',
  contactTitle: 'Контакты — заголовок', contactBody: 'Контакты — описание',
};
const homeFields = Object.keys(homeCopy('en'));
const homeSchema = Object.fromEntries(homeFields.map((key, pos) => [key, {
  type: /Body|Intro|Description/.test(key) ? 'textarea' : 'text',
  display_name: homeLabels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2'),
  pos,
}]));
Object.assign(homeSchema, {
  hero_background: { type: 'asset', display_name: 'Фон первого экрана', filetypes: ['images'], pos: 100 },
  hero_monolith: { type: 'asset', display_name: 'Объект первого экрана', filetypes: ['images'], pos: 101 },
  seo_title: { type: 'text', display_name: 'SEO: заголовок страницы', pos: 102 },
  seo_description: { type: 'textarea', display_name: 'SEO: описание страницы', pos: 103 },
});

const components = [
  { name: 'home_page', display_name: 'Главная страница', is_root: true, is_nestable: false, schema: homeSchema },
  { name: 'news_article', display_name: 'Новость', is_root: true, is_nestable: false, schema: {
    title: { type: 'text', display_name: 'Заголовок', required: true, pos: 0 },
    summary: { type: 'textarea', display_name: 'Краткое описание', pos: 1 },
    feature_on_home: { type: 'boolean', display_name: 'Показать на главной', pos: 2 },
    card_label: { type: 'text', display_name: 'Рубрика на главной', pos: 3 },
    publication_date: { type: 'datetime', display_name: 'Дата публикации', pos: 4 },
    hero_image: { type: 'asset', display_name: 'Обложка', filetypes: ['images'], pos: 5 },
    hero_url: { type: 'text', display_name: 'Архивная ссылка обложки', pos: 6 },
    body: { type: 'bloks', display_name: 'Текст статьи', restrict_components: true,
      component_whitelist: ['content_heading', 'content_paragraph', 'content_item', 'content_image'], pos: 7 },
    links: { type: 'bloks', display_name: 'Дополнительные ссылки', restrict_components: true,
      component_whitelist: ['content_link'], pos: 8 },
    seo_title: { type: 'text', display_name: 'SEO: заголовок страницы', pos: 9 },
    seo_description: { type: 'textarea', display_name: 'SEO: описание страницы', pos: 10 },
  } },
  { name: 'site_page', display_name: 'Страница сайта', is_root: true, is_nestable: false, schema: {
    route: { type: 'text', display_name: 'Путь страницы (не менять)', required: true, pos: 0 },
    title: { type: 'text', display_name: 'Заголовок', required: true, pos: 1 },
    summary: { type: 'textarea', display_name: 'Краткое описание', pos: 2 },
    hero_image: { type: 'asset', display_name: 'Обложка', filetypes: ['images'], pos: 3 },
    hero_url: { type: 'text', display_name: 'Архивная ссылка обложки', pos: 4 },
    body: { type: 'bloks', display_name: 'Содержимое страницы', restrict_components: true,
      component_whitelist: ['content_heading', 'content_paragraph', 'content_item', 'content_image'], pos: 5 },
    links: { type: 'bloks', display_name: 'Ссылки', restrict_components: true,
      component_whitelist: ['content_link'], pos: 6 },
    seo_title: { type: 'text', display_name: 'SEO: заголовок страницы', pos: 7 },
    seo_description: { type: 'textarea', display_name: 'SEO: описание страницы', pos: 8 },
  } },
  { name: 'content_heading', display_name: 'Подзаголовок', is_root: false, is_nestable: true,
    schema: { text: { type: 'text', display_name: 'Текст', required: true, pos: 0 } } },
  { name: 'content_paragraph', display_name: 'Абзац', is_root: false, is_nestable: true,
    schema: { text: { type: 'textarea', display_name: 'Текст', required: true, pos: 0 } } },
  { name: 'content_item', display_name: 'Пункт списка', is_root: false, is_nestable: true,
    schema: { text: { type: 'textarea', display_name: 'Текст', required: true, pos: 0 } } },
  { name: 'content_image', display_name: 'Изображение', is_root: false, is_nestable: true,
    schema: {
      image: { type: 'asset', display_name: 'Загрузить изображение', filetypes: ['images'], pos: 0 },
      image_url: { type: 'text', display_name: 'Архивная ссылка', pos: 1 },
      alt: { type: 'text', display_name: 'Описание изображения', pos: 2 },
    } },
  { name: 'content_link', display_name: 'Ссылка', is_root: false, is_nestable: true,
    schema: {
      label: { type: 'text', display_name: 'Подпись', required: true, pos: 0 },
      url: { type: 'text', display_name: 'Адрес URL', required: true, pos: 1 },
    } },
];

const stories = [
  ...['en', 'ru'].map((locale) => ({
    fullSlug: locale === 'ru' ? 'ru/site-home' : 'site-home',
    name: locale === 'ru' ? 'Главная — RU' : 'Home — EN',
    path: locale === 'ru' ? '/ru/' : '/',
    content: {
      _uid: randomUUID(), component: 'home_page', ...homeCopy(locale),
      seo_title: locale === 'ru' ? 'Next Genium — Миры за гранью ожидаемого' : 'Next Genium — Worlds Beyond the Expected',
      seo_description: locale === 'ru'
        ? 'Next Genium — независимая студия игр для ПК и консолей.'
        : 'Next Genium is an independent game studio creating worlds across science fiction, horror and fantasy.',
    },
  })),
  ...localPages.filter((page) => page.section === 'news' && page.slug !== 'news').map((page) => ({
    fullSlug: page.route,
    name: page.title.replace(/\s+[—–-]\s+Next Genium$/, ''),
    path: `/${page.route}/`,
    content: {
      _uid: randomUUID(), component: 'news_article', title: page.title,
      summary: page.description || page.blocks.find((block) => block.type === 'paragraph')?.text.slice(0, 190) || '',
      hero_url: archivedUrl(page.hero),
      body: page.blocks.map(bodyBlok),
      links: page.links.map((link) => ({ _uid: randomUUID(), component: 'content_link',
        label: link.label, url: link.href })),
      seo_title: `${page.title.replace(/\s+[—–-]\s+Next Genium$/, '')} — Next Genium`,
      seo_description: page.description || '',
    },
  })),
  ...localPages.filter((page) => !(page.section === 'news' && page.slug !== 'news')).map((page) => ({
    fullSlug: `site-pages/${page.locale}/${page.route.replace(/^ru\//, '').replaceAll('/', '--')}`,
    name: `${page.locale.toUpperCase()} / ${page.title.replace(/\s+[—–-]\s+Next Genium$/, '')}`,
    path: `/${page.route}/`,
    content: {
      _uid: randomUUID(), component: 'site_page', route: page.route,
      title: page.title.replace(/\s+[—–-]\s+Next Genium$/, ''),
      summary: page.description || '',
      hero_url: archivedUrl(page.hero),
      body: page.blocks.map(bodyBlok),
      links: page.links.map((link) => ({ _uid: randomUUID(), component: 'content_link',
        label: link.label, url: link.href })),
      seo_title: `${page.title.replace(/\s+[—–-]\s+Next Genium$/, '')} — Next Genium`,
      seo_description: page.description || '',
    },
  })),
];

if (!apply) {
  console.log(`Dry run: ${components.length} content types, ${stories.length} draft stories (2 home, ${stories.filter((story) => story.content.component === 'news_article').length} news, ${stories.filter((story) => story.content.component === 'site_page').length} pages).`);
  console.log('No Storyblok account was accessed. Run with --apply after adding Space ID and Management token to .env.');
  process.exit(0);
}

const spaceId = env.STORYBLOK_SPACE_ID;
const managementToken = env.STORYBLOK_MANAGEMENT_TOKEN;
if (!/^\d+$/.test(spaceId || '') || !managementToken) {
  throw new Error('Set STORYBLOK_SPACE_ID and STORYBLOK_MANAGEMENT_TOKEN in .env first');
}
const managementEndpoints = {
  eu: 'https://mapi.storyblok.com/v1',
  us: 'https://api-us.storyblok.com/v1',
  ca: 'https://api-ca.storyblok.com/v1',
  ap: 'https://api-ap.storyblok.com/v1',
  cn: 'https://app.storyblokchina.cn/v1',
};
const managementEndpoint = managementEndpoints[env.STORYBLOK_REGION || 'eu'];
if (!managementEndpoint) throw new Error('Unsupported STORYBLOK_REGION');
const apiBase = `${managementEndpoint}/spaces/${spaceId}`;

async function request(method, path, body) {
  const response = await fetch(`${apiBase}/${path}`, {
    method, headers: {
      Authorization: managementToken,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Storyblok Management API ${response.status} ${method} ${path}: ${(await response.text()).slice(0, 400)}`);
  return response.json();
}

async function listAll(path, key) {
  const result = [];
  for (let page = 1; page <= 10; page++) {
    const data = await request('GET', `${path}?per_page=100&page=${page}`);
    const batch = data[key] || [];
    result.push(...batch);
    if (batch.length < 100) return result;
  }
  throw new Error(`Too many Storyblok ${key} to inspect safely`);
}

const existingComponents = new Set((await listAll('components', 'components')).map((item) => item.name));
for (const component of components) {
  if (existingComponents.has(component.name)) continue;
  await request('POST', 'components/', { component });
  console.log(`Created content type: ${component.name}`);
}

const existingStories = new Map((await listAll('stories', 'stories')).map((item) => [item.full_slug, item]));
for (const fullSlug of ['ru', 'news', 'ru/news', 'site-pages', 'site-pages/en', 'site-pages/ru']) {
  if (existingStories.has(fullSlug)) continue;
  const segments = fullSlug.split('/');
  const parentSlug = segments.slice(0, -1).join('/');
  const parentId = parentSlug ? existingStories.get(parentSlug)?.id : 0;
  if (parentId == null) throw new Error(`Missing parent folder: ${parentSlug}`);
  const { story } = await request('POST', 'stories', {
    story: { is_folder: true, name: segments.at(-1), slug: segments.at(-1), parent_id: parentId },
  });
  existingStories.set(fullSlug, story);
  console.log(`Created folder: ${fullSlug}`);
}

for (const draft of stories) {
  if (existingStories.has(draft.fullSlug)) {
    console.log(`Kept existing story: ${draft.fullSlug}`);
    continue;
  }
  const segments = draft.fullSlug.split('/');
  const parentSlug = segments.slice(0, -1).join('/');
  const parentId = parentSlug ? existingStories.get(parentSlug)?.id : 0;
  if (parentId == null) throw new Error(`Missing parent folder: ${parentSlug}`);
  const { story } = await request('POST', 'stories', { publish: false, story: {
    name: draft.name, slug: segments.at(-1), parent_id: parentId,
    path: draft.path, content: draft.content,
  } });
  existingStories.set(draft.fullSlug, story);
  console.log(`Created draft: ${draft.fullSlug}`);
  await new Promise((resolve) => setTimeout(resolve, 220));
}

console.log('Storyblok import finished. Review drafts in the editor before publishing.');
