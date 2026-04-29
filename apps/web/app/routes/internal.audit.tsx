import { json } from '@remix-run/node';
import { useLoaderData, useSearchParams, useNavigation, Form } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, InlineStack, Box,
  TextField, Button, SkeletonBodyText,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { InternalTruncateCell } from '~/components/InternalTruncateCell';
import { getPrisma } from '~/db.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import type { Prisma } from '@prisma/client';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get('shopDomain') || undefined;
  const action = url.searchParams.get('action') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;
  const page = parseCursorParams(url, 150);

  const prisma = getPrisma();
  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = action;
  if (search) {
    where.OR = [
      { action: { contains: search } },
      { details: { contains: search } },
    ];
  }
  if (shopDomain) {
    where.shop = { is: { shopDomain: { contains: shopDomain } } };
  }
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: page.take,
    skip: page.skip,
    cursor: page.cursor,
    include: { shop: true },
  });
  const nextCursorHref = buildNextCursorUrl(url, rows, page.take);

  const distinctActionsRows = await prisma.auditLog.findMany({
    select: { action: true },
    distinct: ['action'],
    orderBy: { action: 'asc' },
    take: 200,
  });

  return json({
    rows: rows.map(r => ({
      id: r.id,
      action: r.action,
      details: r.details,
      shopDomain: r.shop?.shopDomain ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    distinctActions: distinctActionsRows.map(d => d.action),
    filters: { shopDomain, action, search, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursorHref,
    pageSize: page.take,
  });
}

export default function InternalAudit() {
  const { rows, distinctActions, filters, nextCursorHref, pageSize } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();

  return (
    <Page
      title="Audit log"
      subtitle="Sensitive admin & merchant actions retained for compliance review"
      fullWidth
    >
      <div style={{ width: '100%', maxWidth: '100%' }}>
        <BlockStack gap="300">
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Filters</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {distinctActions.length > 0 ? `Recent actions: ${distinctActions.slice(0, 8).join(', ')}${distinctActions.length > 8 ? '…' : ''}` : 'No audit log entries yet.'}
              </Text>
              <Form method="get">
                <InlineStack gap="300" wrap blockAlign="end">
                  <div style={{ minWidth: 200 }}>
                    <TextField label="Action" name="action" value={filters.action ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('action', v); else p.delete('action'); setParams(p); }} autoComplete="off" placeholder="MODULE_DELETED…" />
                  </div>
                  <div style={{ minWidth: 200 }}>
                    <TextField label="Shop domain" name="shopDomain" value={filters.shopDomain ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('shopDomain', v); else p.delete('shopDomain'); setParams(p); }} autoComplete="off" placeholder="shop.myshopify.com" />
                  </div>
                  <div style={{ minWidth: 200 }}>
                    <TextField label="Search" name="q" value={filters.search ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('q', v); else p.delete('q'); setParams(p); }} autoComplete="off" placeholder="Search action or details…" />
                  </div>
                  <div style={{ minWidth: 160 }}>
                    <TextField label="From" name="dateFrom" type="date" value={filters.dateFrom?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateFrom', v); else p.delete('dateFrom'); setParams(p); }} autoComplete="off" />
                  </div>
                  <div style={{ minWidth: 160 }}>
                    <TextField label="To" name="dateTo" type="date" value={filters.dateTo?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateTo', v); else p.delete('dateTo'); setParams(p); }} autoComplete="off" />
                  </div>
                  <Button submit variant="primary" loading={isLoading}>Apply</Button>
                  <Button url="/internal/audit" variant="secondary">Clear</Button>
                </InlineStack>
              </Form>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Audit entries</Text>
              {isLoading ? (
                <SkeletonBodyText lines={6} />
              ) : rows.length === 0 ? (
                <BlockStack gap="200">
                  <Text as="p" tone="subdued">No audit entries match your filters.</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Compliance-relevant actions (deletions, plan changes, sensitive overrides) appear here.</Text>
                </BlockStack>
              ) : (
                <Box paddingBlockEnd="200">
                  <div className="internal-table-scroll" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e0e0e0', textAlign: 'left' }}>
                          <th style={{ padding: '6px 12px', fontWeight: 600 }}>Time</th>
                          <th style={{ padding: '6px 12px', fontWeight: 600 }}>Action</th>
                          <th style={{ padding: '6px 12px', fontWeight: 600 }}>Store</th>
                          <th style={{ padding: '6px 12px', fontWeight: 600 }}>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '6px 12px' }}>{new Date(r.createdAt).toLocaleString()}</td>
                            <td style={{ padding: '6px 12px' }}>{r.action}</td>
                            <td style={{ padding: '6px 12px' }}>
                              <InternalTruncateCell value={r.shopDomain} maxLength={40} maxWidthPx={200} />
                            </td>
                            <td style={{ padding: '6px 12px' }}>
                              <InternalTruncateCell value={r.details} maxLength={120} maxWidthPx={420} tone="subdued" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Box>
              )}
              <InlineStack gap="200" align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">
                  Showing {rows.length} of up to {pageSize} per page.
                </Text>
                {nextCursorHref ? (
                  <Button url={nextCursorHref} variant="secondary">Load more</Button>
                ) : null}
              </InlineStack>
            </BlockStack>
          </Card>
        </BlockStack>
      </div>
    </Page>
  );
}
