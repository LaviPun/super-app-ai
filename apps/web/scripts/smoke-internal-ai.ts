type SmokeOptions = {
  baseUrl: string;
  password: string;
  withStream: boolean;
};

function parseArgs(argv: string[]): SmokeOptions {
  const options: SmokeOptions = {
    baseUrl: process.env.SMOKE_BASE_URL?.trim() || 'http://127.0.0.1:4000',
    password: process.env.INTERNAL_ADMIN_PASSWORD?.trim() || '',
    withStream: (process.env.SMOKE_WITH_STREAM ?? '').trim() === '1',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base-url') {
      options.baseUrl = argv[i + 1] ?? options.baseUrl;
      i += 1;
      continue;
    }
    if (arg === '--password') {
      options.password = argv[i + 1] ?? options.password;
      i += 1;
      continue;
    }
    if (arg === '--with-stream') {
      options.withStream = true;
    }
  }

  return options;
}

function getCookiePair(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  return setCookieHeader.split(';')[0]?.trim() ?? null;
}

async function login(baseUrl: string, password: string): Promise<string> {
  const form = new URLSearchParams();
  form.set('password', password);
  form.set('to', '/internal/ai-assistant');

  const response = await fetch(`${baseUrl}/internal/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  if (response.status !== 302) {
    const body = await response.text().catch(() => '');
    throw new Error(`Login failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const headersWithSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const firstSetCookie = headersWithSetCookie.getSetCookie?.()[0] ?? response.headers.get('set-cookie');
  const cookie = getCookiePair(firstSetCookie);
  if (!cookie) throw new Error('Login succeeded but Set-Cookie header missing');
  return cookie;
}

async function createSession(): Promise<string> {
  const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
  const store = new InternalAssistantStoreService();
  const session = await store.createSession({
    title: 'Smoke test',
    mode: 'localMachine',
    memoryEnabled: true,
  });
  return session.id;
}

async function probe(baseUrl: string, cookie: string): Promise<void> {
  const response = await fetch(`${baseUrl}/internal/ai-assistant/probe`, {
    redirect: 'manual',
    headers: { cookie },
  });
  if (response.status === 302) {
    throw new Error('Probe redirected to login (auth cookie was not accepted)');
  }
  if (response.status !== 200) {
    const body = await response.text().catch(() => '');
    throw new Error(`Probe failed (${response.status}): ${body.slice(0, 200)}`);
  }
}

async function stream(baseUrl: string, cookie: string, sessionId: string): Promise<void> {
  const response = await fetch(`${baseUrl}/internal/ai-assistant/chat/stream`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      message: 'Smoke test ping',
      target: 'localMachine',
      clientRequestId: `smoke-${Date.now()}`,
    }),
  });

  if (response.status === 302) {
    throw new Error('Stream redirected to login (auth cookie was not accepted)');
  }
  if (response.status !== 200 || !response.body) {
    const body = await response.text().catch(() => '');
    throw new Error(`Stream start failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const reader = response.body.getReader();
  let combined = '';
  for (let i = 0; i < 20; i += 1) {
    const { done, value } = await reader.read();
    if (done) break;
    combined += new TextDecoder().decode(value);
    if (combined.includes('event: done') || combined.includes('event: error')) break;
  }
  await reader.cancel();
  if (!combined.includes('event: ready')) {
    throw new Error('Stream did not emit SSE ready event');
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.password) {
    throw new Error('Missing INTERNAL_ADMIN_PASSWORD (or pass --password)');
  }

  const cookie = await login(options.baseUrl, options.password);
  await probe(options.baseUrl, cookie);

  if (options.withStream) {
    const sessionId = await createSession();
    await stream(options.baseUrl, cookie, sessionId);
  }

  console.info(
    `[smoke-internal-ai] ok base=${options.baseUrl} probe=pass stream=${options.withStream ? 'pass' : 'skipped'}`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke-internal-ai] failed: ${message}`);
  process.exit(1);
});
