import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
});
