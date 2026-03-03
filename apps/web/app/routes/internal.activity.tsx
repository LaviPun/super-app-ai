import { json } from '@remix-run/node';
import { useLoaderData, useSearchParams, useNavigation, Form } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, DataTable, Badge, InlineStack,
  TextField, Select, Button, Filters, SkeletonBodyText,
} from '@shopify/polaris';
import { ActivityLogService } from '~/services/activity/activity.service';
import { requireInternalAdmin } from '~/internal-admin/session.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const actor = url.searchParams.get('actor') || undefined;
  const action = url.searchParams.get('action') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const service = new ActivityLogService();
  const [logs, distinctActions] = await Promise.all([
    service.list({ actor, action, search, dateFrom, dateTo, take: 300 }),
    service.getDistinctActions(),
  ]);

  return json({
    logs: logs.map(l => ({
      id: l.id,
      actor: l.actor,
      action: l.action,
      resource: l.resource,
      shopDomain: l.shop?.shopDomain ?? null,
      details: l.details,
      ip: l.ip,
      createdAt: l.createdAt.toISOString(),
    })),
    distinctActions,
    filters: { actor, action, search, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
  });
}

const ACTOR_OPTIONS = [
  { label: 'All actors', value: '' },
  { label: 'System', value: 'SYSTEM' },
  { label: 'Merchant', value: 'MERCHANT' },
  { label: 'Internal Admin', value: 'INTERNAL_ADMIN' },
  { label: 'Webhook', value: 'WEBHOOK' },
  { label: 'Cron', value: 'CRON' },
];

function toneForActor(actor: string) {
  switch (actor) {
    case 'SYSTEM': return 'info' as const;
    case 'MERCHANT': return 'success' as const;
    case 'INTERNAL_ADMIN': return 'warning' as const;
    case 'WEBHOOK': return 'attention' as const;
    default: return 'info' as const;
  }
}

export default function InternalActivity() {
  const { logs, distinctActions, filters } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();

  const actionOptions = [
    { label: 'All actions', value: '' },
    ...distinctActions.map(a => ({ label: a, value: a })),
  ];

  return (
    <Page title="Activity log" subtitle={`${logs.length} entries`}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Filters</Text>
            <Form method="get">
              <InlineStack gap="300" wrap blockAlign="end">
                <div style={{ minWidth: 160 }}>
                  <Select
                    label="Actor"
                    name="actor"
                    options={ACTOR_OPTIONS}
                    value={filters.actor ?? ''}
                    onChange={(v) => {
                      const p = new URLSearchParams(params);
                      if (v) p.set('actor', v); else p.delete('actor');
                      setParams(p);
                    }}
                  />
                </div>
                <div style={{ minWidth: 200 }}>
                  <Select
                    label="Action"
                    name="action"
                    options={actionOptions}
                    value={filters.action ?? ''}
                    onChange={(v) => {
                      const p = new URLSearchParams(params);
                      if (v) p.set('action', v); else p.delete('action');
                      setParams(p);
                    }}
                  />
                </div>
                <div style={{ minWidth: 200 }}>
                  <TextField
                    label="Search"
                    name="q"
                    value={filters.search ?? ''}
                    onChange={(v) => {
                      const p = new URLSearchParams(params);
                      if (v) p.set('q', v); else p.delete('q');
                      setParams(p);
                    }}
                    autoComplete="off"
                    placeholder="Search resource, details..."
                  />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField
                    label="Date from"
                    name="dateFrom"
                    type="date"
                    value={filters.dateFrom ? filters.dateFrom.split('T')[0] : ''}
                    onChange={(v) => {
                      const p = new URLSearchParams(params);
                      if (v) p.set('dateFrom', v); else p.delete('dateFrom');
                      setParams(p);
                    }}
                    autoComplete="off"
                  />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField
                    label="Date to"
                    name="dateTo"
                    type="date"
                    value={filters.dateTo ? filters.dateTo.split('T')[0] : ''}
                    onChange={(v) => {
                      const p = new URLSearchParams(params);
                      if (v) p.set('dateTo', v); else p.delete('dateTo');
                      setParams(p);
                    }}
                    autoComplete="off"
                  />
                </div>
                <Button submit loading={isLoading}>Apply filters</Button>
                <Button url="/internal/activity" variant="plain">Clear</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Activity entries ({logs.length})</Text>
            {isLoading ? (
              <SkeletonBodyText lines={8} />
            ) : logs.length === 0 ? (
              <Text as="p" tone="subdued">No activity recorded yet. Actions will appear here as users interact with the app.</Text>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                headings={['Time', 'Actor', 'Action', 'Resource', 'Store', 'Details']}
                rows={logs.map(l => [
                  new Date(l.createdAt).toLocaleString(),
                  <Badge key={`a-${l.id}`} tone={toneForActor(l.actor)}>{l.actor}</Badge>,
                  l.action,
                  l.resource ?? '—',
                  l.shopDomain ?? '—',
                  l.details ? (
                    <Text key={`d-${l.id}`} as="span" variant="bodySm" tone="subdued" truncate>
                      {l.details.length > 80 ? l.details.slice(0, 80) + '...' : l.details}
                    </Text>
                  ) : '—',
                ])}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
