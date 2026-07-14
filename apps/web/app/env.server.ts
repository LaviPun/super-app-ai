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

  // Retention
  DEFAULT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  // Persistence redaction hardening
  STRICT_PII_REDACTION: z.string().optional(),
  // Explicitly controls Shopify test billing mode. If unset, falls back to NODE_ENV for backward compatibility.
  BILLING_TEST_MODE: z.string().optional(),

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
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | undefined;

/**
 * Validates process.env at boot. Call once from entry points.
 * Throws with a clear list of missing/invalid vars so the app never starts misconfigured.
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

export function isBillingTestModeEnabled(): boolean {
  const defaultValue = process.env.NODE_ENV !== 'production';
  return parseBooleanEnv(process.env.BILLING_TEST_MODE, defaultValue);
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
