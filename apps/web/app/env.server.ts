import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Shopify OAuth
  SHOPIFY_API_KEY: z.string().min(1, 'SHOPIFY_API_KEY is required'),
  SHOPIFY_API_SECRET: z.string().min(1, 'SHOPIFY_API_SECRET is required'),
  SHOPIFY_APP_URL: z.string().url('SHOPIFY_APP_URL must be a valid URL'),
  SCOPES: z.string().min(1, 'SCOPES is required'),

  // Encryption (base64-encoded 32-byte key)
  ENCRYPTION_KEY: z
    .string()
    .min(1, 'ENCRYPTION_KEY is required')
    .refine(
      (v) => {
        try {
          return Buffer.from(v, 'base64').length >= 32;
        } catch {
          return false;
        }
      },
      { message: 'ENCRYPTION_KEY must be a base64-encoded value of at least 32 bytes' }
    ),

  // Internal admin dashboard
  INTERNAL_ADMIN_PASSWORD: z.string().min(8, 'INTERNAL_ADMIN_PASSWORD must be at least 8 characters'),
  INTERNAL_ADMIN_SESSION_SECRET: z.string().min(16, 'INTERNAL_ADMIN_SESSION_SECRET must be at least 16 characters'),

  // Internal SSO (optional)
  INTERNAL_SSO_ISSUER: z.string().url().optional(),
  INTERNAL_SSO_CLIENT_ID: z.string().optional(),
  INTERNAL_SSO_CLIENT_SECRET: z.string().optional(),
  INTERNAL_SSO_REDIRECT_URI: z.string().url().optional(),
  /** Comma-separated exact-match email allowlist for internal SSO. REQUIRED whenever INTERNAL_SSO_ISSUER is set. */
  INTERNAL_SSO_ALLOWED_EMAILS: z.string().optional(),

  // Retention
  DEFAULT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  // Persistence redaction hardening
  STRICT_PII_REDACTION: z.string().optional(),

  // App Pricing plan sync (Partner API). All optional — inert without them (Conf-4).
  SHOPIFY_PARTNER_API_TOKEN: z.string().optional(),
  SHOPIFY_PARTNER_ORG_ID: z.string().optional(),
  SHOPIFY_APP_GID: z.string().optional(),       // gid://shopify/App/<id>
  SHOPIFY_APP_HANDLE: z.string().optional(),    // app handle from the Partner Dashboard listing URL

  /** When set, internal AI assistant never uses modalRemote or cross-target failover (local-only). */
  INTERNAL_AI_LOCAL_ONLY: z.string().optional(),
  INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS: z.string().optional(),
  INTERNAL_AI_CHAT_MESSAGE_RETENTION_DAYS: z.string().optional(),
  ALLOW_MERCHANT_CODE_EXECUTION: z.string().optional(),

  // Workflow email connector (optional)
  EMAIL_CONNECTOR_PROVIDER: z.enum(['sendgrid', 'generic']).optional(),
  EMAIL_API_URL: z.string().url().optional(),
  EMAIL_API_KEY_HEADER: z.string().min(1).optional(),
  EMAIL_API_KEY_PREFIX: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  ADMIN_EMAIL: z.string().email().optional(),

  // Cron endpoint protection (optional — endpoint disabled if not set)
  CRON_SECRET: z.string().optional(),

  // Observability (optional)
  SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // OpenTelemetry (optional — traces sent only when endpoint is set)
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default('superapp-web'),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_TRACES_SAMPLE_RATE: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.string().optional(),

  // Redis / queue (WS-A)
  REDIS_URL: z.string().min(1).optional(),
  QUEUE_REDIS_URL: z.string().min(1).optional(),
  QUEUE_PREFIX: z.string().optional(),
  QUEUE_DEFAULT_ATTEMPTS: z.coerce.number().int().positive().optional(),
  QUEUE_DEFAULT_BACKOFF_MS: z.coerce.number().int().positive().optional(),
  JOB_EXECUTION_MODE: z.enum(['inline', 'queue', 'disabled']).default('inline'),
  PLATFORM_V2_ENABLED: z.string().optional(),

  // AI providers
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_DEFAULT_MODEL: z.string().optional(),
  OPENAI_DEFAULT_MODEL: z.string().optional(),
  GEMINI_DEFAULT_MODEL: z.string().optional(),
  ANTHROPIC_CODE_EXECUTION: z.string().optional(),
  ANTHROPIC_SKILLS: z.string().optional(),
  LLM_PROVIDER: z.string().optional(),

  // Feature flags (string-boolean via parseBooleanEnv at read sites)
  AI_COST_ROUTING_ENABLED: z.string().optional(),
  JUDGE_POLISH_ENABLED: z.string().optional(),
  PREVIEW_EXPORT_QUEUE_ENABLED: z.string().optional(),
  SHOPIFY_DOCS_GROUNDING_DISABLED: z.string().optional(),
  SIDEKICK_EXTENSION_ENABLED: z.string().optional(),
  BLUEPRINTS_ENABLED: z.string().optional(),
  THEME_NATIVE_SECTION_ENABLED: z.string().optional(),
  THEME_CHECK_GATE: z.string().optional(),
  RELEASE_GLOBAL_KILL_SWITCH: z.string().optional(),
  RELEASE_SURFACE_ADMIN_ENABLED: z.string().optional(),
  RELEASE_SURFACE_CHECKOUT_ENABLED: z.string().optional(),
  RELEASE_SURFACE_CUSTOMER_ACCOUNT_ENABLED: z.string().optional(),
  RELEASE_SURFACE_FLOW_ENABLED: z.string().optional(),
  RELEASE_SURFACE_FUNCTIONS_ENABLED: z.string().optional(),
  RELEASE_SURFACE_INTEGRATION_ENABLED: z.string().optional(),
  RELEASE_SURFACE_POS_ENABLED: z.string().optional(),
  RELEASE_SURFACE_THEME_ENABLED: z.string().optional(),

  // Internal AI router client + Modal proxy + triage
  INTERNAL_AI_ALLOW_HOSTS: z.string().optional(),
  INTERNAL_AI_ROUTER_URL: z.string().url().optional(),
  INTERNAL_AI_ROUTER_TOKEN: z.string().optional(),
  INTERNAL_AI_ROUTER_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  INTERNAL_AI_ROUTER_SHADOW: z.string().optional(),
  INTERNAL_AI_ROUTER_DUAL_TARGET_ENABLED: z.string().optional(),
  INTERNAL_AI_ROUTER_CANARY_SHOPS: z.string().optional(),
  INTERNAL_AI_ROUTER_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().optional(),
  INTERNAL_AI_ROUTER_CIRCUIT_COOLDOWN_MS: z.coerce.number().int().positive().optional(),
  INTERNAL_AI_CHAT_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  MODAL_ROUTER_URL: z.string().url().optional(),
  MODAL_ROUTER_TOKEN: z.string().optional(),
  MODAL_ROUTER_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  SUPPORT_TRIAGE_PROVIDER: z.string().optional(),
  SUPPORT_TRIAGE_MODEL: z.string().optional(),
  SUPPORT_TRIAGE_URL: z.string().url().optional(),
  SUPPORT_TRIAGE_TIMEOUT_MS: z.coerce.number().int().positive().optional(),

  // Email / Slack connectors (EMAIL_API_KEY was read but never registered)
  EMAIL_API_KEY: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),

  // Shopify misc
  SHOPIFY_API_VERSION: z.string().optional(),
  SHOP_CUSTOM_DOMAIN: z.string().optional(),
  SHOPIFY_DEPLOYED_FUNCTION_EXTENSIONS: z.string().optional(),
  APP_URL: z.string().url().optional(),
  PORT: z.coerce.number().int().positive().optional(),
}).superRefine((env, ctx) => {
  if (env.INTERNAL_SSO_ISSUER) {
    const allowed = (env.INTERNAL_SSO_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowed.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['INTERNAL_SSO_ALLOWED_EMAILS'],
        message:
          'INTERNAL_SSO_ALLOWED_EMAILS is required (comma-separated emails) when INTERNAL_SSO_ISSUER is set — without it SSO would grant internal admin to any IdP identity.',
      });
    }
  }
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | undefined;

