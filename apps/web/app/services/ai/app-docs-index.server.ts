/**
 * App documentation corpus index + search for the internal assistant.
 *
 * The internal ops copilot runs against a small local model (a 4B by default),
 * so grounding it in the repo's `docs/` corpus must be cheap and bounded: a
 * lazily-built in-memory section index, keyword scoring with heading weighting,
 * and hard caps on how much text can flow into the model's context.
 *
 * Pure + injectable: `findDocsDir` / `buildDocsIndex` / `searchDocs` take
 * explicit inputs so they are unit-testable against a fixture corpus. The tool
 * wrapper (internal-assistant-tools.server.ts) uses the cached `resolveDocsDir`
 * + `getDocsIndex` helpers below.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type DocSection = { docPath: string; heading: string; body: string };
export type DocSnippet = { doc: string; heading: string; excerpt: string };

/** Skip pathologically large files — docs are prose, not data dumps. */
const MAX_FILE_BYTES = 300 * 1024;
const MAX_EXCERPT_CHARS = 900;
const MAX_TOTAL_CHARS = 4000;
const MAX_SNIPPETS = 4;
/**
 * Ranking weights. Coverage (how many *distinct* query terms a section matches)
 * dominates so that a long changelog repeating one common term ("app") never
 * out-ranks a focused section that matches the whole query; heading matches then
 * beat body-only matches, and raw body frequency is only a small tiebreak.
 */
const COVERAGE_WEIGHT = 10;
const HEADING_WEIGHT = 3;
const BODY_PRESENCE_WEIGHT = 1;
/** Directories walked, relative to the docs root. Archive is intentionally excluded. */
const INDEXED_SUBDIRS = ['', 'runbooks'];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'to', 'of', 'in', 'on', 'for', 'with', 'as', 'at', 'by', 'from', 'this',
  'that', 'these', 'those', 'it', 'its', 'do', 'does', 'did', 'how', 'what', 'why',
  'when', 'where', 'which', 'who', 'whom', 'can', 'could', 'should', 'would', 'will',
  'me', 'my', 'you', 'your', 'we', 'our', 'us', 'i', 'about', 'into', 'work', 'works',
  'please', 'tell', 'explain', 'show', 'give', 'get', 'so', 'if', 'then', 'than',
]);

/**
 * Walk up from `startCwd` (dev cwd is apps/web) looking for the repo `docs/`
 * directory, identified by its `_glossary.md` marker. Returns the docs dir path
 * or null when the corpus is not shipped (e.g. a docs-less deployment).
 */
export function findDocsDir(startCwd: string): string | null {
  let dir = startCwd;
  for (let i = 0; i < 12; i += 1) {
    const candidate = join(dir, 'docs');
    if (existsSync(join(candidate, '_glossary.md'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function toDocPath(docsDir: string, subdir: string, file: string): string {
  return subdir ? `docs/${subdir}/${file}` : `docs/${file}`;
}

/** Split a markdown document into sections keyed by `#`/`##`/`###` headings. */
function splitSections(docPath: string, raw: string): DocSection[] {
  const lines = raw.split('\n');
  const sections: DocSection[] = [];
  let heading = '(intro)';
  let body: string[] = [];
  const flush = () => {
    const text = body.join('\n').trim();
    if (text) sections.push({ docPath, heading: heading.trim(), body: text });
    body = [];
  };
  for (const line of lines) {
    const match = /^(#{1,3})\s+(.*\S)\s*$/.exec(line);
    if (match) {
      flush();
      heading = match[2] ?? heading;
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Build the section index for a docs directory. Reads top-level `docs/*.md` and
 * `docs/runbooks/*.md` (archive and other subtrees are excluded), skipping files
 * over {@link MAX_FILE_BYTES}.
 */
export function buildDocsIndex(docsDir: string): DocSection[] {
  const sections: DocSection[] = [];
  for (const subdir of INDEXED_SUBDIRS) {
    const dir = subdir ? join(docsDir, subdir) : docsDir;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.endsWith('.md')) continue;
      const full = join(dir, file);
      let raw: string;
      try {
        const stat = statSync(full);
        if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
        raw = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      sections.push(...splitSections(toDocPath(docsDir, subdir, file), raw));
    }
  }
  return sections;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !STOPWORDS.has(term));
}

function countOccurrences(haystack: string, term: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(term, from);
    if (idx === -1) break;
    count += 1;
    from = idx + term.length;
  }
  return count;
}

function scoreSection(section: DocSection, terms: string[]): number {
  const heading = section.heading.toLowerCase();
  const body = section.body.toLowerCase();
  let score = 0;
  let covered = 0;
  for (const term of terms) {
    const inHeading = heading.includes(term);
    const bodyCount = countOccurrences(body, term);
    if (!inHeading && bodyCount === 0) continue;
    covered += 1;
    if (inHeading) score += HEADING_WEIGHT;
    if (bodyCount > 0) score += BODY_PRESENCE_WEIGHT + Math.min(bodyCount, 5) * 0.1;
  }
  // Distinct-term coverage is the dominant signal.
  score += covered * COVERAGE_WEIGHT;
  return score;
}

/** Collapse whitespace and clamp a section body to at most {@link MAX_EXCERPT_CHARS}. */
function toExcerpt(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  return collapsed.length <= MAX_EXCERPT_CHARS ? collapsed : `${collapsed.slice(0, MAX_EXCERPT_CHARS - 1)}…`;
}

/**
 * Score `index` sections against `prompt` and return the top {@link MAX_SNIPPETS}
 * as snippets, each excerpt clamped to {@link MAX_EXCERPT_CHARS} and the combined
 * excerpt payload clamped to {@link MAX_TOTAL_CHARS}.
 */
export function searchDocs(index: DocSection[], prompt: string): DocSnippet[] {
  const terms = Array.from(new Set(tokenize(prompt)));
  if (terms.length === 0) return [];
  const ranked = index
    .map((section) => ({ section, score: scoreSection(section, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SNIPPETS);

  const snippets: DocSnippet[] = [];
  let total = 0;
  for (const { section } of ranked) {
    const excerpt = toExcerpt(section.body);
    if (total + excerpt.length > MAX_TOTAL_CHARS) break;
    snippets.push({ doc: section.docPath, heading: section.heading, excerpt });
    total += excerpt.length;
  }
  return snippets;
}

let cachedDocsDir: string | null | undefined;
let cachedIndex: { dir: string; sections: DocSection[] } | null = null;

/** Resolve (and cache) the repo docs dir from the process cwd. Null when absent. */
export function resolveDocsDir(): string | null {
  if (cachedDocsDir === undefined) cachedDocsDir = findDocsDir(process.cwd());
  return cachedDocsDir;
}

/** Lazily build (and cache in module scope) the section index for `docsDir`. */
export function getDocsIndex(docsDir: string): DocSection[] {
  if (cachedIndex && cachedIndex.dir === docsDir) return cachedIndex.sections;
  const sections = buildDocsIndex(docsDir);
  cachedIndex = { dir: docsDir, sections };
  return sections;
}
