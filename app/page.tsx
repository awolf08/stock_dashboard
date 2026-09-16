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
  RefreshCw,
  Plus,
  Settings,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import watchlist from '../config/watchlist.json';
import { parseEventsPayload, type EarningsEvent } from '../lib/events';
import { parseMarketPayload, snapshotIsStale, type Quote } from '../lib/market';

type Page = 'overview' | 'events' | 'reports';
type Accent = 'cyan' | 'amber' | 'blue' | 'violet' | 'pink' | 'gold';
type ThemeMode = 'light' | 'dark';
type RefreshState = 'idle' | 'requesting' | 'updating' | 'success' | 'error';

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
const themeStorageKey = 'baybell-theme';

// This is only a public navigation URL. Authentication belongs to the report host.
const privateReportsUrl = process.env.NEXT_PUBLIC_PRIVATE_REPORTS_URL || 'https://baybell.com/private/';
const baybellHome = process.env.NEXT_PUBLIC_BAYBELL_HOME === '1';
const featuredIndexSymbols = ['^GSPC', '^IXIC', '^DJI', '^RUT'];
const refreshQuotesUrl = process.env.NEXT_PUBLIC_REFRESH_QUOTES_URL || '';
const refreshPollIntervalMs = 20_000;
const refreshPollTimeoutMs = 5 * 60_000;
const marketCategoryNames = new Set(['index etf', 'sector etf', 'technology / semis etf', 'leveraged etf', 'fund/bond', 'commodity / macro etf']);

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


