import { mkdtemp, rm } from 'node:fs/promises';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalStorageAdapter } from '~/services/assets/storage/local-storage-adapter.server';
import { createImageStorageProcessor } from '~/services/assets/image-storage.server';
import { WorkerEventSchema } from '~/services/assets/worker-events.server';

describe('image storage worker processor (ported from apps/workers, V2 salvage D2/C5)', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('emits worker lifecycle events on successful preview export', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'superapp-worker-preview-'));
    const processor = createImageStorageProcessor({
      storage: new LocalStorageAdapter({ rootDir: tempDir }),
      now: () => new Date('2026-05-19T09:00:00.000Z'),
    });

    const output = await processor({
      id: 'job_preview_1',
      queueName: 'asset-storage',
      payload: {
        type: 'PREVIEW_EXPORT',
        jobId: 'job_preview_1',
        shopId: 'shop_1',
        moduleId: 'module_1',
        assetId: 'preview_1',
        preview: {
          contentType: 'text/html',
          body: '<section>RecipeSpec-safe preview</section>',
        },
      },
      trace: { correlationId: 'corr_preview_1', shopId: 'shop_1' },
    });

    expect(output.status).toBe('SUCCESS');
    expect(output.events.map((event) => event.type)).toEqual([
      'JOB_STARTED',
      'JOB_PROGRESS',
      'JOB_PROGRESS',
      'JOB_COMPLETED',
    ]);
    for (const event of output.events) {
      expect(WorkerEventSchema.safeParse(event).success).toBe(true);
    }
    expect(output.result).toMatchObject({
      status: 'succeeded',
      assets: [{ id: 'preview_1', kind: 'exported_preview' }],
    });
  });

  it('returns FAILED status and JOB_FAILED when payload validation fails', async () => {
    const processor = createImageStorageProcessor();
    const output = await processor({
      id: 'job_bad',
      queueName: 'asset-storage',
      payload: { type: 'IMAGE_INGESTION', jobId: 'job_bad' },
      trace: { correlationId: 'corr_bad' },
    });

    expect(output.status).toBe('FAILED');
    expect(output.events.at(-1)?.type).toBe('JOB_FAILED');
    expect(output.events.at(-1)?.message).toMatch(/invalid/i);
  });
});

// Matches only an actual import/require specifier (quoted module string), not
// prose mentions of the package name in comments or test descriptions —
// this file's own describe/it titles reference the package name in prose.
const WORKERS_IMPORT_SPECIFIER = /['"]@superapp\/workers['"]/;

function scan(dir: string, hits: string[]) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'build' || name === '.cache') continue;
    if (statSync(p).isDirectory()) scan(p, hits);
    else if (/\.(ts|tsx)$/.test(name) && WORKERS_IMPORT_SPECIFIER.test(readFileSync(p, 'utf8'))) hits.push(p);
  }
}

it('apps/web no longer imports the V2 @superapp/workers package (V2 delete-safety, D2)', () => {
  const hits: string[] = [];
  scan(join(__dirname, '..'), hits); // app/
  scan(join(__dirname, '../../scripts'), hits);
  expect(hits).toEqual([]);
});
