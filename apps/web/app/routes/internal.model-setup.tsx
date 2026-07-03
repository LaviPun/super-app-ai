import { json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { z } from 'zod';
import {
  useAdminCtx,
  Btn,
  Badge,
  Card,
  Field,
  Input,
  Select,
  Checkbox,
  Banner,
  Tabs,
  StatusDot,
  PageHead,
  KV,
  fmtNum,
  fmtMs,
} from '~/components/admin/page-kit';
import type { RouterRuntimeConfig, RouterRuntimeTarget } from '~/schemas/router-runtime-config.server';
import type { AssistantChatProbeResult } from '~/services/ai/assistant-chat-target-probe.server';
import { isInternalAiLocalOnlyEnabledFromEnv } from '~/services/ai/internal-ai-local-only';

type ProbeResult = AssistantChatProbeResult;

type RouterBackend = 'ollama' | 'openai' | 'qwen3' | 'custom' | 'anthropic';
const RouterRuntimeTargetSchema = z.enum(['localMachine', 'modalRemote']);
const RouterBackendSchema = z.enum(['ollama', 'openai', 'qwen3', 'custom', 'anthropic']);
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

export function normalizeFallbackTarget(
  activeTarget: RouterRuntimeTarget,
  fallbackTarget: string | undefined | null,
): RouterRuntimeTarget | undefined {
  const parsed = RouterRuntimeTargetSchema.safeParse(fallbackTarget ?? '');
  if (!parsed.success) return undefined;
  if (parsed.data === activeTarget) return undefined;
  return parsed.data;
}

function isModalProxyUrl(url: string | undefined | null): boolean {
  const raw = url?.trim();
  if (!raw) return false;
  const upstream = process.env.INTERNAL_ROUTER_UPSTREAM_URL?.trim();
  if (upstream && raw === upstream) return true;
  try {
    const parsed = new URL(raw);
    return parsed.hostname.endsWith('.modal.run');
  } catch {
    return false;
  }
}

export async function loader({ request }: { request: Request }) {
  const { requireInternalAdmin } = await import('~/internal-admin/session.server');
  const {
    getRouterRuntimeConfig,
    maskToken,
    resolveRouterTargetConfig,
  } = await import('~/services/ai/router-runtime-config.server');
  const { getPromptRouterMetricsSnapshot, getReleaseGateState } = await import('~/services/ai/prompt-router.server');
  await requireInternalAdmin(request);
  const { config, parseError } = await getRouterRuntimeConfig();
  const { SettingsService } = await import('~/services/settings/settings.service');
  const settings = await new SettingsService().get();
  const resolved = await resolveRouterTargetConfig();
  const metrics = getPromptRouterMetricsSnapshot();
  const releaseGate = getReleaseGateState();
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
    parseError: parseError ?? null,
    releaseGate,
    assistantLocalOnly: isInternalAiLocalOnlyEnabledFromEnv(),
    modalProxyWarning: isModalProxyUrl(config.targets.modalRemote.url),
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

async function handleModelSetupAction(request: Request) {
  try {
    const { getRouterRuntimeConfig, saveRouterRuntimeConfig } = await import('~/services/ai/router-runtime-config.server');
    const { runHealthProbe, runRouteProbe } = await import('~/services/ai/internal-model-setup-probes.server');
    const { validateAssistantChatTarget } = await import('~/services/ai/assistant-chat-target-probe.server');
    const form = await request.formData();
    const intent = String(form.get('intent') ?? 'save');
    const { ActivityLogService } = await import('~/services/activity/activity.service');
    const { SettingsService } = await import('~/services/settings/settings.service');
    const activity = new ActivityLogService();
    const { config: current } = await getRouterRuntimeConfig();
    const assistantLocalOnly = isInternalAiLocalOnlyEnabledFromEnv();

    if (intent === 'save') {
      const parsed = SaveConfigFormSchema.safeParse(Object.fromEntries(form));
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? 'Invalid Local AI setting input' }, { status: 400 });
      }
      const values = parsed.data;
      if (assistantLocalOnly) {
        if (values.activeTarget === 'modalRemote') {
          return json(
            { error: 'INTERNAL_AI_LOCAL_ONLY is set: active target cannot be modalRemote (assistant sends are local-only).' },
            { status: 400 },
          );
        }
        if (values.dualTargetEnabled === 'true') {
          return json(
            { error: 'INTERNAL_AI_LOCAL_ONLY is set: disable dual-target resolution (no Modal failover for the assistant).' },
            { status: 400 },
          );
        }
        const fb = values.fallbackTarget?.trim();
        if (fb === 'modalRemote') {
          return json(
            { error: 'INTERNAL_AI_LOCAL_ONLY is set: fallback target cannot be modalRemote.' },
            { status: 400 },
          );
        }
      }
      const localModel = values.localModel?.trim() || 'qwen3:4b-instruct';
      const modalModel = values.modalModel?.trim() || 'Qwen/Qwen3-4B-Instruct';
      const next: RouterRuntimeConfig = {
        ...current,
        activeTarget: values.activeTarget,
        fallbackTarget: normalizeFallbackTarget(values.activeTarget, values.fallbackTarget),
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

      const localChatValidation = await validateAssistantChatTarget({
        target: 'localMachine',
        backend: next.targets.localMachine.backend,
        url: next.targets.localMachine.url,
        token: next.targets.localMachine.token,
        timeoutMs: next.targets.localMachine.timeoutMs,
      });
      const modalChatValidation = assistantLocalOnly
        ? ({ ok: true as const, message: 'skipped (INTERNAL_AI_LOCAL_ONLY)' } satisfies AssistantChatProbeResult)
        : await validateAssistantChatTarget({
            target: 'modalRemote',
            backend: next.targets.modalRemote.backend,
            url: next.targets.modalRemote.url,
            token: next.targets.modalRemote.token,
            timeoutMs: next.targets.modalRemote.timeoutMs,
          });

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

      const localChatValidation = await validateAssistantChatTarget({
        target: 'localMachine',
        backend: nextTargets.localMachine.backend,
        url: nextTargets.localMachine.url,
        token: nextTargets.localMachine.token,
        timeoutMs: nextTargets.localMachine.timeoutMs,
      });
      const modalChatValidation = assistantLocalOnly
        ? ({ ok: true as const, message: 'skipped (INTERNAL_AI_LOCAL_ONLY)' } satisfies AssistantChatProbeResult)
        : await validateAssistantChatTarget({
            target: 'modalRemote',
            backend: nextTargets.modalRemote.backend,
            url: nextTargets.modalRemote.url,
            token: nextTargets.modalRemote.token,
            timeoutMs: nextTargets.modalRemote.timeoutMs,
          });

      const allOk = localChatValidation.ok && modalChatValidation.ok;
      return json({
        validation: {
          localMachine: localChatValidation,
          modalRemote: modalChatValidation,
        },
        toast: {
          message: allOk
            ? assistantLocalOnly
              ? 'Assistant target validation passed for localMachine (cloud target skipped: INTERNAL_AI_LOCAL_ONLY).'
              : 'Assistant target validation passed for local and cloud.'
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
      if (assistantLocalOnly && target === 'modalRemote') {
        return json(
          { error: 'INTERNAL_AI_LOCAL_ONLY is set: cannot switch active router target to modalRemote.' },
          { status: 400 },
        );
      }
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
      if (assistantLocalOnly && rollbackTo === 'modalRemote') {
        return json(
          { error: 'INTERNAL_AI_LOCAL_ONLY is set: cannot roll back to modalRemote.' },
          { status: 400 },
        );
      }
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

export async function action({ request }: { request: Request }) {
  const { requireInternalAdmin } = await import('~/internal-admin/session.server');
  await requireInternalAdmin(request);
  return handleModelSetupAction(request);
}

type ActionData = {
  toast?: { message: string; error?: boolean };
  error?: string;
  validation?: { localMachine: ProbeResult; modalRemote: ProbeResult };
  probe?: ProbeResult;
};

export default function AdminModelSetup() {
  const ctx = useAdminCtx();
  const {
    config,
    parseError,
    releaseGate,
    assistantLocalOnly,
    modalProxyWarning,
    resolved,
    tokenMasked,
    metrics,
    gates,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const [tab, setTab] = useState('local');

  // Target fields, initialized from the saved runtime config (edits survive tab switches).
  const [localUrl, setLocalUrl] = useState(config.targets.localMachine.url ?? '');
  const [localBackend, setLocalBackend] = useState<RouterBackend>(config.targets.localMachine.backend);
  const [localModel, setLocalModel] = useState(config.targets.localMachine.model ?? '');
  const [modalUrl, setModalUrl] = useState(config.targets.modalRemote.url ?? '');
  const [modalBackend, setModalBackend] = useState<RouterBackend>(config.targets.modalRemote.backend);
  const [modalModel, setModalModel] = useState(config.targets.modalRemote.model ?? '');
  const [modalToken, setModalToken] = useState('');
  const [localOnly, setLocalOnly] = useState(assistantLocalOnly || !config.dualTargetEnabled);

  // Toast the server's response — success or error styling comes from the action, never the client.
  const toastedRef = useRef<ActionData | null>(null);
  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data || toastedRef.current === fetcher.data) return;
    toastedRef.current = fetcher.data;
    if (fetcher.data.toast?.message) ctx.toast(fetcher.data.toast.message, fetcher.data.toast.error === true);
    else if (fetcher.data.error) ctx.toast(fetcher.data.error, true);
  }, [fetcher.state, fetcher.data, ctx]);

  const busy = fetcher.state !== 'idle';
  const pendingIntent = busy ? String(fetcher.formData?.get('intent') ?? '') : '';
  const pendingTarget = busy ? String(fetcher.formData?.get('target') ?? '') : '';

  const isLocal = tab === 'local';
  const tabTarget: RouterRuntimeTarget = isLocal ? 'localMachine' : 'modalRemote';
  const isActive = config.activeTarget === tabTarget;

  // Real probe state for the selected target (probe actions persist lastHealthCheck* and revalidate).
  const lastHealthForTab = config.lastHealthCheckMessage?.startsWith(`${tabTarget}:`)
    ? (config.lastHealthCheckOk ?? null)
    : null;

  const validation = fetcher.data?.validation ?? null;
  const activeMetrics = metrics.byTarget[resolved.target];

  /** Post the full runtime config to the route's own action (`save` / `validateAssistantTargets`). */
  function submitConfig(intent: 'save' | 'validateAssistantTargets') {
    const fd = new FormData();
    fd.set('intent', intent);
    fd.set('activeTarget', assistantLocalOnly ? 'localMachine' : config.activeTarget);
    if (config.fallbackTarget && !(assistantLocalOnly && config.fallbackTarget === 'modalRemote')) {
      fd.set('fallbackTarget', config.fallbackTarget);
    }
    fd.set('dualTargetEnabled', localOnly ? 'false' : 'true');
    fd.set('shadowMode', config.shadowMode ? 'true' : 'false');
    fd.set('canaryShops', config.canaryShops.join(', '));
    fd.set('circuitFailureThreshold', String(config.circuitFailureThreshold));
    fd.set('circuitCooldownMs', String(config.circuitCooldownMs));
    fd.set('releaseGateSchemaFailRateMax', String(config.releaseGateSchemaFailRateMax));
    fd.set('releaseGateFallbackRateMax', String(config.releaseGateFallbackRateMax));
    fd.set('localUrl', localUrl);
    fd.set('localBackend', localBackend);
    fd.set('localModel', localModel);
    fd.set('localTimeoutMs', String(config.targets.localMachine.timeoutMs));
    fd.set('modalUrl', modalUrl);
    fd.set('modalBackend', modalBackend);
    fd.set('modalModel', modalModel);
    fd.set('modalTimeoutMs', String(config.targets.modalRemote.timeoutMs));
    if (modalToken.trim()) fd.set('modalToken', modalToken.trim());
    fetcher.submit(fd, { method: 'post' });
  }

  function submitOp(intent: 'probeHealth' | 'probeRoute' | 'switchTarget' | 'rollback', target?: RouterRuntimeTarget) {
    const fd = new FormData();
    fd.set('intent', intent);
    if (target) fd.set('target', target);
    fetcher.submit(fd, { method: 'post' });
  }

  return (
    <div className="page page-narrow">
      <PageHead
        title="Local AI Setting"
        sub="Configure the self-hosted Qwen3 targets used by the internal prompt router and AI Assistant."
        actions={
          <>
            <Btn
              icon="check"
              loading={pendingIntent === 'validateAssistantTargets'}
              disabled={busy}
              onClick={() => submitConfig('validateAssistantTargets')}
            >
              Validate targets
            </Btn>
            <Btn
              variant="primary"
              loading={pendingIntent === 'save'}
              disabled={busy}
              onClick={() => submitConfig('save')}
            >
              Save config
            </Btn>
          </>
        }
      />
      {(parseError || releaseGate.tripped || assistantLocalOnly || validation) && (
        <div className="stack" style={{ gap: 12, marginBottom: 16 }}>
          {parseError && (
            <Banner tone="critical" title="Saved router config could not be loaded">
              Decryption/parse error — the defaults below are in effect. Re-save the config to restore.
              <div className="t-xs t-muted" style={{ marginTop: 4 }}>{parseError}</div>
            </Banner>
          )}
          {releaseGate.tripped && (
            <Banner tone="critical" title="Release gate tripped — shadow mode forced">
              {releaseGate.reason ??
                'A rolling release-gate metric exceeded its threshold; router calls run in shadow mode until rates recover.'}
              {releaseGate.metric != null && releaseGate.value != null && releaseGate.threshold != null && (
                <div className="t-xs" style={{ marginTop: 4 }}>
                  {releaseGate.metric}: {(releaseGate.value * 100).toFixed(2)}% (max {(releaseGate.threshold * 100).toFixed(2)}%)
                  {releaseGate.target ? ` on ${releaseGate.target}` : ''}
                </div>
              )}
            </Banner>
          )}
          {assistantLocalOnly && (
            <Banner tone="info" title="INTERNAL_AI_LOCAL_ONLY — assistant is local-only">
              Dual-target / Modal failover and switching the active target to modalRemote are disabled. Cloud target
              validation is skipped on save.
            </Banner>
          )}
          {validation && (
            <Banner
              tone={validation.localMachine.ok && validation.modalRemote.ok ? 'success' : 'warning'}
              title="Assistant chat target validation (not saved)"
            >
              <div>
                localMachine: {validation.localMachine.ok ? 'OK' : 'Failed'} — {validation.localMachine.message}
              </div>
              <div>
                modalRemote: {validation.modalRemote.ok ? 'OK' : 'Failed'} — {validation.modalRemote.message}
              </div>
            </Banner>
          )}
        </div>
      )}
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'local', label: 'Local (localMachine)' },
            { id: 'cloud', label: 'Cloud (modalRemote)' },
          ]}
        />
      </Card>
      <Card pad>
        <div className="stack-5">
          <div className="row spread">
            <span className="row" style={{ gap: 8 }}>
              <span className="t-h3">{isLocal ? 'Local machine target' : 'Cloud remote target'}</span>
              <Badge tone={isActive ? 'success' : undefined} dot>
                {isActive ? 'Active' : 'Standby'}
              </Badge>
            </span>
            <span className="asst-health">
              {lastHealthForTab != null && <StatusDot ok={lastHealthForTab} />}
              {lastHealthForTab == null ? 'Not probed' : lastHealthForTab ? 'Healthy' : 'Unhealthy'}
            </span>
          </div>
          <Field
            label="Base URL"
            help={isLocal ? 'Ollama base, or reference router base for passthrough' : 'Must be a chat-inference host, not the /route proxy'}
          >
            <Input
              mono
              value={isLocal ? localUrl : modalUrl}
              placeholder={isLocal ? 'http://127.0.0.1:11434' : 'https://your-chat-host.example.com'}
              onChange={(e: ChangeEvent<HTMLInputElement>) => (isLocal ? setLocalUrl : setModalUrl)(e.target.value)}
            />
          </Field>
          <div className="grid grid-2">
            <Field label="Backend">
              <Select
                options={['ollama', 'qwen3', 'openai', 'custom', 'anthropic']}
                value={isLocal ? localBackend : modalBackend}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  (isLocal ? setLocalBackend : setModalBackend)(e.target.value as RouterBackend)
                }
              />
            </Field>
            <Field label="Model">
              <Input
                mono
                value={isLocal ? localModel : modalModel}
                placeholder={isLocal ? 'qwen3:4b-instruct' : 'Qwen/Qwen3-4B-Instruct'}
                onChange={(e: ChangeEvent<HTMLInputElement>) => (isLocal ? setLocalModel : setModalModel)(e.target.value)}
              />
            </Field>
          </div>
          {tab === 'cloud' && (
            <Field
              label="Auth token"
              optional
              help={tokenMasked.modalRemote ? `Current: ${tokenMasked.modalRemote} — leave blank to keep` : 'No token saved yet'}
            >
              <Input
                type="password"
                placeholder="••••••••"
                value={modalToken}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setModalToken(e.target.value)}
              />
            </Field>
          )}
          <div className="divider" />
          <Checkbox
            checked={localOnly}
            disabled={assistantLocalOnly}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setLocalOnly(e.target.checked)}
            label="Local-only guardrails"
            sub="New sessions default to local; never auto-route to cloud (disables dual-target failover)"
          />
          {tab === 'cloud' && modalProxyWarning && (
            <Banner tone="warning" title="Check the URL">
              The saved URL points at the Modal /route proxy, so chat will 404. Point it at a real chat host (vLLM/Ollama).
            </Banner>
          )}
          <div className="divider" />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Btn
              size="sm"
              icon="live"
              loading={pendingIntent === 'probeHealth' && pendingTarget === tabTarget}
              disabled={busy}
              onClick={() => submitOp('probeHealth', tabTarget)}
            >
              Health check
            </Btn>
            <Btn
              size="sm"
              icon="flow"
              loading={pendingIntent === 'probeRoute' && pendingTarget === tabTarget}
              disabled={busy}
              onClick={() => submitOp('probeRoute', tabTarget)}
            >
              Route contract check
            </Btn>
            <Btn
              size="sm"
              icon="transfer"
              loading={pendingIntent === 'switchTarget'}
              disabled={busy || isActive || (assistantLocalOnly && tabTarget === 'modalRemote')}
              onClick={() => submitOp('switchTarget', tabTarget)}
            >
              Switch active here (shadow)
            </Btn>
            <Btn
              size="sm"
              icon="replay"
              loading={pendingIntent === 'rollback'}
              disabled={busy || !config.previousTarget || (assistantLocalOnly && config.previousTarget === 'modalRemote')}
              onClick={() => submitOp('rollback')}
            >
              {config.previousTarget ? `Rollback to ${config.previousTarget}` : 'Rollback'}
            </Btn>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <div className="t-xs t-muted">
              Last health: {config.lastHealthCheckAt ?? 'never'}
              {config.lastHealthCheckMessage ? ` — ${config.lastHealthCheckMessage}` : ''}
            </div>
            <div className="t-xs t-muted">
              Last route check: {config.lastRouteCheckAt ?? 'never'}
              {config.lastRouteCheckMessage ? ` — ${config.lastRouteCheckMessage}` : ''}
            </div>
          </div>
        </div>
      </Card>
      <Card pad style={{ marginTop: 16 }}>
        <div className="stack-5">
          <div className="row spread">
            <span className="t-h3">Observability &amp; promotion gates</span>
            <span className="t-xs t-muted">
              Resolved now: {resolved.target} · {resolved.url ?? 'no url'} · token {resolved.tokenMasked || 'not configured'}
            </span>
          </div>
          <KV
            rows={[
              ['Attempts', fmtNum(activeMetrics.attempts)],
              ['Schema rejects', fmtNum(activeMetrics.schemaRejects)],
              ['Fallbacks', fmtNum(activeMetrics.fallbacks)],
              ['Timeouts / network', fmtNum(activeMetrics.timeoutsOrNetwork)],
              ['p95 latency', fmtMs(activeMetrics.p95LatencyMs)],
            ]}
          />
          <div className="stack" style={{ gap: 6 }}>
            <span className="asst-health">
              <StatusDot ok={gates.schemaPass} />
              Schema-fail rate gate: {(gates.schemaFailRate * 100).toFixed(2)}% / max{' '}
              {(resolved.releaseGateSchemaFailRateMax * 100).toFixed(2)}% ({gates.schemaPass ? 'PASS' : 'FAIL'})
            </span>
            <span className="asst-health">
              <StatusDot ok={gates.fallbackPass} />
              Fallback rate gate: {(gates.fallbackRate * 100).toFixed(2)}% / max{' '}
              {(resolved.releaseGateFallbackRateMax * 100).toFixed(2)}% ({gates.fallbackPass ? 'PASS' : 'FAIL'})
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
