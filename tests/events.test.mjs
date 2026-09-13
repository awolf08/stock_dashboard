import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeEarningsEvent, fetchEarningsCalendar, updateEventsData } from '../scripts/fetch-events-data.mjs';
import { parseEventsPayload } from '../lib/events.ts';

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
      fetchImpl: async () => Response.json({ earningsCalendar: [raw, { ...raw, symbol: 'AAPL', date: '2026-09-15', hour: 'bmo' }] }),
    });
    assert.equal(payload.range.from, '2026-09-14');
    assert.equal(payload.range.to, '2026-09-21');
    assert.deepEqual(payload.earnings.map((event) => event.symbol), ['NVDA', 'AAPL']);
    const written = parseEventsPayload(JSON.parse(await readFile(join(dir, 'events.json'), 'utf8')));
    assert.equal(written.earnings.length, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('client rejects malformed event payloads', () => {
  const payload = { schemaVersion: 1, provider: 'finnhub', generatedAt: '2026-09-14T16:00:00Z', range: { from: '2026-09-14', to: '2026-09-21' }, earnings: [normalizeEarningsEvent(raw, new Set())] };
  assert.equal(parseEventsPayload(payload), payload);
  assert.throws(() => parseEventsPayload({ ...payload, provider: 'mock' }));
  assert.throws(() => parseEventsPayload({ ...payload, earnings: [{ symbol: 'NVDA' }] }));
});
