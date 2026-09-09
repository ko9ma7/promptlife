import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  'github-upload-now.cmd',
  'scripts/github-bootstrap.ps1',
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
  const filePath = fileURLToPath(new URL(file, root));
  const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
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


const bootstrapPs = await readFile(new URL('scripts/github-bootstrap.ps1', root), 'utf8');
if (bootstrapPs.includes('\\"')) {
  throw new Error('PowerShell bootstrap contains backslash-escaped double quotes, which are invalid PowerShell string escapes.');
}
if (!bootstrapPs.includes('Local $Branch is anchored to origin/$Branch')) {
  throw new Error('PowerShell bootstrap is missing the remote-history anchoring guard.');
}
const uploadCmd = await readFile(new URL('github-upload-now.cmd', root), 'utf8');
if (!uploadCmd.includes('git reset --mixed "origin/%DEFAULT_BRANCH%"')) {
  throw new Error('Minimal Windows uploader is missing the safe remote-history anchor.');
}
if (uploadCmd.includes('powershell.exe')) {
  throw new Error('Minimal Windows uploader must remain PowerShell-free.');
}

console.log(`QA passed: ${required.length} required files + ${jsFiles.length} JavaScript syntax checks + metadata checks.`);
