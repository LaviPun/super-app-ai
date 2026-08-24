import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blankStrings } from '../../scripts/lib/cluster-fingerprint.mjs';

const TEMPLATES_ROOT = join(__dirname, '..', 'templates');

function allTemplateFiles(): string[] {
  const dirs = ['modules', 'blocks', 'sections'];
  return dirs.flatMap((d) =>
    readdirSync(join(TEMPLATES_ROOT, d))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => join(TEMPLATES_ROOT, d, f)),
  );
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

  it('no structural-duplicate cluster exceeds 4 members (Tmpl dedupe)', async () => {
    const { ALL_TEMPLATES } = await import('../templates/index.js');
    const groups = new Map<string, string[]>();
    for (const t of ALL_TEMPLATES) {
      const key = t.spec.type + '::' + JSON.stringify(blankStrings(t.spec.config));
      const bucket = groups.get(key);
      if (bucket) bucket.push(t.id);
      else groups.set(key, [t.id]);
    }
    const oversized = [...groups.entries()].filter(([, ids]) => ids.length > 4);
    expect(oversized, JSON.stringify(oversized.map(([, ids]) => ids))).toEqual([]);
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
