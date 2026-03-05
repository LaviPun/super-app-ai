import { json } from '@remix-run/node';
import { useLoaderData, Form, useNavigation, useFetcher, useSearchParams, useRevalidator } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, InlineStack, Button, TextField,
  Banner, Badge, DataTable, InlineGrid, Divider, Box, SkeletonBodyText,
  Modal, Tabs, Select,
} from '@shopify/polaris';
import { useState, useCallback, useEffect } from 'react';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { PreviewService } from '~/services/preview/preview.service';
import { MODULE_CATALOG, isCapabilityAllowed } from '@superapp/core';
import { getTypeDisplayLabel, getTypeTone } from '~/utils/type-label';
import { compileRecipe } from '~/services/recipes/compiler';
import { StyleBuilder } from '~/components/StyleBuilder';
import { ConfigEditor } from '~/components/ConfigEditor';
import { ThemeService } from '~/services/shopify/theme.service';
import type { RecipeSpec } from '@superapp/core';

function isThemeStorefrontUi(spec: RecipeSpec): boolean {
  return ['theme.banner', 'theme.popup', 'theme.notificationBar', 'theme.effect', 'theme.floatingWidget', 'proxy.widget'].includes(spec.type);
}

export async function loader({ request, params }: { request: Request; params: { moduleId?: string } }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) throw new Response('Missing moduleId', { status: 400 });

  const ms = new ModuleService();
  const mod = await ms.getModule(session.shop, moduleId);
  if (!mod) throw new Response('Not found', { status: 404 });

  const caps = new CapabilityService();
  let planTier = await caps.getPlanTier(session.shop);
  if (planTier === 'UNKNOWN') planTier = await caps.refreshPlanTier(session.shop, admin);

  const draft = mod.versions.find(v => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
  const spec = draft ? new RecipeService().parse(draft.specJson) : null;

  const blockedCapabilities = spec
    ? (spec.requires ?? []).filter(c => !isCapabilityAllowed(planTier, c as any))
    : [];
  const blockReasons = blockedCapabilities.map(c => caps.explainCapabilityGate(c as any) ?? String(c));

  const catalog = spec
    ? MODULE_CATALOG.find(x => x.catalogId === spec.type || x.catalogId.startsWith(`${spec.type}.`))
    : null;

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

  const versions = mod.versions.map(v => ({
    id: v.id,
    version: v.version,
    status: v.status,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    isActive: mod.activeVersionId === v.id,
  }));

  let previewHtml: string | null = null;
  let previewJson: unknown | null = null;
  if (spec) {
    const result = new PreviewService().render(spec);
    if (result.kind === 'HTML') {
      previewHtml = result.html;
    } else {
      previewJson = result.json;
    }
  }

  let themes: { id: number; name: string; role: string }[] = [];
  if (spec && String(spec.type).startsWith('theme.')) {
    try {
      const themeService = new ThemeService(admin);
      const raw = await themeService.listThemes();
      themes = raw
        .map(t => ({ id: Number(t.id), name: (t.name ?? '').toString(), role: (t.role ?? '').toString().toLowerCase() }))
        .filter(t => Number.isFinite(t.id) && t.id > 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[modules.$moduleId] Theme list fetch failed:', msg);
      }
    }
  }

  const publishedVersion = mod.versions.find(v => v.status === 'PUBLISHED') ?? mod.activeVersion ?? null;
  const publishedThemeId = publishedVersion?.targetThemeId ?? null;

  return json({ moduleId, mod, spec, catalog, compiled, planTier, blockedCapabilities, blockReasons, versions, previewHtml, previewJson, themes, publishedThemeId });
}

function getDefaultThemeId(
  themes: { id: number; name: string; role: string }[],
  publishedThemeId: string | null
): string {
  if (!themes.length) return '';
  const publishedMatch = publishedThemeId && themes.some(t => String(t.id) === String(publishedThemeId));
  if (publishedMatch) return String(publishedThemeId);
  const main = themes.find(t => String(t.role).toLowerCase() === 'main');
  return main ? String(main.id) : String(themes[0].id);
}