/** Variables that must be present (non-empty) in production, on top of the always-required set. */
const PROD_REQUIRED = [
  'REDIS_URL',
  'CRON_SECRET',
  'SENTRY_DSN',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
] as const;

/**
 * Validates process.env at boot. Call once from entry points.
 * Throws with a clear list of missing/invalid vars so the app never starts misconfigured.
 * In production, also fails fast if any PROD_REQUIRED variable is missing/empty —
 * a misconfigured Railway service should refuse to boot rather than limp along.
 */
export function validateEnv(): Env {
  if (_env) return _env;

  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[env] Boot failed — invalid environment:\n${issues}`);
  }

  if (result.data.NODE_ENV === 'production') {
    const missing = PROD_REQUIRED.filter((k) => {
      const v = result.data[k];
      return v === undefined || v === '';
    });
    if (missing.length > 0) {
      throw new Error(
        `[env] Boot failed — required in production but missing:\n${missing
          .map((k) => `  • ${k}`)
          .join('\n')}`,
      );
    }
  }

  _env = result.data;
  return _env;
}

/**
 * Returns the validated env. Throws if validateEnv() was never called in test or prod.
 * Prefer calling validateEnv() at boot; use getEnv() in services.
 */
export function getEnv(): Env {
  if (!_env) {
    // In tests, auto-validate so services don't need extra setup.
    if (process.env.NODE_ENV === 'test') return validateEnv();
    throw new Error('[env] getEnv() called before validateEnv(). Call validateEnv() at app boot.');
  }
  return _env;
}

/** Reset cached env (used in tests only). */
export function _resetEnvForTest() {
  _env = undefined;
}

function parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function isStrictPiiRedactionEnabled(): boolean {
  const defaultValue = process.env.NODE_ENV === 'production';
  return parseBooleanEnv(process.env.STRICT_PII_REDACTION, defaultValue);
}

/**
 * Partner API config for App Pricing plan sync (PlanSyncService). Returns null
 * (rather than throwing) when any required var is absent so sync stays an inert
 * no-op until the Partner Dashboard runbook (Task 8) supplies real values.
 */
export function getPartnerApiConfig():
  | { token: string; orgId: string; appGid: string }
  | null {
  const token = process.env.SHOPIFY_PARTNER_API_TOKEN;
  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const appGid = process.env.SHOPIFY_APP_GID;
  if (!token || !orgId || !appGid) return null;
  return { token, orgId, appGid };
}

/** Internal admin assistant: block cloud target and dual-target fallback when true. */
export function isInternalAiLocalOnlyEnabled(): boolean {
  return parseBooleanEnv(process.env.INTERNAL_AI_LOCAL_ONLY, false);
}

/** Merchant-facing RecipeSpec generation paths must keep this disabled by default. */
export function isMerchantCodeExecutionAllowed(): boolean {
  return parseBooleanEnv(process.env.ALLOW_MERCHANT_CODE_EXECUTION, false);
}

/**
 * Multi-module blueprints (one request → a coordinated set of modules). Off by
 * default; single-module generation is unchanged when disabled. See
 * docs/blueprints.md.
 */
export function isBlueprintsEnabled(): boolean {
  return parseBooleanEnv(process.env.BLUEPRINTS_ENABLED, false);
}

/**
 * Native-section theme push (033): compile a `theme.section` to a real
 * `sections/superapp-<slug>.liquid` file and write it via the Theme Files API.
 * OFF by default — the app-block path is the shipping default. This path also
 * requires `write_themes` + a Shopify page-builder exemption (inert until granted),
 * so even with the flag on it is a no-op on stores that lack the grant. See
 * specs/033-theme-edit-api/design.md §8.
 */
export function isThemeNativeSectionEnabled(): boolean {
  return parseBooleanEnv(process.env.THEME_NATIVE_SECTION_ENABLED, false);
}

/**
 * Pre-publish theme-check gate (035). When ON (the default), `error`-severity
 * Theme Check offenses on compiled native-section Liquid BLOCK the publish; when
 * OFF the same offenses are logged non-blocking (warn-only). Kept as an env flag
 * so a false-positive in a new theme-check version can be defused to warn-only
 * WITHOUT a code deploy (set THEME_CHECK_GATE=off|false|no|0). Warnings/infos are
 * always non-blocking regardless of this flag, and any theme-check runtime failure
 * degrades to warn-only (the gate protects, it never bricks publishing).
 */
export function isThemeCheckGateBlocking(): boolean {
  return parseBooleanEnv(process.env.THEME_CHECK_GATE, true);
}

/**
 * Cheapest-first multi-provider AI routing. OFF by default. When disabled,
 * generation stays on the legacy single-provider path even if `AiModelPrice`
 * rows exist — so seeding pricing for cost observability never silently reroutes
 * production traffic to whichever provider happens to be cheapest. Turn this on
 * only when you intend price data to also select the serving provider.
 * See apps/web/app/services/ai/provider-cost-routing.server.ts.
 */
export function isCostRoutingEnabled(): boolean {
  return parseBooleanEnv(process.env.AI_COST_ROUTING_ENABLED, false);
}
