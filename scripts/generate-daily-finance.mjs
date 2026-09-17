import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { generateDailyMarketSummary } from './generate-daily-market-summary.mjs';

const summaryPath = new URL('../public/data/daily-market-summary.json', import.meta.url);
const articlePath = new URL('../public/data/daily-market-article.json', import.meta.url);
const chatGptLatestUrl = process.env.DAILY_FINANCE_CHATGPT_MARKDOWN_URL || 'https://raw.githubusercontent.com/awolf08/FinanceDailyReport/main/ChatGPT/latest.md';
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


async function readTextFromUrl(url) {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'baybell-daily-finance-generator' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(markdown) {
  if (!markdown) return '';
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const html = [];
  const paragraph = [];
  const list = [];
  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph.length = 0;
  }
  function flushList() {
    if (!list.length) return;
    html.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
    list.length = 0;
  }
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushParagraph(); flushList(); continue; }
    if (line.startsWith('### ')) { flushParagraph(); flushList(); html.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('## ')) { flushParagraph(); flushList(); html.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# ')) { flushParagraph(); flushList(); html.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`); continue; }
    if (/^[-*]\s+/.test(line)) { flushParagraph(); list.push(line.replace(/^[-*]\s+/, '')); continue; }
    paragraph.push(line.replace(/\\$/, ''));
  }
  flushParagraph();
  flushList();
  return html.join('\n');
}

