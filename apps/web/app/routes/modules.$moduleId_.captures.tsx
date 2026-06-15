/**
 * DataCapture admin view for a module (Module System v2 backend data).
 * GET /modules/:moduleId/captures            → Polaris table
 * GET /modules/:moduleId/captures?format=csv → CSV download
 * GET /modules/:moduleId/captures?format=print → printable HTML (Save as PDF)
 */
import { json } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import { Page, Card, BlockStack, Text, DataTable, Button, InlineStack, EmptyState } from '@shopify/polaris';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { recordsToCsv, recordsToPrintHtml, type ExportableRecord } from '~/services/data/export.service';

export async function loader({ request, params }: { request: Request; params: { moduleId?: string } }) {
  const { session } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) throw new Response('Missing moduleId', { status: 400 });

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) throw new Response('Shop not found', { status: 404 });

  const mod = await prisma.module.findFirst({ where: { id: moduleId, shopId: shopRow.id }, select: { id: true, name: true } });
  if (!mod) throw new Response('Module not found', { status: 404 });

  const rows = await prisma.dataCapture.findMany({
    where: { moduleId, shopId: shopRow.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, captureType: true, customerId: true, payload: true, createdAt: true },
  });

  const exportable: ExportableRecord[] = rows.map((r) => ({
    title: r.captureType,
    externalId: r.customerId,
    createdAt: r.createdAt.toISOString(),
    payload: r.payload,
  }));

  const format = new URL(request.url).searchParams.get('format');
  if (format === 'csv') {
    return new Response(recordsToCsv(exportable), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${moduleId}-captures.csv"`,
      },
    });
  }
  if (format === 'print') {
    return new Response(
      recordsToPrintHtml({ title: `${mod.name} — captures`, subtitle: `${rows.length} capture(s)`, records: exportable }),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  return json({
    moduleId,
    moduleName: mod.name,
    captures: rows.map((r) => ({
      id: r.id,
      captureType: r.captureType,
      customerId: r.customerId,
      createdAt: r.createdAt.toISOString(),
      preview: (() => {
        try { return JSON.stringify(JSON.parse(r.payload)).slice(0, 80); } catch { return r.payload.slice(0, 80); }
      })(),
    })),
  });
}

export default function ModuleCaptures() {
  const { moduleId, moduleName, captures } = useLoaderData<typeof loader>();

  return (
    <Page
      title={`${moduleName} — captures`}
      backAction={{ content: 'Module', url: `/modules/${moduleId}` }}
      secondaryActions={[
        { content: 'Export CSV', url: `/modules/${moduleId}/captures?format=csv`, external: true },
        { content: 'Print / PDF', url: `/modules/${moduleId}/captures?format=print`, external: true },
      ]}
    >
      <Card>
        {captures.length === 0 ? (
          <EmptyState heading="No captures yet" image="">
            <p>Form submissions and events captured by this module will appear here.</p>
          </EmptyState>
        ) : (
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">{captures.length} capture(s)</Text>
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'text']}
              headings={['Type', 'Customer', 'Created', 'Payload']}
              rows={captures.map((c: { captureType: string; customerId: string | null; createdAt: string; preview: string }) => [c.captureType, c.customerId ?? '—', new Date(c.createdAt).toLocaleString(), c.preview])}
            />
            <InlineStack>
              <Link to={`/modules/${moduleId}`}><Button>Back to module</Button></Link>
            </InlineStack>
          </BlockStack>
        )}
      </Card>
    </Page>
  );
}
