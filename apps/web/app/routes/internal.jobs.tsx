import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Page, Card, BlockStack, Text, Badge } from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { JobService } from '~/services/jobs/job.service';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const jobs = await new JobService().listLatest(200);
  const running = jobs.filter(j => j.status === 'RUNNING' || j.status === 'QUEUED').length;
  const failed = jobs.filter(j => j.status === 'FAILED').length;

  // Fetch recent per-step flow logs for debugging
  const stepLogs = await prisma.flowStepLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { shop: true },
  });

  return json({ jobs, running, failed, stepLogs });
}

export default function InternalJobs() {
  const { jobs, running, failed, stepLogs } = useLoaderData<typeof loader>();
  return (
    <Page title="Jobs">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="100">
            <Text as="p">Running / queued: {running}</Text>
            <Text as="p">Failed (DLQ): {failed}</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">All Jobs (last 200)</Text>
            {jobs.map(j => (
              <Text as="p" key={j.id}>
                {new Date(j.createdAt).toLocaleString()} — {j.type} —{' '}
                <Badge tone={j.status === 'FAILED' ? 'critical' : j.status === 'SUCCESS' ? 'success' : 'attention'}>
                  {j.status}
                </Badge>{' '}
                — {j.shop?.shopDomain ?? 'n/a'}
                {j.error ? ` — ⚠ ${j.error}` : ''}
              </Text>
            ))}
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Flow Step Logs (last 100)</Text>
            {stepLogs.length === 0 ? <Text as="p">No step logs yet.</Text> : null}
            {stepLogs.map(s => (
              <Text as="p" key={s.id}>
                {new Date(s.createdAt).toLocaleString()} — step:{s.step} {s.kind} —{' '}
                <Badge tone={s.status === 'SUCCESS' ? 'success' : 'critical'}>{s.status}</Badge>
                {s.durationMs != null ? ` — ${s.durationMs}ms` : ''}
                {s.error ? ` — ${s.error}` : ''}
                {' '} — {s.shop?.shopDomain ?? 'n/a'}
              </Text>
            ))}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
