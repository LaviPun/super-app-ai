/**
 * One-shot Sentry verification: sends a tagged test event through the same
 * redaction-wrapped capture path production uses, then flushes.
 * Run: SENTRY_DSN=... pnpm --filter web exec tsx --tsconfig tsconfig.scripts.json scripts/sentry-smoke.ts
 */
import { captureException, flushSentry } from '../app/services/observability/sentry.server';

async function main() {
  if (!process.env.SENTRY_DSN) {
    console.error('SENTRY_DSN not set');
    process.exit(1);
  }
  captureException(new Error(`ws-a sentry smoke ${new Date().toISOString()}`), {
    requestId: 'ws-a-smoke',
  });
  await flushSentry(5000);
  console.log('event flushed — check Sentry Issues');
  process.exit(0);
}
void main();
