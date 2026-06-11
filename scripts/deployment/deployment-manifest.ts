import { z } from 'zod';

export const DeploymentServiceSchema = z.enum([
  'frontend',
  'api',
  'workers',
  'internal-router',
  'legacy-remix',
]);

export const EnvVarRowSchema = z.object({
  name: z.string().min(1),
  required: z.boolean(),
  secret: z.boolean().default(false),
  description: z.string().min(1),
});

export const DeploymentTargetSchema = z.object({
  service: DeploymentServiceSchema,
  platform: z.enum(['vercel', 'railway', 'fly', 'runpod', 'managed', 'cloudflare']),
  healthPath: z.string().optional(),
  readinessPath: z.string().optional(),
  configFiles: z.array(z.string().min(1)),
  env: z.array(EnvVarRowSchema),
});

export const DeploymentManifestSchema = z.object({
  version: z.literal(1),
  targets: z.array(DeploymentTargetSchema).min(1),
});

export type DeploymentManifest = z.infer<typeof DeploymentManifestSchema>;

export const deploymentManifest: DeploymentManifest = {
  version: 1,
  targets: [
    {
      service: 'frontend',
      platform: 'vercel',
      configFiles: ['apps/frontend/vercel.json', 'apps/frontend/.env.example'],
      env: [
        {
          name: 'NEXT_PUBLIC_API_BASE_URL',
          required: true,
          secret: false,
          description: 'Public Fastify API origin used by the Next migration shell.',
        },
      ],
    },
    {
      service: 'api',
      platform: 'railway',
      healthPath: '/health',
      readinessPath: '/ready',
      configFiles: ['apps/api/Dockerfile', 'apps/api/railway.toml', 'apps/api/.env.example'],
      env: [
        { name: 'NODE_ENV', required: true, secret: false, description: 'Runtime mode.' },
        { name: 'HOST', required: true, secret: false, description: 'Bind host (0.0.0.0 in Railway).' },
        { name: 'PORT', required: true, secret: false, description: 'HTTP port exposed by Railway.' },
        { name: 'API_SERVICE_VERSION', required: false, secret: false, description: 'Health payload version label.' },
        { name: 'JOB_EXECUTION_MODE', required: true, secret: false, description: 'inline | queue | disabled.' },
        { name: 'QUEUE_PROVIDER', required: true, secret: false, description: 'memory (local) or bullmq (staging/prod).' },
        { name: 'JOB_STORE_PROVIDER', required: true, secret: false, description: 'memory or repository.' },
        { name: 'QUEUE_REDIS_URL', required: true, secret: true, description: 'Redis URL when QUEUE_PROVIDER=bullmq.' },
        { name: 'QUEUE_PREFIX', required: true, secret: false, description: 'BullMQ key prefix.' },
        { name: 'DATABASE_URL', required: true, secret: true, description: 'Managed Postgres for job ledger (repository store).' },
      ],
    },
    {
      service: 'workers',
      platform: 'railway',
      healthPath: '/health',
      readinessPath: '/ready',
      configFiles: ['apps/workers/Dockerfile', 'apps/workers/railway.toml', 'apps/workers/.env.example'],
      env: [
        { name: 'NODE_ENV', required: true, secret: false, description: 'Runtime mode.' },
        { name: 'WORKER_HEALTH_HOST', required: true, secret: false, description: 'Health server bind host.' },
        { name: 'WORKER_HEALTH_PORT', required: true, secret: false, description: 'Health server port for Railway checks.' },
        { name: 'QUEUE_PROVIDER', required: true, secret: false, description: 'bullmq in staging/prod.' },
        { name: 'QUEUE_REDIS_URL', required: true, secret: true, description: 'Shared Redis with API queues.' },
        { name: 'QUEUE_PREFIX', required: true, secret: false, description: 'Must match API QUEUE_PREFIX.' },
        { name: 'WORKER_CONCURRENCY', required: true, secret: false, description: 'Per-queue BullMQ concurrency.' },
      ],
    },
    {
      service: 'internal-router',
      platform: 'railway',
      healthPath: '/healthz',
      configFiles: [
        'apps/web/Dockerfile.internal-router',
        'apps/web/railway.internal-router.toml',
        'deploy/railway-internal-router/README.md',
      ],
      env: [
        { name: 'ROUTER_HOST', required: true, secret: false, description: 'Bind host (0.0.0.0 on Railway).' },
        { name: 'ROUTER_PORT', required: false, secret: false, description: 'HTTP port; defaults to Railway PORT or 8787 when unset.' },
        { name: 'ROUTER_BACKEND', required: true, secret: false, description: 'ollama or openai.' },
        { name: 'ROUTER_OLLAMA_BASE_URL', required: true, secret: false, description: 'Ollama/vLLM origin for /route and passthrough.' },
        { name: 'ROUTER_OLLAMA_MODEL', required: true, secret: false, description: 'Ollama model tag (e.g. qwen3:4b-instruct).' },
        { name: 'INTERNAL_AI_ROUTER_TOKEN', required: true, secret: true, description: 'Bearer auth for /route and passthrough.' },
        { name: 'ROUTER_OPENAI_BASE_URL', required: false, secret: false, description: 'OpenAI-compatible backend when ROUTER_BACKEND=openai.' },
        { name: 'ROUTER_OPENAI_API_KEY', required: false, secret: true, description: 'API key for OpenAI-compatible backend.' },
      ],
    },
    {
      service: 'legacy-remix',
      platform: 'fly',
      configFiles: ['apps/web/.env.example'],
      env: [
        { name: 'DATABASE_URL', required: true, secret: true, description: 'Primary app database during migration.' },
        { name: 'SHOPIFY_API_KEY', required: true, secret: true, description: 'Embedded app credentials.' },
        { name: 'SHOPIFY_API_SECRET', required: true, secret: true, description: 'Embedded app credentials.' },
        { name: 'ENCRYPTION_KEY', required: true, secret: true, description: 'At-rest secret encryption.' },
      ],
    },
  ],
};
