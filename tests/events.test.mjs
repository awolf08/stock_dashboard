import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchMarketCaps, normalizeEarningsEvent, fetchEarningsCalendar, updateEventsData } from '../scripts/fetch-events-data.mjs';
import { compareEarningsMarketCap, formatMarketCap, parseEventsPayload } from '../lib/events.ts';

const sleep = async () => {};
const raw = { symbol: 'nvda', date: '2026-09-14', hour: 'amc', epsEstimate: 1.23, revenueEstimate: 42000000000 };

test('earnings events normalize session and watchlist impact', () => {
  const event = normalizeEarningsEvent(raw, new Set(['NVDA']));
  assert.equal(event.symbol, 'NVDA');
  assert.equal(event.session, 'after-close');
  assert.equal(event.timeLabel, 'After Close');
  assert.equal(event.impact, 'High');
  assert.equal(event.watchlistMatch, true);
  assert.throws(() => normalizeEarningsEvent({ ...raw, date: 'bad' }, new Set()));
});

test('earnings calendar request uses header token and retries rate limits', async () => {
  let calls = 0;
  const waits = [];
  const rows = await fetchEarningsCalendar({ apiKey: 'test-secret', from: '2026-09-14', to: '2026-09-21', sleep: async (ms) => waits.push(ms),
    fetchImpl: async (url, options) => {
      assert.equal(url.searchParams.has('token'), false);
      assert.equal(options.headers['X-Finnhub-Token'], 'test-secret');
      calls += 1;
      return calls === 1 ? new Response('', { status: 429 }) : Response.json({ earningsCalendar: [raw] });
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [60000]);
  assert.deepEqual(rows[0], raw);
});

test('events refresh writes only verified payloads', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-events-'));
  const outputDir = pathToFileURL(`${dir}/`);
  try {
    const payload = await updateEventsData({ apiKey: 'test-key', outputDir, now: new Date('2026-09-14T16:00:00Z'), sleep,
      watchlist: [{ name: 'AI', symbols: ['NVDA'] }],
      fetchImpl: async (url) => (typeof url === 'string' && url.includes('nasdaq.com')) ? Response.json({data:{rows:[{symbol:'NVDA',marketCap:'4,000,000,000,000'}]}}) : Response.json({ earningsCalendar: [raw, { ...raw }, { ...raw, symbol: 'AAPL', date: '2026-09-15', hour: 'bmo' }] }),
    });
    assert.equal(payload.range.from, '2026-09-14');
    assert.equal(payload.range.to, '2026-09-21');
    assert.deepEqual(payload.earnings.map((event) => event.symbol), ['NVDA', 'AAPL']);
    const written = parseEventsPayload(JSON.parse(await readFile(join(dir, 'events.json'), 'utf8')));
    assert.equal(written.earnings.length, 2);
    assert.equal(written.earnings[0].marketCap, 4e12);
    assert.equal(written.earnings[1].marketCap, undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('client rejects malformed event payloads', () => {
  const payload = { schemaVersion: 1, provider: 'finnhub', generatedAt: '2026-09-14T16:00:00Z', range: { from: '2026-09-14', to: '2026-09-21' }, earnings: [normalizeEarningsEvent(raw, new Set())] };
  assert.equal(parseEventsPayload(payload), payload);
  assert.throws(() => parseEventsPayload({ ...payload, provider: 'mock' }));
  assert.throws(() => parseEventsPayload({ ...payload, earnings: [{ symbol: 'NVDA' }] }));
});

test('market cap sorting ranks largest first and unknown last without changing input', () => {
  const base = normalizeEarningsEvent(raw, new Set());
  const events = [{ ...base, symbol: 'UNKNOWN' }, { ...base, symbol: 'SMALL', marketCap: 1e9 }, { ...base, symbol: 'BIG', date: '2026-09-20', marketCap: 3e12 }];
  assert.deepEqual([...events].sort(compareEarningsMarketCap).map(e => e.symbol), ['BIG', 'SMALL', 'UNKNOWN']);
  assert.equal(events[0].symbol, 'UNKNOWN');
  assert.equal(formatMarketCap(3e12), 'Cap $3T');
  assert.equal(formatMarketCap(), 'Market cap unavailable');
});

test('bulk market caps discard missing, zero and invalid values', async () => {
  const caps = await fetchMarketCaps({fetchImpl: async () => Response.json({data:{rows:[
    {symbol:'A',marketCap:'$1,000,000'}, {symbol:'B',marketCap:'N/A'}, {symbol:'C',marketCap:'0'}, {symbol:'D',marketCap:-5}
  ]}})});
  assert.deepEqual([...caps], [['A', 1000000]]);
});

test('market cap failure does not discard earnings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-events-'));
  try {
    const result = await updateEventsData({apiKey:'test', outputDir:pathToFileURL(`${dir}/`), watchlist:[], sleep,
      fetchImpl: async url => (typeof url === 'string' && url.includes('nasdaq.com')) ? new Response('', {status:503}) : Response.json({earningsCalendar:[raw]})});
    assert.equal(result.earnings.length, 1);
    assert.equal(result.earnings[0].marketCap, undefined);
    parseEventsPayload(result);
    assert.throws(() => parseEventsPayload({...result, earnings:[{...result.earnings[0],marketCap:-1}]}));
  } finally { await rm(dir, {recursive:true, force:true}); }
});
