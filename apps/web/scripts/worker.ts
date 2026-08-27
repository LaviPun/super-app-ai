/**
 * Railway worker service entrypoint (WS-A skeleton).
 *
 * Boots, connects to the queue Redis (QUEUE_REDIS_URL || REDIS_URL via
 * @superapp/job-orchestration config), serves GET /healthz for Railway's
 * healthcheck, and heartbeats. When JOB_EXECUTION_MODE=queue and processors
 * are registered (Task 5), mounts real BullMQ Workers via
 * createWebWorkerRuntime; otherwise stays health-only, exactly as the WS-A
 * skeleton did.
 */
import http from 'node:http';
import Redis from 'ioredis';
import { loadJobOrchestratorConfig, resolveEffectiveMode } from '@superapp/job-orchestration';
import { createWebWorkerRuntime, type WebWorkerRuntime } from '../app/services/jobs/worker-runtime.server.js';
import { buildWorkerHandlers } from '../app/services/jobs/processors/index.js';
import { createOpsWorkerRuntime, type OpsWorkerRuntime } from '../app/services/jobs/ops-queue.server.js';

const config = loadJobOrchestratorConfig();
if (!config.queueRedisUrl) {
  console.error('[worker] FATAL: QUEUE_REDIS_URL or REDIS_URL must be set');
  process.exit(1);
}

// maxRetriesPerRequest: null is the BullMQ-required connection setting; use it
// here so WS-C can hand this exact connection config to bullmq Workers.
const redis = new Redis(config.queueRedisUrl, { maxRetriesPerRequest: null });
let redisStatus: 'ok' | 'fail' = 'fail';

redis.on('ready', () => {
  redisStatus = 'ok';
  console.info('[worker] redis ready', { prefix: config.queuePrefix });
});
redis.on('error', (err) => {
  redisStatus = 'fail';
  console.error('[worker] redis error', err.message);
});

const port = Number(process.env.PORT ?? 8080);
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    const ok = redisStatus === 'ok';
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok, role: 'worker', redis: redisStatus }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});
server.listen(port, '0.0.0.0', () => {
  console.info('[worker] health server listening', {
    port,
    mode: resolveEffectiveMode(config),
    queuePrefix: config.queuePrefix,
  });
});

const heartbeat = setInterval(async () => {
  try {
    await redis.ping();
    redisStatus = 'ok';
  } catch {
    redisStatus = 'fail';
  }
}, 30_000);

let runtime: WebWorkerRuntime | null = null;
if (resolveEffectiveMode(config) === 'queue') {
  const handlers = buildWorkerHandlers();
  if (Object.keys(handlers).length > 0) {
    runtime = createWebWorkerRuntime({ handlers });
    console.info('[worker] BullMQ workers mounted', { queues: Object.keys(handlers) });
  } else {
    console.info('[worker] no handlers registered yet — health-only mode');
  }
}

// WS-G Task 14 (Decision G8): a SEPARATE BullMQ Worker for the "superapp-ops"
// queue (CONNECTOR_TEST/FLOW_RUN/MESSAGING_RUN/HTTP_SYNC_RUN/RESTOCK_WATCH_RUN/
// LOYALTY_ACCRUAL_RUN — job-executors.server.ts), independent of the
// `createWebWorkerRuntime` platform registry above (see ops-queue.server.ts's
// doc comment for why this queue is deliberately NOT folded into
// `PlatformQueueName`). Reuses this script's existing `redis` connection.
// Fix round (Important #3): now mounted via createOpsWorkerRuntime, which
// carries its own 'failed'-event reconciler mirroring WS-C's runtime above.
let opsWorker: OpsWorkerRuntime | null = null;
if (resolveEffectiveMode(config) === 'queue') {
  opsWorker = createOpsWorkerRuntime({ connection: redis });
  console.info('[worker] bullmq Worker mounted', { queue: 'superapp-ops' });
}

async function shutdown(signal: string) {
  console.info(`[worker] ${signal} — shutting down`);
  clearInterval(heartbeat);
  // Raise the force-exit window when a runtime is mounted so in-flight jobs
  // can drain via Worker.close() before Railway kills the process.
  const forceExitMs = runtime || opsWorker ? 30_000 : 5_000;
  const forceExit = setTimeout(() => process.exit(0), forceExitMs).unref();
  try {
    await Promise.all([runtime?.close(), opsWorker?.close()]);
  } finally {
    server.close(() => {
      clearTimeout(forceExit);
      void redis.quit().finally(() => process.exit(0));
    });
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
