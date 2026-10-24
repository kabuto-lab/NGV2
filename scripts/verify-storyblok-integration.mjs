import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const astroCli = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/stories') {
    const stories = url.searchParams.get('content_type') === 'site_page' ? [{
      full_slug: 'site-pages/en/about',
      content: {
        _uid: 'cms-about', component: 'site_page', route: 'about',
        title: 'CMS About', summary: 'This page is editable in Storyblok.',
        body: [{ _uid: 'cms-about-paragraph', component: 'content_paragraph', text: 'Edited page body from the mock CMS.' }],
      },
    }] : [{
      full_slug: 'news/cms-integration-check',
      content: {
        _uid: 'cms-integration-check', component: 'news_article',
        title: 'CMS integration check', summary: 'A new article from Storyblok.',
        body: [{ _uid: 'cms-paragraph', component: 'content_paragraph', text: 'Published from the mock CMS.' }],
      },
    }];
    response.end(JSON.stringify({ stories }));
  } else if (url.pathname === '/stories/site-home') {
    response.end(JSON.stringify({ story: { content: {
      _uid: 'cms-home', component: 'home_page', h1a: 'CMS TEST',
    } } }));
  } else {
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'Not found' }));
  }
});

function build(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [astroCli, 'build'], {
      cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(output) : reject(new Error(output)));
  });
}

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const output = await build({
    STORYBLOK_PUBLIC_TOKEN: 'local-test-token',
    STORYBLOK_API_BASE_URL: `http://127.0.0.1:${port}`,
    STORYBLOK_PREVIEW_MODE: '0',
  });
  assert.match(output, /61 page\(s\) built/);
  assert.match(readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8'), /CMS TEST/);
  const article = new URL('../dist/news/cms-integration-check/index.html', import.meta.url);
  assert.ok(existsSync(article));
  assert.match(readFileSync(article, 'utf8'), /Published from the mock CMS/);
  assert.match(readFileSync(new URL('../dist/about/index.html', import.meta.url), 'utf8'), /Edited page body from the mock CMS/);
  console.log('Storyblok build check passed: homepage, content page and new article route.');
} finally {
  server.close();
  await build({
    STORYBLOK_PUBLIC_TOKEN: '', STORYBLOK_PREVIEW_TOKEN: '',
    STORYBLOK_API_BASE_URL: '', STORYBLOK_PREVIEW_MODE: '0',
  });
}
