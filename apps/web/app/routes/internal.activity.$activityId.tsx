import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, InlineStack, Button, Divider,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { ActivityLogService } from '~/services/activity/activity.service';

const NOT_FOUND = new Response(null, { status: 404 });

export async function loader({ request, params }: { request: Request; params: { activityId?: string } }) {
  await requireInternalAdmin(request);
  const activityId = params.activityId;
  if (!activityId) throw NOT_FOUND;

  const service = new ActivityLogService();
  const log = await service.getById(activityId);
  if (!log) throw NOT_FOUND;

  let detailsJson: string | null = null;
  let detailsRaw: string | null = null;
  if (log.details) {
    try {
      const parsed = JSON.parse(log.details);
      detailsJson = JSON.stringify(parsed, null, 2);
    } catch {
      detailsRaw = log.details;
    }
  }

  return json({
    id: log.id,
    actor: log.actor,
    action: log.action,
    resource: log.resource,
    shopId: log.shopId,
    shopDomain: log.shop?.shopDomain ?? null,
    details: log.details,
    detailsJson,
    detailsRaw,
    ip: log.ip,
    createdAt: log.createdAt.toISOString(),
  });
}

export default function InternalActivityDetail() {
  const d = useLoaderData<typeof loader>();

  return (
    <Page
      title="Activity detail"
      backAction={{ content: 'Activity log', url: '/internal/activity' }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h2" variant="headingMd">Entry</Text>
              <Text as="p" variant="bodySm" tone="subdued">ID: {d.id}</Text>
            </InlineStack>
            <Divider />
            <BlockStack gap="200">
              <Text as="p" variant="bodySm"><strong>Time</strong>: {new Date(d.createdAt).toLocaleString()}</Text>
              <Text as="p" variant="bodySm"><strong>Actor</strong>: {d.actor}</Text>
              <Text as="p" variant="bodySm"><strong>Action</strong>: {d.action}</Text>
              <Text as="p" variant="bodySm"><strong>Resource</strong>: {d.resource ?? '—'}</Text>
              <Text as="p" variant="bodySm"><strong>Store</strong>: {d.shopDomain ?? (d.shopId ?? '—')}</Text>
              {d.ip && <Text as="p" variant="bodySm"><strong>IP</strong>: {d.ip}</Text>}
            </BlockStack>
            {d.detailsJson && (
              <>
                <Divider />
                <Text as="h3" variant="headingSm">Details (JSON)</Text>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    background: 'var(--p-color-bg-surface-secondary)',
                    borderRadius: 8,
                    fontSize: 12,
                    overflow: 'auto',
                    maxHeight: 400,
                  }}
                >
                  {d.detailsJson}
                </pre>
              </>
            )}
            {d.detailsRaw && (
              <>
                <Divider />
                <Text as="h3" variant="headingSm">Details (raw)</Text>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    background: 'var(--p-color-bg-surface-secondary)',
                    borderRadius: 8,
                    fontSize: 12,
                    overflow: 'auto',
                    maxHeight: 200,
                  }}
                >
                  {d.detailsRaw}
                </pre>
              </>
            )}
            <InlineStack gap="200" blockAlign="start">
              <Button url="/internal/activity">Back to Activity log</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
