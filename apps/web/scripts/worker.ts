/**
 * Railway worker service entrypoint (WS-A skeleton).
 *
 * Boots, connects to the queue Redis (QUEUE_REDIS_URL || REDIS_URL via
 * @superapp/job-orchestration config), serves GET /healthz for Railway's
 * healthcheck, and heartbeats. WS-C mounts real BullMQ Workers here; until
 * then JOB_EXECUTION_MODE stays "inline" and this process only proves the
 * service + Redis wiring.
 */
import http from 'node:http';
import Redis from 'ioredis';
import { loadJobOrchestratorConfig, resolveEffectiveMode } from '@superapp/job-orchestration';

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
  console.log('[worker] redis ready', { prefix: config.queuePrefix });
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
  console.log('[worker] health server listening', {
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

function shutdown(signal: string) {
  console.log(`[worker] ${signal} — shutting down`);
  clearInterval(heartbeat);
  server.close(() => {
    void redis.quit().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
