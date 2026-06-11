import { z } from 'zod';

export const ApiEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default('0.0.0.0'),
  JOB_EXECUTION_MODE: z.enum(['inline', 'queue', 'disabled']).default('inline'),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  return ApiEnvSchema.parse({
    PORT: env.PORT,
    HOST: env.HOST,
    JOB_EXECUTION_MODE: env.JOB_EXECUTION_MODE,
  });
}
