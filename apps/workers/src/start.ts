import { createWorkerRuntime } from './worker-runtime.js';

async function main() {
  const runtime = createWorkerRuntime();
  const shutdown = async () => {
    await runtime.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('[workers] BullMQ consumers started');
}

main().catch((error) => {
  console.error('[workers] failed to start', error);
  process.exit(1);
});
