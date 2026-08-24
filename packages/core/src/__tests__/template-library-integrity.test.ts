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
});
