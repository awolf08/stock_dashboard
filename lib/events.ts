export type EarningsEvent = {
  symbol: string;
  company?: string;
  date: string;
  session: 'before-open' | 'after-close' | 'during-market' | 'unknown';
  timeLabel: string;
  epsEstimate?: number;
  revenueEstimate?: number;
  impact: 'High' | 'Medium' | 'Low';
  watchlistMatch: boolean;
};

export type EventsPayload = {
  schemaVersion: 1;
  provider: 'finnhub';
  generatedAt: string;
  range: { from: string; to: string };
  earnings: EarningsEvent[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function validDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

export function parseEventsPayload(value: unknown): EventsPayload {
  if (!record(value) || value.schemaVersion !== 1 || value.provider !== 'finnhub' || !validDate(value.generatedAt) ||
      !record(value.range) || !validDay(value.range.from) || !validDay(value.range.to) || !Array.isArray(value.earnings)) {
    throw new Error('Invalid events payload');
  }
  const seen = new Set<string>();
  for (const event of value.earnings) {
    if (!record(event) || typeof event.symbol !== 'string' || !event.symbol.trim() || !validDay(event.date) ||
        !['before-open', 'after-close', 'during-market', 'unknown'].includes(String(event.session)) ||
        typeof event.timeLabel !== 'string' || !event.timeLabel.trim() ||
        !['High', 'Medium', 'Low'].includes(String(event.impact)) || typeof event.watchlistMatch !== 'boolean' ||
        (event.company !== undefined && typeof event.company !== 'string') ||
        (event.epsEstimate !== undefined && !finite(event.epsEstimate)) ||
        (event.revenueEstimate !== undefined && !finite(event.revenueEstimate))) {
      throw new Error('Invalid earnings event');
    }
    const symbol = String(event.symbol);
    const date = String(event.date);
    const session = String(event.session);
    const key = `${symbol}:${date}:${session}`;
    if (seen.has(key)) throw new Error('Duplicate earnings event');
    seen.add(key);
  }
  return value as EventsPayload;
}
