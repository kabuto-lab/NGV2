import { defineConfig } from 'astro/config';
import { storyblok } from '@storyblok/astro';
import { loadEnv } from 'vite';

const env = loadEnv('', process.cwd(), 'STORYBLOK_');
const preview = env.STORYBLOK_PREVIEW_MODE === '1';
const token = preview ? env.STORYBLOK_PREVIEW_TOKEN : env.STORYBLOK_PUBLIC_TOKEN;

export default defineConfig({
  output: 'static',
  build: { format: 'directory' },
  integrations: token ? [storyblok({
    accessToken: token,
    apiOptions: { region: env.STORYBLOK_REGION || 'eu' },
    bridge: preview,
    livePreview: false
  })] : []
});
