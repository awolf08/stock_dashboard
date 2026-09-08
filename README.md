# 鬼谷仙 Dashboard

A stock dashboard with verified Finnhub snapshots, refreshed about once an hour by GitHub Actions when scheduling is healthy. The browser checks for a newly published snapshot every minute. This is not a streaming quote service.

## Current behavior

- Overview uses `public/data/market.json`; no fabricated quote fallback.
- Missing, mock, malformed or zero-price snapshots show an unavailable state.
- Failed refreshes keep the last loaded valid snapshot. A snapshot older than two hours is marked overdue. The snapshot fetch time is separate from the last trade time; old trade timestamps are normal when markets are closed.
- Hover over a symbol for its quote timestamp. Legacy snapshots made by the old script have no per-symbol timestamps; fetch again to add them.
- Events and Reports are explicitly labelled demo content. Fake index cards and sparklines have been removed.
- Watchlist edits in the page are saved in the current browser. Add Symbol can reuse only symbols in the fetched feed. To make a symbol available to every visitor and every browser, edit `config/watchlist.json`, commit it, and let the update workflow fetch the next snapshot. Block uses `XYZ`, replacing the obsolete `SQ` symbol.

## 1. Local setup

Use Node 22.13+ (Node 24 recommended) and pnpm 11.19.0.

If this Mac's Terminal cannot find Node or pnpm:

```bash
export PATH="/Users/weicheng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/weicheng/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
```

```bash
cd /Users/weicheng/Desktop/Projects/stock_dashboard
pnpm install --frozen-lockfile
FINNHUB_API_KEY='YOUR_REAL_KEY' pnpm fetch:data
pnpm dev
```

Open http://localhost:3000/. Stop with Control+C. The fetch script does not automatically load `.env`; pass the key in the environment as above. Do not commit credentials.

A missing key, invalid symbol, unavailable quote or exhausted retry sequence makes the update fail without overwriting the prior JSON. There are bounded retries for network errors, rate limits and server errors; requests are spaced apart and repeated symbols across categories are fetched once. All configured symbols must succeed before a new snapshot is written.

The JSON is generated and ignored by Git. GitHub Actions creates a fresh copy before building. Your local snapshot is not uploaded to the source repository.

## 2. Check the project

```bash
pnpm test
pnpm lint
pnpm typecheck
NEXT_PUBLIC_BASE_PATH=/stock_dashboard pnpm build:pages
```

Tests use simulated API responses and temporary directories, require no API key, and do not overwrite your market data. They cover invalid quotes, retries, authentication failures, atomic updates, request deduplication and stale snapshot detection.

`build:pages` produces **dist/client**: HTML, client assets and the snapshot only. It validates the HTML's asset paths. Use an empty `NEXT_PUBLIC_BASE_PATH` for a root/custom-domain site. The workflow obtains this setting automatically from GitHub Pages.

The existing `pnpm build` and `pnpm start` still build/serve the Cloudflare Worker version locally. After a Pages build, run `pnpm build` before `pnpm start` because the two builds share `dist`.

## 3. Create the GitHub repository

This Dashboard is the public website. Private reports remain on `https://baybell.com/private/`, using the existing Cloudflare Access setup confirmed by the owner. An ordinary private repository does not make its Pages website private; keep private report files out of this Dashboard's public build.

On GitHub, create an empty repository called `stock_dashboard`. Do not initialize it with another README, license or .gitignore. Then use Terminal (replace YOUR_USERNAME with your GitHub username):

```bash
git init -b main
git add .
git status --short
```

Check that `.env`, `node_modules`, `dist` and `public/data/market.json` are absent from the staged list. Then:

```bash
git commit -m "Prepare hourly Finnhub dashboard for GitHub Pages"
git remote add origin https://github.com/YOUR_USERNAME/stock_dashboard.git
git push -u origin main
```

If Git asks for authentication, use GitHub Desktop or your configured Git credential manager. Do not use your GitHub account password as a Git password.

## 4. Configure GitHub

1. Repository → **Settings → Secrets and variables → Actions → New repository secret**.
2. Name: **FINNHUB_API_KEY**. Value: your real Finnhub key.
3. Repository → **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Repository → **Actions → Update quotes and deploy Dashboard → Run workflow**. Choose `main`.
5. Wait for both `build` and `deploy` to succeed. Open the deployment URL from the run or Settings → Pages. Normally it is `https://YOUR_USERNAME.github.io/stock_dashboard/`.

The first push may fail before the secret and Pages settings exist. After completing those settings, run the workflow manually again.

## 5. Scheduled operation

The workflow runs on pushes to `main`, manual runs, and scheduled checks every 10 minutes at minutes 7, 17, 27, 37, 47 and 57 UTC. Scheduled checks first look at recent successful GitHub Pages deployments. If a successful deployment is less than 55 minutes old, the run exits without fetching quotes or deploying. If the last successful deployment is older, it fetches quotes, builds the website, then deploys it in the same workflow. It does not commit data back to Git or depend on a second workflow being triggered by a bot commit. A failed fetch or build prevents deployment, leaving the previous published version in place.

