// Called by actions/github-script. Only successful deployments suppress a refresh.
export async function refreshDue({ github, context, now = Date.now() }) {
  if (context.eventName !== 'schedule') return true;
  const repo = context.repo;
  try {
    const { data: deployments } = await github.rest.repos.listDeployments({
      ...repo, environment: 'github-pages', per_page: 10,
    });
    for (const deployment of deployments) {
      const { data: statuses } = await github.rest.repos.listDeploymentStatuses({
        ...repo, deployment_id: deployment.id, per_page: 100,
      });
      for (const status of statuses) {
        const age = now - Date.parse(status.created_at);
        if (status.state === 'success' && age >= 0 && age < 55 * 60 * 1000) {
          return false;
        }
      }
    }
  } catch (error) {
    console.warn(`Freshness check failed; refreshing anyway. ${error.message}`);
    return true;
  }
  return true;
}
