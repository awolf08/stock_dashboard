import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { generateDailyMarketSummary } from '../scripts/generate-daily-market-summary.mjs';
import { generateDailyFinance } from '../scripts/generate-daily-finance.mjs';

test('generateDailyMarketSummary creates structured close summary from market data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'daily-summary-'));
  const marketPath = join(dir, 'market.json');
  const outputPath = join(dir, 'daily-market-summary.json');
  await writeFile(marketPath, JSON.stringify({
    generatedAt: '2026-09-15T21:00:00.000Z',
    indexes: [
      { symbol: '^GSPC', label: 'S&P 500', price: 7614, change: -6, percent: -0.08 },
      { symbol: '^IXIC', label: 'Nasdaq', price: 22890, change: -70, percent: -0.3 },
      { symbol: '^DJI', label: 'Dow', price: 45800, change: -370, percent: -0.8 },
      { symbol: '^RUT', label: 'Russell 2000', price: 2410, change: -18, percent: -0.75 },
    ],
    categories: [
      { name: 'INDEX ETF', quotes: [
        { symbol: 'QQQ', price: 708, change: -2, percent: -0.28 },
        { symbol: 'IWM', price: 239, change: -1.8, percent: -0.75 },
        { symbol: 'SMH', price: 340, change: 4, percent: 1.2 },
      ] },
      { name: 'Semiconductors', quotes: [
        { symbol: 'NVDA', price: 212.98, change: 2.02, percent: 0.96 },
        { symbol: 'AMD', price: 165, change: 3.3, percent: 2.04 },
      ] },
      { name: 'Cloud & Infra', quotes: [
        { symbol: 'ORCL', price: 190, change: -3, percent: -1.55 },
        { symbol: 'SNOW', price: 210, change: -5, percent: -2.33 },
      ] },
    ],
  }));

  const summary = await generateDailyMarketSummary({
    marketUrl: pathToFileURL(marketPath),
    outputUrl: pathToFileURL(outputPath),
  });

  assert.equal(summary.date, '2026-09-15');
  assert.match(summary.title, /美股收盘/);
  assert.equal(summary.indices.SPX.price, 7614);
  assert.ok(summary.levels.SPX.support.length >= 3);
  assert.ok(summary.summary.some((item) => item.includes('S&P 500')));
  assert.equal(JSON.parse(await readFile(outputPath, 'utf8')).schemaVersion, 1);
});

test('generateDailyFinance renders the daily summary card', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'daily-finance-page-'));
  const outputPath = join(dir, 'index.html');
  await generateDailyFinance({ outputUrl: pathToFileURL(outputPath) });
  const html = await readFile(outputPath, 'utf8');
  assert.match(html, /Daily Market Summary/);
  assert.match(html, /收盘总结/);
  assert.match(html, /daily-market-summary\.json/);
});
