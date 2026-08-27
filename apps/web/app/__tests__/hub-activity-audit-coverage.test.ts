import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const ROUTES_TO_CHECK = ['apps/web/app/routes/internal.integrations.tsx', 'apps/web/app/routes/internal.ai-providers.tsx'];

describe('Hub mutation intents are audited', () => {
  for (const route of ROUTES_TO_CHECK) {
    it(`every mutating intent branch in ${route} calls activity.log`, () => {
      const src = readFileSync(join(REPO_ROOT, route), 'utf8');
      const blocks = [...src.matchAll(/if \(intent === '(\w+)'\) \{([\s\S]*?)\n  \}/g)];
      // Sanity: this static-analysis test only guards something if it actually
      // found intent branches — an empty match list would pass vacuously and
      // silently stop guarding anything if the file's brace style ever drifts.
      expect(blocks.length, `No 'if (intent === ...) { ... }' blocks matched in ${route} — regex may be stale against the file's actual style`).toBeGreaterThan(0);

      const unaudited = blocks
        .filter(([, name]) => !name!.startsWith('get') && name !== 'noop')
        .filter(([, , body]) => !/activity\.log\(/.test(body!))
        .map(([, name]) => name);
      expect(unaudited, `Unaudited intents in ${route}: ${unaudited.join(', ')}`).toEqual([]);
    });
  }
});
