import { FinanceCard, FinanceList, FinanceSection, FinanceShell, MetricStrip } from '../finance-page';

const preMarketChecklist = [
  'Overnight futures: S&P 500, Nasdaq 100, Dow, Russell 2000 direction and gap size.',
  'Rates and dollar: 10Y yield, 2Y yield, DXY, and market reaction to macro data.',
  'Pre-market movers: top watchlist gaps, earnings reactions, guidance changes, analyst upgrades or downgrades.',
  'Key levels: prior close, overnight high/low, major support/resistance, and invalidation level.',
];

const afterHoursChecklist = [
  'Index recap: close location, breadth, volume, volatility, and sector leadership.',
  'Top drivers: earnings, macro headlines, rates, mega-cap moves, and ETF flow signals.',
  'Watchlist review: strongest names, weakest names, failed breakouts, and follow-through candidates.',
  'Tomorrow plan: bullish trigger, bearish trigger, neutral chop zone, and risk controls.',
];

export default function DailyFinancePage() {
  return (
    <FinanceShell
      active="daily"
      eyebrow="Daily Finance"
      title="Daily Market Briefing"
      subtitle="One pre-market plan and one after-hours review for the major indexes, watchlists, and trading levels."
    >
      <div className="reports-grid finance-grid-wide">

        <FinanceCard title="Yahoo-style Daily Report">
          <div className="report-subgrid">
            <FinanceSection title="Generated Report Link">
              <p>Open the original FinanceDailyReport output with the Yahoo-style market report layout.</p>
              <div className="link-row">
                <a className="primary-button" href="https://awolf08.github.io/FinanceDailyReport/latest/" target="_blank" rel="noreferrer">Open Latest Report</a>
                <a className="filter-button" href="https://awolf08.github.io/FinanceDailyReport/reports/" target="_blank" rel="noreferrer">Open Report Archive</a>
              </div>
              <p className="muted-text">This is the legacy generated report. Its scheduled job is currently disabled, so Latest points to the last generated report unless we re-enable that workflow.</p>
            </FinanceSection>
            <FinanceSection title="How This Fits">
              <p>Use this link when you want the detailed daily report format. Use the cards below for the newer Baybell briefing template and future automation.</p>
            </FinanceSection>
          </div>
        </FinanceCard>

        <FinanceCard title="Pre-market Analysis Template">
          <MetricStrip metrics={[
            { label: 'Publish Time', value: 'Before Open', tone: 'neutral' },
            { label: 'Focus', value: 'Plan', tone: 'up' },
            { label: 'Coverage', value: 'Indexes + Watchlist', tone: 'neutral' },
          ]} />
          <div className="report-subgrid">
            <FinanceSection title="Market Setup">
              <p>Summarize futures, overnight news, yields, dollar, volatility, and the most important macro calendar items before the bell.</p>
            </FinanceSection>
            <FinanceSection title="Trading Plan">
              <p>Define bullish, bearish, and neutral scenarios with clear trigger levels and invalidation points for SPY, QQQ, DIA, and IWM.</p>
            </FinanceSection>
            <FinanceSection title="Watchlist Focus">
              <FinanceList items={preMarketChecklist} />
            </FinanceSection>
            <FinanceSection title="Risk Notes">
              <p>List events that can change the plan: Fed speakers, CPI/PPI/PCE, employment data, major earnings, oil shock, or bond-market move.</p>
            </FinanceSection>
          </div>
        </FinanceCard>

        <FinanceCard title="After-hours Analysis Template">
          <MetricStrip metrics={[
            { label: 'Publish Time', value: 'After Close', tone: 'neutral' },
            { label: 'Focus', value: 'Review', tone: 'up' },
            { label: 'Coverage', value: 'Close + Next Day', tone: 'neutral' },
          ]} />
          <div className="report-subgrid">
            <FinanceSection title="Session Summary">
              <p>Explain what moved the market, which indexes confirmed strength or weakness, and whether the close supports continuation or reversal.</p>
            </FinanceSection>
            <FinanceSection title="Breadth and Leadership">
              <p>Track gainers versus losers, new highs/lows, sector rotation, mega-cap leadership, and whether small caps joined the move.</p>
            </FinanceSection>
            <FinanceSection title="Watchlist Review">
              <FinanceList items={afterHoursChecklist} />
            </FinanceSection>
            <FinanceSection title="Next Session Prep">
              <p>Convert the day’s action into tomorrow’s key levels, likely scenarios, priority symbols, and risk limits.</p>
            </FinanceSection>
          </div>
        </FinanceCard>
      </div>
    </FinanceShell>
  );
}