function todayInPacific() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function addDaysToDay(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(day: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}

function formatEventNumber(value: number | undefined, currency = false) {
  if (value === undefined) return '—';
  if (currency && Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (currency && Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return currency ? `$${value.toFixed(0)}` : value.toFixed(2);
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

function makeSparklineShape(quote: Quote) {
  const slope = Math.max(-24, Math.min(24, quote.percent * 3.2));
  const start = 46 - slope / 2;
  const end = 46 + slope / 2;
  const bend = quote.change >= 0 ? -8 : 8;
  const points = [
    [4, start],
    [18, start + bend * 0.25],
    [30, start + bend * 0.5],
    [42, (start + end) / 2 + bend],
    [56, end - bend * 0.25],
    [68, end + bend * 0.12],
    [76, end],
  ].map(([x, y]) => [x, Math.max(14, Math.min(70, y))]);
  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  return {
    area: `${line} 76,72 4,72`,
    endX: points.at(-1)?.[0] ?? 76,
    endY: points.at(-1)?.[1] ?? 46,
    line,
  };
}

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.localStorage.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light';
}

function pageFromLocation(): Page {
  if (typeof window === 'undefined') return 'overview';
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('page') || window.location.hash.replace(/^#/, '');
  return requested === 'events' || requested === 'reports' ? requested : 'overview';
}

export default function Home() {
  const [page, setPage] = useState<Page>(() => pageFromLocation());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredTheme());
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [indexes, setIndexes] = useState<Quote[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [earningsEvents, setEarningsEvents] = useState<EarningsEvent[]>([]);
  const [eventsGeneratedAt, setEventsGeneratedAt] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState(false);
  const [now, setNow] = useState(0);
  const [symbolError, setSymbolError] = useState('');
  const feedQuotes = useRef<Quote[]>([]);
  const loaded = useRef(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [overviewView, setOverviewView] = useState<'market' | 'stocks'>('market');
  const [showSymbolDialog, setShowSymbolDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [symbolInput, setSymbolInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [targetCategory, setTargetCategory] = useState(initialCategories[0].name);
  const [refreshState, setRefreshState] = useState<RefreshState>('idle');
  const [refreshMessage, setRefreshMessage] = useState('');
  const generatedAtRef = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    document.documentElement.dataset.theme = themeMode;
    try { window.localStorage.setItem(themeStorageKey, themeMode); } catch {}
  }, [themeMode]);


  const loadMarketSnapshot = useCallback(async ({ signal }: { signal?: AbortSignal } = {}) => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const response = await fetch(`${basePath}/data/market.json?check=${Date.now()}`, {
      cache: 'no-store', signal,
    });
    if (!response.ok) throw new Error('Snapshot unavailable');
    const payload = parseMarketPayload(await response.json());
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
      setCategories((current) => current.map((category) => ({
        ...category,
        quotes: category.quotes.map((quote) => quotesBySymbol.get(quote.symbol) ?? quote),
      })));
    }
    generatedAtRef.current = payload.generatedAt;
    setGeneratedAt(payload.generatedAt);
    setLoadError(false);
    setNow(Date.now());
    return payload;
  }, []);

  useEffect(() => {
    const syncPageFromUrl = () => setPage(pageFromLocation());
    window.addEventListener('popstate', syncPageFromUrl);
    window.addEventListener('hashchange', syncPageFromUrl);
    return () => {
      window.removeEventListener('popstate', syncPageFromUrl);
      window.removeEventListener('hashchange', syncPageFromUrl);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    async function refresh() {
      request = new AbortController();
      const timeout = setTimeout(() => request?.abort(), 15000);
      try {
        await loadMarketSnapshot({ signal: request.signal });
      } catch {
        if (!stopped) setLoadError(true);
      } finally {
        clearTimeout(timeout);
        if (!stopped) timer = setTimeout(refresh, 60000);
      }
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); request?.abort(); };
  }, [loadMarketSnapshot]);


  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    async function refreshEvents() {
      request = new AbortController();
      const timeout = setTimeout(() => request?.abort(), 15000);
      try {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
        const response = await fetch(`${basePath}/data/events.json?check=${Date.now()}`, {
          cache: 'no-store', signal: request.signal,
        });
        if (!response.ok) throw new Error('Events unavailable');
        const payload = parseEventsPayload(await response.json());
        if (stopped) return;
        setEarningsEvents(payload.earnings);
        setEventsGeneratedAt(payload.generatedAt);
        setEventsError(false);
      } catch {
        if (!stopped) setEventsError(true);
      } finally {
        clearTimeout(timeout);
        if (!stopped) timer = setTimeout(refreshEvents, 5 * 60 * 1000);
      }
    }
    void refreshEvents();
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


  async function triggerQuoteRefresh() {
    if (refreshState === 'requesting' || refreshState === 'updating') return;
    if (!refreshQuotesUrl) {
      setRefreshState('error');
      setRefreshMessage('Refresh endpoint is not connected yet.');
      return;
    }
    const startedFrom = generatedAtRef.current;
    setRefreshState('requesting');
    setRefreshMessage('Requesting GitHub update…');
    try {
      const response = await fetch(refreshQuotesUrl, { method: 'POST' });
      const result = await response.json().catch(() => ({})) as { message?: string; runUrl?: string };
      if (!response.ok) throw new Error(result.message || 'Could not start quote refresh.');
      setRefreshState('updating');
      setRefreshMessage(result.message || 'GitHub is updating quotes. This usually takes 2–5 minutes.');
      const deadline = Date.now() + refreshPollTimeoutMs;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, refreshPollIntervalMs));
        const payload = await loadMarketSnapshot();
        if (payload.generatedAt && payload.generatedAt !== startedFrom) {
          setRefreshState('success');
          setRefreshMessage('Quotes updated.');
          return;
        }
      }
      setRefreshState('error');
      setRefreshMessage('Refresh was requested, but the new snapshot is not visible yet. Try again in a minute.');
    } catch (error) {
      setRefreshState('error');
      setRefreshMessage(error instanceof Error ? error.message : 'Could not refresh quotes.');
    }
  }

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
          <div className="theme-toggle" aria-label="Theme mode">
            <button className={themeMode === 'light' ? 'active' : ''} onClick={() => setThemeMode('light')} type="button">Light</button>
            <button className={themeMode === 'dark' ? 'active' : ''} onClick={() => setThemeMode('dark')} type="button">Dark</button>
          </div>
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
            activeView={overviewView}
            onRefreshQuotes={triggerQuoteRefresh}
            onSetActiveView={setOverviewView}
            onSetFilter={setActiveFilter}
            refreshMessage={refreshMessage}
            refreshState={refreshState}
          />
        )}
        {page === 'events' && <Events earnings={earningsEvents} generatedAt={eventsGeneratedAt} hasError={eventsError} />}
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
  activeView,
  breadth,
  categories,
  indexQuotes,
  onRefreshQuotes,
  onSetActiveView,
  onSetFilter,
  refreshMessage,
  refreshState,
}: {
  activeFilter: string;
  activeView: 'market' | 'stocks';
  breadth: { gainers: number; losers: number };
  categories: Category[];
  indexQuotes: Quote[];
  onRefreshQuotes: () => void;
  onSetActiveView: (view: 'market' | 'stocks') => void;
  onSetFilter: (filter: string) => void;
  refreshMessage: string;
  refreshState: RefreshState;
}) {
  const filters = ['All', 'Gainers', 'Losers'];
  const visibleCategories = categories.filter((category) =>
    activeView === 'market'
      ? marketCategoryNames.has(category.name.toLowerCase())
      : !marketCategoryNames.has(category.name.toLowerCase()),
  );
  return (
    <div className="page-content">
      {indexQuotes.length > 0 && (
        <div className="index-deck" aria-label="Major index quotes">
          {indexQuotes.map((quote) => {
            const sparkline = makeSparklineShape(quote);
            return (
              <a className={`index-card ${quote.change < 0 ? 'negative' : ''}`} key={quote.symbol} href={yahooChartUrl(quote.symbol)} target="_blank" rel="noreferrer" aria-label={`Open ${quote.label ?? quote.symbol} 1 year candle chart on Yahoo Finance`}>
                <div>
                  <span>{quote.label ?? quote.symbol}</span>
                  <strong>{formatPrice(quote.price)}</strong>
                  <em>{formatSigned(quote.change)} · {formatSigned(quote.percent)}%</em>
                </div>
                <svg className="sparkline" viewBox="0 0 80 80" aria-label={`${quote.symbol} ${quote.percent >= 0 ? 'up' : 'down'} ${formatSigned(quote.percent)} percent`}>
                  <polygon className="sparkline-area" points={sparkline.area} />
                  <polyline className="sparkline-line" points={sparkline.line} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  <circle className="sparkline-dot" cx={sparkline.endX} cy={sparkline.endY} r="1.8" />
                </svg>
              </a>
            );
          })}
        </div>
      )}
      <div className="page-heading">
        <div>
          <h1>Overview</h1>
          <p>{activeView === 'market' ? 'Index ETF and sector ETF groups' : 'All stock watchlist cards'}</p>
        </div>
        <div className="action-row">
          <div className="view-switch" role="tablist" aria-label="Overview view">
            <button className={activeView === 'market' ? 'active' : ''} onClick={() => onSetActiveView('market')} role="tab" aria-selected={activeView === 'market'}>Index & Sector ETF</button>
            <button className={activeView === 'stocks' ? 'active' : ''} onClick={() => onSetActiveView('stocks')} role="tab" aria-selected={activeView === 'stocks'}>Stocks Cards</button>
          </div>
          {filters.map((filter) => (
            <button className={`filter-button ${activeFilter === filter ? 'active' : ''}`} key={filter} onClick={() => onSetFilter(filter)}>
              {filter}
            </button>
          ))}
          <button className="outline-button refresh-quotes-button" disabled={refreshState === 'requesting' || refreshState === 'updating'} onClick={onRefreshQuotes} type="button">
            <RefreshCw className={refreshState === 'requesting' || refreshState === 'updating' ? 'spin-icon' : ''} size={16} />
            {refreshState === 'requesting' || refreshState === 'updating' ? 'Refreshing' : 'Refresh Quotes'}
          </button>
          <div className="breadth-chip">
            <span>Market Breadth</span>
            <strong className="up">{breadth.gainers}</strong>
            <strong className="down">{breadth.losers}</strong>
          </div>
        </div>
      </div>
      {refreshMessage && <output className={`refresh-status refresh-status-${refreshState}`}>{refreshMessage}</output>}
      <div className="quote-grid">
        {visibleCategories.map((category) => (
          <QuotePanel category={{ ...category, quotes: category.quotes.filter((quote) => activeFilter === 'Gainers' ? quote.change > 0 : activeFilter === 'Losers' ? quote.change < 0 : true) }} key={category.name} />
        ))}
      </div>
    </div>
  );
}

