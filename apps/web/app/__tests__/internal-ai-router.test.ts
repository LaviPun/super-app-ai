import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';

const appsWebRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

function startRouter(port: number, extraEnv: Record<string, string> = {}): ChildProcessWithoutNullStreams {
  return spawn(
    'pnpm',
    ['exec', 'tsx', '--tsconfig', 'tsconfig.scripts.json', 'scripts/internal-ai-router.ts'],
    {
      cwd: appsWebRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ROUTER_HOST: HOST,
        ROUTER_PORT: String(port),
        ROUTER_BACKEND: 'ollama',
        INTERNAL_AI_ROUTER_TOKEN: '',
        ...extraEnv,
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

describe('internal-ai-router Ollama passthrough', () => {
  it('returns 502 from GET /api/tags when ROUTER_OLLAMA_BASE_URL is unreachable', async () => {
    const port = pickPort();
    routerProcess = startRouter(port, {
      NODE_ENV: 'development',
      ROUTER_REQUIRE_AUTH: '0',
      ROUTER_OLLAMA_BASE_URL: 'http://127.0.0.1:59998',
    });
    await waitForHealth(port);

    const response = await fetch(`http://${HOST}:${port}/api/tags`);
    expect(response.status).toBe(502);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe('Upstream unreachable');
  });

  it('returns 502 from POST /api/chat when ROUTER_OLLAMA_BASE_URL is unreachable', async () => {
    const port = pickPort();
    routerProcess = startRouter(port, {
      NODE_ENV: 'development',
      ROUTER_REQUIRE_AUTH: '0',
      ROUTER_OLLAMA_BASE_URL: 'http://127.0.0.1:59997',
    });
    await waitForHealth(port);

    const response = await fetch(`http://${HOST}:${port}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'x', messages: [], stream: false }),
    });
    expect(response.status).toBe(502);
  });
});

describe('internal-ai-router OpenAI-compatible passthrough', () => {
  it('returns 502 from POST /v1/chat/completions when ROUTER_OPENAI_BASE_URL is unreachable', async () => {
    const port = pickPort();
    routerProcess = startRouter(port, {
      NODE_ENV: 'development',
      ROUTER_REQUIRE_AUTH: '0',
      ROUTER_OPENAI_BASE_URL: 'http://127.0.0.1:59996/v1',
    });
    await waitForHealth(port);

    const response = await fetch(`http://${HOST}:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'x', messages: [] }),
    });
    expect(response.status).toBe(502);
  });
});

