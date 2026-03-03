import { json, redirect } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { Page, Banner, Text, BlockStack } from '@shopify/polaris';
import { useCallback } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { FlowBuilder } from '~/components/FlowBuilder';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';

export async function loader({ request, params }: { request: Request; params: { flowId?: string } }) {
  const { session } = await shopify.authenticate.admin(request);
  const flowId = params.flowId;

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) throw new Response('Shop not found', { status: 404 });

  const connectors = await prisma.connector.findMany({
    where: { shopId: shopRow.id },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  if (!flowId || flowId === 'new') {
    return json({ flowId: null, spec: null, moduleName: null, connectors });
  }

  const mod = await prisma.module.findFirst({
    where: { id: flowId, shopId: shopRow.id, type: 'flow.automation' },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 }, activeVersion: true },
  });
  if (!mod) throw new Response('Flow not found', { status: 404 });

  const draft = mod.versions[0] ?? mod.activeVersion;
  let spec = null;
  if (draft) {
    try {
      const parsed = new RecipeService().parse(draft.specJson);
      if (parsed.type === 'flow.automation') {
        spec = parsed.config;
      }
    } catch { /* fallback to null */ }
  }

  return json({ flowId: mod.id, spec, moduleName: mod.name, connectors });
}

export async function action({ request, params }: { request: Request; params: { flowId?: string } }) {
  const { session } = await shopify.authenticate.admin(request);
  const body = await request.json() as { trigger: string; steps: any[] };

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) return json({ error: 'Shop not found' }, { status: 404 });

  const flowSpec = {
    type: 'flow.automation' as const,
    name: 'Visual Flow',
    category: 'FLOW' as const,
    requires: [] as string[],
    config: {
      trigger: body.trigger,
      steps: body.steps,
    },
  };

  const flowId = params.flowId;

  if (flowId && flowId !== 'new') {
    const mod = await prisma.module.findFirst({
      where: { id: flowId, shopId: shopRow.id, type: 'flow.automation' },
    });
    if (!mod) return json({ error: 'Flow not found' }, { status: 404 });

    const ms = new ModuleService();
    await ms.createNewVersion(session.shop, flowId, flowSpec as any);
    return json({ ok: true, flowId });
  }

  const ms = new ModuleService();
  const mod = await ms.createDraft(session.shop, flowSpec as any);
  return json({ ok: true, flowId: mod.id });
}

export default function FlowBuildPage() {
  const { flowId, spec, moduleName, connectors } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const isSaving = fetcher.state !== 'idle';
  const result = fetcher.data as { ok?: boolean; flowId?: string; error?: string } | undefined;

  const handleSave = useCallback((flowSpec: { trigger: string; steps: any[] }) => {
    fetcher.submit(flowSpec as any, {
      method: 'POST',
      action: `/flows/build/${flowId ?? 'new'}`,
      encType: 'application/json',
    });
  }, [flowId, fetcher]);

  return (
    <Page
      title={moduleName ?? 'New Flow'}
      subtitle="Visual flow builder"
      backAction={{ content: 'Flows', url: '/flows' }}
    >
      <BlockStack gap="400">
        {result?.ok && (
          <Banner tone="success" title="Saved">
            <Text as="p">Flow saved successfully.{result.flowId ? ` Flow ID: ${result.flowId}` : ''}</Text>
          </Banner>
        )}
        {result?.error && (
          <Banner tone="critical" title="Error">
            <Text as="p">{result.error}</Text>
          </Banner>
        )}
        <FlowBuilder
          initialSpec={(spec as any) ?? undefined}
          connectors={connectors}
          onSave={handleSave}
          saving={isSaving}
        />
      </BlockStack>
    </Page>
  );
}
