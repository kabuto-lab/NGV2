import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const publicEditor = join(root, 'public', 'assets', 'editor');
const distEditor = join(dist, 'assets', 'editor');
const port = 4321;
const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
let saveQueue = Promise.resolve();

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 20 * 1024 * 1024) throw Object.assign(new Error('Image exceeds 20 MB'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function saveImage(key, data) {
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 24);
  const filename = `${hash}.webp`;
  const version = Date.now();
  const url = `/assets/editor/${filename}?v=${version}`;
  const manifestFile = join(publicEditor, 'manifest.json');
  await mkdir(publicEditor, { recursive: true });
  await mkdir(distEditor, { recursive: true });
  let manifest = {};
  try { manifest = JSON.parse(await readFile(manifestFile, 'utf8')); } catch {}
  manifest[key] = { url, width: undefined, updatedAt: new Date().toISOString() };
  const contents = JSON.stringify(manifest, null, 2) + '\n';
  await writeFile(join(publicEditor, filename), data);
  await writeFile(join(distEditor, filename), data);
  const temporary = join(publicEditor, `manifest-${process.pid}.tmp`);
  await writeFile(temporary, contents);
  await rename(temporary, manifestFile);
  await writeFile(join(distEditor, 'manifest.json'), contents);
  return url;
}

const server = createServer(async (req, res) => {
  try {
    if (!origins.has(`http://${req.headers.host}`)) return send(res, 403, 'Invalid host');
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/editor/images') {
      if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
      if (!origins.has(req.headers.origin)) return send(res, 403, 'Invalid origin');
      if (req.headers['content-type'] !== 'image/webp') return send(res, 415, 'WebP required');
      const key = url.searchParams.get('key');
      if (!key || key.length > 512 || !key.includes('::')) return send(res, 400, 'Invalid image slot');
      const data = await readBody(req);
      if (data.length < 16 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') return send(res, 415, 'Invalid WebP image');
      const task = saveQueue.then(() => saveImage(key, data));
      saveQueue = task.catch(() => {});
      const imageUrl = await task;
      return send(res, 200, JSON.stringify({ url: imageUrl }), 'application/json; charset=utf-8');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Invalid URL'); }
    const file = resolve(dist, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
    const rel = relative(dist, file);
    if (rel.startsWith('..' + sep) || rel === '..' || rel.startsWith(sep)) return send(res, 403, 'Forbidden');
    let info;
    try { info = await stat(file); } catch { return send(res, 404, 'Not found'); }
    if (!info.isFile()) return send(res, 404, 'Not found');
    const data = req.method === 'HEAD' ? null : await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': file.endsWith('manifest.json') ? 'no-store' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch (error) {
    console.error(error);
    send(res, error.status || 500, error.status ? error.message : 'Server error');
  }
});

server.listen(port, '::1', () => console.log(`Next Genium image editor: http://localhost:${port}/ru/`));
