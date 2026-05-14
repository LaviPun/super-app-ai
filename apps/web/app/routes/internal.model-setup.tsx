import { json } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation, useOutletContext, useSubmit } from '@remix-run/react';
import { Banner, BlockStack, Button, Card, Checkbox, Divider, InlineGrid, InlineStack, Page, Select, Text, TextField } from '@shopify/polaris';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { PromptRouterDecisionSchema } from '~/schemas/prompt-router.server';
import {
  RouterRuntimeTargetSchema,
  type RouterRuntimeConfig,
  type RouterRuntimeTarget,
} from '~/schemas/router-runtime-config.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { SettingsService } from '~/services/settings/settings.service';
import {
  getRouterRuntimeConfig,
  maskToken,
  resolveRouterTargetConfig,
  saveRouterRuntimeConfig,
} from '~/services/ai/router-runtime-config.server';
import { getPromptRouterMetricsSnapshot } from '~/services/ai/prompt-router.server';
import {
  fetchWithTimeout,
  probeTargetLiveness,
  validateAssistantChatTarget,
  type AssistantChatProbeResult,
} from '~/services/ai/assistant-chat-target-probe.server';

type ProbeResult = AssistantChatProbeResult;

type RouterBackend = 'ollama' | 'openai' | 'qwen3' | 'custom';
const RouterBackendSchema = z.enum(['ollama', 'openai', 'qwen3', 'custom']);
const SaveConfigFormSchema = z.object({
  activeTarget: RouterRuntimeTargetSchema,
  fallbackTarget: z.string().optional(),
  dualTargetEnabled: z.enum(['true', 'false']),
  shadowMode: z.enum(['true', 'false']),
  canaryShops: z.string().optional(),
  circuitFailureThreshold: z.coerce.number().int().min(1).max(100),
  circuitCooldownMs: z.coerce.number().int().min(1000).max(600000),
  releaseGateSchemaFailRateMax: z.coerce.number().min(0).max(1),
  releaseGateFallbackRateMax: z.coerce.number().min(0).max(1),
  localUrl: z.string().optional(),
  localBackend: RouterBackendSchema,
  localModel: z.string().optional(),
  localTimeoutMs: z.coerce.number().int().min(500).max(10_000),
  localToken: z.string().optional(),
  modalUrl: z.string().optional(),
  modalBackend: RouterBackendSchema,
  modalModel: z.string().optional(),
  modalTimeoutMs: z.coerce.number().int().min(500).max(10_000),
  modalToken: z.string().optional(),
});

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function isoNow(): string {
  return new Date().toISOString();
}

