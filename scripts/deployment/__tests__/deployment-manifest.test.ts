import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { deploymentManifest, DeploymentManifestSchema } from '../deployment-manifest.js';

const repoRoot = resolve(import.meta.dirname, '../../..');

describe('deployment manifest', () => {
  it('parses and references existing config artifacts', () => {
    const manifest = DeploymentManifestSchema.parse(deploymentManifest);
    expect(manifest.targets.map((t) => t.service)).toEqual([
      'frontend',
      'api',
      'workers',
      'internal-router',
      'legacy-remix',
    ]);

    for (const target of manifest.targets) {
      for (const file of target.configFiles) {
        expect(existsSync(resolve(repoRoot, file)), file).toBe(true);
      }
    }
  });

  it('requires redis-backed queue env for api and workers', () => {
    const api = deploymentManifest.targets.find((t) => t.service === 'api');
    const workers = deploymentManifest.targets.find((t) => t.service === 'workers');
    expect(api?.env.some((row) => row.name === 'QUEUE_REDIS_URL' && row.required)).toBe(true);
    expect(workers?.env.some((row) => row.name === 'QUEUE_REDIS_URL' && row.required)).toBe(true);
  });
});
