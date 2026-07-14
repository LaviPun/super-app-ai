import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDocsIndex, findDocsDir, searchDocs } from '~/services/ai/app-docs-index.server';

const ARCHIVE_SENTINEL = 'SENTINEL_ARCHIVE_MUST_NOT_APPEAR';

let root: string;
let docsDir: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'appdocs-'));
  docsDir = join(root, 'docs');
  mkdirSync(join(docsDir, 'runbooks'), { recursive: true });
  mkdirSync(join(docsDir, 'archive'), { recursive: true });

  writeFileSync(join(docsDir, '_glossary.md'), '# Glossary\n## Terms\nBaseline facts.\n');

  writeFileSync(
    join(docsDir, 'alpha.md'),
    [
      '# Alpha',
      '## Plan tiers',
      'Plan tiers control quota and features. Basic and Plus tiers differ in quota.',
      '## Other topic',
      'This section only mentions plan tiers once in the body and nothing else relevant.',
    ].join('\n'),
  );

  // A doc with an oversized section body to exercise the excerpt char cap.
  writeFileSync(
    join(docsDir, 'big.md'),
    ['# Big', '## Plan tiers deep dive', `Plan tiers ${'quota '.repeat(400)}`].join('\n'),
  );

  writeFileSync(
    join(docsDir, 'runbooks', 'publish.md'),
    ['# Publish runbook', '## Publish failure', 'When a publish job fails check the DLQ and logs.'].join('\n'),
  );

  // Must be excluded from the index.
  writeFileSync(
    join(docsDir, 'archive', 'old.md'),
    ['# Archived', '## Plan tiers legacy', `Old plan tiers info ${ARCHIVE_SENTINEL}.`].join('\n'),
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('findDocsDir', () => {
  it('finds the docs dir by walking up to the _glossary.md marker', () => {
    expect(findDocsDir(join(docsDir, 'runbooks'))).toBe(docsDir);
    expect(findDocsDir(root)).toBe(docsDir);
  });

  it('returns null when no docs corpus is present', () => {
    const empty = mkdtempSync(join(tmpdir(), 'nodocs-'));
    try {
      expect(findDocsDir(empty)).toBeNull();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('buildDocsIndex', () => {
  it('indexes top-level docs and runbooks, excluding archive', () => {
    const index = buildDocsIndex(docsDir);
    const docPaths = new Set(index.map((s) => s.docPath));
    expect(docPaths.has('docs/alpha.md')).toBe(true);
    expect(docPaths.has('docs/runbooks/publish.md')).toBe(true);
    // archive is never indexed
    expect([...docPaths].some((p) => p.includes('archive'))).toBe(false);
    expect(index.some((s) => s.body.includes(ARCHIVE_SENTINEL))).toBe(false);
    // sections split on headings
    expect(index.some((s) => s.heading === 'Plan tiers' && s.docPath === 'docs/alpha.md')).toBe(true);
  });
});

describe('searchDocs', () => {
  it('ranks heading matches above body-only matches', () => {
    const index = buildDocsIndex(docsDir);
    const snippets = searchDocs(index, 'How do plan tiers work?');
    expect(snippets.length).toBeGreaterThan(0);
    // The 'Plan tiers' headed section outranks the 'Other topic' body-only mention.
    expect(snippets[0]?.heading.toLowerCase()).toContain('plan tiers');
    expect(snippets[0]?.doc).toMatch(/^docs\//);
  });

  it('enforces excerpt (<=900) and total (<=4000) char caps and top-4 count', () => {
    const index = buildDocsIndex(docsDir);
    const snippets = searchDocs(index, 'plan tiers quota publish failure logs');
    expect(snippets.length).toBeLessThanOrEqual(4);
    for (const s of snippets) {
      expect(s.excerpt.length).toBeLessThanOrEqual(900);
    }
    const total = snippets.reduce((sum, s) => sum + s.excerpt.length, 0);
    expect(total).toBeLessThanOrEqual(4000);
  });

  it('returns nothing for a corpus with no term matches', () => {
    const index = buildDocsIndex(docsDir);
    expect(searchDocs(index, 'zzznonsensetokenxyz')).toEqual([]);
  });
});
