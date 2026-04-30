import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

const HOST = '127.0.0.1';

function pickPort(): number {
  return 19000 + Math.floor(Math.random() * 2000);
}

async function waitForHealth(port: number, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://${HOST}:${port}/healthz`);
      if (res.ok) return;
    } catch {
      // Process may still be booting; retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Router did not become healthy on port ${port}`);
}

function startRouter(port: number): ChildProcessWithoutNullStreams {
  return spawn(
    'pnpm',
    ['exec', 'tsx', '--tsconfig', 'tsconfig.scripts.json', 'scripts/internal-ai-router.ts'],
    {
      cwd: '/Users/lavipun/Work/ai-shopify-superapp/apps/web',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ROUTER_HOST: HOST,
        ROUTER_PORT: String(port),
        ROUTER_BACKEND: 'ollama',
        INTERNAL_AI_ROUTER_TOKEN: '',
      },
      stdio: 'pipe',
    },
  );
}

let routerProcess: ChildProcessWithoutNullStreams | null = null;

afterEach(async () => {
  if (!routerProcess || routerProcess.killed) return;
  routerProcess.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (!routerProcess.killed) {
    routerProcess.kill('SIGKILL');
  }
  routerProcess = null;
});

describe('internal-ai-router auth hardening', () => {
  it('returns 503 in production when auth is required but token is missing', async () => {
    const port = pickPort();
    routerProcess = startRouter(port);
    await waitForHealth(port);

    const response = await fetch(`http://${HOST}:${port}/route`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'x' }),
    });

    expect(response.status).toBe(503);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain('INTERNAL_AI_ROUTER_TOKEN missing');
  });
});

