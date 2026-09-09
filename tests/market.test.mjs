import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeQuote, fetchQuote, updateMarketData } from '../scripts/fetch-finnhub-data.mjs';
import { parseMarketPayload, snapshotIsStale } from '../lib/market.ts';

const quote = { c: 120, d: 0, dp: 0, t: 1788800000 };
const sleep = async () => {};

test('zero movement is valid; unavailable quotes and malformed numbers are rejected', () => {
  assert.equal(normalizeQuote('AAPL', quote).change, 0);
  for (const bad of [{}, { error: 'access denied' }, { ...quote, c: 0 }, { ...quote, d: null }, { ...quote, dp: NaN }, { ...quote, t: 0 }]) {
    assert.throws(() => normalizeQuote('AAPL', bad));
  }
});

test('rate limit retries, keeping the token out of the URL', async () => {
  let calls = 0;
  const waits = [];
  const actual = await fetchQuote('AAPL', 'test-secret', {
    sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async (url, options) => {
      assert.equal(url.searchParams.has('token'), false);
      assert.equal(options.headers['X-Finnhub-Token'], 'test-secret');
      calls += 1;
      return calls === 1 ? new Response('', { status: 429 }) : Response.json(quote);
    },
  });
  assert.equal(actual.price, 120);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [60000]);
});

test('authentication errors fail without retries or secret-bearing provider messages', async () => {
  let calls = 0;
  await assert.rejects(fetchQuote('AAPL', 'test-secret', {
    sleep, fetchImpl: async () => { calls += 1; return new Response('test-secret', { status: 401 }); },
  }), (error) => error.message.includes('401') && !error.message.includes('test-secret'));
  assert.equal(calls, 1);
});

test('failed refresh preserves the previous file; success writes only verified data and deduplicates requests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-quotes-'));
  const outputDir = pathToFileURL(`${dir}/`);
  const path = join(dir, 'market.json');
  const watchlist = [{ name: 'One', symbols: ['AAPL'] }, { name: 'Two', symbols: ['AAPL', 'MSFT'] }];
  const indexes = [{ symbol: '^GSPC', label: 'S&P 500' }];
  try {
    await writeFile(path, 'previous successful snapshot');
    await assert.rejects(updateMarketData({ apiKey: '', outputDir, watchlist, indexes }));
    let count = 0;
    await assert.rejects(updateMarketData({ apiKey: 'test-key', outputDir, watchlist, indexes, sleep,
      fetchImpl: async () => Response.json(++count === 1 ? quote : { c: 0 }),
    }));
    assert.equal(await readFile(path, 'utf8'), 'previous successful snapshot');
    count = 0;
    const payload = await updateMarketData({ apiKey: 'test-key', outputDir, watchlist, indexes, sleep,
      fetchImpl: async () => { count += 1; return Response.json(quote); },
    });
    assert.equal(count, 3);
    assert.equal(payload.provider, 'finnhub');
    assert.deepEqual(payload.indexes.map((item) => item.symbol), ['^GSPC']);
    assert.deepEqual(parseMarketPayload(JSON.parse(await readFile(path, 'utf8'))), payload);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('client rejects mock and malformed snapshots; freshness uses fetch time, not last-trade time', () => {
  const payload = { provider: 'finnhub', generatedAt: '2026-09-07T15:00:00Z', indexes: [normalizeQuote('^GSPC', quote)], categories: [{ name: 'One', quotes: [normalizeQuote('AAPL', quote)] }] };
  assert.equal(parseMarketPayload(payload), payload);
  assert.throws(() => parseMarketPayload({ ...payload, provider: 'mock' }));
  assert.throws(() => parseMarketPayload({ ...payload, categories: [{ name: 'One', quotes: [{}] }] }));
  assert.equal(snapshotIsStale(payload.generatedAt, Date.parse('2026-09-07T16:00:00Z')), false);
  assert.equal(snapshotIsStale(payload.generatedAt, Date.parse('2026-09-07T18:00:00Z')), true);
});
