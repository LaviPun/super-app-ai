import { afterEach, describe, expect, it } from 'vitest';
import { _resetEnvForTest, validateEnv } from '~/env.server';

const BASE: Record<string, string> = {
  DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
  SHOPIFY_API_KEY: 'key',
  SHOPIFY_API_SECRET: 'secret',
  SHOPIFY_APP_URL: 'https://example.up.railway.app',
  SCOPES: 'read_products',
  ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  INTERNAL_ADMIN_PASSWORD: 'longpassword',
  INTERNAL_ADMIN_SESSION_SECRET: 'sixteen-characters',
};

const PROD_ONLY: Record<string, string> = {
  REDIS_URL: 'redis://localhost:6380',
  CRON_SECRET: 'cron-secret-value',
  SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/1',
  ANTHROPIC_API_KEY: 'sk-ant-x',
  OPENAI_API_KEY: 'sk-x',
};

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved = { ...process.env };
  Object.assign(process.env, vars);
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k];
  try {
    fn();
  } finally {
    process.env = saved;
    _resetEnvForTest();
  }
}

describe('env registry', () => {
  afterEach(() => _resetEnvForTest());

  it('accepts the base set outside production', () => {
    withEnv({ ...BASE, NODE_ENV: 'development' }, () => {
      expect(() => validateEnv()).not.toThrow();
    });
  });

  it('fails fast in production when REDIS_URL is missing', () => {
    withEnv(
      { ...BASE, ...PROD_ONLY, NODE_ENV: 'production', REDIS_URL: undefined },
      () => {
        expect(() => validateEnv()).toThrow(/REDIS_URL/);
      },
    );
  });

  it('fails fast in production when SENTRY_DSN and CRON_SECRET are missing', () => {
    withEnv(
      { ...BASE, ...PROD_ONLY, NODE_ENV: 'production', SENTRY_DSN: undefined, CRON_SECRET: undefined },
      () => {
        expect(() => validateEnv()).toThrow(/SENTRY_DSN[\s\S]*CRON_SECRET|CRON_SECRET[\s\S]*SENTRY_DSN/);
      },
    );
  });

  it('accepts a full production set', () => {
    withEnv({ ...BASE, ...PROD_ONLY, NODE_ENV: 'production' }, () => {
      expect(() => validateEnv()).not.toThrow();
    });
  });
});
