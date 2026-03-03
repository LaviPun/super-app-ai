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
  const level = url.searchParams.get('level') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const prisma = getPrisma();
  const where: any = {};
  if (level) where.level = level;
  if (search) {
    where.OR = [
      { message: { contains: search } },
      { route: { contains: search } },
    ];
  }
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const logs = await prisma.errorLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { shop: true },
  });

  return json({
    logs: logs.map(l => ({
      id: l.id,
      level: l.level,
      message: l.message,
      route: l.route,
      shopDomain: l.shop?.shopDomain ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
    filters: { level, search, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
  });
}

const LEVEL_OPTIONS = [
  { label: 'All levels', value: '' },
  { label: 'ERROR', value: 'ERROR' },
  { label: 'WARN', value: 'WARN' },
  { label: 'INFO', value: 'INFO' },
];

export default function InternalLogs() {
  const { logs, filters } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();

  return (
    <Page title="Error logs" subtitle={`${logs.length} entries`}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Filters</Text>
            <Form method="get">
              <InlineStack gap="300" wrap blockAlign="end">
                <div style={{ minWidth: 140 }}>
                  <Select
                    label="Level"
                    name="level"
                    options={LEVEL_OPTIONS}
                    value={filters.level ?? ''}
                    onChange={(v) => {
                      const p = new URLSearchParams(params);
                      if (v) p.set('level', v); else p.delete('level');
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
                    placeholder="Search message, route..."
                  />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField label="From" name="dateFrom" type="date" value={filters.dateFrom?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateFrom', v); else p.delete('dateFrom'); setParams(p); }} autoComplete="off" />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField label="To" name="dateTo" type="date" value={filters.dateTo?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateTo', v); else p.delete('dateTo'); setParams(p); }} autoComplete="off" />
                </div>
                <Button submit loading={isLoading}>Apply</Button>
                <Button url="/internal/logs" variant="plain">Clear</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            {isLoading ? (
              <SkeletonBodyText lines={6} />
            ) : logs.length === 0 ? (
              <BlockStack gap="200">
                <Text as="p" tone="subdued">No error log entries match your filters.</Text>
                <Text as="p" variant="bodySm" tone="subdued">Errors appear here when the app writes to the error log service (e.g. ErrorLogService.error/warn/info). If you never see entries, no errors have been recorded in the selected range. Widen the date range or clear filters to check.</Text>
              </BlockStack>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                headings={['Time', 'Level', 'Message', 'Store', 'Route']}
                rows={logs.map(l => [
                  new Date(l.createdAt).toLocaleString(),
                  <Badge key={l.id} tone={l.level === 'ERROR' ? 'critical' : l.level === 'WARN' ? 'warning' : 'info'}>{l.level}</Badge>,
                  l.message,
                  l.shopDomain ?? '—',
                  l.route ?? '—',
                ])}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
