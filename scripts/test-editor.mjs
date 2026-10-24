import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import { markHtml } from './editable-text.mjs';

const scratch = await mkdtemp(join(tmpdir(), 'ng-editor-'));
const site = join(scratch, 'site');
const data = join(scratch, 'data');
const port = 40000 + randomBytes(2).readUInt16BE() % 20000;
const url = `http://127.0.0.1:${port}`;
const origin = `https://127.0.0.1:${port}`;
const password = randomBytes(16).toString('hex');
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex');
const original = '<!doctype html><html><body><h1>Original heading</h1><img src="/old.webp"></body></html>';
const marked = markHtml(original, '/ru/');
const key = marked.keys[0];
await mkdir(join(site, 'ru'), { recursive: true });
await writeFile(join(site, 'ru/index.html'), marked.html);

const child = spawn(process.execPath, ['scripts/editor-server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    EDITOR_MODE: 'remote',
    EDITOR_PORT: String(port),
    EDITOR_SITE_ROOTS: site,
    EDITOR_DATA_DIR: data,
    EDITOR_ALLOWED_ORIGINS: origin,
    EDITOR_PASSWORD_HASH: `${salt}:${hash}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk; });

try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) throw new Error(stderr || `Editor exited: ${child.exitCode}`);
    try { await fetch(`${url}/api/editor/session`); ready = true; break; }
    catch { await delay(100); }
  }
  assert.ok(ready, 'Editor server did not start');
  const unauthorized = await fetch(`${url}/api/editor/text`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, previous: 'Original heading', text: 'Edited heading' }),
  });
  assert.equal(unauthorized.status, 401);
  const wrongOrigin = await fetch(`${url}/api/editor/login`, {
    method: 'POST', headers: { Origin: 'https://elsewhere.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  assert.equal(wrongOrigin.status, 403);
  const login = await fetch(`${url}/api/editor/login`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const { csrf } = await login.json();
  assert.ok(csrf);
  const missingCsrf = await fetch(`${url}/api/editor/text`, {
    method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, previous: 'Original heading', text: 'Edited heading' }),
  });
  assert.equal(missingCsrf.status, 403);
  const text = await fetch(`${url}/api/editor/text`, {
    method: 'POST', headers: { Origin: origin, Cookie: cookie, 'X-Editor-CSRF': csrf, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, previous: 'Original heading', text: 'Edited heading' }),
  });
  assert.equal(text.status, 200, await text.text());
  assert.match(await readFile(join(site, 'ru/index.html'), 'utf8'), /Edited heading/);
  const conflict = await fetch(`${url}/api/editor/text`, {
    method: 'POST', headers: { Origin: origin, Cookie: cookie, 'X-Editor-CSRF': csrf, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, previous: 'Original heading', text: 'Other heading' }),
  });
  assert.equal(conflict.status, 409);
  const bytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#ef3038' } }).webp().toBuffer();
  const image = await fetch(`${url}/api/editor/images?key=%2Fru%3A%3A0`, {
    method: 'POST', headers: { Origin: origin, Cookie: cookie, 'X-Editor-CSRF': csrf, 'Content-Type': 'image/webp' },
    body: bytes,
  });
  assert.equal(image.status, 200, await image.text());
  const manifest = JSON.parse(await readFile(join(data, 'manifest.json'), 'utf8'));
  assert.ok(manifest['/ru::0'].url.startsWith('/assets/editor/'));
  console.log('Editor API: auth, origin, CSRF, text, conflict and image checks passed');
} finally {
  child.kill();
  await rm(scratch, { recursive: true, force: true });
}
