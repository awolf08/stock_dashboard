import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const summaryPath = new URL('../public/data/daily-market-summary.json', import.meta.url);
const outputPath = new URL('../public/data/daily-market-article.json', import.meta.url);

function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  return number.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function formatList(values) {
  return values?.length ? values.join('、') : 'n/a';
}

function levelText(levels) {
  if (!levels?.support?.length || !levels?.resistance?.length) return 'n/a';
  return `支撑 ${levels.support.join(' → ')}；压力 ${levels.resistance.join(' → ')}`;
}

function articleFromTemplate(summary) {
  const spx = summary.indices?.SPX;
  const qqq = summary.indices?.QQQ;
  const smh = summary.indices?.SMH;
  const strongest = summary.sectors?.strongest;
  const weakest = summary.sectors?.weakest;
  const topMovers = (summary.movers?.top ?? []).slice(0, 4).map((quote) => `${quote.symbol} ${formatPercent(quote.percent)}`);
  const weakMovers = (summary.movers?.weak ?? []).slice(0, 4).map((quote) => `${quote.symbol} ${formatPercent(quote.percent)}`);
  const sections = [
    {
      heading: summary.title,
      paragraphs: [
        `今天市场的核心结论是：${summary.bias}。指数平均涨跌幅为 ${formatPercent(summary.market?.indexAverage)}，watchlist 广度约 ${Math.round(Number(summary.market?.breadth ?? 0) * 100)}%。${spx ? `S&P 500 收在 ${formatPrice(spx.price)}，涨跌幅 ${formatPercent(spx.percent)}。` : ''}${qqq ? `QQQ 收在 ${formatPrice(qqq.price)}，涨跌幅 ${formatPercent(qqq.percent)}。` : ''}`,
        strongest && weakest ? `盘面比指数本身更重要。${strongest.name} 是今天最强方向，平均 ${formatPercent(strongest.average)}；${weakest.name} 明显落后，平均 ${formatPercent(weakest.average)}。这说明资金没有全面 risk-on，而是在少数方向里做选择。` : '板块数据还不完整，所以今天先用指数、ETF 和 watchlist 广度判断市场状态。',
        smh ? `半导体线索需要单独看。SMH 今日 ${formatPercent(smh.percent)}，如果它强于 QQQ，说明 AI/芯片的卖压可能开始缓和；如果它转弱，QQQ 的反弹质量会下降。` : '半导体仍是接下来最需要确认的方向，尤其要看 NVDA、SMH、SOXL 是否和 QQQ 同步。',
      ],
    },
    {
      heading: '为什么今天市场这样走？',
      paragraphs: [
        `第一，指数层面并不是最极端的单边行情，真正的信号来自广度。watchlist 里只有约 ${Math.round(Number(summary.market?.breadth ?? 0) * 100)}% 的股票上涨，说明多数个股没有跟上。`,
        `第二，强弱分化很清楚。强势名单包括 ${formatList(topMovers)}；弱势名单包括 ${formatList(weakMovers)}。如果强势集中在少数股票，而弱势扩散到更多板块，明天需要继续控制仓位。`,
        `第三，今天的主线不是简单的“指数涨跌”，而是观察资金是否愿意重新买回成长和半导体。如果 QQQ、SMH、NVDA 不能同步改善，指数即使反弹也可能只是技术修复。`,
      ],
    },
    {
      heading: 'SPX / QQQ / ES 关键位',
      paragraphs: [
        `SPX：${levelText(summary.levels?.SPX)}。这里第一支撑和第一压力最重要，决定明天是继续修复还是重新转弱。`,
        `QQQ：${levelText(summary.levels?.QQQ)}。如果 QQQ 能站上第一压力位，同时 SMH 强于指数，成长股会有更好的反弹条件。`,
        `ES proxy：${levelText(summary.levels?.ES)}。如果跌破第一支撑，短线更适合等待下一档支撑确认，而不是提前抄底。`,
      ],
    },
    {
      heading: '明天怎么判断？',
      paragraphs: [
        ...(summary.tomorrow ?? []),
        ...(summary.scenarios ?? []).map((scenario) => `${scenario.label}：${scenario.text}`),
        '我的操作判断会优先看组合信号：SPX 是否守住支撑、QQQ 是否强于 SPX、SMH 是否继续修复、弱势板块是否停止扩散。只有这些信号同步改善，反弹才更值得信任。',
      ],
    },
  ];
  return { title: summary.title, sections };
}

