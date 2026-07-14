/**
 * Pre-publish Theme Check gate (035, plan Phase 3b).
 *
 * Compiled native-section Liquid (`sections/superapp-*.liquid`, produced by
 * renderNativeSection) is written verbatim into a MERCHANT's live theme. Before
 * 035 the only pre-write checks were Zod-shape + op-safety + a `{% schema %}`
 * JSON parse (theme-files.server `validateSectionSchema`); no Liquid/HTML/theme
 * semantics validation ran. This module runs Shopify's own Theme Check
 * (`@shopify/theme-check-node`) on the compiled Liquid so a malformed section
 * (unclosed tag, invalid schema setting type, parser-blocking script, …) is
 * caught at publish rather than shipped to the storefront.
 *
 * Design notes:
 *  - Medium: Theme Check's node entrypoint reads a filesystem theme root, so we
 *    materialize the compiled files into a throwaway temp dir (one dir per call →
 *    safe under concurrent publishes) and run `check(root)` once for all files.
 *    A `locales/en.default.json` stub is written so the translation checks don't
 *    error out reading a non-existent `locales/` dir. The library's Liquid-docs
 *    manager memoizes in-process, so warm calls are ~3x faster than the first.
 *  - Config: the repo's ONLY `.theme-check.yml` lives under
 *    extensions/theme-app-extension and extends the `theme_app_extension` preset
 *    — that preset is for app blocks and would flag a `sections/` file as an
 *    invalid location, so it is deliberately NOT reused here. We validate against
 *    Theme Check's default (recommended) config, which is the correct rule set
 *    for a section destined for a real Online Store 2.0 theme.
 *  - Severity split: `error` offenses are the block signal; `warning`/`info` are
 *    advisory and always non-blocking.
 *  - Failure-safety: a timeout or a library crash NEVER blocks publish — the call
 *    resolves with `degraded: true` and empty offenses so the caller can log +
 *    audit and proceed. The gate protects; it must not brick publishing.
 */
import { check, Severity } from '@shopify/theme-check-node';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** A compiled Liquid file about to be written to a theme. `path` is theme-relative (e.g. `sections/superapp-hero.liquid`). */
export interface CompiledLiquidFile {
  path: string;
  content: string;
}

export type ThemeCheckSeverity = 'error' | 'warning' | 'info';

export interface ThemeCheckOffense {
  /** Theme Check rule id, e.g. `LiquidHTMLSyntaxError`, `ValidSchema`. */
  check: string;
  message: string;
  /** Theme-relative file the offense is in, e.g. `sections/superapp-hero.liquid`. */
  file: string;
  /** 1-indexed line, when available. */
  line?: number;
  severity: ThemeCheckSeverity;
}

export interface ThemeCheckResult {
  /** `error`-severity offenses — the publish-blocking set (when the gate is blocking). */
  errors: ThemeCheckOffense[];
  /** `warning`/`info` offenses — advisory, never blocking. */
  warnings: ThemeCheckOffense[];
  /**
   * True when Theme Check could not run (timeout / library crash). Offenses are
   * empty in this mode; the caller must treat it as "unable to validate" and
   * proceed WITHOUT blocking (degrade to warn + audit), never as a pass or a fail.
   */
  degraded: boolean;
  degradedReason?: string;
}

/** Hard ceiling for a single gate run; on overrun we degrade to warn-only. */
const THEME_CHECK_TIMEOUT_MS = 15_000;

function severityLabel(sev: Severity): ThemeCheckSeverity {
  if (sev === Severity.ERROR) return 'error';
  if (sev === Severity.WARNING) return 'warning';
  return 'info';
}

/** Convert a Theme Check offense `uri` (a file:// URI under the temp root) to a theme-relative path. */
function toRelativeFile(uri: string, rootDir: string): string {
  let p = uri;
  try {
    p = uri.startsWith('file:') ? decodeURIComponent(new URL(uri).pathname) : uri;
  } catch {
    // fall through with the raw uri
  }
  const rel = path.relative(rootDir, p);
  return rel && !rel.startsWith('..') ? rel : path.basename(p);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => never): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`theme-check timed out after ${ms}ms`)), ms);
    // Do not keep the event loop alive on account of this timer.
    timer.unref?.();
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  // (onTimeout is only referenced for type-narrowing symmetry; the race rejects.)
  void onTimeout;
}

async function runThemeCheck(files: CompiledLiquidFile[]): Promise<ThemeCheckResult> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'superapp-theme-check-'));
  try {
    // Stub locale so translation checks don't crash reading a missing locales/ dir.
    await mkdir(path.join(rootDir, 'locales'), { recursive: true });
    await writeFile(path.join(rootDir, 'locales', 'en.default.json'), '{}', 'utf8');

    for (const file of files) {
      const abs = path.join(rootDir, file.path);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, file.content, 'utf8');
    }

    // Default (recommended) config — see module header for why the repo's
    // theme-app-extension config is intentionally not passed here.
    const offenses = await check(rootDir);

    const errors: ThemeCheckOffense[] = [];
    const warnings: ThemeCheckOffense[] = [];
    for (const o of offenses) {
      const severity = severityLabel(o.severity);
      const entry: ThemeCheckOffense = {
        check: o.check,
        message: o.message,
        file: toRelativeFile(o.uri, rootDir),
        line: o.start?.line,
        severity,
      };
      if (severity === 'error') errors.push(entry);
      else warnings.push(entry);
    }
    return { errors, warnings, degraded: false };
  } finally {
    await rm(rootDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Run Theme Check on compiled Liquid files. Resolves to a structured error/warning
 * split; NEVER rejects — a timeout or library crash resolves with `degraded: true`
 * so a publish is never bricked by the gate's own infra failure.
 */
export async function checkCompiledLiquid(
  files: CompiledLiquidFile[],
  opts: { timeoutMs?: number } = {},
): Promise<ThemeCheckResult> {
  if (files.length === 0) {
    return { errors: [], warnings: [], degraded: false };
  }
  try {
    return await withTimeout(
      runThemeCheck(files),
      opts.timeoutMs ?? THEME_CHECK_TIMEOUT_MS,
      () => {
        throw new Error('unreachable');
      },
    );
  } catch (err) {
    return {
      errors: [],
      warnings: [],
      degraded: true,
      degradedReason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** How many offenses to name in a merchant-facing error before summarizing the rest. */
const MAX_NAMED_OFFENSES = 5;

/**
 * Thrown when the Theme Check gate is blocking and the compiled Liquid has one or
 * more `error`-severity offenses. Carries the full offense list; the message names
 * the first few (rule + file + line) so a merchant/operator sees exactly what to fix.
 */
export class ThemeCheckFailedError extends Error {
  readonly code = 'THEME_CHECK_FAILED';
  constructor(readonly offenses: ThemeCheckOffense[]) {
    const named = offenses
      .slice(0, MAX_NAMED_OFFENSES)
      .map((o) => `${o.check} in ${o.file}${o.line != null ? ` (line ${o.line})` : ''}: ${o.message}`)
      .join('; ');
    const extra = offenses.length > MAX_NAMED_OFFENSES ? ` (+${offenses.length - MAX_NAMED_OFFENSES} more)` : '';
    super(
      `Publish blocked: the compiled theme section failed Theme Check with ` +
        `${offenses.length} error${offenses.length === 1 ? '' : 's'} — ${named}${extra}.`,
    );
    this.name = 'ThemeCheckFailedError';
  }
}
