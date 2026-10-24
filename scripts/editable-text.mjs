import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parse, serialize } from 'parse5';

const excluded = new Set(['script', 'style', 'noscript', 'template', 'svg', 'textarea', 'option']);
const markerPrefix = 'ng-edit:';

export function pagePath(root, filename) {
  const path = relative(root, filename).split(sep).join('/');
  if (path === 'index.html') return '/';
  if (!path.endsWith('/index.html')) throw new Error(`Not a page: ${filename}`);
  return `/${path.slice(0, -'index.html'.length)}`;
}

export function editKey(path, index, original) {
  const hash = createHash('sha256').update(original.trim()).digest('hex').slice(0, 12);
  return `${path}::${index}:${hash}`;
}

export function visitEditableText(document, path, callback) {
  const body = findBody(document);
  if (!body) throw new Error(`HTML body missing: ${path}`);
  let index = 0;
  function walk(node, skip = false) {
    const attrs = node.attrs || [];
    const hidden = attrs.some((attr) =>
      (attr.name === 'aria-hidden' && attr.value === 'true') || attr.name === 'data-no-edit');
    const blocked = skip || excluded.has(node.tagName) || hidden;
    for (const child of [...(node.childNodes || [])]) {
      if (child.nodeName === '#text') {
        if (blocked || !/[\p{L}\p{N}]/u.test(child.value)) continue;
        callback({ node: child, parent: node, key: editKey(path, index++, child.value) });
      } else if (child.nodeName !== '#comment') {
        walk(child, blocked);
      }
    }
  }
  walk(body);
  return index;
}

function findBody(node) {
  if (node.tagName === 'body') return node;
  for (const child of node.childNodes || []) {
    const found = findBody(child);
    if (found) return found;
  }
  return null;
}

export function markHtml(html, path, manifest = {}) {
  const document = parse(html);
  const marked = [];
  visitEditableText(document, path, ({ node, parent, key }) => {
    const at = parent.childNodes.indexOf(node);
    const comment = { nodeName: '#comment', data: `${markerPrefix}${key}`, parentNode: parent };
    parent.childNodes.splice(at, 0, comment);
    if (Object.hasOwn(manifest, key) && typeof manifest[key] === 'string') node.value = manifest[key];
    marked.push(key);
  });
  return { html: serialize(document), keys: marked };
}

export function replaceMarkedText(html, key, value) {
  const document = parse(html);
  let replaced = false;
  let previous = null;
  function walk(node) {
    const children = node.childNodes || [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeName === '#comment' && child.data === `${markerPrefix}${key}`) {
        const next = children[i + 1];
        if (next?.nodeName !== '#text') throw new Error('Text marker has no text node');
        previous = next.value;
        next.value = value;
        replaced = true;
        return;
      }
      walk(child);
      if (replaced) return;
    }
  }
  walk(document);
  return replaced ? { html: serialize(document), previous } : null;
}

export async function htmlPages(root) {
  const pages = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.name === 'index.html') pages.push(file);
    }
  }
  await visit(root);
  return pages;
}

export async function markSite(root, manifest = {}) {
  let pages = 0;
  let slots = 0;
  for (const filename of await htmlPages(root)) {
    const path = pagePath(root, filename);
    const result = markHtml(await readFile(filename, 'utf8'), path, manifest);
    await writeFile(filename, result.html);
    pages++;
    slots += result.keys.length;
  }
  return { pages, slots };
}
