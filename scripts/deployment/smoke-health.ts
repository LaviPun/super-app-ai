#!/usr/bin/env tsx

type ProbeTarget = {
  name: string;
  baseUrl: string;
  paths: string[];
};

function parseTargets(): ProbeTarget[] {
  const apiBase = process.env.API_BASE_URL ?? process.env.SMOKE_API_BASE_URL ?? 'http://127.0.0.1:3001';
  const workerBase = process.env.WORKER_BASE_URL ?? process.env.SMOKE_WORKER_BASE_URL ?? 'http://127.0.0.1:8080';

  return [
    { name: 'api', baseUrl: apiBase.replace(/\/$/, ''), paths: ['/health', '/ready'] },
    { name: 'workers', baseUrl: workerBase.replace(/\/$/, ''), paths: ['/health', '/ready'] },
  ];
}

async function probe(target: ProbeTarget, path: string): Promise<void> {
  const url = `${target.baseUrl}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) {
    throw new Error(`${target.name} ${path} returned ${res.status} (${url})`);
  }
  const body = (await res.json()) as { ok?: boolean; service?: string };
  if (body.ok !== true) {
    throw new Error(`${target.name} ${path} payload missing ok=true (${url})`);
  }
  if (body.service && body.service !== target.name) {
    throw new Error(`${target.name} ${path} expected service=${target.name}, got ${body.service}`);
  }
}

async function main(): Promise<void> {
  const targets = parseTargets();
  for (const target of targets) {
    for (const path of target.paths) {
      await probe(target, path);
    }
  }
  console.log(JSON.stringify({ ok: true, targets: targets.map((t) => t.name) }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