async function readChatGptLatestMarkdown() {
  const markdown = await readTextFromUrl(chatGptLatestUrl);
  if (!markdown) return null;
  const title = markdown.split('\n').find((line) => line.startsWith('# '))?.replace(/^#\s+/, '').trim() || 'Daily Market Close Summary';
  return { title, markdown, html: renderMarkdown(markdown), sourceUrl: chatGptLatestUrl };
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


function themeHeadScript() {
  return `<script>(function(){try{var t=localStorage.getItem('baybell-theme')||'light';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();</script>`;
}

function themeBodyScript() {
  return `<script>(function(){function apply(t){document.documentElement.dataset.theme=t;try{localStorage.setItem('baybell-theme',t)}catch(e){}document.querySelectorAll('[data-theme-choice]').forEach(function(b){b.classList.toggle('active',b.dataset.themeChoice===t);});}document.querySelectorAll('[data-theme-choice]').forEach(function(b){b.addEventListener('click',function(){apply(b.dataset.themeChoice||'light');});});apply(document.documentElement.dataset.theme||'light');})();</script>`;
}

function renderArticleSections(article) {
  if (!article?.sections?.length) return '';
  return rows(article.sections, (section) => `<section class="box article-section"><h3>${escapeHtml(section.heading)}</h3>${rows(section.paragraphs ?? [], (paragraph) => `<p>${escapeHtml(paragraph)}</p>`)}</section>`);
}

export async function generateDailyFinance({ outputUrl = outputPath } = {}) {
  const summary = await readSummary();
  const article = await readArticle();
  const chatGptArticle = await readChatGptLatestMarkdown();
  const indices = Object.entries(summary.indices ?? {}).filter(([, quote]) => quote);
  const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Daily Finance · Baybell Dashboard</title>
  ${themeHeadScript()}
  <style>
    :root { color-scheme: light; --bg:#f5f7fb; --panel:#ffffff; --soft:#f8fafc; --border:#d9e2ef; --text:#172033; --muted:#637083; --blue:#1769d8; --green:#078052; --red:#c9332b; --amber:#b7791f; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; background:linear-gradient(135deg,#f8fbff 0%,#eef4fb 52%,#f7f8fb 100%); color:var(--text); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .shell { display:grid; grid-template-columns:268px minmax(0,1fr); min-height:100vh; }
    aside { background:rgba(255,255,255,.92); border-right:1px solid var(--border); padding-bottom:24px; box-shadow:10px 0 30px rgba(30,45,70,.05); }
    .brand { display:flex; align-items:center; gap:12px; height:70px; padding:0 22px; border-bottom:1px solid var(--border); color:#182235; font-size:18px; font-weight:800; text-decoration:none; }
    .brand-icon { width:24px; height:24px; border-radius:7px; background:linear-gradient(135deg,#1d75df,#23b6a8); box-shadow:0 8px 22px rgba(29,117,223,.22); }
    nav { display:grid; gap:8px; padding:24px 14px 20px; }
    nav a { display:flex; align-items:center; gap:14px; min-height:44px; border:1px solid transparent; border-radius:8px; color:#4d5b70; padding:0 14px; text-decoration:none; font-weight:600; }
    nav a.active, nav a:hover { border-color:#b9d3f5; background:#eef6ff; color:#1459b8; box-shadow:inset 3px 0 0 #2b7de9; }
    main { min-width:0; padding:26px 28px 34px; overflow:auto; }
    .hero { display:flex; justify-content:space-between; gap:20px; align-items:center; margin-bottom:24px; border:1px solid var(--border); background:rgba(255,255,255,.78); border-radius:14px; padding:22px; box-shadow:0 18px 45px rgba(37,52,75,.08); }
    .eyebrow { color:var(--green); font-size:13px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    h1 { margin:8px 0; font-size:28px; color:#111827; }
    p { color:var(--muted); line-height:1.65; margin:0; }
    .actions { display:flex; gap:10px; flex-wrap:wrap; }
    .button { display:inline-flex; align-items:center; min-height:38px; border:1px solid #cdd8e7; border-radius:8px; background:white; color:#25354d; padding:0 16px; text-decoration:none; font-weight:700; box-shadow:0 4px 12px rgba(30,45,70,.05); }
    .button.primary { border-color:#1769d8; background:linear-gradient(180deg,#2d82ee,#1769d8); color:white; }
    .grid { display:grid; gap:16px; }
    .two { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
    .card { border:1px solid var(--border); border-radius:14px; background:rgba(255,255,255,.94); box-shadow:0 18px 45px rgba(37,52,75,.08); overflow:hidden; }
    .card-title { min-height:56px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid var(--border); padding:0 18px; background:#fbfdff; }
    h2 { margin:0; font-size:17px; color:#111827; }
    .stamp { color:#728095; font-size:12px; }
    .metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; padding:14px; border-bottom:1px solid var(--border); background:#f8fafc; }
    .metric, .box { border:1px solid #dfe7f2; border-radius:12px; background:white; padding:14px; }
    .metric span { color:#728095; font-size:12px; display:block; margin-bottom:6px; }
    .metric strong { font-size:18px; color:#172033; display:block; }
    .metric em { font-style:normal; font-weight:700; }
    .sections { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; padding:14px; }
    h3 { margin:0 0 12px; font-size:14px; color:#172033; }
    ul { margin:0; padding-left:18px; display:grid; gap:9px; color:#4d5b70; line-height:1.6; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th,td { padding:11px 14px; border-top:1px solid var(--border); text-align:left; }
    th { color:#728095; font-weight:700; background:#f8fafc; }
    td { color:#25354d; }
    .up { color:var(--green); } .down { color:var(--red); } .amber { color:var(--amber); }
    .article-grid { grid-template-columns:1fr; }
    .article-section p { color:#334155; font-size:15px; }
    .article-section p + p { margin-top:12px; }
    .markdown-article { padding:18px; }
    .markdown-article h1 { margin:0 0 18px; font-size:24px; }
    .markdown-article h2 { margin:24px 0 12px; font-size:20px; }
    .markdown-article h3 { margin:18px 0 10px; font-size:16px; }
    .markdown-article p { color:#334155; font-size:15px; line-height:1.75; margin:0 0 13px; }
    .markdown-article ul { margin:0 0 14px; }
    .markdown-article a { color:var(--blue); font-weight:700; }
    .footer-note { margin-top:18px; color:#728095; font-size:13px; }
    html[data-theme="dark"] { color-scheme: dark; --bg:#020916; --panel:#071527; --soft:#0a1524; --border:rgba(132,169,208,.2); --text:#eef5ff; --muted:#9fb0c5; --blue:#2b9aff; --green:#57df91; --red:#ff5b48; --amber:#f7b731; }
    html[data-theme="dark"] body { background:radial-gradient(circle at 50% 0%, rgba(25,110,190,.16), transparent 34%), linear-gradient(135deg,#010611 0%,#061120 48%,#020916 100%); }
    html[data-theme="dark"] aside { background:linear-gradient(180deg,rgba(6,20,38,.98),rgba(2,9,22,.98)); border-right-color:rgba(132,169,208,.16); box-shadow:none; }
    html[data-theme="dark"] .brand { color:#f4f8ff; border-bottom-color:rgba(132,169,208,.12); }
    html[data-theme="dark"] nav a { color:#c8d4e3; }
    html[data-theme="dark"] nav a.active, html[data-theme="dark"] nav a:hover { border-color:rgba(64,155,255,.32); background:linear-gradient(90deg,rgba(20,117,220,.55),rgba(18,67,121,.25)); color:white; }
    html[data-theme="dark"] .hero, html[data-theme="dark"] .card { background:linear-gradient(180deg,rgba(9,25,45,.78),rgba(4,13,27,.78)); box-shadow:0 16px 38px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.03); }
    html[data-theme="dark"] h1, html[data-theme="dark"] h2, html[data-theme="dark"] h3, html[data-theme="dark"] .metric strong { color:#eef5ff; }
    html[data-theme="dark"] .card-title, html[data-theme="dark"] .metrics, html[data-theme="dark"] th { background:rgba(5,16,31,.48); border-color:rgba(132,169,208,.16); }
    html[data-theme="dark"] .metric, html[data-theme="dark"] .box { background:rgba(5,16,31,.66); border-color:rgba(132,169,208,.14); }
    html[data-theme="dark"] .button { background:rgba(4,13,27,.62); color:#dce6f3; border-color:rgba(132,169,208,.22); box-shadow:none; }
    html[data-theme="dark"] .button.primary { border-color:rgba(64,155,255,.58); background:linear-gradient(180deg,rgba(29,143,255,.78),rgba(15,73,140,.78)); color:white; }
    html[data-theme="dark"] td, html[data-theme="dark"] .article-section p, html[data-theme="dark"] .markdown-article p { color:#dce6f3; }
    html[data-theme="dark"] ul { color:#abb8c9; }
    .theme-choice.active { border-color:var(--blue); color:white; background:linear-gradient(180deg,#2d82ee,#1769d8); }
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
        <div class="actions"><button class="button theme-choice" data-theme-choice="light" type="button">Light</button><button class="button theme-choice" data-theme-choice="dark" type="button">Dark</button><a class="button" href="/">Dashboard</a><a class="button primary" href="/data/daily-market-article.json">Open Article JSON</a><a class="button" href="/data/daily-market-summary.json">Open Data JSON</a></div>
      </section>
      <section class="grid">
        <article class="card"><div class="card-title"><h2>每日盘后总结</h2><span class="stamp">${chatGptArticle ? 'FinanceDailyReport · ChatGPT/latest.md' : escapeHtml(article?.provider === 'openai' ? `OpenAI · ${article.model ?? 'model'}` : 'Template fallback')}</span></div>${chatGptArticle ? `<div class="markdown-article">${chatGptArticle.html}</div><div class="sections"><section class="box"><h3>Source</h3><p><a href="${escapeHtml(chatGptArticle.sourceUrl)}" target="_blank" rel="noreferrer">Open ChatGPT/latest.md</a></p></section></div>` : `<div class="sections article-grid">${renderArticleSections(article)}</div>`}</article>
        <article class="card"><div class="card-title"><h2>结构化收盘数据</h2><span class="stamp">Generated ${escapeHtml(formatDateTime(summary.generatedAt))}</span></div><div class="metrics">${rows(indices.slice(0, 5), ([symbol, quote]) => `<div class="metric"><span>${escapeHtml(symbol)}</span><strong>${escapeHtml(formatPrice(quote.price))}</strong><em class="${Number(quote.percent) >= 0 ? 'up' : 'down'}">${escapeHtml(formatPercent(quote.percent))}</em></div>`)}</div><div class="sections"><section class="box"><h3>今日解读</h3><ul>${rows(summary.summary ?? [], (item) => `<li>${escapeHtml(item)}</li>`)}</ul></section><section class="box"><h3>关键驱动</h3><ul>${rows(summary.drivers ?? [], (item) => `<li>${escapeHtml(item)}</li>`)}</ul></section></div></article>
        <article class="card"><div class="card-title"><h2>SPX / QQQ / ES 关键位</h2><span class="stamp">Market data ${escapeHtml(formatDateTime(summary.marketDataGeneratedAt))}</span></div><table><thead><tr><th>Asset</th><th>Levels</th></tr></thead><tbody><tr><td>SPX</td><td>${escapeHtml(levelText(summary.levels?.SPX))}</td></tr><tr><td>QQQ</td><td>${escapeHtml(levelText(summary.levels?.QQQ))}</td></tr><tr><td>ES proxy</td><td>${escapeHtml(levelText(summary.levels?.ES))}</td></tr></tbody></table></article>
        <div class="two"><article class="card"><div class="card-title"><h2>明天看什么</h2></div><div class="sections"><section class="box"><h3>观察清单</h3><ul>${rows(summary.tomorrow ?? [], (item) => `<li>${escapeHtml(item)}</li>`)}</ul></section><section class="box"><h3>情景判断</h3><ul>${rows(summary.scenarios ?? [], (item) => `<li><strong>${escapeHtml(item.label)}</strong> ${escapeHtml(item.text)}</li>`)}</ul></section></div></article><article class="card"><div class="card-title"><h2>板块与个股</h2></div><table><thead><tr><th>Group/Symbol</th><th>Move</th><th>Read</th></tr></thead><tbody>${rows([...(summary.sectors?.groups ?? []).slice(0, 4).map((group) => ({ label: group.name, move: group.average, read: `${group.gainers}/${group.count} up` })), ...(summary.movers?.top ?? []).slice(0, 3).map((quote) => ({ label: quote.symbol, move: quote.percent, read: quote.group }))], (row) => `<tr><td>${escapeHtml(row.label)}</td><td class="${Number(row.move) >= 0 ? 'up' : 'down'}">${escapeHtml(formatPercent(row.move))}</td><td>${escapeHtml(row.read)}</td></tr>`)}</tbody></table></article></div>
        <article class="card"><div class="card-title"><h2>Yahoo-style Daily Report</h2></div><div class="sections"><section class="box"><h3>Legacy Generated Report</h3><p>Open the original FinanceDailyReport output with the Yahoo-style market report layout.</p><div class="actions"><a class="button primary" href="https://awolf08.github.io/FinanceDailyReport/latest/" target="_blank" rel="noreferrer">Open Latest Report</a><a class="button" href="https://github.com/awolf08/FinanceDailyReport/tree/main/reports" target="_blank" rel="noreferrer">Open Report Archive</a></div></section><section class="box"><h3>Next Upgrade</h3><p>The main article above now comes from FinanceDailyReport/ChatGPT/latest.md. The dashboard JSON sections remain available as structured market data below.</p></section></div></article>
      </section>
      <p class="footer-note">This page is generated during deploy from dashboard quote data. It is informational market analysis, not investment advice.</p>
    </main>
  </div>
  ${themeBodyScript()}
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
