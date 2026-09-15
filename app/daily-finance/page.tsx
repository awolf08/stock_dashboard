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

        <FinanceCard title="Daily Market Summary / 美股收盘总结">
          <div className="report-subgrid">
            <FinanceSection title="How It Is Generated">
              <p>The dashboard generates a structured daily market summary from the latest quote snapshot: index moves, watchlist breadth, strongest and weakest groups, top movers, support/resistance levels, and next-session scenarios.</p>
              <div className="link-row">
                <a className="primary-button" href="/data/daily-market-summary.json" target="_blank" rel="noreferrer">Open Summary JSON</a>
                <a className="filter-button" href="https://github.com/awolf08/FinanceDailyReport/tree/main/reports" target="_blank" rel="noreferrer">Open Legacy Archive</a>
              </div>
            </FinanceSection>
            <FinanceSection title="Next Upgrade">
              <p>This is the data layer for the kind of Chinese close report you showed. The next step is adding an LLM writing pass that turns the JSON into a longer narrative with macro/news context.</p>
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
