import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const marketPath = new URL('../public/data/market.json', import.meta.url);
const outputPath = new URL('../public/data/daily-market-summary.json', import.meta.url);

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function formatPrice(value) {
  const n = number(value, NaN);
  if (!Number.isFinite(n)) return 'n/a';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatPercent(value) {
  const n = number(value, NaN);
  if (!Number.isFinite(n)) return 'n/a';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function formatDate(value) {
  const date = value && Number.isFinite(Date.parse(value)) ? new Date(value) : new Date();
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'America/Los_Angeles',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function localDate(value) {
  const date = value && Number.isFinite(Date.parse(value)) ? new Date(value) : new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return fallback;
  }
}

function flattenQuotes(market) {
  const quotes = [];
  for (const quote of Array.isArray(market.indexes) ? market.indexes : []) {
    quotes.push({ ...quote, group: 'Major Indexes', isIndex: true });
  }
  for (const category of Array.isArray(market.categories) ? market.categories : []) {
    for (const quote of Array.isArray(category.quotes) ? category.quotes : []) {
      quotes.push({ ...quote, group: category.name, isIndex: false });
    }
  }
  return quotes.filter((quote) => typeof quote.symbol === 'string' && Number.isFinite(Number(quote.price)) && Number.isFinite(Number(quote.percent)));
}

function findQuote(quotes, symbols) {
  const set = new Set(symbols);
  return quotes.find((quote) => set.has(quote.symbol));
}

function groupSummaries(market) {
  return (Array.isArray(market.categories) ? market.categories : [])
    .map((category) => {
      const quotes = (Array.isArray(category.quotes) ? category.quotes : []).filter((quote) => Number.isFinite(Number(quote.percent)));
      const average = quotes.length ? quotes.reduce((sum, quote) => sum + Number(quote.percent), 0) / quotes.length : 0;
      const gainers = quotes.filter((quote) => Number(quote.percent) > 0).length;
      return { name: category.name, count: quotes.length, average, gainers, losers: quotes.length - gainers };
    })
    .filter((group) => group.count > 0)
    .sort((a, b) => b.average - a.average);
}

function levels(price, scale = 0.006) {
  const base = number(price, 0);
  if (base <= 0) return { support: [], resistance: [] };
  const step = base * scale;
  const roundTo = base > 1000 ? 10 : base > 100 ? 1 : 0.5;
  const round = (value) => Math.round(value / roundTo) * roundTo;
  return {
    support: [round(base - step), round(base - step * 2), round(base - step * 3)],
    resistance: [round(base + step), round(base + step * 2), round(base + step * 3)],
  };
}

function classify({ indexAverage, breadth, strongest, weakest }) {
  let bias = '谨慎中性';
  let tone = 'neutral';
  if (indexAverage > 0.35 && breadth >= 0.55) {
    bias = '偏强，但仍需确认';
    tone = 'constructive';
  } else if (indexAverage < -0.35 && breadth <= 0.45) {
    bias = '偏弱，风险控制优先';
    tone = 'defensive';
  }
  const semis = strongest?.name?.toLowerCase().includes('semi') || weakest?.name?.toLowerCase().includes('semi');
  return { bias, tone, semiconductorsInFocus: semis };
}

export async function generateDailyMarketSummary({ marketUrl = marketPath, outputUrl = outputPath } = {}) {
  const market = await readJson(marketUrl, { generatedAt: null, indexes: [], categories: [] });
  const allQuotes = flattenQuotes(market);
  const indexes = (Array.isArray(market.indexes) ? market.indexes : []).filter((quote) => Number.isFinite(Number(quote.percent)));
  const groups = groupSummaries(market);
  const watchlistQuotes = allQuotes.filter((quote) => !quote.isIndex);
  const topMovers = [...watchlistQuotes].sort((a, b) => Number(b.percent) - Number(a.percent)).slice(0, 5);
  const weakMovers = [...watchlistQuotes].sort((a, b) => Number(a.percent) - Number(b.percent)).slice(0, 5);
  const indexAverage = indexes.length ? indexes.reduce((sum, quote) => sum + Number(quote.percent), 0) / indexes.length : 0;
  const breadth = watchlistQuotes.length ? watchlistQuotes.filter((quote) => Number(quote.percent) > 0).length / watchlistQuotes.length : 0.5;
  const strongest = groups[0] ?? null;
  const weakest = groups.at(-1) ?? null;
  const classification = classify({ indexAverage, breadth, strongest, weakest });
  const spx = findQuote(allQuotes, ['^GSPC', 'SPX']);
  const qqq = findQuote(allQuotes, ['QQQ', '^NDX']);
  const dia = findQuote(allQuotes, ['DIA', '^DJI']);
  const iwm = findQuote(allQuotes, ['IWM', '^RUT']);
  const smh = findQuote(allQuotes, ['SMH', 'SOXX']);
  const dateLabel = formatDate(market.generatedAt);
  const title = `${dateLabel}美股收盘：${classification.bias}${strongest ? `，${strongest.name}领涨` : ''}`;
  const summary = [
    `今天指数平均表现为 ${formatPercent(indexAverage)}，watchlist 广度约 ${Math.round(breadth * 100)}%。${spx ? `S&P 500 收在 ${formatPrice(spx.price)}，涨跌幅 ${formatPercent(spx.percent)}。` : ''}`,
    strongest && weakest ? `板块轮动上，${strongest.name} 最强，平均 ${formatPercent(strongest.average)}；${weakest.name} 最弱，平均 ${formatPercent(weakest.average)}。这说明今天更适合看板块分化，而不是只看大盘指数。` : '板块数据有限，今天先以指数和核心 watchlist 的方向作为主线。',
    smh ? `半导体代理 ETF/标的 ${smh.symbol} 今日 ${formatPercent(smh.percent)}，这是判断 AI/芯片风险是否止跌的关键线索。` : '半导体仍是明天需要重点确认的方向，尤其要看 NVDA、SMH、SOXL 是否继续同步。',
  ];
  const drivers = [
    strongest ? `${strongest.name} 领涨，显示资金短线偏好的方向` : '需要等待更多板块数据确认主线',
    weakest ? `${weakest.name} 落后，说明风险偏好仍不均衡` : '弱势板块暂不明确',
    `Watchlist breadth ${Math.round(breadth * 100)}%，用于判断上涨/下跌是否有广度支持`,
  ];
  const tomorrow = [
    spx ? `SPX 重点看 ${levels(spx.price).support[0]} 是否守住，以及 ${levels(spx.price).resistance[0]} 上方能否继续扩展。` : 'SPX 数据缺失时，用 SPY/QQQ 的同步性确认方向。',
    qqq ? `QQQ 支撑 ${levels(qqq.price, 0.008).support.join(' / ')}，压力 ${levels(qqq.price, 0.008).resistance.join(' / ')}。` : 'QQQ/NDX 是判断成长股风险偏好的核心。',
    smh ? `半导体如果继续强于指数，说明杀估值压力可能缓和；如果反弹失败，要防止 AI leadership 再次拖累 QQQ。` : '确认半导体是否止跌，比单日指数涨跌更重要。',
  ];
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    marketDataGeneratedAt: market.generatedAt ?? null,
    date: localDate(market.generatedAt),
    title,
    bias: classification.bias,
    tone: classification.tone,
    indices: {
      SPX: spx ? { price: spx.price, change: spx.change, percent: spx.percent } : null,
      QQQ: qqq ? { price: qqq.price, change: qqq.change, percent: qqq.percent } : null,
      DIA: dia ? { price: dia.price, change: dia.change, percent: dia.percent } : null,
      IWM: iwm ? { price: iwm.price, change: iwm.change, percent: iwm.percent } : null,
      SMH: smh ? { price: smh.price, change: smh.change, percent: smh.percent } : null,
    },
    market: { indexAverage, breadth },
    sectors: { strongest, weakest, groups: groups.slice(0, 8) },
    movers: { top: topMovers, weak: weakMovers },
    levels: {
      SPX: spx ? levels(spx.price) : null,
      QQQ: qqq ? levels(qqq.price, 0.008) : null,
      ES: spx ? levels(spx.price) : null,
    },
    drivers,
    summary,
    tomorrow,
    scenarios: [
      { label: '🟢 利好', text: '指数重新站上第一压力位，同时 QQQ/SMH 强于大盘，说明风险偏好回升。' },
      { label: '🟡 中性', text: 'SPX/QQQ 在支撑和压力之间震荡，等待宏观或盈利事件重新定价。' },
      { label: '🔴 风险', text: 'SPX 跌破第一支撑且弱势板块继续扩大，优先降低仓位和等待确认。' },
    ],
  };
  await mkdir(new URL('.', outputUrl), { recursive: true });
  const temporaryFile = new URL('daily-market-summary.json.tmp', new URL('.', outputUrl));
  await writeFile(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(temporaryFile, outputUrl);
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateDailyMarketSummary().then((summary) => {
    console.log(`Generated daily market summary for ${summary.date}: ${summary.bias}.`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
