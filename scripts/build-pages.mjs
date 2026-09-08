import { spawnSync } from 'node:child_process';
import { readFile, writeFile, access, rename, rm } from 'node:fs/promises';

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
const privateReportsUrl = process.env.NEXT_PUBLIC_PRIVATE_REPORTS_URL || '';
if (privateReportsUrl) {
  const url = new URL(privateReportsUrl);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Private Reports must link to an HTTPS login/report URL without embedded credentials.');
  }
}
if (basePath && !/^\/[A-Za-z0-9._-]+$/.test(basePath)) {
  throw new Error('NEXT_PUBLIC_BASE_PATH must be empty or a single /repository-name path.');
}
const buildEnv = { ...process.env, STATIC_EXPORT: '1', NEXT_PUBLIC_BASE_PATH: basePath };
delete buildEnv.FINNHUB_API_KEY;
const result = spawnSync(process.execPath, ['node_modules/vinext/dist/cli.js', 'build'], {
  stdio: 'inherit', env: buildEnv,
});
if (result.status !== 0) process.exit(result.status ?? 1);
// Vinext nests assets under assetPrefix on disk. Pages already mounts the
// artifact at basePath, so remove that extra filesystem prefix, not URL prefixes.
if (basePath) {
  await rename(`dist/client${basePath}/_next`, 'dist/client/_next');
  await rm(`dist/client${basePath}`, { recursive: true });
}
const html = await readFile('dist/client/index.html', 'utf8');
if (!html.includes('<html')) throw new Error('Static export did not emit an HTML page.');
for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (!url.startsWith('/')) continue;
  // These are preserved by the reports repository's site-assembly step.
  if (process.env.NEXT_PUBLIC_BAYBELL_HOME === '1' &&
      ['/daily-finance/', '/weekly-finance/', '/guru-position/'].includes(url)) continue;
  if (!url.startsWith(`${basePath}/`)) throw new Error(`Asset outside Pages base path: ${url}`);
  await access(`dist/client/${url.slice(basePath.length + 1).split('?')[0]}`);
}
await access('dist/client/data/market.json');
await writeFile('dist/client/.nojekyll', '');
console.log(`GitHub Pages artifact ready: dist/client (base path: ${basePath || '/'}).`);
