import { z } from 'zod';
import { JobExecutionModeSchema } from '@superapp/platform-contracts';

export const JobOrchestratorConfigSchema = z.object({
  mode: JobExecutionModeSchema.default('inline'),
  queueRedisUrl: z.string().url().optional(),
  queuePrefix: z.string().min(1).default('superapp'),
  defaultAttempts: z.number().int().positive().default(3),
  defaultBackoffMs: z.number().int().positive().default(1000),
});

export type JobOrchestratorConfig = z.infer<typeof JobOrchestratorConfigSchema>;

export function loadJobOrchestratorConfig(
  env: NodeJS.ProcessEnv = process.env,
): JobOrchestratorConfig {
  const modeRaw = env.JOB_EXECUTION_MODE?.trim();
  const mode =
    modeRaw === 'queue' || modeRaw === 'disabled' || modeRaw === 'inline' ? modeRaw : 'inline';

  return JobOrchestratorConfigSchema.parse({
    mode,
    queueRedisUrl: env.QUEUE_REDIS_URL?.trim() || env.REDIS_URL?.trim() || undefined,
    queuePrefix: env.QUEUE_PREFIX?.trim() || 'superapp',
    defaultAttempts: env.QUEUE_DEFAULT_ATTEMPTS
      ? Number.parseInt(env.QUEUE_DEFAULT_ATTEMPTS, 10)
      : 3,
    defaultBackoffMs: env.QUEUE_DEFAULT_BACKOFF_MS
      ? Number.parseInt(env.QUEUE_DEFAULT_BACKOFF_MS, 10)
      : 1000,
  });
}

export function resolveEffectiveMode(config: JobOrchestratorConfig): JobOrchestratorConfig['mode'] {
  if (config.mode === 'queue' && !config.queueRedisUrl) {
    return 'inline';
  }
  return config.mode;
}
