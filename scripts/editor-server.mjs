import { createServer } from 'node:http';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { replaceMarkedText } from './editable-text.mjs';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const roots = (process.env.EDITOR_SITE_ROOTS || join(project, 'dist')).split(';').map((path) => resolve(path));
const dataDir = resolve(process.env.EDITOR_DATA_DIR || join(project, 'public/assets/editor'));
const port = Number(process.env.EDITOR_PORT || 4321);
const remote = process.env.EDITOR_MODE === 'remote';
const host = remote ? '127.0.0.1' : '::1';
const origins = new Set((process.env.EDITOR_ALLOWED_ORIGINS ||
  `http://localhost:${port},http://127.0.0.1:${port},http://[::1]:${port}`).split(',').map((value) => value.trim()));
const hosts = new Set([...origins].map((origin) => new URL(origin).host));
const passwordRecord = process.env.EDITOR_PASSWORD_HASH || '';
if (remote && (!passwordRecord || [...origins].some((origin) => !origin.startsWith('https://')))) {
  throw new Error('Remote editor requires EDITOR_PASSWORD_HASH and HTTPS origins');
}
const sessions = new Map();
const attempts = new Map();
const sessionAge = 8 * 60 * 60 * 1000;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
let saveQueue = Promise.resolve();

function respond(res, status, data, headers = {}) {
  const json = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(json), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(json);
}

