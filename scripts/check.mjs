import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const required = [
  'index.html',
  'src/main.js',
  'src/styles.css',
  'src/rules/compiler.js',
  'src/scientist/analyzer.js',
  'src/simulation/engine.js',
  'public/favicon.ico',
  'public/favicon.svg',
  'public/favicon-32x32.png',
  'public/apple-touch-icon.png',
  'public/icon-192.png',
  'public/icon-512.png',
  'public/site.webmanifest',
  'public/og-image.png',
  'public/repo-preview.png',
  '.github/workflows/deploy.yml',
  'github-bootstrap.cmd',
  '.gitignore',
  '.gitattributes',
  'LICENSE',
  'README.md',
];

for (const file of required) {
  await access(new URL(file, root), constants.R_OK);
}

const jsFiles = [
  'src/main.js',
  'src/rules/compiler.js',
  'src/scientist/analyzer.js',
  'src/simulation/engine.js',
  'scripts/build.mjs',
  'scripts/dev.mjs',
  'scripts/check.mjs',
];
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', new URL(file, root).pathname], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Syntax check failed: ${file}\n${result.stderr}`);
  }
}

const html = await readFile(new URL('index.html', root), 'utf8');
const requiredMarkup = [
  '<title>PromptLife',
  'meta name="description"',
  'property="og:title"',
  'property="og:description"',
  'property="og:image"',
  'name="twitter:card"',
  'href="./favicon.ico"',
  'href="./site.webmanifest"',
];
for (const marker of requiredMarkup) {
  if (!html.includes(marker)) throw new Error(`Missing HTML metadata marker: ${marker}`);
}

console.log(`QA passed: ${required.length} required files + ${jsFiles.length} JavaScript syntax checks + metadata checks.`);
