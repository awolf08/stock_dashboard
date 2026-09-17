import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { generateDailyMarketSummary } from '../scripts/generate-daily-market-summary.mjs';
import { generateDailyFinance } from '../scripts/generate-daily-finance.mjs';
import { generateDailyMarketArticle } from '../scripts/generate-daily-market-article.mjs';

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
  await generateDailyFinance({
    outputUrl: pathToFileURL(outputPath),
    chatGptMarkdown: '# 2026-09-16 美股收盘总结\n\n## 盘后总结\n\n今天市场围绕 **Fed** 和科技股重新定价。\n\n- SPX 继续测试关键位\n- QQQ 观察资金流向',
  });
  const html = await readFile(outputPath, 'utf8');
  assert.match(html, /Daily Market Summary/);
  assert.match(html, /结构化收盘数据/);
  assert.match(html, /daily-market-summary\.json/);
  assert.match(html, /daily-market-article\.json/);
  assert.match(html, /每日盘后总结/);
  assert.match(html, /FinanceDailyReport · ChatGPT\/latest\.md/);
  assert.match(html, /2026-09-16 美股收盘总结/);
});


test('generateDailyMarketArticle writes Chinese article JSON with template fallback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'daily-article-'));
  const summaryPath = join(dir, 'daily-market-summary.json');
  const outputPath = join(dir, 'daily-market-article.json');
  await writeFile(summaryPath, JSON.stringify({
    schemaVersion: 1,
    generatedAt: '2026-09-15T21:05:00.000Z',
    marketDataGeneratedAt: '2026-09-15T21:00:00.000Z',
    date: '2026-09-15',
    title: '9月15日美股收盘：偏弱，半导体止跌',
    bias: '偏弱，风险控制优先',
    indices: {
      SPX: { price: 7614, change: -6, percent: -0.08 },
      QQQ: { price: 708, change: -2, percent: -0.28 },
      IWM: { price: 239, change: -1.8, percent: -0.75 },
      SMH: { price: 340, change: 4, percent: 1.2 },
    },
    market: { indexAverage: -0.5, breadth: 0.38 },
    sectors: {
      strongest: { name: 'Semiconductors', average: 1.3, gainers: 4, count: 5 },
      weakest: { name: 'Cloud & Infra', average: -1.5, gainers: 1, count: 5 },
    },
    movers: {
      top: [{ symbol: 'NVDA', percent: 0.96, group: 'Semiconductors' }],
      weak: [{ symbol: 'SNOW', percent: -2.3, group: 'Cloud & Infra' }],
    },
    levels: {
      SPX: { support: [7600, 7570, 7550], resistance: [7630, 7650, 7700] },
      QQQ: { support: [705, 700], resistance: [715, 720] },
      ES: { support: [7600, 7580], resistance: [7630, 7650] },
    },
    tomorrow: ['看 SPX 是否守住 7600。'],
    scenarios: [{ label: '🟡 中性', text: '继续震荡。' }],
  }));

  const article = await generateDailyMarketArticle({
    summaryUrl: pathToFileURL(summaryPath),
    outputUrl: pathToFileURL(outputPath),
  });

  assert.equal(article.provider, 'template');
  assert.match(article.markdown, /为什么今天市场这样走/);
  assert.match(article.markdown, /SPX/);
  assert.equal(JSON.parse(await readFile(outputPath, 'utf8')).schemaVersion, 1);
});