async function body(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function jsonBody(req, limit = 16 * 1024) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON required'), { status: 415 });
  const raw = await body(req, limit);
  try { return JSON.parse(raw.toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function sessionFor(req) {
  if (!remote) return { csrf: 'local' };
  const id = /(?:^|;\s*)ng_editor_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  const session = id && sessions.get(id);
  if (!session) return null;
  if (session.until < Date.now()) { sessions.delete(id); return null; }
  return session;
}

function requireEditor(req) {
  const session = sessionFor(req);
  if (!session) throw Object.assign(new Error('Login required'), { status: 401 });
  if (req.headers['x-editor-csrf'] !== session.csrf) throw Object.assign(new Error('Invalid session token'), { status: 403 });
}

function verifyPassword(password) {
  const [salt, hash] = passwordRecord.split(':');
  if (!salt || !/^[a-f0-9]{128}$/.test(hash || '')) return false;
  const candidate = scryptSync(password, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

async function writeAtomic(file, content) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, file);
}

async function readManifest(file) {
  try {
    const data = JSON.parse(await readFile(file, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function saveImage(key, raw) {
  if (!/^\/[a-z0-9/-]*::\d+(?:::[a-z0-9-]+)?$/.test(key) || key.includes('//')) throw Object.assign(new Error('Invalid image slot'), { status: 400 });
  if (raw.length < 16 || raw.toString('ascii', 0, 4) !== 'RIFF' || raw.toString('ascii', 8, 12) !== 'WEBP') throw Object.assign(new Error('WebP required'), { status: 415 });
  const image = sharp(raw, { limitInputPixels: 25_000_000 });
  const metadata = await image.metadata();
  if (metadata.format !== 'webp' || !metadata.width || !metadata.height) throw Object.assign(new Error('Invalid image'), { status: 415 });
  const bytes = await image.webp({ quality: 90 }).toBuffer();
  const filename = `${createHash('sha256').update(key).digest('hex').slice(0, 24)}.webp`;
  const url = `/assets/editor/${filename}?v=${Date.now()}`;
  const manifestFile = join(dataDir, 'manifest.json');
  const manifest = await readManifest(manifestFile);
  manifest[key] = { url, updatedAt: new Date().toISOString() };
  await writeAtomic(join(dataDir, filename), bytes);
  await writeAtomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  for (const root of roots) {
    await writeAtomic(join(root, 'assets/editor', filename), bytes);
    await writeAtomic(join(root, 'assets/editor/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
  return url;
}

function pageFile(root, path) {
  if (!/^\/(?:[a-z0-9-]+\/)*$/.test(path)) throw Object.assign(new Error('Invalid page path'), { status: 400 });
  const file = resolve(root, `.${path}index.html`);
  const rel = relative(root, file);
  if (rel.startsWith(`..${sep}`) || rel === '..' || rel.startsWith(sep)) throw Object.assign(new Error('Invalid page path'), { status: 400 });
  return file;
}

async function saveText(key, previous, value) {
  const match = /^(\/(?:[a-z0-9-]+\/)*)::\d+:[a-f0-9]{12}$/.exec(key);
  if (!match || typeof value !== 'string' || typeof previous !== 'string' || !value.trim() || value.length > 10_000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)) {
    throw Object.assign(new Error('Invalid text edit'), { status: 400 });
  }
  const changes = [];
  for (const root of roots) {
    const file = pageFile(root, match[1]);
    const updated = replaceMarkedText(await readFile(file, 'utf8'), key, value);
    if (!updated) throw Object.assign(new Error('Text slot no longer exists; reload the page'), { status: 409 });
    if (updated.previous !== previous) throw Object.assign(new Error('This text changed; reload the page'), { status: 409 });
    changes.push({ file, html: updated.html });
  }
  for (const change of changes) await writeAtomic(change.file, change.html);
  const manifestFile = join(dataDir, 'text.json');
  const manifest = await readManifest(manifestFile);
  manifest[key] = value;
  await writeAtomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return value;
}

async function staticFile(req, res, url) {
  if (remote) return respond(res, 404, { error: 'Not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return respond(res, 405, { error: 'Method not allowed' });
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return respond(res, 400, { error: 'Invalid URL' }); }
  const file = resolve(roots[0], `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
  const rel = relative(roots[0], file);
  if (rel.startsWith(`..${sep}`) || rel === '..' || rel.startsWith(sep)) return respond(res, 403, { error: 'Forbidden' });
  let info;
  try { info = await stat(file); } catch { return respond(res, 404, { error: 'Not found' }); }
  if (!info.isFile()) return respond(res, 404, { error: 'Not found' });
  const bytes = req.method === 'HEAD' ? null : await readFile(file);
  res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': file.endsWith('manifest.json') ? 'no-store' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.end(bytes);
}

const server = createServer(async (req, res) => {
  try {
    if (!hosts.has(req.headers.host)) return respond(res, 403, { error: 'Invalid host' });
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'POST' && !origins.has(req.headers.origin)) return respond(res, 403, { error: 'Invalid origin' });
    if (url.pathname === '/api/editor/session' && req.method === 'GET') {
      const session = sessionFor(req);
      return respond(res, 200, { authenticated: !!session, csrf: session?.csrf || null });
    }
    if (url.pathname === '/api/editor/login' && req.method === 'POST') {
      if (!remote) return respond(res, 200, { authenticated: true, csrf: 'local' });
      const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '').slice(0, 100);
      const record = attempts.get(ip) || { count: 0, until: Date.now() + 10 * 60_000 };
      if (record.until < Date.now()) { record.count = 0; record.until = Date.now() + 10 * 60_000; }
      if (record.count >= 5) return respond(res, 429, { error: 'Too many attempts; retry later' });
      const { password } = await jsonBody(req, 4096);
      if (typeof password !== 'string' || !verifyPassword(password)) {
        record.count++;
        attempts.set(ip, record);
        return respond(res, 401, { error: 'Incorrect password' });
      }
      attempts.delete(ip);
      const id = randomBytes(32).toString('hex');
      const csrf = randomBytes(24).toString('hex');
      sessions.set(id, { csrf, until: Date.now() + sessionAge });
      return respond(res, 200, { authenticated: true, csrf }, { 'Set-Cookie': `ng_editor_session=${id}; HttpOnly; Secure; SameSite=Strict; Path=/api/editor; Max-Age=${sessionAge / 1000}` });
    }
    if (url.pathname === '/api/editor/logout' && req.method === 'POST') {
      requireEditor(req);
      const id = /(?:^|;\s*)ng_editor_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      if (id) sessions.delete(id);
      return respond(res, 200, { ok: true }, { 'Set-Cookie': 'ng_editor_session=; HttpOnly; Secure; SameSite=Strict; Path=/api/editor; Max-Age=0' });
    }
    if (url.pathname === '/api/editor/images' && req.method === 'POST') {
      requireEditor(req);
      if (req.headers['content-type'] !== 'image/webp') return respond(res, 415, { error: 'WebP required' });
      const key = url.searchParams.get('key') || '';
      const raw = await body(req, 20 * 1024 * 1024);
      const task = saveQueue.then(() => saveImage(key, raw));
      saveQueue = task.catch(() => {});
      return respond(res, 200, { url: await task });
    }
    if (url.pathname === '/api/editor/text' && req.method === 'POST') {
      requireEditor(req);
      const { key, previous, text } = await jsonBody(req);
      const task = saveQueue.then(() => saveText(key, previous, text));
      saveQueue = task.catch(() => {});
      return respond(res, 200, { text: await task });
    }
    if (url.pathname.startsWith('/api/editor/')) return respond(res, 404, { error: 'Not found' });
    await staticFile(req, res, url);
  } catch (error) {
    console.error(error);
    respond(res, error.status || 500, { error: error.status ? error.message : 'Server error' });
  }
});

server.listen(port, host, () => console.log(`Next Genium editor: ${remote ? 'remote API' : `http://localhost:${port}/ru/`}`));
