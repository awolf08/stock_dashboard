import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const marketPath = new URL('../public/data/market.json', import.meta.url);
const eventsPath = new URL('../public/data/events.json', import.meta.url);
const outputPath = new URL('../public/weekly-finance/index.html', import.meta.url);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  return number.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return String(day ?? 'n/a');
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}

function formatDateTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not available';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles',
  }).format(new Date(value));
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
  for (const quote of Array.isArray(market.indexes) ? market.indexes : []) quotes.push({ ...quote, group: 'Major Indexes', isIndex: true });
  for (const category of Array.isArray(market.categories) ? market.categories : []) {
    for (const quote of Array.isArray(category.quotes) ? category.quotes : []) quotes.push({ ...quote, group: category.name, isIndex: false });
  }
  return quotes.filter((quote) => typeof quote.symbol === 'string' && Number.isFinite(quote.percent) && Number.isFinite(quote.price));
}

function groupSummaries(market) {
  return (Array.isArray(market.categories) ? market.categories : [])
    .map((category) => {
      const quotes = (Array.isArray(category.quotes) ? category.quotes : []).filter((quote) => Number.isFinite(quote.percent));
      const average = quotes.length ? quotes.reduce((sum, quote) => sum + quote.percent, 0) / quotes.length : 0;
      const gainers = quotes.filter((quote) => quote.percent > 0).length;
      return { name: category.name, count: quotes.length, average, gainers, losers: quotes.length - gainers };
    })
    .filter((group) => group.count > 0)
    .sort((a, b) => b.average - a.average);
}

function outlookFromData(indexQuotes, quotes, groups, earnings) {
  const indexAverage = indexQuotes.length ? indexQuotes.reduce((sum, quote) => sum + quote.percent, 0) / indexQuotes.length : 0;
  const breadth = quotes.length ? quotes.filter((quote) => quote.percent > 0).length / quotes.length : 0.5;
  const highImpactEvents = earnings.filter((event) => event.impact === 'High' || event.watchlistMatch).length;
  let bias = 'Neutral';
  if (indexAverage > 0.45 && breadth >= 0.55) bias = 'Constructive';
  if (indexAverage < -0.45 && breadth <= 0.45) bias = 'Defensive';
  if (Math.abs(indexAverage) < 0.2 && highImpactEvents >= 6) bias = 'Event-driven';
  const strongest = groups[0]?.name ?? 'n/a';
  const weakest = groups.at(-1)?.name ?? 'n/a';
  const confidence = Math.abs(indexAverage) > 0.75 && (breadth > 0.6 || breadth < 0.4) ? 'Medium' : 'Low-to-medium';
  return { bias, confidence, indexAverage, breadth, highImpactEvents, strongest, weakest };
}

function rows(items, render) {
  return items.map(render).join('\n');
}

