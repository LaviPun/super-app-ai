import { MODULE_TYPE_TO_TEMPLATE_KIND, type ModuleType } from '@superapp/core';
import type { ClassifyResult } from '~/services/ai/classify.server';
import type { IntentPacket } from '@superapp/core';
import {
  PromptRouterDecisionSchema,
  type PromptRouterDecision,
} from '~/schemas/prompt-router.server';
import type { PromptRouterReasonCode } from '~/schemas/prompt-router-reasons.server';
import {
  resolveRouterTargetConfig,
  type ResolvedRouterTarget,
} from '~/services/ai/router-runtime-config.server';
import { ActivityLogService } from '~/services/activity/activity.service';

/** Observability label for upstream budgeting (optional). */
export type PromptRouterOperationClass = 'P0_CREATE' | 'P1_MODIFY' | 'P2_HYDRATE';

export interface BuildPromptRouterDecisionParams {
  prompt: string;
  classification: ClassifyResult;
  intentPacket: IntentPacket;
  /** When `INTERNAL_AI_ROUTER_CANARY_SHOPS` is set, only listed shops call the router; omitted shop skips the router for safety. */
  shopDomain?: string;
  operationClass?: PromptRouterOperationClass;
}

const ROUTER_CONFIDENCE = {
  HIGH: 0.8,
  MEDIUM: 0.55,
} as const;

const MODULE_SETTINGS_FIELDS: Partial<Record<ModuleType, string[]>> = {
  'theme.popup': ['title', 'trigger', 'frequency', 'showOnPages', 'ctaText'],
  'theme.banner': ['heading', 'subheading', 'ctaText', 'ctaUrl'],
  'theme.notificationBar': ['message', 'dismissible'],
  'theme.contactForm': ['title', 'submitLabel', 'submissionMode', 'spamProtection'],
  'theme.effect': ['effectKind', 'intensity', 'speed', 'startTrigger'],
  'theme.floatingWidget': ['variant', 'anchor', 'onClick', 'url'],
  'proxy.widget': ['widgetId', 'mode', 'title'],
};

export interface PromptRouterMetricsSnapshot {
  attempts: number;
  successes: number;
  failures: number;
  shadowsRecorded: number;
  canarySkips: number;
  circuitSkips: number;
  harnessModuleTypeCorrections: number;
  harnessConfidenceClamps: number;
  byTarget: Record<'localMachine' | 'modalRemote', {
    attempts: number;
    successes: number;
    failures: number;
    fallbacks: number;
    schemaRejects: number;
    timeoutsOrNetwork: number;
    p95LatencyMs: number;
  }>;
}

const metrics: PromptRouterMetricsSnapshot = {
  attempts: 0,
  successes: 0,
  failures: 0,
  shadowsRecorded: 0,
  canarySkips: 0,
  circuitSkips: 0,
  harnessModuleTypeCorrections: 0,
  harnessConfidenceClamps: 0,
  byTarget: {
    localMachine: { attempts: 0, successes: 0, failures: 0, fallbacks: 0, schemaRejects: 0, timeoutsOrNetwork: 0, p95LatencyMs: 0 },
    modalRemote: { attempts: 0, successes: 0, failures: 0, fallbacks: 0, schemaRejects: 0, timeoutsOrNetwork: 0, p95LatencyMs: 0 },
  },
};
const latencyByTarget: Record<'localMachine' | 'modalRemote', number[]> = {
  localMachine: [],
  modalRemote: [],
};

const RELEASE_GATE_BUFFER_SIZE = 200;
type ReleaseGateSample = { schemaReject: boolean; fallback: boolean; at: number };
const releaseGateBuffer: Record<'localMachine' | 'modalRemote', ReleaseGateSample[]> = {
  localMachine: [],
  modalRemote: [],
};

export type ReleaseGateState = {
  tripped: boolean;
  reason?: string;
  metric?: 'schemaFailRate' | 'fallbackRate';
  value?: number;
  threshold?: number;
  target?: 'localMachine' | 'modalRemote';
};

let releaseGateState: ReleaseGateState = { tripped: false };

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function circuitFailureThreshold(defaultValue?: number): number {
  return defaultValue ?? Number(process.env.INTERNAL_AI_ROUTER_CIRCUIT_FAILURE_THRESHOLD?.trim() || '5');
}

function circuitCooldownMs(defaultValue?: number): number {
  return defaultValue ?? Number(process.env.INTERNAL_AI_ROUTER_CIRCUIT_COOLDOWN_MS?.trim() || '30000');
}

function confidenceMaxDelta(): number {
  const raw = Number(process.env.ROUTER_CONFIDENCE_MAX_DELTA?.trim() ?? '0.15');
  return Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 1) : 0.15;
}

