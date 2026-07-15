import { z } from 'zod';
import { getLlmClient, attributeServedCost, recordAiUsage, ConfiguredLlmClient, type LlmClient } from '~/services/ai/llm.server';
import { AiUsageService } from '~/services/observability/ai-usage.service';
import { getPrisma } from '~/db.server';

/**
 * Support ticket triage.
 *
 * Local-first: defaults to the machine-local Ollama model (qwen3.5:9b) and can
 * be toggled to the cloud provider chain via the AppSettings.supportTriageMode
 * toggle (internal admin, Phase E) or SUPPORT_TRIAGE_PROVIDER=cloud — same
 * self-hosted-by-default posture as the internal copilot
 * (see services/ai/internal-assistant.server.ts / router-runtime-config).
 *
 * Config precedence (env overrides DB so a dev can toggle without touching the
 * admin UI): a set SUPPORT_TRIAGE_* env var always wins over the AppSettings
 * value; when the env var is unset the persisted AppSettings value is used.
 *
 * DB (AppSettings singleton, written by internal.ai-providers "Support triage"):
 *   supportTriageMode        local | cloud   (default local)
 *   supportTriageProviderId  AiProvider.id to pin the cloud triage call to (optional)
 *
 * Env overrides:
 *   SUPPORT_TRIAGE_PROVIDER   local | cloud   (overrides supportTriageMode)
 *   SUPPORT_TRIAGE_URL        Ollama base URL (default http://127.0.0.1:11434, localhost-only)
 *   SUPPORT_TRIAGE_MODEL      Ollama model tag (default qwen3.5:9b)
 *   SUPPORT_TRIAGE_TIMEOUT_MS request budget (default 25000, clamped 5000–55000
 *                             to stay under the Cloudflare tunnel ceiling)
 */

export const TRIAGE_CATEGORIES = [
  'bug',
  'module_generation',
  'billing',
  'how_to',
  'performance',
  'data',
  'other',
] as const;

export const TriageResultSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.enum(TRIAGE_CATEGORIES).catch('other'),
  summary: z.string().min(1).max(600),
  suggestedReply: z.string().min(1).max(2000),
  escalate: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

// JSON Schema handed to the model (Ollama structured output / cloud responseSchema).
const TRIAGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    category: { type: 'string', enum: [...TRIAGE_CATEGORIES] },
    summary: { type: 'string' },
    suggestedReply: { type: 'string' },
    escalate: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['severity', 'category', 'summary', 'suggestedReply', 'escalate', 'confidence'],
} as const;

export interface TriageInput {
  subject: string;
  description: string;
  shopDomain: string;
  moduleContext?: string;
}

export type TriageOutcome =
  | { ok: true; result: TriageResult; provider: 'local' | 'cloud'; model: string }
  | { ok: false; error: string; provider: 'local' | 'cloud' };

