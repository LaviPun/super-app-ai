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

  // Cron endpoint protection (optional — endpoint disabled if not set)
  CRON_SECRET: z.string().optional(),
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
