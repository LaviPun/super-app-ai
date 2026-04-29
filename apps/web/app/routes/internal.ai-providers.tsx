import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData, useActionData, useNavigation } from '@remix-run/react';
import {
  Page, Card, BlockStack, TextField, Button, Text, InlineStack, Select,
  Badge, DataTable, Banner, Checkbox,
} from '@shopify/polaris';
import { useState, useRef, useEffect } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { AiProviderService, type ProviderKind } from '~/services/internal/ai-provider.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const service = new AiProviderService();
  const providersRaw = await service.list();
  const providers = await Promise.all(
    providersRaw.map(async (p) => ({
      ...p,
      apiKeyMasked: await service.getApiKeyMasked(p.id),
    }))
  );
  const defaultProviders = await service.getDefaultProvidersForSettings();
  const prisma = getPrisma();
  const prices = await prisma.aiModelPrice.findMany({
    where: { isActive: true },
    include: { provider: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return json({ providers, prices, defaultProviders });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'create');
  const service = new AiProviderService();
  const prisma = getPrisma();
  const activity = new ActivityLogService();

  if (intent === 'activate') {
    const id = String(form.get('id') ?? '');
    if (!id) return json({ error: 'Missing id' }, { status: 400 });
    await service.setActive(id);
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PROVIDER_ACTIVATED', resource: `provider:${id}` });
    return redirect('/internal/ai-providers');
  }

  if (intent === 'addPrice') {
    const providerId = String(form.get('providerId') ?? '');
    const model = String(form.get('model') ?? '').trim();
    const inputRaw = String(form.get('inputCents') ?? '').trim();
    const outputRaw = String(form.get('outputCents') ?? '').trim();
    const cachedRaw = String(form.get('cachedCents') ?? '').trim();
    const input = Number(inputRaw);
    const output = Number(outputRaw);
    if (!providerId || !model || inputRaw === '' || outputRaw === '' ||
        !Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) {
      return json(
        { error: 'Provider, model, and non-negative input/output cents are required (0 is allowed for free tiers).' },
        { status: 400 },
      );
    }
    let cached: number | null = null;
    if (cachedRaw !== '') {
      const c = Number(cachedRaw);
      if (!Number.isFinite(c) || c < 0) {
        return json({ error: 'Cached cents must be a non-negative number.' }, { status: 400 });
      }
      cached = c;
    }

    await prisma.aiModelPrice.create({
      data: {
        providerId,
        model,
        inputPer1MTokensCents: input,
        outputPer1MTokensCents: output,
        cachedInputPer1MTokensCents: cached,
        isActive: true,
      },
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PRICE_ADDED', resource: `model:${model}`, details: { providerId, input, output } });
    return redirect('/internal/ai-providers');
  }

  if (intent === 'updateExtraConfig') {
    const id = String(form.get('id') ?? '');
    const skillsRaw = String(form.get('claudeSkills') ?? '').trim();
    const codeExecution = form.get('claudeCodeExecution') === 'true';
    if (!id) return json({ error: 'Missing provider id' }, { status: 400 });
    const skills = skillsRaw ? skillsRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) : [];
    await service.updateExtraConfig(id, { skills: skills.length ? skills : undefined, codeExecution });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PROVIDER_EXTRA_CONFIG_UPDATED', resource: `provider:${id}` });
    return redirect('/internal/ai-providers');
  }

  if (intent === 'saveOpenAI') {
    const apiKey = String(form.get('openaiApiKey') ?? '').trim();
    const model = String(form.get('openaiModel') ?? '').trim();
    try {
      await service.upsertDefaultOpenAI({ apiKey: apiKey || undefined, model: model || undefined });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'OpenAI save failed.' }, { status: 400 });
    }
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPENAI_PROVIDER_UPDATED' });
    return redirect('/internal/ai-providers');
  }

  if (intent === 'saveClaude') {
    const apiKey = String(form.get('claudeApiKey') ?? '').trim();
    const model = String(form.get('claudeModel') ?? '').trim();
    const skillsRaw = String(form.get('claudeSkills') ?? '').trim();
    const codeExecution = form.get('claudeCodeExecution') === 'true';
    const skills = skillsRaw ? skillsRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) : undefined;
    const extraConfig = skills?.length || codeExecution ? { skills, codeExecution } : undefined;
    try {
      await service.upsertDefaultClaude({ apiKey: apiKey || undefined, model: model || undefined, extraConfig });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Claude save failed.' }, { status: 400 });
    }
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'CLAUDE_PROVIDER_UPDATED' });
    return redirect('/internal/ai-providers');
  }

  const name = String(form.get('name') ?? '').trim();
  const providerRaw = String(form.get('provider') ?? 'OPENAI');
  const apiKey = String(form.get('apiKey') ?? '').trim();
  const model = String(form.get('defaultModel') ?? '').trim();
  const baseUrl = String(form.get('baseUrl') ?? '').trim();
  const claudeSkillsRaw = String(form.get('claudeSkills') ?? '').trim();
  const claudeCodeExecution = form.get('claudeCodeExecution') === 'true';

  if (!name || !apiKey) return json({ error: 'Name and API key are required.' }, { status: 400 });

  const ALLOWED_PROVIDERS: readonly ProviderKind[] = ['OPENAI', 'ANTHROPIC', 'AZURE_OPENAI', 'CUSTOM'];
  if (!ALLOWED_PROVIDERS.includes(providerRaw as ProviderKind)) {
    return json({ error: `Unknown provider kind: ${providerRaw}` }, { status: 400 });
  }
  const provider = providerRaw as ProviderKind;

  const extraConfig =
    provider === 'ANTHROPIC' && (claudeSkillsRaw || claudeCodeExecution)
      ? {
          skills: claudeSkillsRaw ? claudeSkillsRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) : undefined,
          codeExecution: claudeCodeExecution,
        }
      : undefined;

  await service.create({
    name,
    provider,
    apiKey,
    model: model || undefined,
    baseUrl: baseUrl || undefined,
    isActive: true,
    extraConfig: extraConfig ?? undefined,
  });

  await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PROVIDER_CREATED', resource: `provider:${name}`, details: { provider } });
  return redirect('/internal/ai-providers');
}

