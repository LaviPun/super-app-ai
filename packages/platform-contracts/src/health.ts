import { z } from 'zod';

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string().min(1),
  version: z.string().min(1),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ReadinessResponseSchema = HealthResponseSchema.extend({
  checks: z
    .object({
      config: z.boolean(),
    })
    .catchall(z.boolean()),
});

export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;