function envTruthy(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function shouldSkipRouterForCanary(canaryShops: string[], shopDomain?: string): boolean {
  const allow = new Set(canaryShops.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (allow.size === 0) return false;
  if (!shopDomain) return true;
  return !allow.has(shopDomain.trim().toLowerCase());
}

function isCircuitOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

function recordRouterFailure(threshold?: number, cooldownMs?: number): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= circuitFailureThreshold(threshold)) {
    circuitOpenUntil = Date.now() + circuitCooldownMs(cooldownMs);
    consecutiveFailures = 0;
  }
}

function recordRouterSuccess(): void {
  consecutiveFailures = 0;
}

/** For Vitest only — resets circuit breaker and counters. */
export function resetPromptRouterInternalsForTests(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
  metrics.attempts = 0;
  metrics.successes = 0;
  metrics.failures = 0;
  metrics.shadowsRecorded = 0;
  metrics.canarySkips = 0;
  metrics.circuitSkips = 0;
  metrics.harnessModuleTypeCorrections = 0;
  metrics.harnessConfidenceClamps = 0;
  metrics.byTarget.localMachine = { attempts: 0, successes: 0, failures: 0, fallbacks: 0, schemaRejects: 0, timeoutsOrNetwork: 0, p95LatencyMs: 0 };
  metrics.byTarget.modalRemote = { attempts: 0, successes: 0, failures: 0, fallbacks: 0, schemaRejects: 0, timeoutsOrNetwork: 0, p95LatencyMs: 0 };
  latencyByTarget.localMachine = [];
  latencyByTarget.modalRemote = [];
  releaseGateBuffer.localMachine = [];
  releaseGateBuffer.modalRemote = [];
  releaseGateState = { tripped: false };
}

export function getPromptRouterMetricsSnapshot(): PromptRouterMetricsSnapshot {
  (['localMachine', 'modalRemote'] as const).forEach((target) => {
    const arr = latencyByTarget[target];
    if (!arr.length) {
      metrics.byTarget[target].p95LatencyMs = 0;
      return;
    }
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
    metrics.byTarget[target].p95LatencyMs = sorted[idx] ?? 0;
  });
  return { ...metrics };
}

/**
 * Returns the current in-memory release gate state. When `tripped` is true,
 * the prompt router forces shadow mode on every call until the rolling rate
 * drops back under the configured threshold.
 */
export function getReleaseGateState(): ReleaseGateState {
  return { ...releaseGateState };
}

function logRouterEvent(
  payload: Record<string, string | number | boolean | undefined>,
): void {
  if (!envTruthy('INTERNAL_AI_ROUTER_DEBUG_LOG')) return;
  // eslint-disable-next-line no-console
  console.log('[prompt-router]', JSON.stringify(payload));
}

type FetchOutcome =
  | { decision: PromptRouterDecision; schemaReject: false; failed: false }
  | { decision: null; schemaReject: boolean; failed: true };

function pushReleaseGateSample(
  target: 'localMachine' | 'modalRemote',
  sample: ReleaseGateSample,
): void {
  const buf = releaseGateBuffer[target];
  buf.push(sample);
  if (buf.length > RELEASE_GATE_BUFFER_SIZE) buf.shift();
}

function evaluateReleaseGate(
  target: 'localMachine' | 'modalRemote',
  runtime: ResolvedRouterTarget,
): void {
  const buf = releaseGateBuffer[target];
  if (buf.length === 0) return;
  const schemaCount = buf.reduce((acc, s) => (s.schemaReject ? acc + 1 : acc), 0);
  const fallbackCount = buf.reduce((acc, s) => (s.fallback ? acc + 1 : acc), 0);
  const schemaRate = schemaCount / buf.length;
  const fallbackRate = fallbackCount / buf.length;

  const schemaTripped = schemaRate > runtime.releaseGateSchemaFailRateMax;
  const fallbackTripped = fallbackRate > runtime.releaseGateFallbackRateMax;

  if (schemaTripped || fallbackTripped) {
    const metric: 'schemaFailRate' | 'fallbackRate' = schemaTripped
      ? 'schemaFailRate'
      : 'fallbackRate';
    const value = schemaTripped ? schemaRate : fallbackRate;
    const threshold = schemaTripped
      ? runtime.releaseGateSchemaFailRateMax
      : runtime.releaseGateFallbackRateMax;
    const alreadyTripped =
      releaseGateState.tripped &&
      releaseGateState.metric === metric &&
      releaseGateState.target === target;
    releaseGateState = {
      tripped: true,
      metric,
      value,
      threshold,
      target,
      reason: `${metric} ${(value * 100).toFixed(2)}% exceeded ${(threshold * 100).toFixed(2)}% on ${target}`,
    };
    if (!alreadyTripped) {
      void new ActivityLogService()
        .log({
          actor: 'SYSTEM',
          action: 'ROUTER_RELEASE_GATE_TRIPPED',
          details: { metric, value, threshold, target },
        })
        .catch(() => {});
      logRouterEvent({ event: 'release_gate_tripped', metric, value, threshold, target });
    }
    return;
  }

  if (releaseGateState.tripped && releaseGateState.target === target) {
    releaseGateState = { tripped: false };
    logRouterEvent({ event: 'release_gate_reset', target });
  }
}

