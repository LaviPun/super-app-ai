import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEPLOYED_FUNCTION_EXTENSION_HANDLES } from '~/services/publish/deployed-extensions.server';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..'); // apps/web/app/__tests__ → repo root

/** Handles of type="function" extensions actually listed in shopify.app.production.toml extension_directories. */
function functionHandlesFromAppToml(): string[] {
  const appToml = readFileSync(join(REPO_ROOT, 'shopify.app.production.toml'), 'utf8');
  const dirs = [...appToml.matchAll(/^\s*"(extensions\/[^"]+)",?\s*$/gm)].map((m) => m[1]!);
  const handles: string[] = [];
  for (const dir of dirs) {
    const extToml = readFileSync(join(REPO_ROOT, dir, 'shopify.extension.toml'), 'utf8');
    if (!/^type\s*=\s*"function"/m.test(extToml)) continue;
    const h = extToml.match(/^handle\s*=\s*"([^"]+)"/m)?.[1];
    if (h) handles.push(h);
  }
  return handles.sort();
}

describe('deployed-function manifest ↔ shopify.app.production.toml consistency (WS-E finding 6)', () => {
  it('every deploy-listed function extension is in the manifest, and vice versa', () => {
    const fromToml = functionHandlesFromAppToml();
    const fromManifest = [...DEPLOYED_FUNCTION_EXTENSION_HANDLES].sort();
    // Set equality both ways so drift in EITHER direction fails the build.
    expect(fromManifest).toEqual(fromToml);
  });
});
