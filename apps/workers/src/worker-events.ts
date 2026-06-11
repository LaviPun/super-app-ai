import { z } from 'zod';

export const WorkerEventSchema = z.object({
  type: z.enum(['JOB_STARTED', 'JOB_PROGRESS', 'JOB_COMPLETED', 'JOB_FAILED']),
  jobId: z.string().min(1),
  queueName: z.string().min(1),
  trace: z.object({
    requestId: z.string().optional(),
    correlationId: z.string().min(1),
    shopId: z.string().optional(),
  }),
  timestamp: z.string().datetime(),
  progress: z.number().min(0).max(100),
  message: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export type WorkerEvent = z.infer<typeof WorkerEventSchema>;