/**
 * Prompt router service: decides how much context the main compiler model should receive.
 * Prefers an internal lightweight router endpoint when configured; falls back to deterministic
 * confidence-gated logic to keep token usage predictable.
 */
export async function buildPromptRouterDecision(
  params: BuildPromptRouterDecisionParams,
): Promise<PromptRouterDecision> {
  const deterministic = buildDeterministicDecision(params);
  const runtime = await resolveRouterTargetConfig();

  if (shouldSkipRouterForCanary(runtime.canaryShops, params.shopDomain)) {
    metrics.canarySkips += 1;
    logRouterEvent({
      event: 'canary_skip',
      shopDomain: params.shopDomain ?? '',
      target: runtime.target,
    });
    return deterministic;
  }

  const baseUrl = runtime.url?.trim();
  if (!baseUrl) return deterministic;

  if (isCircuitOpen()) {
    metrics.circuitSkips += 1;
    logRouterEvent({ event: 'circuit_open', target: runtime.target });
    return deterministic;
  }

  const primary = await fetchAndMergeRouterDecision(
    params,
    deterministic,
    runtime,
    runtime.target,
    baseUrl,
    runtime.token,
    runtime.timeoutMs,
  );

  let outcome: FetchOutcome = primary;
  let attemptTarget: 'localMachine' | 'modalRemote' = runtime.target;
  pushReleaseGateSample(runtime.target, {
    schemaReject: primary.schemaReject,
    fallback: primary.failed,
    at: Date.now(),
  });

  if (primary.failed && runtime.dualTargetEnabled && runtime.fallback) {
    metrics.byTarget[runtime.target].fallbacks += 1;
    const secondary = await fetchAndMergeRouterDecision(
      params,
      deterministic,
      runtime,
      runtime.fallback.target,
      runtime.fallback.url,
      runtime.fallback.token,
      runtime.fallback.timeoutMs,
    );
    pushReleaseGateSample(runtime.fallback.target, {
      schemaReject: secondary.schemaReject,
      fallback: secondary.failed,
      at: Date.now(),
    });
    outcome = secondary;
    attemptTarget = runtime.fallback.target;
  }

  if (outcome.failed) {
    recordRouterFailure(runtime.circuitFailureThreshold, runtime.circuitCooldownMs);
    metrics.failures += 1;
    metrics.byTarget[attemptTarget].failures += 1;
    if (attemptTarget === runtime.target) {
      metrics.byTarget[runtime.target].fallbacks += 1;
    }
    evaluateReleaseGate(runtime.target, runtime);
    if (runtime.fallback) evaluateReleaseGate(runtime.fallback.target, runtime);
    return deterministic;
  }

  recordRouterSuccess();
  metrics.successes += 1;
  metrics.byTarget[attemptTarget].successes += 1;

  evaluateReleaseGate(runtime.target, runtime);
  if (runtime.fallback) evaluateReleaseGate(runtime.fallback.target, runtime);

  if (runtime.shadowMode || releaseGateState.tripped) {
    metrics.shadowsRecorded += 1;
    logRouterEvent({
      event: 'shadow',
      reasonCode: outcome.decision.reasonCode,
      op: params.operationClass ?? 'P0_CREATE',
      target: attemptTarget,
      forcedByReleaseGate: releaseGateState.tripped && !runtime.shadowMode,
    });
    return deterministic;
  }

  return outcome.decision;
}

