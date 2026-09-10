'use client';

/* eslint-disable next/no-html-link-for-pages -- Report links open separately built static HTML documents, not Next.js routes. */

import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  Download,
  FileText,
  Home as HomeIcon,
  LockKeyhole,
  Menu,
  MoreVertical,
  Plus,
  Settings,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import watchlist from '../config/watchlist.json';
import { parseMarketPayload, snapshotIsStale, type Quote } from '../lib/market';

type Page = 'overview' | 'events' | 'reports';
type Accent = 'cyan' | 'amber' | 'blue' | 'violet' | 'pink' | 'gold';

type Category = {
  name: string;
  accent: Accent;
  quotes: Quote[];
};

type StoredCategory = {
  name: string;
  accent: Accent;
  symbols: string[];
};

const initialCategories: Category[] = watchlist.map(({ name, accent }) => ({ name, accent: accent as Accent, quotes: [] }));
const watchlistStorageKey = 'baybell-watchlists-v1';

// This is only a public navigation URL. Authentication belongs to the report host.
const privateReportsUrl = process.env.NEXT_PUBLIC_PRIVATE_REPORTS_URL || 'https://baybell.com/private/';
const baybellHome = process.env.NEXT_PUBLIC_BAYBELL_HOME === '1';
const featuredIndexSymbols = ['^GSPC', '^IXIC', '^DJI', '^RUT'];

const earnings = {
  todayBefore: [
    ['WDAY', 'Workday', '$1.74', '$2.09B', '7:15 AM', 'High'],
    ['ADI', 'Analog Devices', '$1.85', '$2.42B', '7:00 AM', 'High'],
    ['DELL', 'Dell Technologies', '$1.32', '$23.6B', '6:30 AM', 'Medium'],
  ],
  todayAfter: [
    ['NVDA', 'NVIDIA', '$0.64', '$24.6B', '4:05 PM', 'High'],
    ['SNOW', 'Snowflake', '$0.21', '$857M', '4:10 PM', 'Medium'],
    ['MSFT', 'Microsoft', '$2.81', '$61.1B', '4:05 PM', 'High'],
  ],
  tomorrowBefore: [
    ['DELL', 'Dell Technologies', '$1.60', '$23.9B', '6:30 AM', 'High'],
    ['ADI', 'Analog Devices', '$1.71', '$2.45B', '7:00 AM', 'High'],
  ],
  tomorrowAfter: [
    ['AMZN', 'Amazon.com', '$0.98', '$155.2B', '4:05 PM', 'High'],
    ['GOOGL', 'Alphabet', '$1.39', '$77.8B', '4:05 PM', 'High'],
  ],
};

const otherEvents = [
  ['Macro', 'Fed Chair Powell Speaks', '10:00 AM ET', 'High'],
  ['Economic Data', 'Retail Sales (MoM)', '8:30 AM ET', 'High'],
  ['Economic Data', 'Industrial Production', '9:15 AM ET', 'Medium'],
  ['Investor Day', 'Apple Investor Day', '10:00 AM ET', 'High'],
  ['Company', "Salesforce Spring '25 Release", '11:00 AM ET', 'Medium'],
  ['Ex-Dividend', 'Johnson & Johnson', '12:00 AM ET', 'Low'],
];

const historyRows = [
  ['Daily After-hours Report', 'May 16, 2025', '07:45 PM ET', 'Mixed close as tech strength offsets energy weakness'],
  ['Weekly Forecast Analysis', 'May 16, 2025', '07:30 PM ET', 'Moderately bullish outlook with key events ahead'],
  ['Daily After-hours Report', 'May 15, 2025', '07:42 PM ET', 'Broad rally led by tech and consumer discretionary'],
];

const accentClass: Record<Accent, string> = {
  cyan: 'accent-cyan',
  amber: 'accent-amber',
  blue: 'accent-blue',
  violet: 'accent-violet',
  pink: 'accent-pink',
  gold: 'accent-gold',
};

