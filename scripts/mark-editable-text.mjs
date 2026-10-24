import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { markSite } from './editable-text.mjs';

const root = resolve(import.meta.dirname, '..');
const manifestFile = process.env.EDITOR_TEXT_MANIFEST_PATH || resolve(root, 'public/assets/editor/text.json');
let manifest = {};
try { manifest = JSON.parse(await readFile(manifestFile, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const result = await markSite(resolve(root, 'dist'), manifest);
console.log(`Marked ${result.slots} editable text segments across ${result.pages} pages`);