export async function generateWeeklyFinance({ marketUrl = marketPath, eventsUrl = eventsPath, outputUrl = outputPath } = {}) {
  const market = await readJson(marketUrl, { provider: 'finnhub', generatedAt: null, indexes: [], categories: [] });
  const events = await readJson(eventsUrl, { generatedAt: null, earnings: [] });
  const allQuotes = flattenQuotes(market);
  const indexQuotes = (Array.isArray(market.indexes) ? market.indexes : []).filter((quote) => Number.isFinite(quote.percent));
  const groups = groupSummaries(market);
  const earnings = (Array.isArray(events.earnings) ? events.earnings : [])
    .filter((event) => typeof event.symbol === 'string' && typeof event.date === 'string')
    .sort((a, b) => `${a.date}-${a.symbol}`.localeCompare(`${b.date}-${b.symbol}`));
  const watchlistEarnings = earnings.filter((event) => event.watchlistMatch).slice(0, 10);
  const featuredEarnings = (watchlistEarnings.length ? watchlistEarnings : earnings).slice(0, 10);
  const topMovers = [...allQuotes].filter((quote) => !quote.isIndex).sort((a, b) => b.percent - a.percent).slice(0, 8);
  const weakMovers = [...allQuotes].filter((quote) => !quote.isIndex).sort((a, b) => a.percent - b.percent).slice(0, 8);
  const outlook = outlookFromData(indexQuotes, allQuotes.filter((quote) => !quote.isIndex), groups, earnings);
  const generatedAt = new Date().toISOString();
  const marketUpdated = market.generatedAt ?? null;
  const eventsUpdated = events.generatedAt ?? null;
  const indexEtfSymbols = ['SPY', 'QQQ', 'DIA', 'IWM', 'SMH', 'IGV'];
  const majorIndexList = indexQuotes.length ? indexQuotes : allQuotes.filter((quote) => indexEtfSymbols.includes(quote.symbol));

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Weekly Finance · Baybell Dashboard</title>
  <style>
    :root { color-scheme: dark; --bg:#020916; --panel:#071527; --border:rgba(132,169,208,.2); --text:#eef5ff; --muted:#9fb0c5; --blue:#2b9aff; --green:#57df91; --red:#ff5b48; --amber:#f7b731; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; background:radial-gradient(circle at 50% 0%, rgba(25,110,190,.16), transparent 34%), linear-gradient(135deg,#010611 0%,#061120 48%,#020916 100%); color:var(--text); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .shell { display:grid; grid-template-columns:268px minmax(0,1fr); min-height:100vh; }
    aside { background:linear-gradient(180deg,rgba(6,20,38,.98),rgba(2,9,22,.98)); border-right:1px solid rgba(132,169,208,.16); padding-bottom:24px; }
    .brand { display:flex; align-items:center; gap:12px; height:70px; padding:0 22px; border-bottom:1px solid rgba(132,169,208,.12); color:#f4f8ff; font-size:18px; font-weight:700; text-decoration:none; }
    .brand-icon { width:24px; height:24px; border-radius:7px; background:linear-gradient(135deg,#1d8fff,#26e0c2); box-shadow:0 0 20px rgba(43,154,255,.35); }
    nav { display:grid; gap:8px; padding:24px 14px 20px; }
    nav a { display:flex; align-items:center; gap:14px; min-height:44px; border:1px solid transparent; border-radius:6px; color:#c8d4e3; padding:0 14px; text-decoration:none; }
    nav a.active, nav a:hover { border-color:rgba(64,155,255,.32); background:linear-gradient(90deg,rgba(20,117,220,.55),rgba(18,67,121,.25)); color:white; box-shadow:inset 3px 0 0 #2497ff; }
    main { min-width:0; padding:26px 28px 34px; overflow:auto; }
    .hero { display:flex; justify-content:space-between; gap:20px; align-items:center; margin-bottom:24px; }
    .eyebrow { color:var(--green); font-size:13px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
    h1 { margin:8px 0; font-size:28px; }
    p { color:var(--muted); line-height:1.6; margin:0; }
    .actions { display:flex; gap:10px; flex-wrap:wrap; }
    .button { display:inline-flex; align-items:center; min-height:38px; border:1px solid rgba(132,169,208,.22); border-radius:6px; background:rgba(4,13,27,.62); color:#dce6f3; padding:0 16px; text-decoration:none; }
    .button.primary { border-color:rgba(64,155,255,.58); background:linear-gradient(180deg,rgba(29,143,255,.78),rgba(15,73,140,.78)); color:white; }
    .grid { display:grid; gap:16px; }
    .two { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
    .card { border:1px solid var(--border); border-radius:7px; background:linear-gradient(180deg,rgba(9,25,45,.78),rgba(4,13,27,.78)); box-shadow:0 16px 38px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.03); overflow:hidden; }
    .card-title { min-height:54px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid rgba(132,169,208,.16); padding:0 18px; }
    h2 { margin:0; font-size:17px; }
    .stamp { color:#8fa1b8; font-size:12px; }
    .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; padding:14px; border-bottom:1px solid rgba(132,169,208,.12); }
    .metric, .box { border:1px solid rgba(132,169,208,.14); border-radius:7px; background:rgba(5,16,31,.66); padding:14px; }
    .metric span { color:#8fa1b8; font-size:12px; display:block; margin-bottom:6px; }
    .metric strong { font-size:18px; }
    .sections { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; padding:14px; }
    h3 { margin:0 0 12px; font-size:14px; }
    ul { margin:0; padding-left:18px; display:grid; gap:9px; color:#abb8c9; line-height:1.55; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th,td { padding:11px 14px; border-top:1px solid rgba(132,169,208,.12); text-align:left; }
    th { color:#8fa1b8; font-weight:500; }
    td { color:#dce6f3; }
    .up { color:var(--green); } .down { color:var(--red); } .amber { color:var(--amber); }
    .footer-note { margin-top:18px; color:#7f8fa4; font-size:13px; }
    @media (max-width:900px) { .shell { grid-template-columns:1fr; } .hero { align-items:flex-start; flex-direction:column; } .sections, .metrics, .two { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <div class="shell">
    <aside>
      <a class="brand" href="/"><span class="brand-icon"></span><span>鬼谷仙 Dashboard</span></a>
      <nav>
        <a href="/">Overview</a>
        <a href="/?page=events">Events</a>
        <a href="/daily-finance/">Daily Finance</a>
        <a class="active" href="/weekly-finance/">Weekly Finance</a>
        <a href="/guru-position/">Guru Positions</a>
        <a href="https://options.baybell.com">Options</a>
        <a href="https://baybell.com/private/">Private Reports</a>
      </nav>
    </aside>
    <main>
      <section class="hero">
        <div><span class="eyebrow">Weekly Finance · Real Data</span><h1>Next Week Market Outlook</h1><p>Generated from the latest market snapshot and Finnhub earnings calendar. Macro calendar is not connected yet, so the outlook focuses on price action, breadth, sector groups, and known earnings risk.</p></div>
        <div class="actions"><a class="button" href="/">Dashboard</a><a class="button primary" href="https://baybell.com/private/">Private Login</a></div>
      </section>
      <section class="grid">
        <article class="card"><div class="card-title"><h2>Data-driven Weekly Forecast</h2><span class="stamp">Generated ${escapeHtml(formatDateTime(generatedAt))}</span></div><div class="metrics"><div class="metric"><span>Bias</span><strong>${escapeHtml(outlook.bias)}</strong></div><div class="metric"><span>Confidence</span><strong>${escapeHtml(outlook.confidence)}</strong></div><div class="metric"><span>Index Avg</span><strong class="${outlook.indexAverage >= 0 ? 'up' : 'down'}">${escapeHtml(formatPercent(outlook.indexAverage))}</strong></div><div class="metric"><span>Watchlist Breadth</span><strong>${Math.round(outlook.breadth * 100)}%</strong></div></div><div class="sections"><section class="box"><h3>Executive View</h3><p>The model reads the latest quote snapshot as <strong>${escapeHtml(outlook.bias)}</strong>. Major index average is <strong class="${outlook.indexAverage >= 0 ? 'up' : 'down'}">${escapeHtml(formatPercent(outlook.indexAverage))}</strong>, while watchlist breadth is <strong>${Math.round(outlook.breadth * 100)}%</strong>. Strongest group: <strong>${escapeHtml(outlook.strongest)}</strong>. Weakest group: <strong>${escapeHtml(outlook.weakest)}</strong>.</p></section><section class="box"><h3>Scenario Plan</h3><ul><li>Base case: follow the current breadth signal until indexes reverse through the prior snapshot direction.</li><li>Bullish trigger: indexes and leading groups both close positive, with breadth above 60%.</li><li>Bearish trigger: index average falls below -0.5% and leadership narrows under 45% breadth.</li><li>Event risk: ${outlook.highImpactEvents} watchlist/high-impact earnings events are in the calendar window.</li></ul></section></div></article>
        <article class="card"><div class="card-title"><h2>Major Index / ETF Roadmap</h2><span class="stamp">Market data ${escapeHtml(formatDateTime(marketUpdated))}</span></div><table><thead><tr><th>Symbol</th><th>Price</th><th>Move</th><th>Read</th></tr></thead><tbody>${rows(majorIndexList.slice(0, 10), (quote) => `<tr><td>${escapeHtml(quote.label || quote.symbol)}</td><td>${escapeHtml(formatPrice(quote.price))}</td><td class="${quote.percent >= 0 ? 'up' : 'down'}">${escapeHtml(formatPercent(quote.percent))}</td><td>${quote.percent >= 0 ? 'Supportive' : 'Pressure'}</td></tr>`)}</tbody></table></article>
        <div class="two"><article class="card"><div class="card-title"><h2>Strongest Groups</h2></div><table><thead><tr><th>Group</th><th>Avg Move</th><th>Breadth</th></tr></thead><tbody>${rows(groups.slice(0, 6), (group) => `<tr><td>${escapeHtml(group.name)}</td><td class="${group.average >= 0 ? 'up' : 'down'}">${escapeHtml(formatPercent(group.average))}</td><td>${group.gainers}/${group.count} up</td></tr>`)}</tbody></table></article><article class="card"><div class="card-title"><h2>Weakest Groups</h2></div><table><thead><tr><th>Group</th><th>Avg Move</th><th>Breadth</th></tr></thead><tbody>${rows([...groups].reverse().slice(0, 6), (group) => `<tr><td>${escapeHtml(group.name)}</td><td class="${group.average >= 0 ? 'up' : 'down'}">${escapeHtml(formatPercent(group.average))}</td><td>${group.gainers}/${group.count} up</td></tr>`)}</tbody></table></article></div>
        <div class="two"><article class="card"><div class="card-title"><h2>Top Watchlist Movers</h2></div><table><thead><tr><th>Symbol</th><th>Group</th><th>Move</th></tr></thead><tbody>${rows(topMovers, (quote) => `<tr><td>${escapeHtml(quote.symbol)}</td><td>${escapeHtml(quote.group)}</td><td class="${quote.percent >= 0 ? 'up' : 'down'}">${escapeHtml(formatPercent(quote.percent))}</td></tr>`)}</tbody></table></article><article class="card"><div class="card-title"><h2>Weak Watchlist Movers</h2></div><table><thead><tr><th>Symbol</th><th>Group</th><th>Move</th></tr></thead><tbody>${rows(weakMovers, (quote) => `<tr><td>${escapeHtml(quote.symbol)}</td><td>${escapeHtml(quote.group)}</td><td class="${quote.percent >= 0 ? 'up' : 'down'}">${escapeHtml(formatPercent(quote.percent))}</td></tr>`)}</tbody></table></article></div>
        <article class="card"><div class="card-title"><h2>Next Earnings Risk</h2><span class="stamp">Events data ${escapeHtml(formatDateTime(eventsUpdated))}</span></div><table><thead><tr><th>Date</th><th>Symbol</th><th>Time</th><th>Impact</th></tr></thead><tbody>${featuredEarnings.length ? rows(featuredEarnings, (event) => `<tr><td>${escapeHtml(formatDay(event.date))}</td><td>${escapeHtml(event.symbol)}</td><td>${escapeHtml(event.timeLabel || 'Time TBA')}</td><td class="${event.watchlistMatch ? 'amber' : ''}">${escapeHtml(event.watchlistMatch ? 'Watchlist' : event.impact || 'Medium')}</td></tr>`) : '<tr><td colspan="4">No earnings events available in the current feed.</td></tr>'}</tbody></table></article>
      </section>
      <p class="footer-note">This page is generated during deploy from verified quote and earnings JSON. It is an informational market briefing template, not investment advice.</p>
    </main>
  </div>
</body>
</html>
`;
  await writeFile(outputUrl, html);
  return { generatedAt, marketUpdated, eventsUpdated, quoteCount: allQuotes.length, earningsCount: earnings.length, bias: outlook.bias };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateWeeklyFinance().then((summary) => {
    console.log(`Generated weekly finance page with ${summary.quoteCount} quotes, ${summary.earningsCount} earnings, bias ${summary.bias}.`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
