import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export function normalizeQuote(symbol, data) {
  if (!data || typeof data !== 'object' ||
      ![data.c, data.d, data.dp, data.t].every((n) => typeof n === 'number' && Number.isFinite(n)) ||
      data.c <= 0 || data.t <= 0) {
    throw new Error(`No valid quote for ${symbol}; previous snapshot kept.`);
  }
  return {
    symbol, price: data.c, change: data.d, percent: data.dp,
    quotedAt: new Date(data.t * 1000).toISOString(),
  };
}

export async function fetchQuote(symbol, apiKey, { fetchImpl = fetch, sleep = delay } = {}) {
  const url = new URL('https://finnhub.io/api/v1/quote');
  url.searchParams.set('symbol', symbol);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { 'X-Finnhub-Token': apiKey },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      if (attempt === 2) throw new Error(`Quote request timed out or failed for ${symbol}.`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(response.status === 429 ? Math.min(Math.max(retryAfter * 1000, 60000), 120000) : 2000 * (attempt + 1));
        continue;
      }
      throw new Error(`Quote request failed for ${symbol}: HTTP ${response.status}.`);
    }
    let data;
    try { data = await response.json(); } catch { throw new Error(`Invalid JSON for ${symbol}.`); }
    return normalizeQuote(symbol, data);
  }
  throw new Error(`Quote request failed for ${symbol}.`);
}

export function normalizeIndexQuote(symbol, label, data) {
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  const price = meta?.regularMarketPrice;
  const previousClose = meta?.previousClose ?? meta?.chartPreviousClose;
  const timestamp = result?.timestamp?.at(-1) ?? meta?.regularMarketTime;
  if (![price, previousClose, timestamp].every((n) => typeof n === 'number' && Number.isFinite(n)) || price <= 0 || previousClose <= 0 || timestamp <= 0) {
    throw new Error(`No valid index quote for ${symbol}; previous snapshot kept.`);
  }
  const change = price - previousClose;
  return {
    symbol,
    label,
    price,
    change,
    percent: (change / previousClose) * 100,
    quotedAt: new Date(timestamp * 1000).toISOString(),
  };
}

export async function fetchIndexQuote({ symbol, label }, { fetchImpl = fetch, sleep = delay } = {}) {
  const encoded = encodeURIComponent(symbol);
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}`);
  url.searchParams.set('range', '1d');
  url.searchParams.set('interval', '5m');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
    } catch {
      if (attempt === 2) throw new Error(`Index quote request timed out or failed for ${symbol}.`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(response.status === 429 ? Math.min(Math.max(retryAfter * 1000, 60000), 120000) : 2000 * (attempt + 1));
        continue;
      }
      throw new Error(`Index quote request failed for ${symbol}: HTTP ${response.status}.`);
    }
    let data;
    try { data = await response.json(); } catch { throw new Error(`Invalid JSON for ${symbol}.`); }
    return normalizeIndexQuote(symbol, label, data);
  }
  throw new Error(`Index quote request failed for ${symbol}.`);
}

export async function updateMarketData({
  apiKey = process.env.FINNHUB_API_KEY,
  outputDir = new URL('../public/data/', import.meta.url),
  watchlist,
  indexes = [
    { symbol: '^GSPC', label: 'S&P 500' },
    { symbol: '^IXIC', label: 'Nasdaq' },
    { symbol: '^DJI', label: 'Dow' },
    { symbol: '^RUT', label: 'Russell 2000' },
  ],
  fetchImpl = fetch,
  indexFetchImpl = fetchImpl,
  sleep = delay,
} = {}) {
  if (!apiKey?.trim() || apiKey.includes('your_')) {
    throw new Error('Set FINNHUB_API_KEY to a real key. No mock data will be generated.');
  }
  watchlist ??= JSON.parse(await readFile(new URL('../config/watchlist.json', import.meta.url), 'utf8'));
  if (!Array.isArray(watchlist) || !watchlist.length || watchlist.some((group) =>
    typeof group.name !== 'string' || !group.name.trim() || !Array.isArray(group.symbols) || !group.symbols.length ||
    group.symbols.some((symbol) => typeof symbol !== 'string' || !/^[A-Z0-9.^:-]+$/.test(symbol)) ||
    new Set(group.symbols).size !== group.symbols.length) || new Set(watchlist.map((group) => group.name)).size !== watchlist.length) {
    throw new Error('Invalid config/watchlist.json. Use unique category names and unique symbols in each category.');
  }
  const quotes = new Map();
  const indexQuotes = [];
  for (const index of indexes) {
    if (!quotes.has(index.symbol)) {
      if (quotes.size) await sleep(1100);
      const quote = await fetchIndexQuote(index, { fetchImpl: indexFetchImpl, sleep });
      quotes.set(index.symbol, quote);
    }
    indexQuotes.push(quotes.get(index.symbol));
  }
  const categories = [];
  for (const group of watchlist) {
    const groupQuotes = [];
    for (const symbol of group.symbols) {
      if (!quotes.has(symbol)) {
        if (quotes.size) await sleep(1100);
        quotes.set(symbol, await fetchQuote(symbol, apiKey, { fetchImpl, sleep }));
      }
      groupQuotes.push(quotes.get(symbol));
    }
    categories.push({ name: group.name, quotes: groupQuotes });
  }
  const payload = { schemaVersion: 1, generatedAt: new Date().toISOString(), provider: 'finnhub', indexes: indexQuotes, categories };
  await mkdir(outputDir, { recursive: true });
  const temporaryFile = new URL('market.json.tmp', outputDir);
  await writeFile(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(temporaryFile, new URL('market.json', outputDir));
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  updateMarketData().then((payload) => {
    console.log(`Updated ${payload.categories.reduce((count, group) => count + group.quotes.length, 0)} quotes at ${payload.generatedAt}.`);
  }).catch((error) => {
    // Do not log request objects, headers, or provider bodies containing secrets.
    console.error(error.message);
    process.exitCode = 1;
  });
}