function ClaudeExtraConfigForm({ provider }: { provider: { id: string; extraConfig: string | null } }) {
  const [skills, setSkills] = useState(() => {
    try {
      const c = provider.extraConfig ? JSON.parse(provider.extraConfig) as { skills?: string[] } : {};
      return c.skills?.join(', ') ?? '';
    } catch { return ''; }
  });
  const [codeExecution, setCodeExecution] = useState(() => {
    try {
      const c = provider.extraConfig ? JSON.parse(provider.extraConfig) as { codeExecution?: boolean } : {};
      return !!c.codeExecution;
    } catch { return false; }
  });
  return (
    <BlockStack gap="200">
      {provider.extraConfig ? (
        <Text as="p" variant="bodySm" tone="subdued">
          Claude: {(() => {
            try {
              const c = JSON.parse(provider.extraConfig) as { skills?: string[]; codeExecution?: boolean };
              const parts = [];
              if (c.skills?.length) parts.push(`Skills: ${c.skills.join(', ')}`);
              if (c.codeExecution) parts.push('Code execution: on');
              return parts.length ? parts.join(' · ') : '—';
            } catch { return '—'; }
          })()}
        </Text>
      ) : null}
      <Form method="post">
        <input type="hidden" name="intent" value="updateExtraConfig" />
        <input type="hidden" name="id" value={provider.id} />
        <BlockStack gap="200">
          <TextField label="Claude skills (comma-separated)" name="claudeSkills" value={skills} onChange={setSkills} autoComplete="off" placeholder="pptx, xlsx" />
          <Checkbox label="Code execution" checked={codeExecution} onChange={setCodeExecution} />
          <input type="hidden" name="claudeCodeExecution" value={codeExecution ? 'true' : 'false'} />
          <Button submit size="slim" variant="secondary">Update Claude options</Button>
        </BlockStack>
      </Form>
    </BlockStack>
  );
}

