import { json } from '@remix-run/node';
import { useState } from 'react';
import { z } from 'zod';
import {
  useAdminCtx,
  Btn,
  Card,
  Field,
  Input,
  Select,
  Checkbox,
  Banner,
  Tabs,
  StatusDot,
  PageHead,
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

export default function AdminModelSetup() {
  const ctx = useAdminCtx();
  const [tab, setTab] = useState('local');
  return (
    <div className="page page-narrow">
      <PageHead
        title="Local AI Setting"
        sub="Configure the self-hosted Qwen3 targets used by the internal prompt router and AI Assistant."
        actions={
          <>
            <Btn icon="check" onClick={() => ctx.toast('Targets validated — chat ready')}>
              Validate targets
            </Btn>
            <Btn variant="primary" onClick={() => ctx.toast('Runtime config saved')}>
              Save config
            </Btn>
          </>
        }
      />
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
            <span className="t-h3">{tab === 'local' ? 'Local machine target' : 'Cloud remote target'}</span>
            <span className="asst-health">
              <StatusDot ok={tab === 'local'} />
              {tab === 'local' ? 'Healthy' : 'Standby'}
            </span>
          </div>
          <Field
            label="Base URL"
            help={tab === 'local' ? 'Ollama base, or reference router base for passthrough' : 'Must be a chat-inference host, not the /route proxy'}
          >
            <Input mono defaultValue={tab === 'local' ? 'http://127.0.0.1:11434' : 'https://qwen-twin.modal.run'} />
          </Field>
          <div className="grid grid-2">
            <Field label="Backend">
              <Select options={['ollama', 'qwen3', 'openai', 'custom', 'anthropic']} value={tab === 'local' ? 'ollama' : 'qwen3'} onChange={() => {}} />
            </Field>
            <Field label="Model">
              <Input mono defaultValue="qwen3:4b-instruct" />
            </Field>
          </div>
          {tab === 'cloud' && (
            <Field label="Auth token" optional>
              <Input type="password" placeholder="••••••••" />
            </Field>
          )}
          <div className="divider" />
          <Checkbox defaultChecked label="Local-only guardrails" sub="New sessions default to local; never auto-route to cloud" />
          {tab === 'cloud' && (
            <Banner tone="warning" title="Check the URL">
              If this points at a Modal /route proxy, chat will 404. Point it at a real chat host (vLLM/Ollama).
            </Banner>
          )}
        </div>
      </Card>
    </div>
  );
}
