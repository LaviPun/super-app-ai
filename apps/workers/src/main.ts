import { loadWorkerEnv } from './env.js';
import { consoleWorkerLogger } from './logger.js';
import { createWorkerRuntime } from './runtime.js';

const env = loadWorkerEnv();
const runtime = createWorkerRuntime({ env, logger: consoleWorkerLogger });

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  consoleWorkerLogger.info('received shutdown signal', { signal });
  try {
    await runtime.stop();
    process.exit(0);
  } catch (err) {
    consoleWorkerLogger.error('worker shutdown failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
