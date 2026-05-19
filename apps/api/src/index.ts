import Fastify from 'fastify';
import { loadEnv, type ApiEnv } from './env.js';
import { registerObservabilityPlugin } from './plugins/observability.js';
import { registerSecurityPlugin } from './plugins/security.js';
import { registerInternalAssistantRoutes } from './routes/internal-assistant.js';
import { registerHealthRoutes, registerJobRoutes } from './routes/index.js';
import { registerConnectorRoutes } from './routes/connectors.js';
import { registerWebhookFlowRoutes } from './routes/webhook-flow.js';
import { createJobSystem, type JobSystem } from './services/jobs/factory.js';

export type BuildAppOptions = {
  env?: ApiEnv;
  logger?: boolean;
  jobs?: JobSystem;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const env = options.env ?? loadEnv();
  const app = Fastify({
    logger: options.logger ?? env.NODE_ENV !== 'test',
  });
  const jobs = options.jobs ?? createJobSystem(env);

  await registerObservabilityPlugin(app, env, jobs);
  await registerSecurityPlugin(app);
  await registerHealthRoutes(app, env);
  await registerJobRoutes(app);
  await registerConnectorRoutes(app);
  await registerInternalAssistantRoutes(app);
  await registerWebhookFlowRoutes(app);
  app.addHook('onClose', async () => {
    await jobs.queue.close?.();
  });

  return app;
}

export { loadEnv };
