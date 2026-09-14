import { FinanceCard, FinanceList, FinanceSection, FinanceShell, MetricStrip } from '../finance-page';

const weeklyDrivers = [
  'Macro calendar: inflation, jobs, GDP, PMI, Fed speakers, Treasury auctions, and oil inventory data.',
  'Earnings calendar: watchlist names, mega-cap earnings, semiconductor, cloud, finance, and consumer bellwethers.',
  'Technical map: weekly trend, support/resistance, moving averages, breadth, volatility, and failed-breakout risk.',
  'Scenario plan: base case, bullish case, bearish case, trigger levels, and what would change the view.',
];

const portfolioNotes = [
  'Indexes and ETFs to monitor: SPY, QQQ, DIA, IWM, SMH, SOXL, IGV, TQQQ, UPRO.',
  'Leadership check: AI leaders, cloud and infrastructure, fintech, brokers, China ADR, crypto-linked equities.',
  'Risk controls: position size, event exposure, gap risk, correlation, and maximum drawdown tolerance.',
];

export default function WeeklyFinancePage() {
  return (
    <FinanceShell
      active="weekly"
      eyebrow="Weekly Finance"
      title="Next Week Market Outlook"
      subtitle="A weekly forecast template for index direction, macro drivers, earnings focus, and scenario planning."
    >
      <div className="reports-grid finance-grid-wide">
        <FinanceCard title="Generated Weekly Report Link">
          <div className="report-subgrid">
            <FinanceSection title="Weekly Market Events Report">
              <p>Open the generated weekly market-events report from the legacy FinanceDailyReport publisher.</p>
              <div className="link-row">
                <a className="primary-button" href="https://baybell.com/weekly-finance/2026-09-13.html" target="_blank" rel="noreferrer">Open Latest Weekly Report</a>
                <a className="filter-button" href="https://github.com/awolf08/FinanceDailyReport/tree/main/reports" target="_blank" rel="noreferrer">Open Report Archive</a>
              </div>
            </FinanceSection>
            <FinanceSection title="How This Fits">
              <p>Use this link for the full weekly generated report. The cards below remain the Baybell weekly planning template.</p>
            </FinanceSection>
          </div>
        </FinanceCard>

        <FinanceCard title="Weekly Forecast Template">
          <MetricStrip metrics={[
            { label: 'Publish Time', value: 'Weekend', tone: 'neutral' },
            { label: 'Focus', value: 'Next Week', tone: 'up' },
            { label: 'Output', value: 'Forecast + Plan', tone: 'neutral' },
          ]} />
          <div className="report-subgrid">
            <FinanceSection title="Executive View">
              <p>State the weekly bias for the major indexes, the confidence level, and the main reason behind the view.</p>
            </FinanceSection>
            <FinanceSection title="Index Roadmap">
              <p>Map SPY, QQQ, DIA, and IWM with upside levels, downside levels, momentum condition, and invalidation points.</p>
            </FinanceSection>
            <FinanceSection title="Key Drivers">
              <FinanceList items={weeklyDrivers} />
            </FinanceSection>
            <FinanceSection title="Trading Scenarios">
              <p>Write the base, bullish, and bearish scenarios so the weekly view can be updated quickly when price or macro data changes.</p>
            </FinanceSection>
          </div>
        </FinanceCard>

        <FinanceCard title="Portfolio and Watchlist Plan">
          <MetricStrip metrics={[
            { label: 'Universe', value: 'Indexes + Sectors', tone: 'neutral' },
            { label: 'Review', value: 'Weekly', tone: 'up' },
            { label: 'Risk', value: 'Scenario Based', tone: 'neutral' },
          ]} />
          <div className="report-subgrid">
            <FinanceSection title="Sector Focus">
              <p>Identify the strongest sectors, weakest sectors, rotation candidates, and whether risk appetite favors growth, value, defensives, or small caps.</p>
            </FinanceSection>
            <FinanceSection title="Earnings Focus">
              <p>Highlight upcoming earnings that can move watchlist groups or indexes, especially AI, cloud, semiconductors, finance, and consumer leaders.</p>
            </FinanceSection>
            <FinanceSection title="Position Planning">
              <FinanceList items={portfolioNotes} />
            </FinanceSection>
            <FinanceSection title="Follow-up Checklist">
              <p>Update the weekly thesis after major macro data, after the first two trading sessions, and after any break above or below the weekly levels.</p>
            </FinanceSection>
          </div>
        </FinanceCard>
      </div>
    </FinanceShell>
  );
}