GitHub scheduling is best-effort and can be delayed or skipped under load. The extra scheduled checks give GitHub several chances each hour to recover from a missed trigger while keeping the target quote refresh cadence near one hour. Public repositories with no activity for 60 days can have scheduled workflows disabled; because this workflow does not create hourly commits, check the Actions page periodically and re-enable it if necessary. GitHub Actions usage is subject to your plan's allowance, especially for private repositories.

Your computer can be off. Keep an eye on the snapshot timestamp and GitHub's failed-run notifications. A browser left open checks the published file every minute; this does not make additional calls to Finnhub.

## 6. Watchlist persistence

Add Symbol, Remove Symbol, Add Category and Delete Category are saved to this browser's `localStorage`. The saved layout contains category names, accent colors and ticker symbols only; prices still come from the latest verified Finnhub snapshot. A later hourly snapshot refreshes prices without undoing your saved watchlists.

This is per browser and per device. To publish a default watchlist for everyone, update `config/watchlist.json`, then commit and push the change. The GitHub workflow fetches quotes for the configured symbols before deploying. A public static page should not store a GitHub token in the browser to write watchlist changes back to the repository.

## Troubleshooting

- **HTTP 401/403**: check the secret and the key's market-data permissions.
- **HTTP 429**: the script backs off and retries. Check your plan's limits if it persists.
- **No valid quote for SYMBOL**: check the ticker and Finnhub coverage in `config/watchlist.json`. Do not replace unavailable quotes with zero or invented values.
- **Local page rejects your old snapshot**: rerun `pnpm fetch:data` with your key. The previous script could produce `SQ: 0`; the new watchlist requests `XYZ`.
- **Pages setup/deploy error**: verify Pages source is GitHub Actions, the branch is `main`, and repository/organization policies permit Pages deployment.
- **404 or unstyled site**: use the deployment URL, including the repository path. The workflow uses `configure-pages` to select the matching base path.

References: [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [Finnhub quote API](https://finnhub.io/docs/api/quote).

## Public dashboard + private reports

These are separate destinations:

- **Public:** this GitHub Pages build, containing roughly hourly quotes and the explicitly labelled demo sections.
- **Private:** the existing report website behind its own verified login. The dashboard links to it but never downloads or embeds its private reports.

The owner confirmed `baybell.com` and that Cloudflare Access is already configured. The Dashboard's **Private Reports** link defaults to `https://baybell.com/private/`, matching the existing site's Private Login destination. Authentication is performed by that site; the Dashboard does not create a second login system. Live Access behavior has not been independently tested in this task.

No extra URL configuration is needed for Baybell. To override the destination later:

1. Dashboard repository → **Settings → Secrets and variables → Actions → Variables → New repository variable**.
2. Name: **PRIVATE_REPORTS_URL**. Value: the replacement HTTPS private entry URL.
3. Run **Update quotes and deploy Dashboard** again to update the sidebar link.

For local development, optionally set `NEXT_PUBLIC_PRIVATE_REPORTS_URL` in `.env.local` and restart `pnpm dev`. The URL is public configuration, not a password or API key. Leaving it unset or empty uses `https://baybell.com/private/`.

Do not place real private report HTML, PDFs or JSON in this project's `public/` folder, client imports or public repository. A private pathname or login link is not an access-control boundary. Verify that logged-out requests to the private report and its data/downloads require authentication, including any alternate hosting URLs. A Cloudflare gate on the custom domain alone must not leave the same files accessible at a public origin. See [Cloudflare Pages Access configuration](https://developers.cloudflare.com/pages/platform/known-issues/) and [GitHub Pages visibility](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

The private report website, its login policies and DNS are not changed by this repository's workflow. Keep the existing report-domain CNAME with that website; do not assign the same apex domain to this separate Pages project.

## Baybell homepage integration

The `awolf08/reports` repository now has a separate homepage assembly workflow.
It checks out this source, fetches a snapshot using its own `FINNHUB_API_KEY`
secret, builds at `/` with `NEXT_PUBLIC_BAYBELL_HOME=1`, and overlays the result
on its existing report archive. That mode adds real report navigation links.
The independent `stock_dashboard` Pages deployment continues to work.

To preview the homepage build locally:

```bash
NEXT_PUBLIC_BAYBELL_HOME=1 pnpm build:pages
```

The `/daily-finance/`, `/weekly-finance/` and `/guru-position/` destinations are
provided by the reports site's assembly step, not by this app's router.
The original report homepage remains available as `/report-index.html` after
assembly. Private report content is never copied into this repository or its
standalone Pages deployment.
