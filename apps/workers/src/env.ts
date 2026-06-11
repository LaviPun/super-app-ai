import { z } from 'zod';

const WorkerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WORKER_SERVICE_VERSION: z.string().default('0.1.0'),
  WORKER_HEALTH_HOST: z.string().default('0.0.0.0'),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(8080),
  QUEUE_PROVIDER: z.enum(['memory', 'bullmq']).default('memory'),
  QUEUE_REDIS_URL: z.string().url().optional(),
  QUEUE_PREFIX: z.string().min(1).default('superapp-v2'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
}).superRefine((env, ctx) => {
  if (env.QUEUE_PROVIDER === 'bullmq' && !env.QUEUE_REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['QUEUE_REDIS_URL'],
      message: 'QUEUE_REDIS_URL is required when QUEUE_PROVIDER=bullmq',
    });
  }
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return WorkerEnvSchema.parse(source);
}
