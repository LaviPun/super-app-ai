import { json } from '@remix-run/node';
import { useLoaderData, useSearchParams, useNavigation, Form } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, DataTable, Badge, InlineStack,
  TextField, Select, Button, SkeletonBodyText,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const actor = url.searchParams.get('actor') || undefined;
  const statusFilter = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const prisma = getPrisma();
  const where: any = {};
  if (actor) where.actor = actor;
  if (statusFilter === 'success') where.success = true;
  if (statusFilter === 'error') where.success = false;
  if (search) {
    where.OR = [
      { path: { contains: search } },
      { method: { contains: search } },
    ];
  }
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const logs = await prisma.apiLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { shop: true },
  });

  return json({
    logs: logs.map(l => ({
      id: l.id,
      actor: l.actor,
      method: l.method,
      path: l.path,
      status: l.status,
      durationMs: l.durationMs,
      shopDomain: l.shop?.shopDomain ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
    filters: { actor, status: statusFilter, search, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
  });
}

const ACTOR_OPTIONS = [
  { label: 'All actors', value: '' },
  { label: 'Internal', value: 'INTERNAL' },
  { label: 'Merchant', value: 'MERCHANT' },
  { label: 'Webhook', value: 'WEBHOOK' },
  { label: 'App Proxy', value: 'APP_PROXY' },
];

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Success', value: 'success' },
  { label: 'Error', value: 'error' },
];

export default function InternalApiLogs() {
  const { logs, filters } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();

  return (
    <Page title="API logs" subtitle={`${logs.length} entries`}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Filters</Text>
            <Form method="get">
              <InlineStack gap="300" wrap blockAlign="end">
                <div style={{ minWidth: 140 }}>
                  <Select label="Actor" name="actor" options={ACTOR_OPTIONS} value={filters.actor ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('actor', v); else p.delete('actor'); setParams(p); }} />
                </div>
                <div style={{ minWidth: 140 }}>
                  <Select label="Status" name="status" options={STATUS_OPTIONS} value={filters.status ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('status', v); else p.delete('status'); setParams(p); }} />
                </div>
                <div style={{ minWidth: 200 }}>
                  <TextField label="Search path" name="q" value={filters.search ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('q', v); else p.delete('q'); setParams(p); }} autoComplete="off" placeholder="/api/..." />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField label="From" name="dateFrom" type="date" value={filters.dateFrom?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateFrom', v); else p.delete('dateFrom'); setParams(p); }} autoComplete="off" />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField label="To" name="dateTo" type="date" value={filters.dateTo?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateTo', v); else p.delete('dateTo'); setParams(p); }} autoComplete="off" />
                </div>
                <Button submit loading={isLoading}>Apply</Button>
                <Button url="/internal/api-logs" variant="plain">Clear</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            {isLoading ? (
              <SkeletonBodyText lines={6} />
            ) : logs.length === 0 ? (
              <Text as="p" tone="subdued">No API logs match your filters.</Text>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'numeric', 'text']}
                headings={['Time', 'Actor', 'Method / Path', 'Status', 'Duration (ms)', 'Store']}
                rows={logs.map(l => [
                  new Date(l.createdAt).toLocaleString(),
                  l.actor,
                  `${l.method} ${l.path}`,
                  <Badge key={l.id} tone={l.status >= 400 ? 'critical' : 'success'}>{String(l.status)}</Badge>,
                  l.durationMs,
                  l.shopDomain ?? '—',
                ])}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
