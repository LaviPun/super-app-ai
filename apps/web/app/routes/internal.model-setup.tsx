import { json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation, useOutletContext } from '@remix-run/react';
import { Banner, BlockStack, Button, Card, Checkbox, Divider, InlineGrid, InlineStack, Page, Select, Text, TextField } from '@shopify/polaris';
import { useEffect, useMemo, useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { PromptRouterDecisionSchema } from '~/schemas/prompt-router.server';
import {
  RouterRuntimeTargetSchema,
  type RouterRuntimeConfig,
  type RouterRuntimeTarget,
} from '~/schemas/router-runtime-config.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import {
  getRouterRuntimeConfig,
  maskToken,
  resolveRouterTargetConfig,
  saveRouterRuntimeConfig,
} from '~/services/ai/router-runtime-config.server';

type ProbeResult = {
  ok: boolean;
  message: string;
};

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function isoNow(): string {
  return new Date().toISOString();
}

async function fetchWithTimeout(url: string, token: string | undefined, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function runHealthProbe(config: RouterRuntimeConfig, target: RouterRuntimeTarget): Promise<ProbeResult> {
  const targetConfig = config.targets[target];
  const url = targetConfig.url?.trim();
  if (!url) return { ok: false, message: `${target} URL missing` };
  try {
    const response = await fetchWithTimeout(
      `${url.replace(/\/+$/, '')}/healthz`,
      targetConfig.token,
      targetConfig.timeoutMs,
      { method: 'GET' },
    );
    if (!response.ok) return { ok: false, message: `/healthz returned ${response.status}` };
    return { ok: true, message: `/healthz ok (${response.status})` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'health check failed' };
  }
}

async function runRouteProbe(config: RouterRuntimeConfig, target: RouterRuntimeTarget): Promise<ProbeResult> {
  const targetConfig = config.targets[target];
  const url = targetConfig.url?.trim();
  if (!url) return { ok: false, message: `${target} URL missing` };
  try {
    const payload = {
      prompt: 'Create a popup with 10% discount.',
      classification: {
        moduleType: 'theme.popup',
        intent: 'promo.popup',
        surface: 'home',
        confidence: 0.7,
        alternatives: [],
      },
      intentPacket: {
        classification: {
          intent: 'promo.popup',
          confidence: 0.7,
          evidence: [],
          moduleTypeHint: 'theme.popup',
        },
        routing: {
          needCatalog: true,
          needSettings: true,
          needSchema: false,
          styleRichness: 'medium',
        },
      },
      fallback: {
        version: '1.0',
        moduleType: 'theme.popup',
        confidence: 0.7,
        includeFlags: {
          includeSettingsPack: true,
          includeIntentPacket: true,
          includeCatalog: true,
          includeFullSchema: false,
          includeStyleSchema: false,
        },
        settingsRequired: ['title'],
        needsClarification: false,
        reasonCode: 'deterministic_medium_confidence',
        reasoning: 'probe_fallback',
      },
      operationClass: 'P0_CREATE',
    };
    const response = await fetchWithTimeout(
      `${url.replace(/\/+$/, '')}/route`,
      targetConfig.token,
      targetConfig.timeoutMs,
      { method: 'POST', body: JSON.stringify(payload) },
    );
    if (!response.ok) return { ok: false, message: `/route returned ${response.status}` };
    const data = await response.json();
    const parsed = PromptRouterDecisionSchema.safeParse(data);
    if (!parsed.success) return { ok: false, message: '/route JSON failed PromptRouterDecisionSchema' };
    return { ok: true, message: `/route schema check passed (${parsed.data.reasonCode})` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'route probe failed' };
  }
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const config = await getRouterRuntimeConfig();
  const resolved = await resolveRouterTargetConfig();

  return json({
    config,
    resolved: {
      ...resolved,
      tokenMasked: maskToken(resolved.token),
    },
    tokenMasked: {
      localMachine: maskToken(config.targets.localMachine.token),
      modalRemote: maskToken(config.targets.modalRemote.token),
    },
  });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');
  const activity = new ActivityLogService();
  const current = await getRouterRuntimeConfig();

  if (intent === 'save') {
    const next: RouterRuntimeConfig = {
      ...current,
      activeTarget: RouterRuntimeTargetSchema.parse(String(form.get('activeTarget') ?? current.activeTarget)),
      fallbackTarget: RouterRuntimeTargetSchema.safeParse(String(form.get('fallbackTarget') ?? '')).success
        ? RouterRuntimeTargetSchema.parse(String(form.get('fallbackTarget')))
        : undefined,
      shadowMode: String(form.get('shadowMode') ?? 'false') === 'true',
      canaryShops: parseCsv(String(form.get('canaryShops') ?? '')),
      circuitFailureThreshold: Number(form.get('circuitFailureThreshold') ?? current.circuitFailureThreshold),
      circuitCooldownMs: Number(form.get('circuitCooldownMs') ?? current.circuitCooldownMs),
      targets: {
        localMachine: {
          ...current.targets.localMachine,
          url: String(form.get('localUrl') ?? '').trim() || undefined,
          backend: (String(form.get('localBackend') ?? current.targets.localMachine.backend) as 'ollama' | 'openai' | 'custom'),
          model: String(form.get('localModel') ?? '').trim() || undefined,
          timeoutMs: Number(form.get('localTimeoutMs') ?? current.targets.localMachine.timeoutMs),
          token: String(form.get('localToken') ?? '').trim() || current.targets.localMachine.token,
        },
        modalRemote: {
          ...current.targets.modalRemote,
          url: String(form.get('modalUrl') ?? '').trim() || undefined,
          backend: (String(form.get('modalBackend') ?? current.targets.modalRemote.backend) as 'ollama' | 'openai' | 'custom'),
          model: String(form.get('modalModel') ?? '').trim() || undefined,
          timeoutMs: Number(form.get('modalTimeoutMs') ?? current.targets.modalRemote.timeoutMs),
          token: String(form.get('modalToken') ?? '').trim() || current.targets.modalRemote.token,
        },
      },
    };

    const saved = await saveRouterRuntimeConfig(next);
    await activity.log({
      actor: 'INTERNAL_ADMIN',
      action: 'STORE_SETTINGS_UPDATED',
      details: {
        section: 'setup-model',
        activeTarget: saved.activeTarget,
        fallbackTarget: saved.fallbackTarget ?? null,
        shadowMode: saved.shadowMode,
      },
    });
    return json({ toast: { message: 'Setup the Model configuration saved' } });
  }

  if (intent === 'probeHealth' || intent === 'probeRoute') {
    const target = RouterRuntimeTargetSchema.parse(String(form.get('target') ?? current.activeTarget));
    const result = intent === 'probeHealth'
      ? await runHealthProbe(current, target)
      : await runRouteProbe(current, target);

    const next: RouterRuntimeConfig = {
      ...current,
      ...(intent === 'probeHealth'
        ? {
            lastHealthCheckAt: isoNow(),
            lastHealthCheckOk: result.ok,
            lastHealthCheckMessage: `${target}: ${result.message}`,
          }
        : {
            lastRouteCheckAt: isoNow(),
            lastRouteCheckOk: result.ok,
            lastRouteCheckMessage: `${target}: ${result.message}`,
          }),
    };
    await saveRouterRuntimeConfig(next);
    return json({
      toast: { message: result.ok ? 'Probe passed' : 'Probe failed', error: !result.ok },
      probe: result,
    });
  }

  if (intent === 'switchTarget') {
    const target = RouterRuntimeTargetSchema.parse(String(form.get('target') ?? current.activeTarget));
    const previous = current.activeTarget;
    const withShadow: RouterRuntimeConfig = {
      ...current,
      previousTarget: previous,
      activeTarget: target,
      shadowMode: true,
    };
    await saveRouterRuntimeConfig(withShadow);
    await activity.log({
      actor: 'INTERNAL_ADMIN',
      action: 'SETTINGS_CHANGE',
      details: { section: 'setup-model', step: 'switchTarget', previous, target, forcedShadow: true },
    });
    return json({ toast: { message: `Active target switched to ${target} (shadow mode enabled)` } });
  }

  if (intent === 'rollback') {
    if (!current.previousTarget) {
      return json({ error: 'No previous target available for rollback' }, { status: 400 });
    }
    const rollbackTo = current.previousTarget;
    await saveRouterRuntimeConfig({
      ...current,
      activeTarget: rollbackTo,
      shadowMode: true,
    });
    await activity.log({
      actor: 'INTERNAL_ADMIN',
      action: 'SETTINGS_CHANGE',
      details: { section: 'setup-model', step: 'rollback', target: rollbackTo },
    });
    return json({ toast: { message: `Rolled back to ${rollbackTo} (shadow mode enabled)` } });
  }

  return json({ error: 'Unknown intent' }, { status: 400 });
}

export default function InternalModelSetupRoute() {
  const { config, tokenMasked, resolved } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const outletContext = useOutletContext<{ showToast?: (msg: string, error?: boolean) => void }>();
  const isSaving = nav.state !== 'idle';

  const [activeTarget, setActiveTarget] = useState<RouterRuntimeTarget>(config.activeTarget);
  const [fallbackTarget, setFallbackTarget] = useState<string>(config.fallbackTarget ?? '');
  const [shadowMode, setShadowMode] = useState(config.shadowMode);
  const [canaryShops, setCanaryShops] = useState(config.canaryShops.join(', '));
  const [circuitFailureThreshold, setCircuitFailureThreshold] = useState(String(config.circuitFailureThreshold));
  const [circuitCooldownMs, setCircuitCooldownMs] = useState(String(config.circuitCooldownMs));

  const [localUrl, setLocalUrl] = useState(config.targets.localMachine.url ?? '');
  const [localBackend, setLocalBackend] = useState(config.targets.localMachine.backend);
  const [localModel, setLocalModel] = useState(config.targets.localMachine.model ?? '');
  const [localTimeoutMs, setLocalTimeoutMs] = useState(String(config.targets.localMachine.timeoutMs));
  const [localToken, setLocalToken] = useState('');

  const [modalUrl, setModalUrl] = useState(config.targets.modalRemote.url ?? '');
  const [modalBackend, setModalBackend] = useState(config.targets.modalRemote.backend);
  const [modalModel, setModalModel] = useState(config.targets.modalRemote.model ?? '');
  const [modalTimeoutMs, setModalTimeoutMs] = useState(String(config.targets.modalRemote.timeoutMs));
  const [modalToken, setModalToken] = useState('');

  useEffect(() => {
    const toast = actionData && 'toast' in actionData ? (actionData as { toast?: { message: string; error?: boolean } }).toast : undefined;
    if (toast?.message && outletContext?.showToast) outletContext.showToast(toast.message, toast.error);
  }, [actionData, outletContext]);

  const targetOptions = useMemo(
    () => [
      { label: 'localMachine (local developer machine)', value: 'localMachine' },
      { label: 'modalRemote (fully hosted on Modal)', value: 'modalRemote' },
    ],
    [],
  );

  return (
    <Page title="Setup the Model" subtitle="Control runtime target switching for first-layer prompt router.">
      <BlockStack gap="500">
        {actionData && 'error' in actionData && actionData.error ? (
          <Banner tone="critical" title="Action failed">
            <Text as="p">{actionData.error}</Text>
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Active runtime and safety controls</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Guarded switch flow: run health + route probes, switch target with shadow mode, observe, then disable shadow mode.
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Resolved now: <code>{resolved.target}</code> ({resolved.url ?? 'no url'}) token {resolved.tokenMasked || 'not configured'}
            </Text>
            <Form method="post">
              <input type="hidden" name="intent" value="save" />
              <input type="hidden" name="shadowMode" value={shadowMode ? 'true' : 'false'} />
              <BlockStack gap="300">
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <Select label="Active target" name="activeTarget" options={targetOptions} value={activeTarget} onChange={(v) => setActiveTarget(v as RouterRuntimeTarget)} />
                  <Select
                    label="Fallback target (optional)"
                    name="fallbackTarget"
                    options={[{ label: 'None', value: '' }, ...targetOptions]}
                    value={fallbackTarget}
                    onChange={setFallbackTarget}
                  />
                </InlineGrid>
                <Checkbox label="Shadow mode enabled" checked={shadowMode} onChange={setShadowMode} />
                <TextField
                  label="Canary shops (comma separated)"
                  name="canaryShops"
                  value={canaryShops}
                  onChange={setCanaryShops}
                  autoComplete="off"
                  helpText="When set, router calls only run for listed shops."
                />
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <TextField
                    label="Circuit failure threshold"
                    name="circuitFailureThreshold"
                    value={circuitFailureThreshold}
                    onChange={setCircuitFailureThreshold}
                    autoComplete="off"
                  />
                  <TextField
                    label="Circuit cooldown (ms)"
                    name="circuitCooldownMs"
                    value={circuitCooldownMs}
                    onChange={setCircuitCooldownMs}
                    autoComplete="off"
                  />
                </InlineGrid>

                <Divider />
                <Text as="h3" variant="headingSm">localMachine target</Text>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <TextField label="URL" name="localUrl" value={localUrl} onChange={setLocalUrl} autoComplete="off" />
                  <Select
                    label="Backend"
                    name="localBackend"
                    value={localBackend}
                    onChange={(v) => setLocalBackend(v as 'ollama' | 'openai' | 'custom')}
                    options={[
                      { label: 'ollama', value: 'ollama' },
                      { label: 'openai', value: 'openai' },
                      { label: 'custom', value: 'custom' },
                    ]}
                  />
                </InlineGrid>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <TextField label="Model" name="localModel" value={localModel} onChange={setLocalModel} autoComplete="off" />
                  <TextField label="Timeout (ms)" name="localTimeoutMs" value={localTimeoutMs} onChange={setLocalTimeoutMs} autoComplete="off" />
                </InlineGrid>
                <Text as="p" variant="bodySm" tone="subdued">Token: {tokenMasked.localMachine || 'not set'}</Text>
                <TextField
                  label="Rotate local token (optional)"
                  name="localToken"
                  type="password"
                  value={localToken}
                  onChange={setLocalToken}
                  autoComplete="off"
                  placeholder="Leave blank to keep existing"
                />

                <Divider />
                <Text as="h3" variant="headingSm">modalRemote target</Text>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <TextField label="URL" name="modalUrl" value={modalUrl} onChange={setModalUrl} autoComplete="off" />
                  <Select
                    label="Backend"
                    name="modalBackend"
                    value={modalBackend}
                    onChange={(v) => setModalBackend(v as 'ollama' | 'openai' | 'custom')}
                    options={[
                      { label: 'openai', value: 'openai' },
                      { label: 'ollama', value: 'ollama' },
                      { label: 'custom', value: 'custom' },
                    ]}
                  />
                </InlineGrid>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <TextField label="Model" name="modalModel" value={modalModel} onChange={setModalModel} autoComplete="off" />
                  <TextField label="Timeout (ms)" name="modalTimeoutMs" value={modalTimeoutMs} onChange={setModalTimeoutMs} autoComplete="off" />
                </InlineGrid>
                <Text as="p" variant="bodySm" tone="subdued">Token: {tokenMasked.modalRemote || 'not set'}</Text>
                <TextField
                  label="Rotate modal token (optional)"
                  name="modalToken"
                  type="password"
                  value={modalToken}
                  onChange={setModalToken}
                  autoComplete="off"
                  placeholder="Leave blank to keep existing"
                />

                <InlineStack align="start">
                  <Button submit variant="primary" loading={isSaving}>Save setup</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Operator checks</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Run `/healthz` and `/route` schema validation probes before and after switching targets.
            </Text>
            <InlineStack gap="200">
              <Form method="post">
                <input type="hidden" name="intent" value="probeHealth" />
                <input type="hidden" name="target" value={activeTarget} />
                <Button submit loading={isSaving}>Health check active target</Button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="probeRoute" />
                <input type="hidden" name="target" value={activeTarget} />
                <Button submit loading={isSaving}>Route contract check</Button>
              </Form>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Last health: {config.lastHealthCheckAt ?? 'never'} {config.lastHealthCheckMessage ? `(${config.lastHealthCheckMessage})` : ''}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Last route check: {config.lastRouteCheckAt ?? 'never'} {config.lastRouteCheckMessage ? `(${config.lastRouteCheckMessage})` : ''}
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Safe switch and rollback</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Switch promotes a target in shadow mode first. Rollback restores previous target with automatic shadow safety.
            </Text>
            <InlineStack gap="200">
              <Form method="post">
                <input type="hidden" name="intent" value="switchTarget" />
                <input type="hidden" name="target" value={activeTarget} />
                <Button submit variant="primary" loading={isSaving}>Switch to selected target (shadow)</Button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="rollback" />
                <Button submit tone="critical" loading={isSaving}>Rollback to previous target</Button>
              </Form>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
