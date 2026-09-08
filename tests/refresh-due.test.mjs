import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshDue } from '../scripts/refresh-due.mjs';

const now = Date.parse('2026-09-08T15:00:00Z');
const context = { eventName: 'schedule', repo: { owner: 'example', repo: 'site' } };
function api(statuses) {
  return { rest: { repos: {
    listDeployments: async () => ({ data: statuses.map((_, id) => ({ id })) }),
    listDeploymentStatuses: async ({ deployment_id }) => ({ data: statuses[deployment_id] }),
  } } };
}
const status = (state, minutesAgo) => ({ state, created_at: new Date(now - minutesAgo * 60000).toISOString() });

test('fresh successful deployment suppresses redundant scheduled builds', async () => {
  assert.equal(await refreshDue({ github: api([[status('success', 20)]]), context, now }), false);
  assert.equal(await refreshDue({ github: api([[status('success', 55)]]), context, now }), true);
});
test('failed or absent deployments cannot masquerade as fresh snapshots', async () => {
  assert.equal(await refreshDue({ github: api([[status('failure', 2)], [status('success', 130)]]), context, now }), true);
  assert.equal(await refreshDue({ github: api([]), context, now }), true);
  assert.equal(await refreshDue({ github: api([[status('failure', 2)], [status('success', 20)]]), context, now }), false);
});
test('manual and push runs always refresh without consulting deployment history', async () => {
  for (const eventName of ['push', 'workflow_dispatch']) {
    assert.equal(await refreshDue({ github: {}, context: { ...context, eventName }, now }), true);
  }
});
test('malformed or future timestamps do not suppress recovery', async () => {
  assert.equal(await refreshDue({ github: api([[{ state: 'success', created_at: 'invalid' }, status('success', -10)]]), context, now }), true);
});
test('deployment API errors refresh instead of leaving the page stale', async () => {
  const github = { rest: { repos: {
    listDeployments: async () => { throw new Error('temporary GitHub API error'); },
  } } };
  assert.equal(await refreshDue({ github, context, now }), true);
});