function buildDeterministicDecision(
  params: BuildPromptRouterDecisionParams,
): PromptRouterDecision {
  const confidence =
    params.intentPacket.classification.confidence ?? params.classification.confidenceScore ?? 0;
  const isStorefront =
    params.classification.moduleType.startsWith('theme.') ||
    params.classification.moduleType === 'proxy.widget';
  const templateKind = MODULE_TYPE_TO_TEMPLATE_KIND[params.classification.moduleType];
  const base = {
    version: '1.0' as const,
    moduleType: params.classification.moduleType,
    confidence,
    intent: params.intentPacket.classification.intent,
    surface: params.classification.surface,
    settingsRequired: MODULE_SETTINGS_FIELDS[params.classification.moduleType] ?? [],
    catalogFilters: {
      templateKind,
      intent: params.classification.intent,
      surface: params.classification.surface,
      limit: 8,
    },
    needsClarification: false,
    reasonCode: 'deterministic_confidence_gating' as PromptRouterReasonCode,
    reasoning: 'deterministic_confidence_gating',
  };

  if (confidence >= ROUTER_CONFIDENCE.HIGH) {
    return PromptRouterDecisionSchema.parse({
      ...base,
      reasonCode: 'deterministic_high_confidence',
      reasoning: 'high_confidence_compact_context',
      includeFlags: {
        includeSettingsPack: true,
        includeIntentPacket: false,
        includeCatalog: false,
        includeFullSchema: false,
        includeStyleSchema: false,
      },
    });
  }

  if (confidence >= ROUTER_CONFIDENCE.MEDIUM) {
    return PromptRouterDecisionSchema.parse({
      ...base,
      reasonCode: 'deterministic_medium_confidence',
      reasoning: 'medium_confidence_catalog_context',
      includeFlags: {
        includeSettingsPack: true,
        includeIntentPacket: true,
        includeCatalog: true,
        includeFullSchema: false,
        includeStyleSchema: false,
      },
    });
  }

  return PromptRouterDecisionSchema.parse({
    ...base,
    reasonCode: 'deterministic_low_confidence',
    reasoning: 'deterministic_low_confidence_gating',
    includeFlags: {
      includeSettingsPack: true,
      includeIntentPacket: true,
      includeCatalog: true,
      includeFullSchema: true,
      includeStyleSchema: isStorefront,
    },
    needsClarification: confidence < 0.45,
  });
}

function applyHarness(
  parsed: PromptRouterDecision,
  deterministic: PromptRouterDecision,
  classification: ClassifyResult,
): PromptRouterDecision {
  const maxDelta = confidenceMaxDelta();
  const baseline = deterministic.confidence;
  const conf = Math.min(1, Math.max(0, parsed.confidence));
  const low = Math.max(0, baseline - maxDelta);
  const high = Math.min(1, baseline + maxDelta);
  const clamped = Math.min(high, Math.max(low, conf));

  const expectedType = classification.moduleType;
  const moduleOk = parsed.moduleType === expectedType;
  const moduleType = moduleOk ? parsed.moduleType : expectedType;

  let reasonCode: PromptRouterReasonCode = 'internal_router_ok';
  if (!moduleOk) {
    reasonCode = 'internal_router_module_type_corrected';
    metrics.harnessModuleTypeCorrections += 1;
  }
  if (clamped !== parsed.confidence) {
    if (reasonCode === 'internal_router_ok') reasonCode = 'internal_router_clamped';
    metrics.harnessConfidenceClamps += 1;
  }

  const merged: PromptRouterDecision = PromptRouterDecisionSchema.parse({
    ...parsed,
    moduleType,
    confidence: clamped,
    catalogFilters: parsed.catalogFilters ?? deterministic.catalogFilters,
    settingsRequired:
      parsed.settingsRequired?.length ? parsed.settingsRequired : deterministic.settingsRequired,
    reasonCode,
    reasoning: parsed.reasoning.slice(0, 200),
  });

  return merged;
}

async function fetchAndMergeRouterDecision(
  params: BuildPromptRouterDecisionParams,
  deterministic: PromptRouterDecision,
  _runtime: ResolvedRouterTarget,
  target: 'localMachine' | 'modalRemote',
  baseUrl: string,
  token: string | null | undefined,
  timeoutMs: number,
): Promise<FetchOutcome> {
  metrics.attempts += 1;
  metrics.byTarget[target].attempts += 1;

  const endpoint = `${baseUrl.replace(/\/+$/, '')}/route`;
  const authToken = token?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        prompt: params.prompt,
        shopDomain: params.shopDomain,
        operationClass: params.operationClass ?? 'P0_CREATE',
        classification: {
          moduleType: params.classification.moduleType,
          intent: params.classification.intent,
          surface: params.classification.surface,
          confidence: params.classification.confidenceScore,
          alternatives: params.classification.alternatives,
        },
        intentPacket: {
          classification: params.intentPacket.classification,
          routing: params.intentPacket.routing,
        },
        fallback: deterministic,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logRouterEvent({ event: 'http_error', status: response.status, target });
      return { decision: null, schemaReject: false, failed: true };
    }

    const json: unknown = await response.json();
    const parsed = PromptRouterDecisionSchema.safeParse(json);
    if (!parsed.success) {
      metrics.byTarget[target].schemaRejects += 1;
      logRouterEvent({ event: 'schema_reject', target });
      return { decision: null, schemaReject: true, failed: true };
    }
    latencyByTarget[target].push(Date.now() - started);
    return {
      decision: applyHarness(parsed.data, deterministic, params.classification),
      schemaReject: false,
      failed: false,
    };
  } catch {
    metrics.byTarget[target].timeoutsOrNetwork += 1;
    logRouterEvent({ event: 'timeout_or_network', target });
    return { decision: null, schemaReject: false, failed: true };
  } finally {
    clearTimeout(timeout);
  }
}
