import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = loadEnv('', root, 'STORYBLOK_');
const region = env.STORYBLOK_REGION || 'eu';
const contentEndpoints = {
  eu: 'https://api.storyblok.com/v2/cdn',
  us: 'https://api-us.storyblok.com/v2/cdn',
  ca: 'https://api-ca.storyblok.com/v2/cdn',
  ap: 'https://api-ap.storyblok.com/v2/cdn',
  cn: 'https://app.storyblokchina.cn/v2/cdn',
};
const managementEndpoints = {
  eu: 'https://mapi.storyblok.com/v1',
  us: 'https://api-us.storyblok.com/v1',
  ca: 'https://api-ca.storyblok.com/v1',
  ap: 'https://api-ap.storyblok.com/v1',
  cn: 'https://app.storyblokchina.cn/v1',
};
if (!contentEndpoints[region]) throw new Error(`Unsupported Storyblok region: ${region}`);
if (!/^\d+$/.test(env.STORYBLOK_SPACE_ID || '')) throw new Error('Set STORYBLOK_SPACE_ID in .env');

async function check(name, url, headers) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log(`${name}: OK`);
    return true;
  } catch (error) {
    console.error(`${name}: ${error.message}`);
    return false;
  }
}

let good = true;
for (const [name, token] of [
  ['Public token', env.STORYBLOK_PUBLIC_TOKEN],
  ['Preview token', env.STORYBLOK_PREVIEW_TOKEN],
]) {
  if (!token) {
    console.error(`${name}: missing from .env`);
    good = false;
    continue;
  }
  const url = new URL(`${contentEndpoints[region]}/spaces/me`);
  url.searchParams.set('token', token);
  good = await check(name, url) && good;
}

if (!env.STORYBLOK_MANAGEMENT_TOKEN) {
  console.error('Personal access token: missing from .env');
  good = false;
} else {
  good = await check('Personal access token',
    `${managementEndpoints[region]}/spaces/${env.STORYBLOK_SPACE_ID}/components?per_page=1`,
    { Authorization: env.STORYBLOK_MANAGEMENT_TOKEN }) && good;
}

if (!good) process.exitCode = 1;
