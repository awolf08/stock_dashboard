const DEFAULT_ALLOWED_ORIGINS = 'https://baybell.com,https://www.baybell.com,http://localhost:3000,http://localhost:5173';

function json(body, init = {}, origin = '*') {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS, GET',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
      ...init.headers,
    },
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : allowed[0] || '*';
}

async function githubJson(env, path, init = {}) {
  const owner = env.GITHUB_OWNER || 'awolf08';
  const repo = env.GITHUB_REPO || 'reports';
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'user-agent': 'baybell-refresh-quotes-worker',
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || `GitHub API failed with ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function recentRun(env) {
  const workflow = env.GITHUB_WORKFLOW || 'deploy-homepage.yml';
  const runs = await githubJson(env, `/actions/workflows/${workflow}/runs?branch=${env.GITHUB_REF || 'main'}&per_page=10`);
  const now = Date.now();
  const cooldownMs = Number(env.MIN_SECONDS_BETWEEN_RUNS || 600) * 1000;
  return runs.workflow_runs?.find((run) => {
    if (run.status === 'queued' || run.status === 'in_progress') return true;
    const created = Date.parse(run.created_at || '');
    return Number.isFinite(created) && now - created < cooldownMs;
  });
}

const handler = {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (request.method === 'OPTIONS') return json({}, { status: 204 }, origin);
    if (new URL(request.url).pathname === '/health') return json({ ok: true }, {}, origin);
    if (request.method !== 'POST') return json({ message: 'Use POST to request a quote refresh.' }, { status: 405 }, origin);
    if (!env.GITHUB_TOKEN) return json({ message: 'Worker is missing GITHUB_TOKEN.' }, { status: 500 }, origin);

    try {
      const existing = await recentRun(env);
      if (existing) {
        return json({
          ok: true,
          message: existing.status === 'completed'
            ? 'A quote update ran recently. Please wait a few minutes before triggering another one.'
            : 'A quote update is already running.',
          runUrl: existing.html_url,
          status: existing.status,
        }, { status: 202 }, origin);
      }

      const workflow = env.GITHUB_WORKFLOW || 'deploy-homepage.yml';
      await githubJson(env, `/actions/workflows/${workflow}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref: env.GITHUB_REF || 'main' }),
      });
      return json({
        ok: true,
        message: 'Quote refresh requested. GitHub is rebuilding Baybell now.',
      }, { status: 202 }, origin);
    } catch (error) {
      return json({ message: error instanceof Error ? error.message : 'Could not request quote refresh.' }, { status: 500 }, origin);
    }
  },
};

export default handler;
