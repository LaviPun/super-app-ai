import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('127.0.0.1'),
  API_SERVICE_VERSION: z.string().default('0.1.0'),
  JOB_EXECUTION_MODE: z.enum(['inline', 'queue', 'disabled']).default('queue'),
  QUEUE_PROVIDER: z.enum(['memory', 'bullmq']).default('memory'),
  JOB_STORE_PROVIDER: z.enum(['memory', 'repository']).default('memory'),
  JOB_LEDGER_DRIVER: z.enum(['memory', 'sqlite', 'postgres']).default('sqlite'),
  JOB_LEDGER_SQLITE_PATH: z.string().min(1).default(':memory:'),
  V2_DATABASE_URL: z.string().url().optional(),
  QUEUE_REDIS_URL: z.string().url().optional(),
  QUEUE_PREFIX: z.string().min(1).default('superapp-v2'),
  QUEUE_DEFAULT_ATTEMPTS: z.coerce.number().int().positive().default(3),
  QUEUE_DEFAULT_BACKOFF_MS: z.coerce.number().int().nonnegative().default(1_000),
}).superRefine((env, ctx) => {
  if (env.QUEUE_PROVIDER === 'bullmq' && !env.QUEUE_REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['QUEUE_REDIS_URL'],
      message: 'QUEUE_REDIS_URL is required when QUEUE_PROVIDER=bullmq',
    });
  }

  if (env.JOB_LEDGER_DRIVER === 'postgres' && !env.V2_DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['V2_DATABASE_URL'],
      message: 'V2_DATABASE_URL is required when JOB_LEDGER_DRIVER=postgres',
    });
  }
});

export type ApiEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return EnvSchema.parse(source);
}
