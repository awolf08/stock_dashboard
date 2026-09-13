import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateWeeklyFinance } from '../scripts/generate-weekly-finance.mjs';

test('weekly finance page is generated from market and earnings data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'weekly-finance-'));
  try {
    const marketPath = join(dir, 'market.json');
    const eventsPath = join(dir, 'events.json');
    const outputPath = join(dir, 'index.html');
    await writeFile(marketPath, JSON.stringify({
      provider: 'finnhub',
      generatedAt: '2026-09-13T12:00:00.000Z',
      indexes: [
        { symbol: '^GSPC', label: 'S&P 500', price: 6000, change: 30, percent: 0.5 },
        { symbol: '^IXIC', label: 'Nasdaq', price: 19000, change: 190, percent: 1 },
      ],
      categories: [
        { name: 'INDEX ETF', quotes: [
          { symbol: 'SPY', price: 600, change: 3, percent: 0.5 },
          { symbol: 'QQQ', price: 520, change: 6, percent: 1.16 },
        ] },
        { name: 'Cloud & Infra', quotes: [
          { symbol: 'ORCL', price: 250, change: 5, percent: 2 },
          { symbol: 'MSFT', price: 500, change: -5, percent: -1 },
        ] },
      ],
    }));
    await writeFile(eventsPath, JSON.stringify({
      provider: 'finnhub',
      generatedAt: '2026-09-13T12:05:00.000Z',
      earnings: [
        { symbol: 'ORCL', date: '2026-09-14', timeLabel: 'After Close', impact: 'High', watchlistMatch: true },
      ],
    }));
    const summary = await generateWeeklyFinance({
      marketUrl: pathToFileURL(marketPath),
      eventsUrl: pathToFileURL(eventsPath),
      outputUrl: pathToFileURL(outputPath),
    });
    const html = await readFile(outputPath, 'utf8');
    assert.equal(summary.quoteCount, 6);
    assert.equal(summary.earningsCount, 1);
    assert.match(html, /Weekly Finance · Real Data/);
    assert.match(html, /S&amp;P 500/);
    assert.match(html, /ORCL/);
    assert.match(html, /After Close/);
    assert.doesNotMatch(html, /State the weekly bias/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
