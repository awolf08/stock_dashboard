import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/refresh-quotes/worker.js';

const env = { GITHUB_TOKEN: 'test-token' };

test('hourly trigger dispatches to canonical reports repo when no recent build exists', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return init.method === 'POST' ? new Response(null, { status: 204 }) : Response.json({ workflow_runs: [] });
  };
  try {
    await worker.scheduled({}, env);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, 'https://api.github.com/repos/awolf08/reports/actions/workflows/deploy-homepage.yml/dispatches');
    assert.deepEqual(JSON.parse(calls[1].init.body), { ref: 'main' });
  } finally { globalThis.fetch = original; }
});

test('hourly trigger avoids active and recent builds', async () => {
  const original = globalThis.fetch;
  try {
    for (const run of [{ status: 'in_progress' }, { status: 'queued' }, { status: 'completed', created_at: new Date().toISOString() }]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return Response.json({ workflow_runs: [run] }); };
      await worker.scheduled({}, env);
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = original; }
});

test('hourly trigger exposes API failure instead of silently succeeding', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ message: 'Bad credentials' }, { status: 401 });
  try { await assert.rejects(worker.scheduled({}, env), /Bad credentials/); }
  finally { globalThis.fetch = original; }
});