async function runHealthProbe(config: RouterRuntimeConfig, target: RouterRuntimeTarget): Promise<ProbeResult> {
  const targetConfig = config.targets[target];
  const url = targetConfig.url?.trim();
  if (!url) return { ok: false, message: `${target} URL missing` };
  return probeTargetLiveness({
    backend: targetConfig.backend,
    url,
    token: targetConfig.token,
    timeoutMs: targetConfig.timeoutMs,
  });
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

function normalizeHttpUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const config = await getRouterRuntimeConfig();
  const settings = await new SettingsService().get();
  const resolved = await resolveRouterTargetConfig();
  const metrics = getPromptRouterMetricsSnapshot();
  const targetMetrics = metrics.byTarget[resolved.target];
  const schemaFailRate =
    targetMetrics.attempts > 0
      ? targetMetrics.schemaRejects / targetMetrics.attempts
      : 0;
  const fallbackRate =
    targetMetrics.attempts > 0
      ? targetMetrics.fallbacks / targetMetrics.attempts
      : 0;
  const gates = {
    schemaFailRate,
    fallbackRate,
    schemaPass: schemaFailRate <= resolved.releaseGateSchemaFailRateMax,
    fallbackPass: fallbackRate <= resolved.releaseGateFallbackRateMax,
  };

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
    designReferenceUrl: settings.designReferenceUrl,
    metrics,
    gates,
  });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  try {
    const form = await request.formData();
    const intent = String(form.get('intent') ?? 'save');
    const activity = new ActivityLogService();
    const current = await getRouterRuntimeConfig();

    if (intent === 'save') {
      const parsed = SaveConfigFormSchema.safeParse(Object.fromEntries(form));
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? 'Invalid Local AI setting input' }, { status: 400 });
      }
      const values = parsed.data;
      const localModel = values.localModel?.trim() || 'qwen3:4b-instruct';
      const modalModel = values.modalModel?.trim() || 'Qwen/Qwen3-4B-Instruct';
      const next: RouterRuntimeConfig = {
        ...current,
        activeTarget: values.activeTarget,
        fallbackTarget: RouterRuntimeTargetSchema.safeParse(values.fallbackTarget ?? '').success
          ? RouterRuntimeTargetSchema.parse(values.fallbackTarget)
          : undefined,
        dualTargetEnabled: values.dualTargetEnabled === 'true',
        shadowMode: values.shadowMode === 'true',
        canaryShops: parseCsv(values.canaryShops ?? ''),
        circuitFailureThreshold: values.circuitFailureThreshold,
        circuitCooldownMs: values.circuitCooldownMs,
        releaseGateSchemaFailRateMax: values.releaseGateSchemaFailRateMax,
        releaseGateFallbackRateMax: values.releaseGateFallbackRateMax,
        targets: {
          localMachine: {
            ...current.targets.localMachine,
            url: values.localUrl?.trim() || undefined,
            backend: values.localBackend,
            model: localModel,
            timeoutMs: values.localTimeoutMs,
            token: values.localToken?.trim() || current.targets.localMachine.token,
          },
          modalRemote: {
            ...current.targets.modalRemote,
            url: values.modalUrl?.trim() || undefined,
            backend: values.modalBackend,
            model: modalModel,
            timeoutMs: values.modalTimeoutMs,
            token: values.modalToken?.trim() || current.targets.modalRemote.token,
          },
        },
      };

      const [localChatValidation, modalChatValidation] = await Promise.all([
        validateAssistantChatTarget({
          target: 'localMachine',
          backend: next.targets.localMachine.backend,
          url: next.targets.localMachine.url,
          token: next.targets.localMachine.token,
          timeoutMs: next.targets.localMachine.timeoutMs,
        }),
        validateAssistantChatTarget({
          target: 'modalRemote',
          backend: next.targets.modalRemote.backend,
          url: next.targets.modalRemote.url,
          token: next.targets.modalRemote.token,
          timeoutMs: next.targets.modalRemote.timeoutMs,
        }),
      ]);

      if (!localChatValidation.ok || !modalChatValidation.ok) {
        const errors = [localChatValidation, modalChatValidation]
          .filter((result) => !result.ok)
          .map((result) => result.message);
        return json(
          {
            error: `Model setup save blocked by strict assistant target validation: ${errors.join(' | ')}`,
          },
          { status: 400 },
        );
      }

      const saved = await saveRouterRuntimeConfig(next);
      await activity.log({
        actor: 'INTERNAL_ADMIN',
        action: 'STORE_SETTINGS_UPDATED',
        details: {
          section: 'local-ai-setting',
          activeTarget: saved.activeTarget,
          fallbackTarget: saved.fallbackTarget ?? null,
          shadowMode: saved.shadowMode,
          localModel: saved.targets.localMachine.model ?? null,
          modalModel: saved.targets.modalRemote.model ?? null,
        },
      });
      return json({ toast: { message: 'Local AI settings saved' } });
    }

    if (intent === 'validateAssistantTargets') {
      const parsed = SaveConfigFormSchema.safeParse(Object.fromEntries(form));
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? 'Invalid Local AI setting input' }, { status: 400 });
      }
      const values = parsed.data;
      const localModel = values.localModel?.trim() || 'qwen3:4b-instruct';
      const modalModel = values.modalModel?.trim() || 'Qwen/Qwen3-4B-Instruct';
      const nextTargets: RouterRuntimeConfig['targets'] = {
        localMachine: {
          ...current.targets.localMachine,
          url: values.localUrl?.trim() || undefined,
          backend: values.localBackend,
          model: localModel,
          timeoutMs: values.localTimeoutMs,
          token: values.localToken?.trim() || current.targets.localMachine.token,
        },
        modalRemote: {
          ...current.targets.modalRemote,
          url: values.modalUrl?.trim() || undefined,
          backend: values.modalBackend,
          model: modalModel,
          timeoutMs: values.modalTimeoutMs,
          token: values.modalToken?.trim() || current.targets.modalRemote.token,
        },
      };

      const [localChatValidation, modalChatValidation] = await Promise.all([
        validateAssistantChatTarget({
          target: 'localMachine',
          backend: nextTargets.localMachine.backend,
          url: nextTargets.localMachine.url,
          token: nextTargets.localMachine.token,
          timeoutMs: nextTargets.localMachine.timeoutMs,
        }),
        validateAssistantChatTarget({
          target: 'modalRemote',
          backend: nextTargets.modalRemote.backend,
          url: nextTargets.modalRemote.url,
          token: nextTargets.modalRemote.token,
          timeoutMs: nextTargets.modalRemote.timeoutMs,
        }),
      ]);

      const allOk = localChatValidation.ok && modalChatValidation.ok;
      return json({
        validation: {
          localMachine: localChatValidation,
          modalRemote: modalChatValidation,
        },
        toast: {
          message: allOk
            ? 'Assistant target validation passed for local and cloud.'
            : 'Assistant target validation found issues — see details below.',
          error: !allOk,
        },
      });
    }

    if (intent === 'saveDesignReference') {
      const input = String(form.get('designReferenceUrl') ?? '');
      const normalized = input.trim() ? normalizeHttpUrl(input) : null;
      if (input.trim() && !normalized) {
        return json({ error: 'Design reference URL must be a valid http/https URL.' }, { status: 400 });
      }
      await new SettingsService().update({ designReferenceUrl: normalized });
      await activity.log({
        actor: 'INTERNAL_ADMIN',
        action: 'SETTINGS_CHANGE',
        details: { section: 'local-ai-setting', step: 'saveDesignReference', designReferenceUrl: normalized ?? null },
      });
      return json({
        toast: { message: normalized ? 'Design reference URL saved' : 'Design reference URL cleared (fallback will be used)' },
      });
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
      if (target === current.activeTarget) {
        return json({ error: `Selected target is already active (${target}). Choose the other target to switch.` }, { status: 400 });
      }
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
        details: { section: 'local-ai-setting', step: 'switchTarget', previous, target, forcedShadow: true },
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
        details: { section: 'local-ai-setting', step: 'rollback', target: rollbackTo },
      });
      return json({ toast: { message: `Rolled back to ${rollbackTo} (shadow mode enabled)` } });
    }

    return json({ error: 'Unknown intent' }, { status: 400 });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected error while updating Local AI settings.',
      },
      { status: 500 },
    );
  }
}

