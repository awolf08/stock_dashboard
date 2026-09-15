import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { generateDailyMarketSummary } from './generate-daily-market-summary.mjs';

const summaryPath = new URL('../public/data/daily-market-summary.json', import.meta.url);
const articlePath = new URL('../public/data/daily-market-article.json', import.meta.url);
const outputPath = new URL('../public/daily-finance/index.html', import.meta.url);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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

function formatDateTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not available';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles',
  }).format(new Date(value));
}

function rows(items, render) {
  return items.map(render).join('\n');
}

function levelText(levels) {
  if (!levels) return 'n/a';
  return `Support ${levels.support.join(' / ')} · Resistance ${levels.resistance.join(' / ')}`;
}

async function readJsonOrNull(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return null;
  }
}

async function readSummary() {
  return await readJsonOrNull(summaryPath) ?? generateDailyMarketSummary();
}

async function readArticle() {
  return await readJsonOrNull(articlePath);
}

function renderArticleSections(article) {
  if (!article?.sections?.length) return '';
  return rows(article.sections, (section) => `<section class="box article-section"><h3>${escapeHtml(section.heading)}</h3>${rows(section.paragraphs ?? [], (paragraph) => `<p>${escapeHtml(paragraph)}</p>`)}</section>`);
}

export async function generateDailyFinance({ outputUrl = outputPath } = {}) {
  const summary = await readSummary();
  const article = await readArticle();
  const indices = Object.entries(summary.indices ?? {}).filter(([, quote]) => quote);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Daily Finance · Baybell Dashboard</title>
  <style>
    :root { color-scheme: dark; --bg:#020916; --panel:#071527; --border:rgba(132,169,208,.2); --text:#eef5ff; --muted:#9fb0c5; --blue:#2b9aff; --green:#57df91; --red:#ff5d52; --amber:#f7b955; }
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
    .metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; padding:14px; border-bottom:1px solid rgba(132,169,208,.12); }
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
    .article-grid { grid-template-columns:1fr; }
    .article-section p + p { margin-top:12px; }
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
        <a class="active" href="/daily-finance/">Daily Finance</a>
        <a href="/weekly-finance/">Weekly Finance</a>
        <a href="/guru-position/">Guru Positions</a>
        <a href="https://options.baybell.com">Options</a>
        <a href="https://baybell.com/private/">Private Reports</a>
      </nav>
    </aside>
    <main>
      <section class="hero">
        <div><span class="eyebrow">Daily Market Summary</span><h1>${escapeHtml(summary.title)}</h1><p>Generated from the latest dashboard quote snapshot, then expanded into a Chinese close-report article. If OpenAI is configured, this uses the LLM writer; otherwise it falls back to a deterministic template.</p></div>
        <div class="actions"><a class="button" href="/">Dashboard</a><a class="button primary" href="/data/daily-market-article.json">Open Article JSON</a><a class="button" href="/data/daily-market-summary.json">Open Data JSON</a></div>
      </section>
      <section class="grid">
        <article class="card"><div class="card-title"><h2>LLM 收盘长文</h2><span class="stamp">${escapeHtml(article?.provider === 'openai' ? `OpenAI · ${article.model ?? 'model'}` : 'Template fallback')}</span></div><div class="sections article-grid">${renderArticleSections(article)}</div></article>
        <article class="card"><div class="card-title"><h2>结构化收盘数据</h2><span class="stamp">Generated ${escapeHtml(formatDateTime(summary.generatedAt))}</span></div><div class="metrics">${rows(indices.slice(0, 5), ([symbol, quote]) => `<div class="metric"><span>${escapeHtml(symbol)}</span><strong>${escapeHtml(formatPrice(quote.price))}</strong><em class="${Number(quote.percent) >= 0 ? 'up' : 'down'}">${escapeHtml(formatPercent(quote.percent))}</em></div>`)}</div><div class="sections"><section class="box"><h3>今日解读</h3><ul>${rows(summary.summary ?? [], (item) => `<li>${escapeHtml(item)}</li>`)}</ul></section><section class="box"><h3>关键驱动</h3><ul>${rows(summary.drivers ?? [], (item) => `<li>${escapeHtml(item)}</li>`)}</ul></section></div></article>
        <article class="card"><div class="card-title"><h2>SPX / QQQ / ES 关键位</h2><span class="stamp">Market data ${escapeHtml(formatDateTime(summary.marketDataGeneratedAt))}</span></div><table><thead><tr><th>Asset</th><th>Levels</th></tr></thead><tbody><tr><td>SPX</td><td>${escapeHtml(levelText(summary.levels?.SPX))}</td></tr><tr><td>QQQ</td><td>${escapeHtml(levelText(summary.levels?.QQQ))}</td></tr><tr><td>ES proxy</td><td>${escapeHtml(levelText(summary.levels?.ES))}</td></tr></tbody></table></article>
        <div class="two"><article class="card"><div class="card-title"><h2>明天看什么</h2></div><div class="sections"><section class="box"><h3>观察清单</h3><ul>${rows(summary.tomorrow ?? [], (item) => `<li>${escapeHtml(item)}</li>`)}</ul></section><section class="box"><h3>情景判断</h3><ul>${rows(summary.scenarios ?? [], (item) => `<li><strong>${escapeHtml(item.label)}</strong> ${escapeHtml(item.text)}</li>`)}</ul></section></div></article><article class="card"><div class="card-title"><h2>板块与个股</h2></div><table><thead><tr><th>Group/Symbol</th><th>Move</th><th>Read</th></tr></thead><tbody>${rows([...(summary.sectors?.groups ?? []).slice(0, 4).map((group) => ({ label: group.name, move: group.average, read: `${group.gainers}/${group.count} up` })), ...(summary.movers?.top ?? []).slice(0, 3).map((quote) => ({ label: quote.symbol, move: quote.percent, read: quote.group }))], (row) => `<tr><td>${escapeHtml(row.label)}</td><td class="${Number(row.move) >= 0 ? 'up' : 'down'}">${escapeHtml(formatPercent(row.move))}</td><td>${escapeHtml(row.read)}</td></tr>`)}</tbody></table></article></div>
        <article class="card"><div class="card-title"><h2>Yahoo-style Daily Report</h2></div><div class="sections"><section class="box"><h3>Legacy Generated Report</h3><p>Open the original FinanceDailyReport output with the Yahoo-style market report layout.</p><div class="actions"><a class="button primary" href="https://awolf08.github.io/FinanceDailyReport/latest/" target="_blank" rel="noreferrer">Open Latest Report</a><a class="button" href="https://github.com/awolf08/FinanceDailyReport/tree/main/reports" target="_blank" rel="noreferrer">Open Report Archive</a></div></section><section class="box"><h3>Next Upgrade</h3><p>The article above is generated from the structured dashboard summary. Add OPENAI_API_KEY as a repository secret to use the LLM writer; without it, the template writer keeps the page updated.</p></section></div></article>
      </section>
      <p class="footer-note">This page is generated during deploy from dashboard quote data. It is informational market analysis, not investment advice.</p>
    </main>
  </div>
</body>
</html>
`;
  await writeFile(outputUrl, html);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateDailyFinance().then((summary) => {
    console.log(`Generated daily finance page for ${summary.date}: ${summary.bias}.`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
