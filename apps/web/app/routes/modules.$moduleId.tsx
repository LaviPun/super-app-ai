import { json } from '@remix-run/node';
import { useLoaderData, Form, useNavigation, useFetcher } from '@remix-run/react';
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
  return ['theme.banner', 'theme.popup', 'theme.notificationBar', 'theme.effect', 'proxy.widget'].includes(spec.type);
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
      themes = await themeService.listThemes();
    } catch {
      // Graceful degradation: user can still type ID manually if themes fetch fails
    }
  }

  return json({ moduleId, mod, spec, catalog, compiled, planTier, blockedCapabilities, blockReasons, versions, previewHtml, previewJson, themes });
}

export default function ModuleDetail() {
  const { moduleId, mod, spec, catalog, compiled, planTier, blockedCapabilities, blockReasons, versions, previewHtml, previewJson, themes } =
    useLoaderData<typeof loader>();
  const draft = mod.versions.find((v: { status: string }) => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
  const isThemeModule = String(spec?.type ?? '').startsWith('theme.');
  const isBlocked = blockedCapabilities.length > 0;
  const nav = useNavigation();
  const isSaving = nav.state !== 'idle';

  const [previewMode, setPreviewMode] = useState<'visual' | 'html'>('visual');
  const [techModalOpen, setTechModalOpen] = useState(false);
  const [techTab, setTechTab] = useState(0);
  const mainTheme = themes.find((t: { role: string }) => t.role === 'main');
  const [selectedThemeId, setSelectedThemeId] = useState(mainTheme ? String(mainTheme.id) : '');
  const [modifyModalOpen, setModifyModalOpen] = useState(false);
  const [modifyInstruction, setModifyInstruction] = useState('');
  const modifyFetcher = useFetcher<{ options?: { index: number; explanation: string; recipe: Record<string, unknown> }[]; error?: string; moduleId?: string }>();
  const modifyConfirmFetcher = useFetcher<{ ok?: boolean; error?: string; version?: number; name?: string }>();
  const isModifying = modifyFetcher.state !== 'idle';
  const isModifyConfirming = modifyConfirmFetcher.state !== 'idle';
  const [modifyOptions, setModifyOptions] = useState<{ index: number; explanation: string; recipe: Record<string, unknown> }[] | null>(null);

  useEffect(() => {
    if (modifyFetcher.data?.options && modifyFetcher.state === 'idle') {
      setModifyOptions(modifyFetcher.data.options);
    }
  }, [modifyFetcher.data, modifyFetcher.state]);

  const hasHtmlPreview = previewHtml !== null;

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
        {/* ─── Module info ─── */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Type</Text>
              {spec ? (
                <Badge tone={getTypeTone(spec.type)}>{getTypeDisplayLabel(spec.type)}</Badge>
              ) : (
                <Text as="p" variant="headingSm">—</Text>
              )}
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Category</Text>
              <Text as="p" variant="headingSm">{spec?.category ?? '—'}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Versions</Text>
              <Text as="p" variant="headingSm">{String(versions.length)}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Plan tier</Text>
              <Text as="p" variant="headingSm">{planTier}</Text>
            </BlockStack>
          </Card>
        </InlineGrid>

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

        {/* ─── Preview ─── */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Live preview</Text>
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
              <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden', height: 420, background: '#fafafa' }}>
                <iframe
                  title="Module preview"
                  srcDoc={previewHtml ?? ''}
                  style={{ width: '100%', height: '100%', border: 0 }}
                  sandbox="allow-scripts"
                />
              </div>
            )}

            {hasHtmlPreview && previewMode === 'html' && (
              <div style={{
                background: '#1e1e2e',
                borderRadius: 12,
                padding: 16,
                maxHeight: 420,
                overflow: 'auto',
              }}>
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  fontSize: 12,
                  fontFamily: '"SF Mono", "Fira Code", "JetBrains Mono", monospace',
                  color: '#cdd6f4',
                  lineHeight: 1.6,
                }}>
                  {previewHtml}
                </pre>
              </div>
            )}

            {!hasHtmlPreview && previewJson != null && (
              <div style={{ background: '#f6f6f7', borderRadius: 12, padding: 16, maxHeight: 420, overflow: 'auto' }}>
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, fontFamily: 'monospace' }}>
                  {JSON.stringify(previewJson as Record<string, unknown>, null, 2)}
                </pre>
              </div>
            )}

            {!hasHtmlPreview && !previewJson && (
              <Text as="p" tone="subdued">No preview available for this module type.</Text>
            )}

            <Text as="p" variant="bodySm" tone="subdued">
              For pixel-perfect preview, publish to a duplicate theme and test on your storefront.
            </Text>
          </BlockStack>
        </Card>

        {/* ─── Module settings / config editor ─── */}
        {spec && (
          <ConfigEditor key={`config-${draft?.id}`} spec={spec} moduleId={moduleId} />
        )}

        {/* ─── Modify with AI ─── */}
        <Card>
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

        {/* ─── Style builder ─── */}
        {spec && isThemeStorefrontUi(spec) ? (
          <StyleBuilder key={draft?.id} spec={spec} moduleId={moduleId} />
        ) : null}

        {/* ─── Publish ─── */}
        <Card>
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
            <Form method="post" action="/api/publish">
              <input type="hidden" name="moduleId" value={moduleId} />
              <BlockStack gap="300">
                {isThemeModule && themes.length > 0 && (
                  <>
                    <Text as="p" variant="headingSm">Target theme</Text>
                    <BlockStack gap="200">
                      {themes.map((t: { id: number; name: string; role: string }) => {
                        const isLive = t.role === 'main';
                        const isSelected = selectedThemeId === String(t.id);
                        return (
                          <div
                            key={t.id}
                            onClick={() => setSelectedThemeId(String(t.id))}
                            style={{
                              padding: '12px 16px',
                              borderRadius: 8,
                              border: isSelected ? '2px solid #2c6ecb' : '1px solid #e1e3e5',
                              background: isSelected ? '#f0f5ff' : isLive ? '#f0fdf4' : '#fff',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              transition: 'border-color 0.15s, background 0.15s',
                            }}
                          >
                            <InlineStack gap="200" blockAlign="center">
                              <div style={{
                                width: 16, height: 16, borderRadius: '50%',
                                border: isSelected ? '5px solid #2c6ecb' : '2px solid #8c9196',
                                background: isSelected ? '#fff' : 'transparent',
                              }} />
                              <BlockStack gap="0">
                                <Text as="span" variant="bodyMd" fontWeight={isLive ? 'bold' : 'regular'}>
                                  {t.name}
                                </Text>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  ID: {t.id}
                                </Text>
                              </BlockStack>
                            </InlineStack>
                            <InlineStack gap="200">
                              {isLive && <Badge tone="success">Live theme</Badge>}
                              {t.role === 'unpublished' && <Badge>Draft</Badge>}
                              {t.role === 'demo' && <Badge tone="info">Trial</Badge>}
                              {isSelected && <Badge tone="info">Selected</Badge>}
                            </InlineStack>
                          </div>
                        );
                      })}
                    </BlockStack>
                    <input type="hidden" name="themeId" value={selectedThemeId} />
                  </>
                )}
                {isThemeModule && themes.length === 0 && (
                  <Banner tone="warning">
                    <BlockStack gap="200">
                      <Text as="p">Could not fetch themes from your store. You can enter a Theme ID manually.</Text>
                      <TextField
                        label="Theme ID"
                        name="themeId"
                        autoComplete="off"
                        helpText="Enter the numeric Theme ID from Settings > Themes in your Shopify admin."
                      />
                    </BlockStack>
                  </Banner>
                )}
                <InlineStack gap="200">
                  <Button
                    submit
                    variant="primary"
                    disabled={isBlocked || isSaving || (isThemeModule && themes.length > 0 && !selectedThemeId)}
                    loading={isSaving}
                  >
                    {mod.status === 'PUBLISHED' ? 'Re-publish' : 'Publish to store'}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        {/* ─── Version history ─── */}
        <Card>
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
                  v.publishedAt ? new Date(v.publishedAt).toLocaleString() : '—',
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

        {/* ─── Technical details (modal) ─── */}
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h2" variant="headingMd">Technical details</Text>
            <Button onClick={() => setTechModalOpen(true)}>
              View compiled operations &amp; RecipeSpec
            </Button>
          </InlineStack>
        </Card>

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
      </BlockStack>
    </Page>
  );
}
