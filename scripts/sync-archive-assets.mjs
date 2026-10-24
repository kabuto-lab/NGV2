import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, '..', 'site', 'assets');
const destination = resolve(root, 'public', 'assets', 'archive');

const sourceExists = await stat(source).then((info) => info.isDirectory()).catch(() => false);
if (sourceExists) {
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
  console.log(`Synced archived images to ${destination}`);
} else {
  const bundledAssets = await readdir(destination).catch(() => []);
  if (bundledAssets.length === 0) {
    throw new Error(`Archived images are missing: ${source} and ${destination}`);
  }
  console.log(`Using bundled archived images in ${destination}`);
}
