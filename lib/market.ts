export type Quote = {
  symbol: string;
  price: number;
  change: number;
  percent: number;
  quotedAt?: string;
};

export type MarketPayload = {
  provider: 'finnhub';
  generatedAt: string;
  categories: { name: string; quotes: Quote[] }[];
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

export function parseMarketPayload(value: unknown): MarketPayload {
  if (!record(value) || value.provider !== 'finnhub' || !validDate(value.generatedAt) ||
      !Array.isArray(value.categories) || value.categories.length === 0) {
    throw new Error('Invalid market snapshot');
  }
  const names = new Set<string>();
  for (const category of value.categories) {
    if (!record(category) || typeof category.name !== 'string' || !category.name.trim() ||
        names.has(category.name) || !Array.isArray(category.quotes) || category.quotes.length === 0) {
      throw new Error('Invalid market category');
    }
    names.add(category.name);
    const symbols = new Set<string>();
    for (const quote of category.quotes) {
      if (!record(quote) || typeof quote.symbol !== 'string' || !quote.symbol.trim() ||
          symbols.has(quote.symbol) || !finite(quote.price) || quote.price <= 0 ||
          !finite(quote.change) || !finite(quote.percent) ||
          (quote.quotedAt !== undefined && !validDate(quote.quotedAt))) {
        throw new Error('Invalid market quote');
      }
      symbols.add(quote.symbol);
    }
  }
  return value as MarketPayload;
}

// Snapshot age is separate from trade age: the last trade may be on Friday.
export function snapshotIsStale(generatedAt: string, now: number): boolean {
  return now - Date.parse(generatedAt) > 2 * 60 * 60 * 1000;
}
