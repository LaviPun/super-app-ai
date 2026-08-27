import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findClusters } from '../../scripts/lib/cluster-fingerprint.mjs';

const TEMPLATES_ROOT = join(__dirname, '..', 'templates');

function allTemplateFiles(): string[] {
  const dirs = ['modules', 'blocks', 'sections'];
  return dirs.flatMap((d) =>
    readdirSync(join(TEMPLATES_ROOT, d))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => join(TEMPLATES_ROOT, d, f)),
  );
}

/** id -> relative source file, same convention the dedupe scripts use. */
function buildFileIndex(): Map<string, string> {
  const index = new Map<string, string>();
  for (const file of allTemplateFiles()) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/id:\s*'([^']+)',/g)) {
      if (m[1]) index.set(m[1], relative(TEMPLATES_ROOT, file));
    }
  }
  return index;
}

describe('template library integrity (WS-H)', () => {
  it('no template hardcodes both text AND background in a colors block (Tmpl-2)', () => {
    const offenders: string[] = [];
    for (const file of allTemplateFiles()) {
      const src = readFileSync(file, 'utf8');
      const blocks = src.match(/colors:\s*\{[^}]*\}/g) ?? [];
      for (const b of blocks) {
        if (/text:.*background:|background:.*text:/.test(b)) offenders.push(`${file}: ${b}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every *ImageUrl/*VideoUrl demo field uses a recognizably-placeholder domain (Tmpl-3 — so the Liquid partial's detection always fires)", () => {
    const offenders: string[] = [];
    for (const file of allTemplateFiles()) {
      const src = readFileSync(file, 'utf8');
      const urlFields = src.match(/(?:Image|Video|Poster)Url:\s*'https?:\/\/[^']*'/g) ?? [];
      for (const f of urlFields) {
        if (!/example\.com|cdn\.shopify\.com\/s\/files\//.test(f)) offenders.push(`${file}: ${f}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no genuine copy-variant cluster exceeds 4 members (Tmpl dedupe, fix round 1: same-file + identity-preserving fingerprint)', async () => {
    const { ALL_TEMPLATES } = await import('../templates/index.js');
    const fileIndex = buildFileIndex();
    const templatesWithFile = ALL_TEMPLATES.filter((t) => fileIndex.has(t.id)).map((t) => ({
      ...t,
      file: fileIndex.get(t.id)!,
    }));
    const oversized = findClusters(templatesWithFile).filter((c) => c.length > 4);
    expect(
      oversized,
      JSON.stringify(oversized.map((c) => c.map((t) => t.id))),
    ).toEqual([]);
  });

  it('every RECIPE_SPEC_TYPE still has at least one template after dedupe (coverage floor)', async () => {
    const { ALL_TEMPLATES } = await import('../templates/index.js');
    const { RECIPE_SPEC_TYPES } = await import('../allowed-values.js');
    const coveredTypes = new Set<string>(ALL_TEMPLATES.map((t) => t.spec.type));
    const missing = (RECIPE_SPEC_TYPES as readonly string[]).filter((t) => !coveredTypes.has(t));
    expect(missing).toEqual([]);
  });

  it('every template carries a tier (Tmpl tier-tag library)', async () => {
    const { ALL_TEMPLATES } = await import('../templates/index.js');
    const untagged = ALL_TEMPLATES.filter((t) => !t.tier).map((t) => t.id);
    expect(untagged).toEqual([]);
  });
});
