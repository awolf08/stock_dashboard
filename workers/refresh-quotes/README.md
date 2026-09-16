# Baybell Refresh Quotes Worker

This Cloudflare Worker lets the public dashboard request a safe quote refresh without exposing a GitHub token in the browser.

## Setup

1. Create a GitHub fine-grained token for `awolf08/reports` with Actions workflow permission.
2. From this folder, set the token as a Worker secret:

```bash
pnpm exec wrangler secret put GITHUB_TOKEN --config workers/refresh-quotes/wrangler.toml
```

3. Deploy the Worker:

```bash
pnpm exec wrangler deploy --config workers/refresh-quotes/wrangler.toml
```

4. Add the deployed Worker URL as repository variable `REFRESH_QUOTES_URL` in both repositories that build the homepage:

- `awolf08/reports`
- `awolf08/stock_dashboard`

The dashboard reads it through `NEXT_PUBLIC_REFRESH_QUOTES_URL` at build time.