function QuotePanel({
  category,
}: {
  category: Category;
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
      </div>
      {category.quotes.map((quote) => (
        <div className="quote-row" key={quote.symbol}>
          <a className="symbol-link" href={yahooChartUrl(quote.symbol)} target="_blank" rel="noreferrer" title={quote.quotedAt ? `Quote time: ${new Date(quote.quotedAt).toLocaleString()}` : 'Quote time unavailable; regenerate the snapshot to include it.'} aria-label={`Open ${quote.symbol} 1 year candle chart on Yahoo Finance`}>{quote.symbol}</a>
          <span className="number">{formatPrice(quote.price)}</span>
          <span className={`number ${quote.change >= 0 ? 'up' : 'down'}`}>{formatSigned(quote.change)}</span>
          <span className={`number ${quote.percent >= 0 ? 'up' : 'down'}`}>{formatSigned(quote.percent)}%</span>
        </div>
      ))}
      {category.quotes.length === 0 && <div className="empty-panel">No symbols yet</div>}
    </article>
  );
}

function Events({ earnings, generatedAt, hasError }: { earnings: EarningsEvent[]; generatedAt: string | null; hasError: boolean }) {
  const [activeFilter, setActiveFilter] = useState('Today');
  const today = todayInPacific();
  const tomorrow = addDaysToDay(today, 1);
  const filterButtons = ['Today', 'Tomorrow', 'This Week', 'Watchlist Only', 'High Impact'];
  const filteredEarnings = earnings.filter((event) => {
    if (activeFilter === 'Today') return event.date === today;
    if (activeFilter === 'Tomorrow') return event.date === tomorrow;
    if (activeFilter === 'Watchlist Only') return event.watchlistMatch;
    if (activeFilter === 'High Impact') return event.impact === 'High';
    return true;
  });
  const todayEvents = earnings.filter((event) => event.date === today);
  const tomorrowEvents = earnings.filter((event) => event.date === tomorrow);
  const watchlistEvents = earnings.filter((event) => event.watchlistMatch).slice(0, 8);
  const days = Array.from(new Set(earnings.map((event) => event.date))).slice(0, 7);
  return (
    <div className="page-content">
      <div className="page-heading">
        <h1>Events</h1>
        <div className="action-row left">
          {filterButtons.map((label) => (
            <button className={`filter-button ${activeFilter === label ? 'active' : ''}`} key={label} onClick={() => setActiveFilter(label)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className={`data-notice ${hasError ? 'data-notice-warning' : ''}`}>
        {hasError
          ? 'Could not load verified earnings events. The next GitHub update will try again.'
          : generatedAt
            ? `Finnhub earnings calendar · updated ${new Date(generatedAt).toLocaleString()}`
            : 'Loading verified earnings events…'}
      </div>
      <div className="events-grid">
        <article className="data-card earnings-card">
          <div className="card-title">
            <h2>Earnings Calendar</h2>
            <a className="link-button" href="https://finance.yahoo.com/calendar/earnings" target="_blank" rel="noreferrer">View Full Earnings Calendar</a>
          </div>
          <div className="earnings-layout">
            <EarningsDay title="Today" date={formatDayLabel(today)} before={todayEvents.filter((event) => event.session === 'before-open')} after={todayEvents.filter((event) => event.session !== 'before-open')} />
            <EarningsDay title="Tomorrow" date={formatDayLabel(tomorrow)} before={tomorrowEvents.filter((event) => event.session === 'before-open')} after={tomorrowEvents.filter((event) => event.session !== 'before-open')} />
          </div>
        </article>
        <article className="data-card">
          <div className="card-title">
            <h2>{activeFilter} Earnings</h2>
          </div>
          <div className="event-list">
            {filteredEarnings.slice(0, 18).map((event) => (
              <div className="event-row" key={`${event.symbol}-${event.date}-${event.session}`}>
                <CalendarDays size={18} />
                <div>
                  <strong><a className="symbol-link" href={yahooChartUrl(event.symbol)} target="_blank" rel="noreferrer">{event.symbol}</a></strong>
                  <span>{event.company || formatDayLabel(event.date)}</span>
                </div>
                <time>{event.timeLabel}</time>
                <ImpactBadge impact={event.impact} />
                {event.watchlistMatch && <Star size={16} />}
              </div>
            ))}
            {filteredEarnings.length === 0 && <div className="empty-panel">No verified earnings events for this filter</div>}
          </div>
        </article>
      </div>
      <article className="data-card weekly-calendar">
        <div className="card-title">
          <h2>Next 7 Days</h2>
          <span className="link-button">{earnings.length} verified events</span>
        </div>
        <div className="week-grid">
          {days.map((day) => {
            const dayEvents = earnings.filter((event) => event.date === day);
            return (
              <div className={`day-column ${day === today ? 'active' : ''}`} key={day}>
                <strong>{formatDayLabel(day)}</strong>
                {dayEvents.slice(0, 3).map((event) => <EventPill label={`${event.symbol} Earnings`} impact={event.impact} key={`${event.symbol}-${event.session}`} />)}
                {dayEvents.length > 3 && <span className="link-button">+{dayEvents.length - 3} More Events</span>}
                {dayEvents.length === 0 && <span className="muted-text">No earnings</span>}
              </div>
            );
          })}
          {days.length === 0 && <div className="empty-panel">No verified earnings events available yet</div>}
        </div>
      </article>
      {watchlistEvents.length > 0 && (
        <article className="data-card weekly-calendar">
          <div className="card-title"><h2>Watchlist Earnings Highlights</h2></div>
          <div className="event-list">
            {watchlistEvents.map((event) => (
              <div className="event-row" key={`watch-${event.symbol}-${event.date}-${event.session}`}>
                <Star size={16} />
                <div>
                  <strong><a className="symbol-link" href={yahooChartUrl(event.symbol)} target="_blank" rel="noreferrer">{event.symbol}</a></strong>
                  <span>{formatDayLabel(event.date)}</span>
                </div>
                <time>{event.timeLabel}</time>
                <span className="number">EPS {formatEventNumber(event.epsEstimate)}</span>
                <span className="number">Rev {formatEventNumber(event.revenueEstimate, true)}</span>
              </div>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}

function EarningsDay({
  after,
  before,
  date,
  title,
}: {
  after: EarningsEvent[];
  before: EarningsEvent[];
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

function EarningsSession({ rows, title }: { rows: EarningsEvent[]; title: string }) {
  return (
    <div className="earnings-session">
      <h3>{title}</h3>
      {rows.map((event) => (
        <div className="earnings-row" key={`${event.symbol}-${event.date}-${event.session}`}>
          <strong><a className="symbol-link" href={yahooChartUrl(event.symbol)} target="_blank" rel="noreferrer">{event.symbol}</a></strong>
          <span>{event.company || event.symbol}</span>
          <span>{formatEventNumber(event.epsEstimate)}</span>
          <span>{formatEventNumber(event.revenueEstimate, true)}</span>
          <time>{event.timeLabel}</time>
          <ImpactBadge impact={event.impact} />
        </div>
      ))}
      {rows.length === 0 && <div className="empty-panel">No verified earnings</div>}
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
