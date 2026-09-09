import { cp, mkdir, rm, copyFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const dist = new URL('../dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyFile(new URL('../index.html', import.meta.url), new URL('../dist/index.html', import.meta.url));
await cp(new URL('../src', import.meta.url), new URL('../dist/src', import.meta.url), { recursive: true });
await cp(new URL('../public', import.meta.url), dist, { recursive: true });
if (existsSync(new URL('../.nojekyll', import.meta.url))) await copyFile(new URL('../.nojekyll', import.meta.url), new URL('../dist/.nojekyll', import.meta.url));
const rawSite = (process.env.SITE_URL || '').trim();
if (rawSite) {
  const site = rawSite.endsWith('/') ? rawSite : rawSite + '/';
  const indexUrl = new URL('../dist/index.html', import.meta.url);
  let html = await readFile(indexUrl, 'utf8');
  html = html.replace('<meta property="og:type" content="website" />', `<meta property="og:type" content="website" />\n  <meta property="og:url" content="${site}" />\n  <link rel="canonical" href="${site}" />`)
             .replaceAll('content="./og-image.png"', `content="${site}og-image.png"`);
  await writeFile(indexUrl, html);
  await writeFile(new URL('../dist/sitemap.xml', import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site}</loc></url></urlset>\n`);
}
console.log(`Built static site to dist/${rawSite ? ' with canonical metadata' : ''}`);
