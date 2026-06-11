import Fastify from 'fastify';
import { loadApiEnv } from './env.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerInternalAssistantRoutes } from './routes/internal-assistant.js';
import { registerPreviewRoutes } from './routes/preview.js';

export async function buildApp() {
  const env = loadApiEnv();
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({
    status: 'ok',
    service: '@superapp/api',
    timestamp: new Date().toISOString(),
  }));

  app.get('/ready', async () => ({
    status: 'ready',
    jobExecutionMode: process.env.JOB_EXECUTION_MODE ?? 'inline',
  }));

  await registerJobRoutes(app);
  await registerInternalAssistantRoutes(app);
  await registerPreviewRoutes(app);

  return { app, env };
}

async function main() {
  const { app, env } = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
