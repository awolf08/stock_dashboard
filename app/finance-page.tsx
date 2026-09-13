import Link from 'next/link';
import { BarChart3, CalendarDays, FileText, Home, LockKeyhole, Settings, Star } from 'lucide-react';
import type { ReactNode } from 'react';

const privateReportsUrl = process.env.NEXT_PUBLIC_PRIVATE_REPORTS_URL || 'https://baybell.com/private/';

type FinanceShellProps = {
  active: 'daily' | 'weekly';
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function FinanceShell({ active, children, eyebrow, subtitle, title }: FinanceShellProps) {
  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <Link className="brand brand-link" href="/" aria-label="Back to dashboard overview">
          <BarChart3 size={24} />
          <span>鬼谷仙 Dashboard</span>
        </Link>

        <nav className="primary-nav" aria-label="Main navigation">
          <Link className="nav-item" href="/"><Home size={18} /><span>Overview</span></Link>
          <Link className="nav-item" href="/#events"><CalendarDays size={18} /><span>Events</span></Link>
          <Link className={`nav-item ${active === 'daily' ? 'active' : ''}`} href="/daily-finance/"><FileText size={18} /><span>Daily Finance</span></Link>
          <Link className={`nav-item ${active === 'weekly' ? 'active' : ''}`} href="/weekly-finance/"><CalendarDays size={18} /><span>Weekly Finance</span></Link>
          <Link className="nav-item" href="/guru-position/"><BarChart3 size={18} /><span>Guru Positions</span></Link>
          <a className="nav-item" href="https://options.baybell.com"><FileText size={18} /><span>Options</span></a>
          {privateReportsUrl && (
            <a className="nav-item" href={privateReportsUrl}>
              <LockKeyhole size={18} />
              <span>Private Reports</span>
            </a>
          )}
          <Link className="nav-item" href="/"><Star size={18} /><span>Watchlists</span></Link>
          <Link className="nav-item" href="/"><Settings size={18} /><span>Settings</span></Link>
        </nav>

        <div className="sidebar-footer">
          <div className="market-mini">
            <span className="status-dot" />
            <div>
              <strong>Finance Reports</strong>
              <span>{active === 'daily' ? 'Pre-market and after-hours' : 'Weekly outlook'}</span>
              <span>Template v1</span>
            </div>
          </div>
          <div className="updated-mini">
            <span>Report Style</span>
            <strong>Market briefing</strong>
            <span>Designed for manual or automated analysis</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <div className="page-content finance-page">
          <div className="page-heading finance-hero">
            <div>
              <span className="finance-eyebrow">{eyebrow}</span>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="action-row">
              <Link className="filter-button" href="/">Dashboard</Link>
              <a className="primary-button" href={privateReportsUrl}>Private Login</a>
            </div>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

export function FinanceCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <article className="data-card finance-card">
      <div className="card-title"><h2>{title}</h2></div>
      <div className="finance-card-body">{children}</div>
    </article>
  );
}

export function FinanceSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="report-box finance-section">
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

export function FinanceList({ items }: { items: string[] }) {
  return (
    <ul className="finance-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export function MetricStrip({ metrics }: { metrics: { label: string; value: string; tone?: 'up' | 'down' | 'neutral' }[] }) {
  return (
    <div className="metric-strip">
      {metrics.map((metric) => (
        <div className="metric-tile" key={metric.label}>
          <span>{metric.label}</span>
          <strong className={metric.tone === 'up' ? 'up' : metric.tone === 'down' ? 'down' : ''}>{metric.value}</strong>
        </div>
      ))}
    </div>
  );
}