export default function ModuleDetail() {
  const { moduleId, mod, spec, catalog, compiled, planTier, blockedCapabilities, blockReasons, versions, previewHtml, previewJson, themes, publishedThemeId } =
    useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [searchParams] = useSearchParams();
  const justPublished = searchParams.get('published') === '1';
  const noExtension = searchParams.get('noExtension');
  const draft = mod.versions.find((v: { status: string }) => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
  const isThemeModule = String(spec?.type ?? '').startsWith('theme.');
  const isBlocked = blockedCapabilities.length > 0;
  const nav = useNavigation();
  const modifyFetcher = useFetcher<{ options?: { index: number; explanation: string; recipe: Record<string, unknown> }[]; error?: string; moduleId?: string }>();
  const modifyConfirmFetcher = useFetcher<{ ok?: boolean; error?: string; version?: number; name?: string }>();
  const publishFetcher = useFetcher<{ error?: string }>();
  const PublishForm = publishFetcher.Form;
  const isPublishing = publishFetcher.state !== 'idle';
  const isModifying = modifyFetcher.state !== 'idle';
  const isModifyConfirming = modifyConfirmFetcher.state !== 'idle';
  const isSaving = nav.state !== 'idle' || publishFetcher.state !== 'idle';

  const defaultThemeId = getDefaultThemeId(themes, publishedThemeId ?? null);
  const [selectedThemeId, setSelectedThemeId] = useState(defaultThemeId);

  useEffect(() => {
    const next = getDefaultThemeId(themes, publishedThemeId ?? null);
    const currentValid = themes.length && themes.some(t => String(t.id) === selectedThemeId);
    if (!currentValid) setSelectedThemeId(next);
  }, [themes, publishedThemeId]);

  const [previewMode, setPreviewMode] = useState<'visual' | 'html'>('visual');
  const [techModalOpen, setTechModalOpen] = useState(false);
  const [techTab, setTechTab] = useState(0);
  const mainTheme = themes.find((t: { role: string }) => String(t.role).toLowerCase() === 'main');
  const [modifyModalOpen, setModifyModalOpen] = useState(false);
  const [modifyInstruction, setModifyInstruction] = useState('');
  const [modifyOptions, setModifyOptions] = useState<{ index: number; explanation: string; recipe: Record<string, unknown> }[] | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleteFetcher = useFetcher<{ error?: string }>();
  const isDeletingModule = deleteFetcher.state !== 'idle';

  useEffect(() => {
    if (modifyFetcher.data?.options && modifyFetcher.state === 'idle') {
      setModifyOptions(modifyFetcher.data.options);
    }
  }, [modifyFetcher.data, modifyFetcher.state]);

  const hasHtmlPreview = previewHtml !== null;

  useEffect(() => {
    if (modifyConfirmFetcher.data?.ok && !isModifyConfirming) {
      // Reload to show the updated module spec after AI modification
      window.location.reload();
    }
  }, [modifyConfirmFetcher.data, isModifyConfirming]);

  return (
    <Page
      title={mod.name}
      subtitle={spec ? `${spec.category} · ${getTypeDisplayLabel(spec.type)}` : undefined}
      backAction={{ content: 'Modules', url: '/modules' }}
      titleMetadata={
        <InlineStack gap="200">
          <Badge tone={mod.status === 'PUBLISHED' ? 'success' : 'attention'}>{mod.status}</Badge>
          <Badge>{planTier}</Badge>
        </InlineStack>
      }
    >
      <BlockStack gap="500">
        {/* Top: stats bar */}
        <InlineGrid columns={{ xs: 2, sm: 4 }} gap="400">
          <Card padding="400">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">Type</Text>
              {spec ? (
                <Badge tone={getTypeTone(spec.type)}>{getTypeDisplayLabel(spec.type)}</Badge>
              ) : (
                <Text as="p" variant="headingSm">—</Text>
              )}
            </BlockStack>
          </Card>
          <Card padding="400">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">Category</Text>
              <Text as="p" variant="headingSm">{spec?.category ?? '—'}</Text>
            </BlockStack>
          </Card>
          <Card padding="400">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">Versions</Text>
              <Text as="p" variant="headingSm">{String(versions.length)}</Text>
            </BlockStack>
          </Card>
          <Card padding="400">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">Plan tier</Text>
              <Text as="p" variant="headingSm">{planTier}</Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {justPublished && (
          <Banner tone="success" title="Module published successfully!">
            <Text as="p">Your module is now live on your store.</Text>
          </Banner>
        )}

        {justPublished && noExtension === 'admin' && (
          <Banner tone="warning" title="This block will not appear in Shopify Admin yet">
            <BlockStack gap="200">
              <Text as="p">
                Admin and POS UI extensions are not deployed in this app. Your module is saved and published in the app, but it will not show on the Shopify Admin order (or product/customer) page until an Admin UI extension is added and deployed.
              </Text>
              <Text as="p" tone="subdued">
                To show blocks on the <strong>customer-facing</strong> order status or order list, use a Customer Account template (Order status block, Order index block, or Profile block) instead. See <code>docs/debug.md</code> §3 for details.
              </Text>
            </BlockStack>
          </Banner>
        )}

        {catalog && (
          <Banner tone="info" title={`Template: ${catalog.catalogId}`}>
            <p>{catalog.description}</p>
          </Banner>
        )}

        {isBlocked && (
          <Banner tone="warning" title="Plan upgrade required">
            <BlockStack gap="200">
              {blockReasons.map((r, i) => <Text key={i} as="p">{r}</Text>)}
              <Button url="/billing" variant="plain">View upgrade options →</Button>
            </BlockStack>
          </Banner>
        )}

        {/* Two-panel: left = settings, right = sticky preview */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--p-space-400)', alignItems: 'start' }}>

          {/* LEFT PANEL: Config + Style + AI + Publish + History + Tech */}
          <BlockStack gap="400">

            {spec && (
              <ConfigEditor key={`config-${draft?.id}`} spec={spec} moduleId={moduleId} />
            )}

            {spec && isThemeStorefrontUi(spec) && (
              <StyleBuilder key={draft?.id} spec={spec} moduleId={moduleId} />
            )}

            <Card padding="400">
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Modify with AI</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Describe what you want to change and AI will generate 3 modification options to choose from.
                    </Text>
                  </BlockStack>
                  <Badge tone="magic">AI-powered</Badge>
                </InlineStack>
                <Button onClick={() => { setModifyModalOpen(true); setModifyOptions(null); }}>
                  Rework / Regenerate
                </Button>
              </BlockStack>
            </Card>

            <Card padding="400">
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Publish</Text>
                  {mod.status === 'PUBLISHED' && <Badge tone="success">Live</Badge>}
                </InlineStack>
                {isBlocked ? (
                  <Banner tone="critical">
                    <Text as="p">This module requires capabilities not included in your plan.</Text>
                  </Banner>
                ) : (
                  <Text as="p" tone="subdued">
                    Publishing deploys the module to your store.{isThemeModule ? ' Select a target theme below.' : ''}
                  </Text>
                )}
                {publishFetcher.data?.error && !isPublishing && (() => {
                  const err = publishFetcher.data.error;
                  const msg = typeof err === 'string' ? err : 'Publish failed. Please try again.';
                  // Don't show "Theme X not found" when that theme is in the current list (stale/transient error)
                  const themeNotFoundMatch = msg.match(/^Theme\s+(\d+)\s+not found/);
                  const themeIdInError = themeNotFoundMatch ? themeNotFoundMatch[1] : null;
                  const themeInList = themeIdInError && themes.some(t => String(t.id) === themeIdInError);
                  if (themeInList) return null;
                  return (
                    <Banner tone="critical">
                      <Text as="p">{msg}</Text>
                    </Banner>
                  );
                })()}
                <PublishForm method="post" action="/api/publish">
                  <input type="hidden" name="moduleId" value={moduleId} />
                  <BlockStack gap="300">
                    {isThemeModule && themes.length > 0 && (
                      <>
                        <InlineStack gap="300" blockAlign="center" wrap={false}>
                          <Box minWidth="240px">
                            <Select
                              label="Target theme"
                              options={themes.map((t: { id: number; name: string; role: string }) => ({
                                value: String(t.id),
                                label: String(t.role).toLowerCase() === 'main' ? `${t.name} (Live)` : t.name,
                              }))}
                              value={selectedThemeId || defaultThemeId}
                              onChange={setSelectedThemeId}
                            />
                          </Box>
                          <Box paddingBlockStart="400">
                            <Button
                              onClick={() => revalidator.revalidate()}
                              loading={revalidator.state === 'loading'}
                            >
                              Refresh themes
                            </Button>
                          </Box>
                        </InlineStack>
                        <input type="hidden" name="themeId" value={selectedThemeId || defaultThemeId} />
                      </>
                    )}
                    {isThemeModule && themes.length === 0 && (
                      <Banner tone="warning">
                        <BlockStack gap="200">
                          <Text as="p">Could not fetch themes from your store. Click Refresh themes to try again.</Text>
                          <Button
                            onClick={() => revalidator.revalidate()}
                            loading={revalidator.state === 'loading'}
                          >
                            Refresh themes
                          </Button>
                        </BlockStack>
                      </Banner>
                    )}
                    <InlineStack gap="200">
                      <Button
                        submit
                        variant="primary"
                        disabled={isBlocked || isSaving || (isThemeModule && themes.length > 0 && !(selectedThemeId || defaultThemeId))}
                        loading={isSaving}
                      >
                        {mod.status === 'PUBLISHED' ? 'Re-publish' : 'Publish to store'}
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </PublishForm>
              </BlockStack>
            </Card>

            <Card padding="400">
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Version history</Text>
                {versions.length === 0 ? (
                  <Text as="p" tone="subdued">No versions yet.</Text>
                ) : (
                  <DataTable
                    columnContentTypes={['numeric', 'text', 'text', 'text']}
                    headings={['Version', 'Status', 'Published at', '']}
                    rows={versions.map(v => [
                      v.version,
                      <Badge key={v.id} tone={v.status === 'PUBLISHED' ? 'success' : 'attention'}>
                        {`${v.status}${v.isActive ? ' (active)' : ''}`}
                      </Badge>,
                      v.publishedAt ? new Date(v.publishedAt).toLocaleString('en-US') : '—',
                      v.isActive ? (
                        <Text key={v.id} as="span" tone="subdued">Current</Text>
                      ) : (
                        <Form key={v.id} method="post" action="/api/rollback">
                          <input type="hidden" name="moduleId" value={moduleId} />
                          <input type="hidden" name="version" value={String(v.version)} />
                          <Button submit size="slim" variant="secondary">
                            {`Rollback to v${v.version}`}
                          </Button>
                        </Form>
                      ),
                    ])}
                  />
                )}
              </BlockStack>
            </Card>

            <Card padding="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Technical details</Text>
                <Button onClick={() => setTechModalOpen(true)}>
                  View compiled operations &amp; RecipeSpec
                </Button>
              </InlineStack>
            </Card>

            <Card padding="400">
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Danger zone</Text>
                <Text as="p" tone="subdued">
                  Permanently delete this module and all its versions. This cannot be undone.
                </Text>
                {!deleteConfirm ? (
                  <Button tone="critical" onClick={() => setDeleteConfirm(true)}>
                    Delete module
                  </Button>
                ) : (
                  <BlockStack gap="200">
                    <Banner tone="critical">
                      <Text as="p">Are you sure? This will permanently delete "{mod.name}" and all its versions.</Text>
                    </Banner>
                    <InlineStack gap="200">
                      <Form method="post" action={`/api/modules/${moduleId}/delete`}>
                        <Button submit tone="critical" variant="primary" loading={isDeletingModule}>
                          Yes, delete permanently
                        </Button>
                      </Form>
                      <Button onClick={() => setDeleteConfirm(false)}>Cancel</Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

          </BlockStack>

          {/* Right panel: sticky preview */}
          <div style={{ position: 'sticky', top: 'var(--p-space-400)' }}>
            <Card padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd" fontWeight="semibold">Live preview</Text>
                  <InlineStack gap="200">
                    {hasHtmlPreview && (
                      <Button
                        size="slim"
                        variant={previewMode === 'visual' ? 'primary' : 'secondary'}
                        onClick={() => setPreviewMode(previewMode === 'visual' ? 'html' : 'visual')}
                      >
                        {previewMode === 'visual' ? 'View HTML' : 'Visual preview'}
                      </Button>
                    )}
                    <Badge>{hasHtmlPreview ? 'HTML' : 'JSON'}</Badge>
                  </InlineStack>
                </InlineStack>

                {hasHtmlPreview && previewMode === 'visual' && (
                  <Box borderRadius="300" borderWidth="025" borderColor="border" minHeight="520px" overflow="hidden" background="bg-surface-secondary">
                    <iframe
                      title="Module preview"
                      srcDoc={previewHtml ?? ''}
                      style={{ width: '100%', height: 520, border: 0 }}
                      sandbox="allow-scripts"
                    />
                  </Box>
                )}

                {hasHtmlPreview && previewMode === 'html' && (
                  <Box padding="400" background="bg-surface-secondary" borderRadius="300" minHeight="520px" maxHeight="520px" overflow="auto">
                    <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, fontFamily: 'var(--p-font-mono)', lineHeight: 1.6 }}>
                      {previewHtml}
                    </pre>
                  </Box>
                )}

                {!hasHtmlPreview && previewJson != null && (
                  <Box padding="400" background="bg-surface-secondary" borderRadius="300" minHeight="520px" maxHeight="520px" overflow="auto">
                    <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, fontFamily: 'var(--p-font-mono)' }}>
                      {JSON.stringify(previewJson as Record<string, unknown>, null, 2)}
                    </pre>
                  </Box>
                )}

                {!hasHtmlPreview && !previewJson && (
                  <Box padding="600" background="bg-surface-secondary" borderRadius="300" minHeight="200px">
                    <BlockStack gap="200">
                      <Text as="p" tone="subdued">No preview available for this module type.</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Publish to a theme to see it on your storefront.</Text>
                    </BlockStack>
                  </Box>
                )}

                <Text as="p" variant="bodySm" tone="subdued">
                  For pixel-perfect preview, publish to a duplicate theme and test on your storefront.
                </Text>
              </BlockStack>
            </Card>
          </div>

        </div>
      </BlockStack>

        {modifyModalOpen && (
          <Modal
            open={modifyModalOpen}
            onClose={() => { setModifyModalOpen(false); setModifyInstruction(''); setModifyOptions(null); }}
            title="Modify module with AI"
            primaryAction={modifyOptions ? undefined : {
              content: 'Generate 3 options',
              loading: isModifying,
              disabled: !modifyInstruction.trim() || isModifying,
              onAction: () => {
                setModifyOptions(null);
                modifyFetcher.submit(
                  { moduleId, instruction: modifyInstruction },
                  { method: 'post', action: '/api/ai/modify-module' },
                );
              },
            }}
            secondaryActions={[{
              content: modifyOptions ? 'Back' : 'Cancel',
              onAction: () => {
                if (modifyOptions) { setModifyOptions(null); }
                else { setModifyModalOpen(false); setModifyInstruction(''); }
              },
            }]}
            large={!!modifyOptions}
          >
            <Modal.Section>
              <BlockStack gap="400">
                {!modifyOptions && (
                  <>
                    <Text as="p" tone="subdued">
                      Describe the changes you want. AI will generate 3 different modification options while keeping the same type ({spec ? getTypeDisplayLabel(spec.type) : '—'}).
                    </Text>
                    <TextField
                      label="What should change?"
                      value={modifyInstruction}
                      onChange={setModifyInstruction}
                      autoComplete="off"
                      multiline={4}
                      placeholder='e.g. "Change the headline to Holiday Sale", "Make the popup trigger on scroll instead of exit intent"'
                      helpText="Be specific about what to change. The rest of the module will be preserved."
                    />
                    {isModifying && (
                      <Banner tone="info">
                        <Text as="p">AI is generating 3 modification options...</Text>
                      </Banner>
                    )}
                  </>
                )}

                {modifyOptions && (
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">Choose a modification</Text>
                    {modifyOptions.map((opt, i) => {
                      const config = (opt.recipe.config ?? {}) as Record<string, unknown>;
                      return (
                        <Card key={i}>
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="h3" variant="headingSm">Option {i + 1}</Text>
                              <Badge tone="info">{String(opt.recipe.type ?? '')}</Badge>
                            </InlineStack>
                            <Text as="p" variant="bodyMd">{opt.explanation}</Text>
                            <BlockStack gap="050">
                              {Object.entries(config).slice(0, 4).map(([k, v]) => (
                                <Text key={k} as="p" variant="bodySm" tone="subdued">
                                  {k}: {typeof v === 'object' ? JSON.stringify(v).slice(0, 50) : String(v).slice(0, 50)}
                                </Text>
                              ))}
                            </BlockStack>
                            <Button
                              variant="primary"
                              loading={isModifyConfirming}
                              disabled={isModifyConfirming}
                              onClick={() => {
                                modifyConfirmFetcher.submit(
                                  { moduleId, spec: JSON.stringify(opt.recipe) },
                                  { method: 'post', action: '/api/ai/modify-module-confirm' },
                                );
                              }}
                            >
                              Use this option
                            </Button>
                          </BlockStack>
                        </Card>
                      );
                    })}
                  </BlockStack>
                )}

                {modifyConfirmFetcher.data?.ok && (
                  <Banner tone="success">
                    <Text as="p">Module updated to version {modifyConfirmFetcher.data.version}. Reload the page to see changes.</Text>
                  </Banner>
                )}
                {modifyFetcher.data?.error && !isModifying && (
                  <Banner tone="critical">
                    <Text as="p">{modifyFetcher.data.error}</Text>
                  </Banner>
                )}
                {modifyConfirmFetcher.data?.error && !isModifyConfirming && (
                  <Banner tone="critical">
                    <Text as="p">{modifyConfirmFetcher.data.error}</Text>
                  </Banner>
                )}
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}

    {techModalOpen && (
      <Modal
        open={techModalOpen}
        onClose={() => setTechModalOpen(false)}
        title="Technical details"
        large
      >
        <Modal.Section>
          <Tabs
            tabs={[
              { id: 'compiled', content: 'Compiled operations' },
              { id: 'recipespec', content: 'RecipeSpec' },
            ]}
            selected={techTab}
            onSelect={setTechTab}
          />
          <Box paddingBlockStart="400">
            {techTab === 0 && (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  Deploy operations generated from the RecipeSpec. Read-only.
                </Text>
                <div style={{ background: '#f6f6f7', borderRadius: 8, padding: 12, maxHeight: 500, overflow: 'auto' }}>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, fontFamily: 'monospace' }}>
                    {JSON.stringify(compiled, null, 2)}
                  </pre>
                </div>
              </BlockStack>
            )}
            {techTab === 1 && (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  The validated RecipeSpec JSON for this module. Read-only.
                </Text>
                <div style={{ background: '#f6f6f7', borderRadius: 8, padding: 12, maxHeight: 500, overflow: 'auto' }}>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, fontFamily: 'monospace' }}>
                    {JSON.stringify(spec, null, 2)}
                  </pre>
                </div>
              </BlockStack>
            )}
          </Box>
        </Modal.Section>
      </Modal>
    )}
    </Page>
  );
}