export default function InternalAiProviders() {
  const { providers, prices, defaultProviders } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const isSaving = nav.state !== 'idle';

  const [addName, setAddName] = useState('');
  const [addProvider, setAddProvider] = useState('OPENAI');
  const [addDefaultModel, setAddDefaultModel] = useState('');
  const [addBaseUrl, setAddBaseUrl] = useState('');
  const [addApiKey, setAddApiKey] = useState('');
  const [addClaudeSkills, setAddClaudeSkills] = useState('');
  const [addClaudeCodeExecution, setAddClaudeCodeExecution] = useState(false);

  const [priceProviderId, setPriceProviderId] = useState(providers[0]?.id ?? '');
  const [priceModel, setPriceModel] = useState('');
  const [priceInputCents, setPriceInputCents] = useState('');
  const [priceOutputCents, setPriceOutputCents] = useState('');
  const [priceCachedCents, setPriceCachedCents] = useState('');

  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState(defaultProviders?.openai?.model ?? '');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [claudeModel, setClaudeModel] = useState(defaultProviders?.claude?.model ?? '');
  const [claudeSkills, setClaudeSkills] = useState(() => {
    if (!defaultProviders?.claude?.extraConfig) return '';
    try {
      const c = JSON.parse(defaultProviders.claude.extraConfig) as { skills?: string[] };
      return c.skills?.join(', ') ?? '';
    } catch { return ''; }
  });
  const [claudeCodeExecution, setClaudeCodeExecution] = useState(() => {
    if (!defaultProviders?.claude?.extraConfig) return false;
    try {
      const c = JSON.parse(defaultProviders.claude.extraConfig) as { codeExecution?: boolean };
      return !!c.codeExecution;
    } catch { return false; }
  });

  useEffect(() => {
    setOpenaiModel((prev) => defaultProviders?.openai?.model ?? prev);
    setClaudeModel((prev) => defaultProviders?.claude?.model ?? prev);
    if (defaultProviders?.claude?.extraConfig) {
      try {
        const c = JSON.parse(defaultProviders.claude.extraConfig) as { skills?: string[]; codeExecution?: boolean };
        setClaudeSkills(c.skills?.join(', ') ?? '');
        setClaudeCodeExecution(!!c.codeExecution);
      } catch {
        // keep current
      }
    }
  }, [defaultProviders?.openai?.model, defaultProviders?.claude?.model, defaultProviders?.claude?.extraConfig]);
  useEffect(() => {
    if (providers.length && !priceProviderId) setPriceProviderId(providers[0]!.id);
  }, [providers, priceProviderId]);

  const providerOptions = providers.map(p => ({ label: `${p.name} (${p.provider})`, value: p.id }));
  const openaiRef = useRef<HTMLDivElement>(null);
  const claudeRef = useRef<HTMLDivElement>(null);
  const addProviderRef = useRef<HTMLDivElement>(null);

  return (
    <Page title="AI Providers" subtitle="Configure AI providers, API keys, and model pricing.">
      <BlockStack gap="500">
        {data?.error ? (
          <Banner tone="critical" title="Error">
            <Text as="p">{data.error}</Text>
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Jump to</Text>
            <Text as="p" variant="bodySm" tone="subdued">Click to scroll to the section and fill details.</Text>
            <InlineStack gap="300">
              <Button
                onClick={() => openaiRef.current?.scrollIntoView({ behavior: 'smooth' })}
              >
                OpenAI (default)
              </Button>
              <Button
                onClick={() => claudeRef.current?.scrollIntoView({ behavior: 'smooth' })}
              >
                Claude (Anthropic) (default)
              </Button>
              <Button
                onClick={() => addProviderRef.current?.scrollIntoView({ behavior: 'smooth' })}
              >
                Add other provider
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <div ref={addProviderRef}>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Add provider (for other APIs)</Text>
              <Text as="p" variant="bodySm" tone="subdued">Add Azure OpenAI, custom endpoints, or additional providers.</Text>
              <Form method="post">
                <BlockStack gap="200">
                  <TextField label="Name" name="name" value={addName} onChange={setAddName} autoComplete="off" helpText="A friendly label for this provider." />
                  <TextField label="Provider type" name="provider" value={addProvider} onChange={setAddProvider} autoComplete="off" helpText="OPENAI, ANTHROPIC (Claude), AZURE_OPENAI, or CUSTOM" placeholder="OPENAI" />
                  <TextField label="Default model (optional)" name="defaultModel" value={addDefaultModel} onChange={setAddDefaultModel} autoComplete="off" />
                  <TextField label="Base URL (optional)" name="baseUrl" value={addBaseUrl} onChange={setAddBaseUrl} autoComplete="off" />
                  <TextField label="API key" name="apiKey" type="password" value={addApiKey} onChange={setAddApiKey} autoComplete="off" />
                  <TextField label="Claude Agent Skills (ANTHROPIC only, optional)" name="claudeSkills" value={addClaudeSkills} onChange={setAddClaudeSkills} autoComplete="off" placeholder="pptx, xlsx, docx or custom skill_01Ab..." helpText="Comma-separated: anthropic IDs (pptx, xlsx, docx, pdf) or custom skill IDs. Max 8 per request." />
                  <Checkbox label="Enable Claude code execution (ANTHROPIC only)" checked={addClaudeCodeExecution} onChange={setAddClaudeCodeExecution} />
                  <input type="hidden" name="claudeCodeExecution" value={addClaudeCodeExecution ? 'true' : 'false'} />
                  <InlineStack align="start">
                    <Button submit variant="primary" loading={isSaving}>Save & set active</Button>
                  </InlineStack>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </div>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Configured providers</Text>
            {providers.length === 0 ? (
              <BlockStack gap="200">
                <Text as="p" tone="subdued">No providers configured yet.</Text>
                <Text as="p" variant="bodySm" tone="subdued">Add a provider above to get started.</Text>
              </BlockStack>
            ) : (
              providers.map(p => (
                <Card key={p.id}>
                  <BlockStack gap="300">
                    <InlineStack gap="200" align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="p" variant="headingSm">{p.name}</Text>
                        <Badge>{p.provider}</Badge>
                        {p.isActive ? <Badge tone="success">Global active</Badge> : null}
                      </InlineStack>
                      <Form method="post">
                        <input type="hidden" name="intent" value="activate" />
                        <input type="hidden" name="id" value={p.id} />
                        <Button submit disabled={p.isActive} size="slim">{p.isActive ? 'Active' : 'Set global active'}</Button>
                      </Form>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      API key: {(p as { apiKeyMasked?: string }).apiKeyMasked ?? '—'} · Model: {p.model ?? '—'} · Base URL: {p.baseUrl ?? '—'}
                    </Text>
                    {p.provider === 'ANTHROPIC' && (
                      <ClaudeExtraConfigForm provider={p} />
                    )}
                  </BlockStack>
                </Card>
              ))
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Model pricing</Text>
            <Text as="p" variant="bodySm" tone="subdued">Add pricing per model (cents per 1M tokens) so costs are computed accurately.</Text>
            <Form method="post">
              <input type="hidden" name="intent" value="addPrice" />
              <input type="hidden" name="providerId" value={priceProviderId} />
              <BlockStack gap="200">
                {providerOptions.length > 0 ? (
                  <Select label="Provider" options={providerOptions} value={priceProviderId} onChange={setPriceProviderId} />
                ) : (
                  <Text as="p" tone="subdued">Add a provider first.</Text>
                )}
                <TextField label="Model" name="model" value={priceModel} onChange={setPriceModel} autoComplete="off" placeholder="gpt-4o" />
                <TextField label="Input (cents / 1M)" name="inputCents" type="number" value={priceInputCents} onChange={setPriceInputCents} autoComplete="off" />
                <TextField label="Output (cents / 1M)" name="outputCents" type="number" value={priceOutputCents} onChange={setPriceOutputCents} autoComplete="off" />
                <TextField label="Cached input (cents / 1M, optional)" name="cachedCents" type="number" value={priceCachedCents} onChange={setPriceCachedCents} autoComplete="off" />
                <InlineStack align="start">
                  <Button submit variant="secondary" loading={isSaving}>Save model pricing</Button>
                </InlineStack>
              </BlockStack>
            </Form>

            {prices.length > 0 ? (
              <DataTable
                columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric']}
                headings={['Provider', 'Model', 'Input', 'Output', 'Cached']}
                rows={prices.map(pr => [
                  pr.provider.name,
                  pr.model,
                  pr.inputPer1MTokensCents,
                  pr.outputPer1MTokensCents,
                  pr.cachedInputPer1MTokensCents ?? '—',
                ])}
              />
            ) : null}
          </BlockStack>
        </Card>

        <div ref={openaiRef}>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">OpenAI (default)</Text>
              <Text as="p" variant="bodySm" tone="subdued">API key and default model. Set as active in the list above or in Settings.</Text>
              <Form method="post">
                <input type="hidden" name="intent" value="saveOpenAI" />
                <BlockStack gap="200">
                  <TextField label="API key" name="openaiApiKey" type="password" value={openaiApiKey} onChange={setOpenaiApiKey} autoComplete="off" placeholder="Leave blank to keep existing" helpText={defaultProviders?.openai ? `Current: ${defaultProviders.openai.apiKeyMasked}` : undefined} />
                  <TextField label="Default model (optional)" name="openaiModel" value={openaiModel} onChange={setOpenaiModel} autoComplete="off" placeholder="gpt-4o-mini" />
                  <Button submit variant="primary" loading={isSaving}>Save OpenAI</Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </div>

        <div ref={claudeRef}>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Claude (Anthropic) (default)</Text>
              <Text as="p" variant="bodySm" tone="subdued">API key, model, and optional Agent Skills / code execution. Set as active in the list above or in Settings.</Text>
              <Form method="post">
                <input type="hidden" name="intent" value="saveClaude" />
                <BlockStack gap="200">
                  <TextField label="API key" name="claudeApiKey" type="password" value={claudeApiKey} onChange={setClaudeApiKey} autoComplete="off" placeholder="Leave blank to keep existing" helpText={defaultProviders?.claude ? `Current: ${defaultProviders.claude.apiKeyMasked}` : undefined} />
                  <TextField label="Default model (optional)" name="claudeModel" value={claudeModel} onChange={setClaudeModel} autoComplete="off" placeholder="claude-sonnet-4-20250514" />
                  <TextField label="Agent Skills (optional, comma-separated)" name="claudeSkills" value={claudeSkills} onChange={setClaudeSkills} autoComplete="off" placeholder="pptx, xlsx, docx" />
                  <Checkbox label="Enable code execution" checked={claudeCodeExecution} onChange={setClaudeCodeExecution} />
                  <input type="hidden" name="claudeCodeExecution" value={claudeCodeExecution ? 'true' : 'false'} />
                  <Button submit variant="primary" loading={isSaving}>Save Claude</Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </div>
      </BlockStack>
    </Page>
  );
}