interface TriageConfig {
  provider: 'local' | 'cloud';
  url: string;
  model: string;
  timeoutMs: number;
  /** AiProvider.id to pin the cloud triage call to; null = default provider chain. */
  providerId: string | null;
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Resolves the effective triage config from AppSettings (persisted admin toggle)
 * with SUPPORT_TRIAGE_* env vars layered on top as overrides — env always beats
 * the DB value so a developer can flip provider/URL/model without editing admin
 * settings. Reads AppSettings once per call (no module-level cache) and is
 * resilient: a DB read failure falls back to env/defaults so the never-throw
 * contract of runSupportTriage holds even if resolveTriageConfig runs first.
 */
export async function resolveTriageConfig(): Promise<TriageConfig> {
  let dbMode: string | null = null;
  let dbProviderId: string | null = null;
  try {
    const settings = await getPrisma().appSettings.findUnique({
      where: { id: 'singleton' },
      select: { supportTriageMode: true, supportTriageProviderId: true },
    });
    dbMode = settings?.supportTriageMode ?? null;
    dbProviderId = (settings?.supportTriageProviderId ?? '').trim() || null;
  } catch (error) {
    console.warn(
      '[support-triage] failed to read AppSettings; falling back to env/defaults',
      error instanceof Error ? error.message : error,
    );
  }

  // Env override wins when set to a recognized value; otherwise use the DB mode.
  const envProviderRaw = process.env.SUPPORT_TRIAGE_PROVIDER?.trim().toLowerCase();
  const envProvider = envProviderRaw === 'cloud' || envProviderRaw === 'local' ? envProviderRaw : undefined;
  const provider: 'local' | 'cloud' = (envProvider ?? (dbMode === 'cloud' ? 'cloud' : 'local'));

  return {
    provider,
    url: (process.env.SUPPORT_TRIAGE_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    model: process.env.SUPPORT_TRIAGE_MODEL ?? 'qwen3.5:9b',
    timeoutMs: clampInt(process.env.SUPPORT_TRIAGE_TIMEOUT_MS, 25_000, 5_000, 55_000),
    providerId: dbProviderId,
  };
}

// The local target is a same-machine Ollama; keep the URL localhost-only so a
// misconfigured env var can't turn this into an SSRF vector.
function assertLocalTriageUrl(url: string): void {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const isLocal = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  if (!isLocal) {
    throw new Error(
      `SUPPORT_TRIAGE_URL must point at localhost for the local provider (got ${host}); use SUPPORT_TRIAGE_PROVIDER=cloud for remote providers`,
    );
  }
}

function buildTriagePrompt(input: TriageInput): { system: string; user: string } {
  const system = [
    'You are the support triage assistant for SuperApp, a Shopify app that generates storefront modules, discounts, and automations for merchants.',
    'Classify the merchant-reported issue below. Respond with ONLY a JSON object with keys:',
    'severity ("low"|"medium"|"high"|"critical"), category (one of: ' + TRIAGE_CATEGORIES.join(', ') + '),',
    'summary (one or two sentences, plain English, for the support team),',
    'suggestedReply (a short, polite first reply to the merchant: acknowledge, state what happens next; never promise a fix time),',
    'escalate (boolean: true if a human should look at this — merchant-impacting bugs, billing problems, anything you are unsure about),',
    'confidence (0-1).',
    'Severity guide: critical = storefront/checkout broken or revenue-impacting for the merchant; high = a feature is broken; medium = degraded or intermittent; low = question, cosmetic, or feature request.',
  ].join(' ');
  const user = [
    `Shop: ${input.shopDomain}`,
    input.moduleContext ? `Module context: ${input.moduleContext}` : null,
    `Subject: ${input.subject}`,
    'Description:',
    input.description,
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

function parseTriageJson(raw: string): TriageResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // tolerate stray prose around the JSON object
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('triage response contained no JSON object');
    parsed = JSON.parse(raw.slice(start, end + 1));
  }
  return TriageResultSchema.parse(parsed);
}

async function triageViaOllama(input: TriageInput, config: TriageConfig): Promise<TriageResult> {
  assertLocalTriageUrl(config.url);
  const { system, user } = buildTriagePrompt(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: false,
        // think:false is mandatory: default thinking mode burns minutes/thousands
        // of tokens before the first JSON byte (see docs/debug.md pattern; measured
        // 3,400 thinking tokens vs 75 output tokens on qwen3.5:9b).
        think: false,
        format: TRIAGE_JSON_SCHEMA,
        // 30m keep_alive: cold model load is 38-86s on the 16GB M1 Pro (2026-07-14
        // audit) and dominates end-to-end latency; keeping the model resident
        // makes warm triage calls ~10s.
        keep_alive: '30m',
        options: { temperature: 0.2, num_ctx: 8192 },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 300);
      throw new Error(`local triage upstream ${response.status}: ${body}`);
    }
    const data = (await response.json()) as { message?: { content?: string } };
    const content = data.message?.content ?? '';
    if (!content) throw new Error('local triage returned an empty response');
    return parseTriageJson(content);
  } finally {
    clearTimeout(timeout);
  }
}

async function triageViaCloud(input: TriageInput, shopId: string | undefined, config: TriageConfig): Promise<TriageResult> {
  const { system, user } = buildTriagePrompt(input);

  // When an operator has pinned a specific provider (AppSettings.supportTriageProviderId)
  // and it still exists, target it directly via the exported ConfiguredLlmClient
  // (a single provider, no fallback chain — a deliberate pin). Otherwise, or when
  // the pinned provider was deleted, fall back to the default per-shop chain.
  let client: LlmClient | undefined;
  let providerId: string | null = null;
  const pinnedId = config.providerId;
  if (pinnedId) {
    const exists = await getPrisma()
      .aiProvider.findUnique({ where: { id: pinnedId }, select: { id: true } })
      .catch(() => null);
    if (exists) {
      client = new ConfiguredLlmClient(pinnedId, shopId);
      providerId = pinnedId;
    }
  }
  if (!client) {
    const selected = await getLlmClient(shopId);
    client = selected.client;
    providerId = selected.providerId;
  }

  const result = await client.generateRecipe(`${system}\n\n${user}`, {
    maxTokens: 1200,
    responseSchema: { name: 'support_triage', schema: TRIAGE_JSON_SCHEMA },
  });
  const usage = new AiUsageService();
  const attribution = await attributeServedCost(result, providerId, result.tokensIn, result.tokensOut);
  await recordAiUsage(usage, {
    providerId: attribution.providerId,
    shopId,
    action: 'SUPPORT_TRIAGE',
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costCents: attribution.costCents,
    meta: { subject: input.subject.slice(0, 120) },
  });
  return parseTriageJson(result.rawJson);
}

/**
 * Runs triage for a ticket. Never throws: a ticket must always be created even
 * when the model is down, slow (16GB machine under memory pressure), or emits
 * garbage — callers persist the error outcome and leave the ticket untriaged.
 */
export async function runSupportTriage(
  input: TriageInput,
  opts: { shopId?: string } = {},
): Promise<TriageOutcome> {
  const config = await resolveTriageConfig();
  try {
    const result =
      config.provider === 'cloud'
        ? await triageViaCloud(input, opts.shopId, config)
        : await triageViaOllama(input, config);
    return { ok: true, result, provider: config.provider, model: config.model };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `triage timed out after ${config.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, error: message.slice(0, 500), provider: config.provider };
  }
}
