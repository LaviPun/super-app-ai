/**
 * DataCapture admin view for a module (Module System v2 backend data).
 * GET /modules/:moduleId/captures            → Polaris table
 * GET /modules/:moduleId/captures?format=csv → CSV download
 * GET /modules/:moduleId/captures?format=print → printable HTML (Save as PDF)
 */
import { json } from '@remix-run/node';
import { useLoaderData, useNavigate } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { MerchantShell } from '~/components/merchant/MerchantShell';
import { EmptyState, MonoChip } from '~/components/merchant/polaris';
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
  return (
    <MerchantShell polaris>
      <ModuleCapturesBody />
    </MerchantShell>
  );
}

function ModuleCapturesBody() {
  const { moduleId, moduleName, captures } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <s-page heading={`${moduleName} — captures`} inlineSize="base">
      <s-button slot="secondary-actions" icon="export" href={`/modules/${moduleId}/captures?format=csv`} target="_blank">
        Export CSV
      </s-button>
      <s-button slot="secondary-actions" icon="print" href={`/modules/${moduleId}/captures?format=print`} target="_blank">
        Print / PDF
      </s-button>
      <s-stack direction="inline">
        <s-button variant="tertiary" icon="arrow-left" onClick={() => navigate(`/modules/${moduleId}`)}>Module</s-button>
      </s-stack>
      {captures.length === 0 ? (
        <s-section>
          <EmptyState icon="forms" heading="No captures yet">
            Form submissions and events captured by this module will appear here.
          </EmptyState>
        </s-section>
      ) : (
        <s-section heading={`${captures.length} capture${captures.length === 1 ? '' : 's'}`} padding="none">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Type</s-table-header>
              <s-table-header>Customer</s-table-header>
              <s-table-header listSlot="kicker">Created</s-table-header>
              <s-table-header>Payload</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {captures.map((c: { id: string; captureType: string; customerId: string | null; createdAt: string; preview: string }) => (
                <s-table-row key={c.id}>
                  <s-table-cell><s-text type="strong">{c.captureType}</s-text></s-table-cell>
                  <s-table-cell>
                    {c.customerId ? <MonoChip>{c.customerId}</MonoChip> : <s-text color="subdued">—</s-text>}
                  </s-table-cell>
                  <s-table-cell><s-text color="subdued">{new Date(c.createdAt).toLocaleString()}</s-text></s-table-cell>
                  <s-table-cell><MonoChip>{c.preview}</MonoChip></s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
