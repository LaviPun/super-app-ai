import { z } from 'zod';

export const DeploymentServiceSchema = z.enum([
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
