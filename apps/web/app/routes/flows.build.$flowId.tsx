import { json } from '@remix-run/node';
import { useLoaderData, useFetcher, useNavigate } from '@remix-run/react';
import { useCallback, useEffect, useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { FlowBuilder } from '~/components/FlowBuilder';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { MerchantShell } from '~/components/merchant/MerchantShell';

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
  const body = await request.json() as { name?: string; trigger: string; steps: any[] };

  if (typeof body?.trigger !== 'string' || !Array.isArray(body?.steps)) {
    return json({ error: 'Invalid flow: trigger and steps are required' }, { status: 400 });
  }

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) return json({ error: 'Shop not found' }, { status: 404 });

  const requestedName = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const flowId = params.flowId;

  const makeSpec = (name: string) => ({
    type: 'flow.automation' as const,
    name,
    category: 'FLOW' as const,
    requires: [] as string[],
    config: {
      trigger: body.trigger,
      steps: body.steps,
    },
  });

  if (flowId && flowId !== 'new') {
    const mod = await prisma.module.findFirst({
      where: { id: flowId, shopId: shopRow.id, type: 'flow.automation' },
    });
    if (!mod) return json({ error: 'Flow not found' }, { status: 404 });

    const name = requestedName || mod.name;
    const ms = new ModuleService();
    await ms.createNewVersion(session.shop, flowId, makeSpec(name) as any);
    if (name !== mod.name) {
      await prisma.module.update({ where: { id: mod.id }, data: { name } });
    }
    return json({ ok: true, flowId });
  }

  const ms = new ModuleService();
  const mod = await ms.createDraft(session.shop, makeSpec(requestedName || 'Untitled flow') as any);
  return json({ ok: true, flowId: mod.id });
}

export default function FlowBuildPage() {
  const { flowId, spec, moduleName, connectors } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [name, setName] = useState(moduleName ?? '');

  // Keep the name field in sync when navigating between flows (or after the
  // first save of a new flow redirects to its real URL).
  useEffect(() => {
    setName(moduleName ?? '');
  }, [moduleName, flowId]);

  const isSaving = fetcher.state !== 'idle';
  const result = fetcher.data as { ok?: boolean; flowId?: string; error?: string } | undefined;

  // After the first save of a NEW flow, move to its real URL so subsequent
  // saves update it instead of creating a fresh module each time.
  useEffect(() => {
    if (result?.ok && result.flowId && result.flowId !== flowId) {
      navigate(`/flows/build/${result.flowId}`, { replace: true });
    }
  }, [result, flowId, navigate]);

  const handleSave = useCallback((flowSpec: { trigger: string; steps: any[] }) => {
    fetcher.submit({ ...flowSpec, name } as any, {
      method: 'POST',
      action: `/flows/build/${flowId ?? 'new'}`,
      encType: 'application/json',
    });
  }, [flowId, fetcher, name]);

  return (
    <MerchantShell polaris>
      <s-page heading={moduleName ?? 'New Flow'} inlineSize="base">
        <s-stack direction="inline" gap="small-100" alignItems="center">
          <s-button variant="tertiary" icon="arrow-left" onClick={() => navigate('/flows')}>Flows</s-button>
          <s-text color="subdued">Visual flow builder</s-text>
        </s-stack>
        {result?.ok && (
          <s-banner heading="Saved" tone="success">
            <s-paragraph>Flow saved successfully.{result.flowId ? ` Flow ID: ${result.flowId}` : ''}</s-paragraph>
          </s-banner>
        )}
        {result?.error && (
          <s-banner heading="Error" tone="critical">
            <s-paragraph>{result.error}</s-paragraph>
          </s-banner>
        )}
        <s-section padding="base">
          <s-text-field
            label="Flow name"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="e.g. Tag big orders"
            details="Saved with the flow and shown in the Flows hub."
          />
        </s-section>
        <FlowBuilder
          initialSpec={(spec as any) ?? undefined}
          connectors={connectors}
          onSave={handleSave}
          saving={isSaving}
        />
      </s-page>
    </MerchantShell>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
