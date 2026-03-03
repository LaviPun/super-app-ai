import { json } from '@remix-run/node';
import { useLoaderData, Form, useNavigation } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, InlineStack, Button, TextField,
  Banner, Badge, DataTable,
} from '@shopify/polaris';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { MODULE_CATALOG, isCapabilityAllowed } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import { StyleBuilder } from '~/components/StyleBuilder';
import type { RecipeSpec } from '@superapp/core';

function isThemeStorefrontUi(spec: RecipeSpec): boolean {
  return ['theme.banner', 'theme.popup', 'theme.notificationBar', 'proxy.widget'].includes(spec.type);
}

export async function loader({ request, params }: { request: Request; params: { moduleId?: string } }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) throw new Response('Missing moduleId', { status: 400 });

  const ms = new ModuleService();
  const mod = await ms.getModule(session.shop, moduleId);
  if (!mod) throw new Response('Not found', { status: 404 });

  // Plan gating check
  const caps = new CapabilityService();
  let planTier = await caps.getPlanTier(session.shop);
  if (planTier === 'UNKNOWN') planTier = await caps.refreshPlanTier(session.shop, admin);

  const draft = mod.versions.find(v => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
  const spec = draft ? new RecipeService().parse(draft.specJson) : null;

  const blockedCapabilities = spec
    ? (spec.requires ?? []).filter(c => !isCapabilityAllowed(planTier, c as any))
    : [];
  const blockReasons = blockedCapabilities.map(c => caps.explainCapabilityGate(c as any) ?? String(c));

  const catalog = spec ? MODULE_CATALOG.find(x => x.type === spec.type) : null;

  const compiled = spec
    ? (() => {
        try {
          const target = String(spec.type).startsWith('theme.') ? { kind: 'THEME', themeId: '0' } : { kind: 'PLATFORM' };
          return compileRecipe(spec as any, target as any);
        } catch (e) {
          return { error: String(e) };
        }
      })()
    : null;

  // Version history
  const versions = mod.versions.map(v => ({
    id: v.id,
    version: v.version,
    status: v.status,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    isActive: mod.activeVersionId === v.id,
  }));

  return json({ moduleId, mod, spec, catalog, compiled, planTier, blockedCapabilities, blockReasons, versions });
}

export default function ModuleDetail() {
  const { moduleId, mod, spec, catalog, compiled, planTier, blockedCapabilities, blockReasons, versions } =
    useLoaderData<typeof loader>();
  const draft = mod.versions.find((v: { status: string }) => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
  const isThemeModule = String(spec?.type ?? '').startsWith('theme.');
  const isBlocked = blockedCapabilities.length > 0;
  const nav = useNavigation();
  const isSaving = nav.state !== 'idle';

  return (
    <Page
      title={mod.name}
      subtitle={spec ? `${spec.category} · ${spec.type} · Plan: ${planTier}` : undefined}
      backAction={{ content: 'All modules', url: '/' }}
    >
      <BlockStack gap="400">
        {catalog ? (
          <Banner tone="info" title={`Template: ${catalog.catalogId}`}>
            <p>{catalog.description}</p>
          </Banner>
        ) : null}

        {isBlocked ? (
          <Banner tone="warning" title="Plan upgrade required">
            <BlockStack gap="200">
              {blockReasons.map((r, i) => <Text key={i} as="p">{r}</Text>)}
            </BlockStack>
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Preview</Text>
            <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden', height: 420 }}>
              <iframe
                title="Module preview"
                src={`/preview/${moduleId}`}
                style={{ width: '100%', height: '100%', border: 0 }}
              />
            </div>
            <Text as="p" tone="subdued">
              Theme previews are an HTML approximation. For a true storefront preview, publish to a duplicate theme.
            </Text>
          </BlockStack>
        </Card>

        {spec && isThemeStorefrontUi(spec) ? (
          <StyleBuilder key={draft?.id} spec={spec} moduleId={moduleId} />
        ) : null}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Publish</Text>
            {isBlocked ? (
              <Banner tone="critical" title="Cannot publish">
                <p>This module requires capabilities your current plan does not include.</p>
              </Banner>
            ) : null}
            <Form method="post" action="/api/publish">
              <input type="hidden" name="moduleId" value={moduleId} />
              <BlockStack gap="300">
                {isThemeModule ? (
                  <TextField label="Theme ID (for preview/publish)" name="themeId" autoComplete="off" />
                ) : null}
                <InlineStack gap="200">
                  <Button submit variant="primary" disabled={isBlocked || isSaving} loading={isSaving}>
                    Publish
                  </Button>
                  <Button url="/">Back</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Version history</Text>
            {versions.length === 0 ? (
              <Text as="p" tone="subdued">No versions yet.</Text>
            ) : (
              <DataTable
                columnContentTypes={['numeric', 'text', 'text', 'text']}
                headings={['Version', 'Status', 'Published at', 'Rollback']}
                rows={versions.map(v => [
                  v.version,
                  <Badge key={v.id} tone={v.status === 'PUBLISHED' ? 'success' : 'attention'}>
                    {v.status}{v.isActive ? ' (active)' : ''}
                  </Badge>,
                  v.publishedAt ? new Date(v.publishedAt).toLocaleString() : '—',
                  v.isActive ? (
                    <Text key={v.id} as="span" tone="subdued">Current</Text>
                  ) : (
                    <Form key={v.id} method="post" action="/api/rollback">
                      <input type="hidden" name="moduleId" value={moduleId} />
                      <input type="hidden" name="version" value={v.version} />
                      <Button submit size="slim" variant="secondary">
                        Rollback to v{v.version}
                      </Button>
                    </Form>
                  ),
                ])}
              />
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Compiled operations (preview)</Text>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }}>
              {JSON.stringify(compiled, null, 2)}
            </pre>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Spec (read-only)</Text>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }}>
              {JSON.stringify(spec, null, 2)}
            </pre>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
