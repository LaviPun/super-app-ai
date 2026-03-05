import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
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

const DETAIL_TRUNCATE = 200;

function DetailCodeBlock({ value, expanded, onToggle }: { value: string; expanded: boolean; onToggle: () => void }) {
  const isLong = value.length > DETAIL_TRUNCATE;
  const preview = isLong && !expanded ? value.slice(0, DETAIL_TRUNCATE) + '\n…' : value;
  return (
    <BlockStack gap="200">
      <pre className={expanded ? 'internal-code-block internal-code-block-expanded' : 'internal-code-block'}>{preview}</pre>
      {isLong && (
        <Button size="slim" variant="plain" onClick={onToggle}>{expanded ? 'Collapse' : 'Expand'}</Button>
      )}
    </BlockStack>
  );
}

export default function InternalActivityDetail() {
  const d = useLoaderData<typeof loader>();
  const [jsonExpanded, setJsonExpanded] = useState(false);
  const [rawExpanded, setRawExpanded] = useState(false);

  return (
    <Page
      title="Activity detail"
      backAction={{ content: 'Activity log', url: '/internal/activity' }}
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h2" variant="headingMd">Entry</Text>
              <Text as="p" variant="bodySm" tone="subdued">ID: {d.id}</Text>
            </InlineStack>
            <Divider />
            <BlockStack gap="300">
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
                <DetailCodeBlock value={d.detailsJson} expanded={jsonExpanded} onToggle={() => setJsonExpanded(e => !e)} />
              </>
            )}
            {d.detailsRaw && (
              <>
                <Divider />
                <Text as="h3" variant="headingSm">Details (raw)</Text>
                <DetailCodeBlock value={d.detailsRaw} expanded={rawExpanded} onToggle={() => setRawExpanded(e => !e)} />
              </>
            )}
            <Divider />
            <InlineStack gap="200" blockAlign="start">
              <Button url="/internal/activity" variant="primary">Back to Activity log</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