function formatPrice(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSigned(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

function yahooChartUrl(symbol: string) {
  return `https://finance.yahoo.com/chart/${encodeURIComponent(symbol)}?range=1y`;
}

function isAccent(value: unknown): value is Accent {
  return typeof value === 'string' && value in accentClass;
}

function readStoredWatchlists(): StoredCategory[] | null {
  try {
    const raw = window.localStorage.getItem(watchlistStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: unknown; categories?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.categories)) return null;
    const categories = parsed.categories
      .map((category): StoredCategory | null => {
        if (!category || typeof category !== 'object') return null;
        const candidate = category as { name?: unknown; accent?: unknown; symbols?: unknown };
        if (typeof candidate.name !== 'string' || !candidate.name.trim() || !isAccent(candidate.accent) || !Array.isArray(candidate.symbols)) return null;
        const symbols = [...new Set(candidate.symbols
          .filter((symbol): symbol is string => typeof symbol === 'string')
          .map((symbol) => symbol.trim().toUpperCase())
          .filter(Boolean))];
        return { name: candidate.name.trim(), accent: candidate.accent, symbols };
      })
      .filter((category): category is StoredCategory => Boolean(category));
    const names = new Set(categories.map((category) => category.name.toLowerCase()));
    return categories.length && names.size === categories.length ? categories : null;
  } catch {
    return null;
  }
}

function storeWatchlists(categories: Category[]) {
  try {
    window.localStorage.setItem(watchlistStorageKey, JSON.stringify({
      version: 1,
      categories: categories.map((category) => ({
        name: category.name,
        accent: category.accent,
        symbols: category.quotes.map((quote) => quote.symbol),
      })),
    }));
  } catch {
    // Browsers may block localStorage in strict/private modes; keep the UI usable.
  }
}

function categoryWithQuotes(category: StoredCategory, quotesBySymbol: Map<string, Quote>) {
  return {
    name: category.name,
    accent: category.accent,
    quotes: category.symbols.flatMap((symbol) => {
      const quote = quotesBySymbol.get(symbol);
      return quote ? [quote] : [];
    }),
  };
}

function categoriesFromPayload(categories: { name: string; quotes: Quote[] }[]) {
  return categories.map((category, index) => ({
    ...category,
    accent: initialCategories[index % initialCategories.length].accent,
  }));
}

function categoriesFromStoredWatchlists(stored: StoredCategory[], defaults: Category[], quotesBySymbol: Map<string, Quote>) {
  const storedByName = new Map(stored.map((category) => [category.name.toLowerCase(), category]));
  const defaultNames = new Set(defaults.map((category) => category.name.toLowerCase()));
  return [
    ...defaults.map((category) => {
      const storedCategory = storedByName.get(category.name.toLowerCase());
      return storedCategory ? categoryWithQuotes(storedCategory, quotesBySymbol) : category;
    }),
    ...stored
      .filter((category) => !defaultNames.has(category.name.toLowerCase()))
      .map((category) => categoryWithQuotes(category, quotesBySymbol)),
  ];
}

function makeSparklinePoints(quote: Quote) {
  const slope = Math.max(-24, Math.min(24, quote.percent * 3.2));
  const start = 46 - slope / 2;
  const end = 46 + slope / 2;
  const bend = quote.change >= 0 ? -8 : 8;
  const points = [
    [4, start],
    [22, start + bend * 0.35],
    [40, (start + end) / 2 + bend],
    [58, end - bend * 0.2],
    [76, end],
  ];
  return points.map(([x, y]) => `${x},${Math.max(14, Math.min(70, y))}`).join(' ');
}

export default function Home() {
  const [page, setPage] = useState<Page>('overview');
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [indexes, setIndexes] = useState<Quote[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(0);
  const [symbolError, setSymbolError] = useState('');
  const feedQuotes = useRef<Quote[]>([]);
  const loaded = useRef(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [showSymbolDialog, setShowSymbolDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [symbolInput, setSymbolInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [targetCategory, setTargetCategory] = useState(initialCategories[0].name);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    async function refresh() {
      request = new AbortController();
      const timeout = setTimeout(() => request?.abort(), 15000);
      try {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
        const response = await fetch(`${basePath}/data/market.json?check=${Date.now()}`, {
          cache: 'no-store', signal: request.signal,
        });
        if (!response.ok) throw new Error('Snapshot unavailable');
        const payload = parseMarketPayload(await response.json());
        if (stopped) return;
        setIndexes(payload.indexes);
        feedQuotes.current = [...payload.indexes, ...payload.categories.flatMap((category) => category.quotes)];
        const quotesBySymbol = new Map(feedQuotes.current.map((quote) => [quote.symbol, quote]));
        if (!loaded.current) {
          const stored = readStoredWatchlists();
          const defaults = categoriesFromPayload(payload.categories);
          const nextCategories = stored
            ? categoriesFromStoredWatchlists(stored, defaults, quotesBySymbol)
            : defaults;
          setCategories(nextCategories);
          setTargetCategory(nextCategories[0]?.name ?? '');
          loaded.current = true;
        } else {
          // Refresh prices without undoing this tab's watchlist edits.
          setCategories((current) => current.map((category) => ({
            ...category,
            quotes: category.quotes.map((quote) => quotesBySymbol.get(quote.symbol) ?? quote),
          })));
        }
        setGeneratedAt(payload.generatedAt);
        setLoadError(false);
      } catch {
        if (!stopped) setLoadError(true);
      } finally {
        clearTimeout(timeout);
        if (!stopped) {
          setNow(Date.now());
          timer = setTimeout(refresh, 60000);
        }
      }
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); request?.abort(); };
  }, []);

  const stale = generatedAt ? snapshotIsStale(generatedAt, now) : false;
  const dataStatus = loadError ? 'Update unavailable' : !generatedAt ? 'Loading quotes' : stale ? 'Snapshot overdue' : 'Hourly snapshot';

  const breadth = useMemo(() => {
    const all = categories.flatMap((category) => category.quotes);
    return {
      gainers: all.filter((quote) => quote.change > 0).length,
      losers: all.filter((quote) => quote.change < 0).length,
    };
  }, [categories]);

  const indexQuotes = useMemo(() => {
    const quotesBySymbol = new Map(indexes.map((quote) => [quote.symbol, quote]));
    return featuredIndexSymbols.flatMap((symbol) => {
      const quote = quotesBySymbol.get(symbol);
      return quote ? [quote] : [];
    });
  }, [indexes]);

  function updateCategories(updater: (current: Category[]) => Category[]) {
    setCategories((current) => {
      const next = updater(current);
      storeWatchlists(next);
      return next;
    });
  }

  function addSymbol() {
    const symbol = symbolInput.trim().toUpperCase();
    if (!symbol) return;
    const quote = feedQuotes.current.find((item) => item.symbol === symbol);
    const target = categories.find((category) => category.name === targetCategory);
    if (!quote) { setSymbolError('This symbol is not in the hourly feed. Add it to config/watchlist.json and run the data update first.'); return; }
    if (!target) { setSymbolError('Choose an existing watchlist first.'); return; }
    if (target.quotes.some((item) => item.symbol === symbol)) { setSymbolError('This symbol is already in this watchlist.'); return; }
    setSymbolError('');
    updateCategories((current) =>
      current.map((category) =>
        category.name === targetCategory
          ? {
              ...category,
              quotes: [
                quote,
                ...category.quotes,
              ],
            }
          : category,
      ),
    );
    setSymbolInput('');
    setShowSymbolDialog(false);
  }

  function removeSymbol(categoryName: string, symbol: string) {
    updateCategories((current) =>
      current.map((category) =>
        category.name === categoryName
          ? { ...category, quotes: category.quotes.filter((quote) => quote.symbol !== symbol) }
          : category,
      ),
    );
  }

  function addCategory() {
    const name = categoryInput.trim();
    if (!name || categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) return;
    updateCategories((current) => [
      ...current,
      {
        name,
        accent: ['cyan', 'amber', 'blue', 'violet', 'pink', 'gold'][current.length % 6] as Accent,
        quotes: [],
      },
    ]);
    setTargetCategory(name);
    setCategoryInput('');
    setShowCategoryDialog(false);
  }

  function deleteCategory(name: string) {
    updateCategories((current) => current.filter((category) => category.name !== name));
    if (targetCategory === name) setTargetCategory(categories.find((category) => category.name !== name)?.name ?? '');
  }

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          <BarChart3 size={24} />
          <span>鬼谷仙 Dashboard</span>
        </div>

        <nav className="primary-nav" aria-label="Main navigation">
          <NavItem icon={<HomeIcon size={18} />} label="Overview" active={page === 'overview'} onClick={() => setPage('overview')} />
          <NavItem icon={<CalendarDays size={18} />} label="Events" active={page === 'events'} onClick={() => setPage('events')} />
          {baybellHome ? (
            <>
              <a className="nav-item" href="/daily-finance/"><FileText size={18} /><span>Daily Finance</span></a>
              <a className="nav-item" href="/weekly-finance/"><CalendarDays size={18} /><span>Weekly Finance</span></a>
              <a className="nav-item" href="/guru-position/"><BarChart3 size={18} /><span>Guru Positions</span></a>
              <a className="nav-item" href="https://options.baybell.com"><FileText size={18} /><span>Options</span></a>
            </>
          ) : <NavItem icon={<FileText size={18} />} label="Reports" active={page === 'reports'} onClick={() => setPage('reports')} />}
          {privateReportsUrl && (
            <a className="nav-item" href={privateReportsUrl}>
              <LockKeyhole size={18} />
              <span>Private Reports</span>
            </a>
          )}
          <NavItem icon={<Star size={18} />} label="Watchlists" active={false} />
          <NavItem icon={<Settings size={18} />} label="Settings" active={false} />
        </nav>

        <div className="watchlist-panel">
          <div className="section-label">
            <span>WATCHLISTS</span>
            <button aria-label="Add category" onClick={() => setShowCategoryDialog(true)}>
              <Plus size={16} />
            </button>
          </div>
          {categories.map((category) => (
            <div className="watchlist-row" key={category.name}>
              <span className={`dot ${accentClass[category.accent]}`} />
              <span>{category.name}</span>
              <button aria-label={`Delete ${category.name}`} onClick={() => deleteCategory(category.name)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="market-mini">
            <span className="status-dot" />
            <div>
              <strong>Finnhub</strong>
              <span>{dataStatus}</span>
              <span>Updates about once an hour</span>
            </div>
          </div>
          <div className="updated-mini">
            <span>Last Updated</span>
            <strong>{generatedAt ? new Date(generatedAt).toLocaleString() : 'Not available yet'}</strong>
            <span>Snapshot fetched · your local time</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        {page === 'overview' && (
          <Overview
            activeFilter={activeFilter}
            breadth={breadth}
            categories={categories}
            indexQuotes={indexQuotes}
            onAddSymbol={() => { setSymbolError(''); setShowSymbolDialog(true); }}
            onRemoveSymbol={removeSymbol}
            onSetFilter={setActiveFilter}
          />
        )}
        {page === 'events' && <Events />}
        {page === 'reports' && <Reports />}
      </section>

      {showSymbolDialog && (
        <div className="modal-backdrop" role="presentation">
          <dialog className="modal" aria-labelledby="add-symbol-title" open>
            <div className="modal-title">
              <h2 id="add-symbol-title">Add Symbol</h2>
              <button aria-label="Close add symbol" onClick={() => setShowSymbolDialog(false)}>
                <X size={18} />
              </button>
            </div>
            <p className="dialog-note">Choose a symbol already included in the hourly feed. Watchlist edits are saved in this browser.</p>
            {symbolError && <p role="alert" className="dialog-note">{symbolError}</p>}
            <label>
              Symbol
              <input value={symbolInput} onChange={(event) => setSymbolInput(event.target.value)} placeholder="NVDA" autoFocus />
            </label>
            <label>
              Watchlist
              <select value={targetCategory} onChange={(event) => setTargetCategory(event.target.value)}>
                {categories.map((category) => (
                  <option key={category.name}>{category.name}</option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setShowSymbolDialog(false)}>Cancel</button>
              <button className="primary-button" onClick={addSymbol}>Add Symbol</button>
            </div>
          </dialog>
        </div>
      )}

      {showCategoryDialog && (
        <div className="modal-backdrop" role="presentation">
          <dialog className="modal" aria-labelledby="add-category-title" open>
            <div className="modal-title">
              <h2 id="add-category-title">Add Category</h2>
              <button aria-label="Close add category" onClick={() => setShowCategoryDialog(false)}>
                <X size={18} />
              </button>
            </div>
            <label>
              Category name
              <input value={categoryInput} onChange={(event) => setCategoryInput(event.target.value)} placeholder="Robotics" autoFocus />
            </label>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setShowCategoryDialog(false)}>Cancel</button>
              <button className="primary-button" onClick={addCategory}>Create Category</button>
            </div>
          </dialog>
        </div>
      )}
    </main>
  );
}

function NavItem({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Overview({
  activeFilter,
  breadth,
  categories,
  indexQuotes,
  onAddSymbol,
  onRemoveSymbol,
  onSetFilter,
}: {
  activeFilter: string;
  breadth: { gainers: number; losers: number };
  categories: Category[];
  indexQuotes: Quote[];
  onAddSymbol: () => void;
  onRemoveSymbol: (category: string, symbol: string) => void;
  onSetFilter: (filter: string) => void;
}) {
  const filters = ['All', 'Gainers', 'Losers', 'Watchlist Only'];
  return (
    <div className="page-content">
      {indexQuotes.length > 0 && (
        <div className="index-deck" aria-label="Major index quotes">
          {indexQuotes.map((quote) => (
            <a className={`index-card ${quote.change < 0 ? 'negative' : ''}`} key={quote.symbol} href={yahooChartUrl(quote.symbol)} target="_blank" rel="noreferrer" aria-label={`Open ${quote.label ?? quote.symbol} 1 year candle chart on Yahoo Finance`}>
              <div>
                <span>{quote.label ?? quote.symbol}</span>
                <strong>{formatPrice(quote.price)}</strong>
                <em>{formatSigned(quote.change)} · {formatSigned(quote.percent)}%</em>
              </div>
              <svg className="sparkline" viewBox="0 0 80 80" aria-label={`${quote.symbol} ${quote.percent >= 0 ? 'up' : 'down'} ${formatSigned(quote.percent)} percent`}>
                <line x1="0" x2="80" y1="46" y2="46" />
                <polyline points={makeSparklinePoints(quote)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ))}
        </div>
      )}
      <div className="page-heading">
        <h1>Overview</h1>
        <div className="action-row">
          {filters.map((filter) => (
            <button className={`filter-button ${activeFilter === filter ? 'active' : ''}`} key={filter} onClick={() => onSetFilter(filter)}>
              {filter === 'Watchlist Only' && <Star size={15} />}
              {filter}
            </button>
          ))}
          <button className="outline-button" onClick={onAddSymbol}>
            <Plus size={16} />
            Add Symbol
          </button>
          <button className="outline-button">
            <Upload size={16} />
            Import Symbols
          </button>
          <div className="breadth-chip">
            <span>Market Breadth</span>
            <strong className="up">{breadth.gainers}</strong>
            <strong className="down">{breadth.losers}</strong>
          </div>
        </div>
      </div>
      <div className="quote-grid">
        {categories.map((category) => (
          <QuotePanel category={{ ...category, quotes: category.quotes.filter((quote) => activeFilter === 'Gainers' ? quote.change > 0 : activeFilter === 'Losers' ? quote.change < 0 : true) }} key={category.name} onRemove={onRemoveSymbol} />
        ))}
      </div>
    </div>
  );
}

function QuotePanel({
  category,
  onRemove,
}: {
  category: Category;
  onRemove: (category: string, symbol: string) => void;
}) {
  return (
    <article className={`data-card quote-panel ${accentClass[category.accent]}`}>
      <div className="card-title">
        <div>
          <span className="accent-bar" />
          <h2>{category.name}</h2>
        </div>
        <MoreVertical size={18} />
      </div>
      <div className="quote-header">
        <span>Symbol</span>
        <span>Price</span>
        <span>Change</span>
        <span>%</span>
        <span />
      </div>
      {category.quotes.map((quote) => (
        <div className="quote-row" key={quote.symbol}>
          <a className="symbol-link" href={yahooChartUrl(quote.symbol)} target="_blank" rel="noreferrer" title={quote.quotedAt ? `Quote time: ${new Date(quote.quotedAt).toLocaleString()}` : 'Quote time unavailable; regenerate the snapshot to include it.'} aria-label={`Open ${quote.symbol} 1 year candle chart on Yahoo Finance`}>{quote.symbol}</a>
          <span className="number">{formatPrice(quote.price)}</span>
          <span className={`number ${quote.change >= 0 ? 'up' : 'down'}`}>{formatSigned(quote.change)}</span>
          <span className={`number ${quote.percent >= 0 ? 'up' : 'down'}`}>{formatSigned(quote.percent)}%</span>
          <button aria-label={`Remove ${quote.symbol}`} onClick={() => onRemove(category.name, quote.symbol)}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {category.quotes.length === 0 && <div className="empty-panel">No symbols yet</div>}
    </article>
  );
}

function Events() {
  return (
    <div className="page-content">
      <div className="page-heading">
        <h1>Events</h1>
        <div className="action-row left">
          {['Today', 'Tomorrow', 'This Week', 'Watchlist Only', 'High Impact'].map((label, index) => (
            <button className={`filter-button ${index === 0 ? 'active' : ''}`} key={label}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="events-grid">
        <article className="data-card earnings-card">
          <div className="card-title">
            <h2>Earnings Calendar</h2>
            <button className="link-button">View Full Earnings Calendar</button>
          </div>
          <div className="earnings-layout">
            <EarningsDay title="Today" date="May 16, 2025" before={earnings.todayBefore} after={earnings.todayAfter} />
            <EarningsDay title="Tomorrow" date="May 17, 2025" before={earnings.tomorrowBefore} after={earnings.tomorrowAfter} />
          </div>
        </article>
        <article className="data-card">
          <div className="card-title">
            <h2>Other Events</h2>
            <button className="link-button">View All Events</button>
          </div>
          <div className="event-tabs">
            {['Macro', 'Company', 'Fed Speaker', 'Economic Data', 'Investor Day'].map((tab, index) => (
              <span className={index === 0 ? 'active' : ''} key={tab}>{tab}</span>
            ))}
          </div>
          <div className="event-list">
            {otherEvents.map(([type, title, time, impact]) => (
              <div className="event-row" key={`${title}-${time}`}>
                <CalendarDays size={18} />
                <div>
                  <strong>{title}</strong>
                  <span>{type}</span>
                </div>
                <time>{time}</time>
                <ImpactBadge impact={impact} />
                <Star size={16} />
              </div>
            ))}
          </div>
        </article>
      </div>
      <article className="data-card weekly-calendar">
        <div className="card-title">
          <h2>Weekly Calendar</h2>
          <button className="link-button">View Full Calendar</button>
        </div>
        <div className="week-grid">
          {['Mon, May 12', 'Tue, May 13', 'Wed, May 14', 'Thu, May 15', 'Fri, May 16', 'Mon, May 19', 'Tue, May 20'].map((day, index) => (
            <div className={`day-column ${index === 4 ? 'active' : ''}`} key={day}>
              <strong>{day}</strong>
              <EventPill label="CPI (Apr)" impact="High" />
              <EventPill label="NVDA Earnings" impact={index % 2 === 0 ? 'High' : 'Medium'} />
              <EventPill label="Powell Speaks" impact="Medium" />
              <button className="link-button">+{index + 2} More Events</button>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function EarningsDay({
  after,
  before,
  date,
  title,
}: {
  after: string[][];
  before: string[][];
  date: string;
  title: string;
}) {
  return (
    <section className="earnings-day">
      <div className="day-title">
        <strong>{title}</strong>
        <span>{date}</span>
      </div>
      <div className="session-grid">
        <EarningsSession title="Before Open" rows={before} />
        <EarningsSession title="After Close" rows={after} />
      </div>
    </section>
  );
}

function EarningsSession({ rows, title }: { rows: string[][]; title: string }) {
  return (
    <div className="earnings-session">
      <h3>{title}</h3>
      {rows.map(([symbol, company, eps, revenue, time, impact]) => (
        <div className="earnings-row" key={`${symbol}-${time}`}>
          <strong>{symbol}</strong>
          <span>{company}</span>
          <span>{eps}</span>
          <span>{revenue}</span>
          <time>{time}</time>
          <ImpactBadge impact={impact} />
        </div>
      ))}
    </div>
  );
}

function Reports() {
  return (
    <div className="page-content">
      <div className="page-heading">
        <h1>Reports</h1>
        <div className="action-row">
          <button className="select-button">
            <CalendarDays size={15} />
            May 16, 2025
            <ChevronDown size={14} />
          </button>
          <button className="filter-button active">Daily</button>
          <button className="filter-button">Weekly</button>
          <button className="primary-button">
            <Sparkles size={16} />
            Generate Report
          </button>
          <button className="outline-button">
            <Download size={16} />
            Export
          </button>
        </div>
      </div>
      <div className="reports-grid">
        <article className="data-card">
          <div className="card-title"><h2>After-hours Summary</h2></div>
          <div className="report-subgrid">
            <ReportBox title="Executive Summary">
              <p>Equities closed mixed as tech strength offset energy weakness. NVDA led gains after strong guidance while XOM fell on oil inventory build.</p>
              <div className="breadth-line"><span>Market Breadth</span><strong className="up">1,742</strong><strong className="down">1,258</strong></div>
            </ReportBox>
            <ReportBox title="Top Movers">
              {['NVDA +4.18%', 'AMD +2.71%', 'MSFT +1.23%', 'XOM -2.45%', 'JPM -1.18%'].map((row) => <span key={row}>{row}</span>)}
            </ReportBox>
            <ReportBox title="Sector Performance">
              {['Technology +1.64%', 'Comm. Services +0.92%', 'Financials -0.27%', 'Energy -1.32%'].map((row) => <span key={row}>{row}</span>)}
            </ReportBox>
            <ReportBox title="Key Drivers">
              {['NVDA guidance beats', 'Retail sales stronger than expected', '10Y yield eased after mixed data', 'Crude inventories rose'].map((row) => <span key={row}>{row}</span>)}
            </ReportBox>
          </div>
        </article>
        <article className="data-card">
          <div className="card-title"><h2>Weekly Forecast</h2></div>
          <div className="report-subgrid">
            <ReportBox title="Next Week Outlook">
              <p>Markets face key earnings and economic data. Volatility may remain elevated with Powell testimony and retail sales in focus.</p>
              <ImpactBadge impact="Moderately Bullish" />
            </ReportBox>
            <ReportBox title="Macro Events">
              {['Powell Speech', 'Existing Home Sales', 'PMI Flash', 'PCE Price Index'].map((row) => <span key={row}>{row}</span>)}
            </ReportBox>
            <ReportBox title="Earnings to Watch">
              {['NVDA', 'MSFT', 'AMZN', 'GOOGL', 'JPM'].map((row) => <span key={row}>{row}</span>)}
            </ReportBox>
            <ReportBox title="Risk Themes">
              {['Sticky inflation delays rate cuts', 'Geopolitical tensions escalate', 'Credit spreads widening'].map((row) => <span key={row}>{row}</span>)}
            </ReportBox>
          </div>
        </article>
      </div>
      <article className="data-card history-card">
        <div className="card-title"><h2>Report History</h2></div>
        {historyRows.map(([type, date, time, summary]) => (
          <div className="history-row" key={`${type}-${date}-${time}`}>
            <FileText size={16} />
            <strong>{type}</strong>
            <span>{date}</span>
            <span>{time}</span>
            <span>{summary}</span>
            <Download size={15} />
            <Menu size={15} />
          </div>
        ))}
      </article>
    </div>
  );
}

function ImpactBadge({ impact }: { impact: string }) {
  return <span className={`impact-badge ${impact.toLowerCase().replaceAll(' ', '-')}`}>{impact}</span>;
}

function EventPill({ impact, label }: { impact: string; label: string }) {
  return (
    <div className="event-pill">
      <span>{label}</span>
      <ImpactBadge impact={impact} />
    </div>
  );
}

function ReportBox({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="report-box">
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}