function plainArticle(article) {
  return article.sections.map((section) => `## ${section.heading}\n\n${section.paragraphs.join('\n\n')}`).join('\n\n');
}

function compactSummary(summary) {
  return {
    date: summary.date,
    title: summary.title,
    bias: summary.bias,
    indices: summary.indices,
    market: summary.market,
    sectors: {
      strongest: summary.sectors?.strongest,
      weakest: summary.sectors?.weakest,
      groups: summary.sectors?.groups?.slice(0, 6),
    },
    movers: {
      top: summary.movers?.top?.slice(0, 5),
      weak: summary.movers?.weak?.slice(0, 5),
    },
    levels: summary.levels,
    drivers: summary.drivers,
    summary: summary.summary,
    tomorrow: summary.tomorrow,
    scenarios: summary.scenarios,
  };
}

function parseModelText(text, fallback) {
  const cleaned = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed.title !== 'string' || !Array.isArray(parsed.sections)) throw new Error('Model article response has invalid shape.');
  const sections = parsed.sections.map((section) => ({
    heading: String(section.heading ?? '').trim(),
    paragraphs: Array.isArray(section.paragraphs) ? section.paragraphs.map((paragraph) => String(paragraph ?? '').trim()).filter(Boolean) : [],
  })).filter((section) => section.heading && section.paragraphs.length);
  if (!sections.length) throw new Error('Model article response has no sections.');
  return { title: parsed.title || fallback.title, sections };
}

async function generateWithOpenAI(summary, { fetchImpl = fetch } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim() || apiKey.includes('your_')) return null;
  const model = process.env.OPENAI_DAILY_SUMMARY_MODEL || 'gpt-4.1-mini';
  const prompt = `你是一个面向主动交易者的中文美股收盘分析员。根据下面 JSON 写一篇中文收盘总结，风格接近专业交易复盘。\n\n要求：\n- 只使用 JSON 里已有的数据，不要编造新闻、收益率、油价、Fed 概率或外部来源。\n- 输出严格 JSON：{ "title": string, "sections": [{ "heading": string, "paragraphs": string[] }] }。\n- 文章要有 4 个 section：收盘总结、为什么今天这样走、SPX / QQQ / ES关键位、明天怎么判断。\n- 可以用谨慎、偏弱、止跌、轮动、确认、支撑/压力等交易语言。\n- 每段 1-3 句，中文。\n\n数据：\n${JSON.stringify(compactSummary(summary), null, 2)}`;
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: { format: { type: 'json_object' } },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`OpenAI article generation failed with HTTP ${response.status}.`);
  const data = await response.json();
  const text = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).map((content) => content.text ?? '').join('\n') ?? '';
  return parseModelText(text, articleFromTemplate(summary));
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

export async function generateDailyMarketArticle({ summaryUrl = summaryPath, outputUrl = outputPath, fetchImpl = fetch } = {}) {
  const summary = await readJson(summaryUrl);
  let article;
  let provider = 'template';
  let error = null;
  try {
    article = await generateWithOpenAI(summary, { fetchImpl });
    if (article) provider = 'openai';
  } catch (exception) {
    error = exception.message;
  }
  article ??= articleFromTemplate(summary);
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summaryGeneratedAt: summary.generatedAt,
    marketDataGeneratedAt: summary.marketDataGeneratedAt,
    date: summary.date,
    provider,
    model: provider === 'openai' ? process.env.OPENAI_DAILY_SUMMARY_MODEL || 'gpt-4.1-mini' : null,
    title: article.title,
    sections: article.sections,
    markdown: plainArticle(article),
    generationError: error,
  };
  await mkdir(new URL('.', outputUrl), { recursive: true });
  const temporaryFile = new URL('daily-market-article.json.tmp', new URL('.', outputUrl));
  await writeFile(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(temporaryFile, outputUrl);
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateDailyMarketArticle().then((article) => {
    console.log(`Generated daily market article for ${article.date} with ${article.provider}.`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
