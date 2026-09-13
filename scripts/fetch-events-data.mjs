import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const dayMs = 24 * 60 * 60 * 1000;

function dayString(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * dayMs);
}

function normalizeSession(hour) {
  const value = typeof hour === 'string' ? hour.toLowerCase() : '';
  if (['bmo', 'before market open', 'before-open'].includes(value)) return { session: 'before-open', timeLabel: 'Before Open' };
  if (['amc', 'after market close', 'after-close'].includes(value)) return { session: 'after-close', timeLabel: 'After Close' };
  if (['dmh', 'during market hours', 'during-market'].includes(value)) return { session: 'during-market', timeLabel: 'During Market' };
  return { session: 'unknown', timeLabel: 'Time TBA' };
}

function normalizeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function watchlistSymbols(watchlist) {
  return new Set(watchlist.flatMap((group) => Array.isArray(group.symbols) ? group.symbols : []).map((symbol) => String(symbol).toUpperCase()));
}

export function normalizeEarningsEvent(raw, watchlistSet) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid earnings event from Finnhub.');
  const symbol = typeof raw.symbol === 'string' ? raw.symbol.trim().toUpperCase() : '';
  const date = typeof raw.date === 'string' ? raw.date : '';
  if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid earnings event from Finnhub.');
  const { session, timeLabel } = normalizeSession(raw.hour);
  const watchlistMatch = watchlistSet.has(symbol);
  return {
    symbol,
    ...(typeof raw.company === 'string' && raw.company.trim() ? { company: raw.company.trim() } : {}),
    date,
    session,
    timeLabel,
    ...(normalizeNumber(raw.epsEstimate) !== undefined ? { epsEstimate: normalizeNumber(raw.epsEstimate) } : {}),
    ...(normalizeNumber(raw.revenueEstimate) !== undefined ? { revenueEstimate: normalizeNumber(raw.revenueEstimate) } : {}),
    impact: watchlistMatch ? 'High' : 'Medium',
    watchlistMatch,
  };
}

export async function fetchEarningsCalendar({ apiKey, from, to, fetchImpl = fetch, sleep = delay } = {}) {
  const url = new URL('https://finnhub.io/api/v1/calendar/earnings');
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { 'X-Finnhub-Token': apiKey },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      if (attempt === 2) throw new Error('Earnings calendar request timed out or failed.');
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(response.status === 429 ? Math.min(Math.max(retryAfter * 1000, 60000), 120000) : 2000 * (attempt + 1));
        continue;
      }
      throw new Error(`Earnings calendar request failed: HTTP ${response.status}.`);
    }
    let data;
    try { data = await response.json(); } catch { throw new Error('Invalid earnings calendar JSON.'); }
    if (!data || typeof data !== 'object' || !Array.isArray(data.earningsCalendar)) throw new Error('Invalid earnings calendar response.');
    return data.earningsCalendar;
  }
  throw new Error('Earnings calendar request failed.');
}

export async function updateEventsData({
  apiKey = process.env.FINNHUB_API_KEY,
  outputDir = new URL('../public/data/', import.meta.url),
  watchlist,
  now = new Date(),
  fetchImpl = fetch,
  sleep = delay,
} = {}) {
  if (!apiKey?.trim() || apiKey.includes('your_')) {
    throw new Error('Set FINNHUB_API_KEY to a real key. No demo event data will be generated.');
  }
  watchlist ??= JSON.parse(await readFile(new URL('../config/watchlist.json', import.meta.url), 'utf8'));
  const from = dayString(now);
  const to = dayString(addDays(now, 7));
  const watchlistSet = watchlistSymbols(watchlist);
  const rawEvents = await fetchEarningsCalendar({ apiKey, from, to, fetchImpl, sleep });
  const earnings = rawEvents
    .map((event) => normalizeEarningsEvent(event, watchlistSet))
    .sort((a, b) => a.date.localeCompare(b.date) || Number(b.watchlistMatch) - Number(a.watchlistMatch) || a.symbol.localeCompare(b.symbol));
  const payload = { schemaVersion: 1, provider: 'finnhub', generatedAt: new Date().toISOString(), range: { from, to }, earnings };
  await mkdir(outputDir, { recursive: true });
  const temporaryFile = new URL('events.json.tmp', outputDir);
  await writeFile(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(temporaryFile, new URL('events.json', outputDir));
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  updateEventsData().then((payload) => {
    console.log(`Updated ${payload.earnings.length} earnings events from ${payload.range.from} to ${payload.range.to}.`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
