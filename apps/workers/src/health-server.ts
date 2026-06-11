import { createServer, type Server } from 'node:http';
import {
  HealthResponseSchema,
  ReadinessResponseSchema,
} from '@superapp/platform-contracts';
import type { WorkerEnv } from './env.js';

export type WorkerHealthServerOptions = {
  env: WorkerEnv;
  getReadinessChecks: () => { config: boolean; runtime: boolean };
};

export type WorkerHealthServer = {
  server: Server;
  url: string;
  close(): Promise<void>;
};

export function createWorkerHealthServer(options: WorkerHealthServerOptions): WorkerHealthServer {
  const host = options.env.WORKER_HEALTH_HOST;
  const port = options.env.WORKER_HEALTH_PORT;

  const server = createServer((req, res) => {
    const path = req.url?.split('?')[0] ?? '/';
    if (req.method !== 'GET') {
      res.writeHead(405, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }));
      return;
    }

    if (path === '/health') {
      const body = HealthResponseSchema.parse({
        ok: true,
        service: 'workers',
        version: options.env.WORKER_SERVICE_VERSION,
        timestamp: new Date().toISOString(),
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }

    if (path === '/ready') {
      const checks = options.getReadinessChecks();
      const ok = checks.config && checks.runtime;
      const body = ReadinessResponseSchema.parse({
        ok: true,
        service: 'workers',
        version: options.env.WORKER_SERVICE_VERSION,
        timestamp: new Date().toISOString(),
        checks,
      });
      res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'NOT_FOUND' }));
  });

  return {
    server,
    url: `http://${host}:${port}`,
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

export async function startWorkerHealthServer(
  options: WorkerHealthServerOptions,
): Promise<WorkerHealthServer> {
  const health = createWorkerHealthServer(options);
  await new Promise<void>((resolve, reject) => {
    health.server.once('error', reject);
    health.server.listen(options.env.WORKER_HEALTH_PORT, options.env.WORKER_HEALTH_HOST, () => {
      resolve();
    });
  });
  return health;
}