export default function InternalModelSetupRoute() {
  const { config, tokenMasked, resolved, metrics, gates, designReferenceUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const nav = useNavigation();
  const outletContext = useOutletContext<{ showToast?: (msg: string, error?: boolean) => void }>();
  const navIntent = nav.formData?.get('intent');
  const isBusy = nav.state !== 'idle';
  const isSavingMain = isBusy && navIntent === 'save';
  const isValidatingAssistant = isBusy && navIntent === 'validateAssistantTargets';
  const isSavingDesignRef = isBusy && navIntent === 'saveDesignReference';
  const isProbingHealth = isBusy && navIntent === 'probeHealth';
  const isProbingRoute = isBusy && navIntent === 'probeRoute';
  const isSwitching = isBusy && navIntent === 'switchTarget';
  const isRollingBack = isBusy && navIntent === 'rollback';

  const [activeTarget, setActiveTarget] = useState<RouterRuntimeTarget>(config.activeTarget);
  const [fallbackTarget, setFallbackTarget] = useState<string>(config.fallbackTarget ?? '');
  const [shadowMode, setShadowMode] = useState(config.shadowMode);
  const [dualTargetEnabled, setDualTargetEnabled] = useState(config.dualTargetEnabled);
  const [canaryShops, setCanaryShops] = useState(config.canaryShops.join(', '));
  const [circuitFailureThreshold, setCircuitFailureThreshold] = useState(String(config.circuitFailureThreshold));
  const [circuitCooldownMs, setCircuitCooldownMs] = useState(String(config.circuitCooldownMs));
  const [releaseGateSchemaFailRateMax, setReleaseGateSchemaFailRateMax] = useState(
    String(config.releaseGateSchemaFailRateMax),
  );
  const [releaseGateFallbackRateMax, setReleaseGateFallbackRateMax] = useState(
    String(config.releaseGateFallbackRateMax),
  );

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
  const [designReferenceInput, setDesignReferenceInput] = useState(designReferenceUrl ?? '');
  const [operatorTarget, setOperatorTarget] = useState<RouterRuntimeTarget>(activeTarget);
  const [switchTargetChoice, setSwitchTargetChoice] = useState<RouterRuntimeTarget>(
    activeTarget === 'localMachine' ? 'modalRemote' : 'localMachine',
  );

  useEffect(() => {
    const toast = actionData && 'toast' in actionData ? (actionData as { toast?: { message: string; error?: boolean } }).toast : undefined;
    if (toast?.message && outletContext?.showToast) outletContext.showToast(toast.message, toast.error);
  }, [actionData, outletContext]);

  useEffect(() => {
    setOperatorTarget(activeTarget);
    setSwitchTargetChoice(activeTarget === 'localMachine' ? 'modalRemote' : 'localMachine');
  }, [activeTarget]);

  const targetOptions = useMemo(
    () => [
      { label: 'localMachine (local developer machine)', value: 'localMachine' },
      { label: 'modalRemote (fully hosted on Modal)', value: 'modalRemote' },
    ],
    [],
  );

  const assistantTargetValidation =
    actionData &&
    'validation' in actionData &&
    actionData.validation &&
    typeof actionData.validation === 'object' &&
    actionData.validation !== null &&
    'localMachine' in actionData.validation &&
    'modalRemote' in actionData.validation
      ? (actionData.validation as { localMachine: ProbeResult; modalRemote: ProbeResult })
      : null;

  function submitAssistantTargetValidation() {
    const form = document.getElementById('internal-model-setup-main-form');
    if (!(form instanceof HTMLFormElement)) return;
    const fd = new FormData(form);
    fd.set('intent', 'validateAssistantTargets');
    submit(fd, { method: 'post' });
  }

  return (
    <Page title="Local AI Setting" subtitle="Control local vs modal router targets for first-layer prompt routing.">
      <BlockStack gap="500">
        {actionData && 'error' in actionData && actionData.error ? (
          <Banner tone="critical" title="Action failed">
            <Text as="p">{actionData.error}</Text>
          </Banner>
        ) : null}

        {assistantTargetValidation ? (
          <Banner
            tone={
              assistantTargetValidation.localMachine.ok && assistantTargetValidation.modalRemote.ok ? 'success' : 'warning'
            }
            title="Assistant chat target validation (not saved)"
          >
            <BlockStack gap="100">
              <Text as="p" variant="bodySm">
                localMachine: {assistantTargetValidation.localMachine.ok ? 'OK' : 'Failed'} —{' '}
                {assistantTargetValidation.localMachine.message}
              </Text>
              <Text as="p" variant="bodySm">
                modalRemote: {assistantTargetValidation.modalRemote.ok ? 'OK' : 'Failed'} —{' '}
                {assistantTargetValidation.modalRemote.message}
              </Text>
            </BlockStack>
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Premium design reference</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Storefront prompt quality uses this website as UI/UX reference for tone, fonts, spacing, and color direction.
              If empty, fallback reference <code>https://bummer.in</code> is used automatically.
            </Text>
            <Form method="post">
              <input type="hidden" name="intent" value="saveDesignReference" />
              <BlockStack gap="200">
                <TextField
                  label="Design reference URL (optional)"
                  name="designReferenceUrl"
                  value={designReferenceInput}
                  onChange={setDesignReferenceInput}
                  autoComplete="off"
                  placeholder="https://yourstore.com"
                  helpText="Used to steer premium UI/UX prompt generation for storefront modules."
                />
                <InlineStack align="start">
                  <Button submit loading={isSavingDesignRef}>Save design reference</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Active runtime and safety controls</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Guarded switch flow: run health + route probes, switch target with shadow mode, observe, then disable shadow mode.
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Resolved now: <code>{resolved.target}</code> ({resolved.url ?? 'no url'}) token {resolved.tokenMasked || 'not configured'}
            </Text>
            <Form method="post" id="internal-model-setup-main-form">
              <input type="hidden" name="intent" value="save" />
              <input type="hidden" name="dualTargetEnabled" value={dualTargetEnabled ? 'true' : 'false'} />
              <input type="hidden" name="shadowMode" value={shadowMode ? 'true' : 'false'} />
              <BlockStack gap="300">
                <Checkbox
                  label="Enable dual-target resolution (feature flag)"
                  checked={dualTargetEnabled}
                  onChange={setDualTargetEnabled}
                />
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
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <TextField
                    label="Release gate: max schema-fail rate (0..1)"
                    name="releaseGateSchemaFailRateMax"
                    value={releaseGateSchemaFailRateMax}
                    onChange={setReleaseGateSchemaFailRateMax}
                    autoComplete="off"
                  />
                  <TextField
                    label="Release gate: max fallback rate (0..1)"
                    name="releaseGateFallbackRateMax"
                    value={releaseGateFallbackRateMax}
                    onChange={setReleaseGateFallbackRateMax}
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
                    onChange={(v) => setLocalBackend(v as RouterBackend)}
                    options={[
                      { label: 'ollama', value: 'ollama' },
                      { label: 'openai', value: 'openai' },
                      { label: 'qwen3', value: 'qwen3' },
                      { label: 'custom', value: 'custom' },
                    ]}
                  />
                </InlineGrid>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <TextField label="Model" name="localModel" value={localModel} onChange={setLocalModel} autoComplete="off" placeholder="qwen3:4b-instruct" />
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
                    onChange={(v) => setModalBackend(v as RouterBackend)}
                    options={[
                      { label: 'openai', value: 'openai' },
                      { label: 'ollama', value: 'ollama' },
                      { label: 'qwen3', value: 'qwen3' },
                      { label: 'custom', value: 'custom' },
                    ]}
                  />
                </InlineGrid>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <TextField label="Model" name="modalModel" value={modalModel} onChange={setModalModel} autoComplete="off" placeholder="Qwen/Qwen3-4B-Instruct" />
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

                <InlineStack align="start" gap="200">
                  <Button submit variant="primary" loading={isSavingMain}>
                    Save local AI settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Form>
            <Text as="p" variant="bodySm" tone="subdued">
              Use “Validate assistant targets” to run the same strict chat-endpoint checks as save, without writing settings.
            </Text>
            <InlineStack align="start" gap="200">
              <Button loading={isValidatingAssistant} onClick={() => submitAssistantTargetValidation()}>
                Validate assistant targets
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Operator checks</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Run `/healthz` and `/route` schema validation probes before and after switching targets.
            </Text>
            <Select
              label="Target to probe"
              options={targetOptions}
              value={operatorTarget}
              onChange={(v) => setOperatorTarget(v as RouterRuntimeTarget)}
            />
            <InlineStack gap="200">
              <Form method="post">
                <input type="hidden" name="intent" value="probeHealth" />
                <input type="hidden" name="target" value={operatorTarget} />
                <Button submit loading={isProbingHealth}>Health check target</Button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="probeRoute" />
                <input type="hidden" name="target" value={operatorTarget} />
                <Button submit loading={isProbingRoute}>Route contract check</Button>
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
            <Select
              label="Target to switch to"
              options={targetOptions}
              value={switchTargetChoice}
              onChange={(v) => setSwitchTargetChoice(v as RouterRuntimeTarget)}
            />
            <InlineStack gap="200">
              <Form method="post">
                <input type="hidden" name="intent" value="switchTarget" />
                <input type="hidden" name="target" value={switchTargetChoice} />
                <Button submit variant="primary" loading={isSwitching}>Switch target (shadow)</Button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="rollback" />
                <Button submit tone="critical" loading={isRollingBack}>Rollback to previous target</Button>
              </Form>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Observability and promotion gates</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Active target `{resolved.target}` metrics: attempts {metrics.byTarget[resolved.target].attempts}, schema rejects {metrics.byTarget[resolved.target].schemaRejects}, fallbacks {metrics.byTarget[resolved.target].fallbacks}, timeouts {metrics.byTarget[resolved.target].timeoutsOrNetwork}, p95 {metrics.byTarget[resolved.target].p95LatencyMs}ms.
            </Text>
            <Text as="p" variant="bodySm" tone={gates.schemaPass ? 'success' : 'critical'}>
              Schema-fail rate gate: {(gates.schemaFailRate * 100).toFixed(2)}% / max {(resolved.releaseGateSchemaFailRateMax * 100).toFixed(2)}% ({gates.schemaPass ? 'PASS' : 'FAIL'})
            </Text>
            <Text as="p" variant="bodySm" tone={gates.fallbackPass ? 'success' : 'critical'}>
              Fallback rate gate: {(gates.fallbackRate * 100).toFixed(2)}% / max {(resolved.releaseGateFallbackRateMax * 100).toFixed(2)}% ({gates.fallbackPass ? 'PASS' : 'FAIL'})
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Deployment checklist</Text>
            <Text as="p" variant="bodySm" tone="subdued">1) Save target configs 2) Run health + route probes 3) Switch in shadow mode 4) Observe gates 5) Promote by disabling shadow mode 6) Rollback if gates fail.</Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
