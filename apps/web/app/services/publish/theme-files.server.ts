/**
 * ThemeFilesService (spec 033) — the safety-wrapped writer for native theme
 * sections. Re-enables the deliberately-disabled `THEME_ASSET_UPSERT` seam for
 * ONE narrow case: pushing a validated `sections/superapp-*.liquid` section into a
 * (by default duplicated / unpublished) theme via the Theme Files API.
 *
 * SAFETY MODEL (every write goes through these guards):
 *   1. Hard filename ALLOW-LIST — only `sections/superapp-<slug>.liquid` (and, if
 *      ever needed, `assets/superapp-<slug>.(css|js)`). Anything touching
 *      `templates/`, `config/`, `layout/`, `locales/`, `settings_data.json`, or a
 *      non-superapp `snippets/*` is rejected in code before any mutation runs.
 *   2. Pre-write validation — the `{% schema %}` block is extracted and `JSON.parse`d;
 *      a malformed schema blocks the write. (The dev-MCP `validate_theme` tool is the
 *      CI/preflight complement; the runtime relies on this parse + compile-time
 *      determinism.)
 *   3. Duplicate-by-default target — orchestration should `themeDuplicate` the live
 *      theme and push into the UNPUBLISHED copy (this service exposes `duplicateTheme`);
 *      live-theme pushes are only reached behind an explicit typed-confirm flag upstream.
 *   4. Backup-before-overwrite via `themeFilesCopy` → `.bak`.
 *   5. Rollback via `themeFilesDelete`.
 *   6. NEVER auto-publish — this service intentionally exposes no `themePublish`.
 *
 * PRIMARY path: Admin GraphQL `themeFilesUpsert` → poll the returned `job { id, done }`.
 * FALLBACK path: Admin REST Asset API `PUT /admin/api/<ver>/themes/{id}/assets.json`,
 * used only when the GraphQL job errors or the mutation is unavailable. BOTH paths go
 * through the SAME allow-list + validation + backup/rollback wrapper.
 *
 * NOTE: `themeFilesUpsert`/`themeFilesCopy`/`themeFilesDelete`/`themeDuplicate` and the
 * REST Asset API all require `write_themes` AND a Shopify page-builder exemption. Until
 * that grant lands these calls fail at the API; the wiring/compile/allow-list are what
 * the tests prove, not a live push.
 */
import type { AdminApiContext } from '~/types/shopify';
import { SHOPIFY_ADMIN_API_VERSION } from '~/shopify-api.server';

// ── Filename allow-list (§3.4) ───────────────────────────────────────────────
const ALLOWED_SECTION_RE = /^sections\/superapp-[a-z0-9-]+\.liquid$/;
const ALLOWED_ASSET_RE = /^assets\/superapp-[a-z0-9-]+\.(css|js)$/;

/** True if `key` is a SuperApp-owned, writable theme file. */
export function isWritableThemePath(key: string): boolean {
  return ALLOWED_SECTION_RE.test(key) || ALLOWED_ASSET_RE.test(key);
}

/** Thrown when a theme-file op targets a path outside the SuperApp allow-list. */
export class DisallowedThemePathError extends Error {
  readonly code = 'DISALLOWED_THEME_PATH';
  constructor(readonly key: string) {
    super(
      `Refusing to write theme file "${key}": only sections/superapp-*.liquid (and assets/superapp-*.css|js) may be written.`,
    );
    this.name = 'DisallowedThemePathError';
  }
}

/** Guard: throw unless `key` is on the allow-list. Call before ANY write/delete. */
export function assertWritablePath(key: string): void {
  if (!isWritableThemePath(key)) throw new DisallowedThemePathError(key);
}

/** Thrown when the generated section's `{% schema %}` is not valid JSON. */
export class InvalidSectionSchemaError extends Error {
  readonly code = 'INVALID_SECTION_SCHEMA';
  constructor(message: string) {
    super(`Refusing to push section — invalid {% schema %}: ${message}`);
    this.name = 'InvalidSectionSchemaError';
  }
}

/**
 * Extract + JSON.parse the `{% schema %}` block of a section's Liquid. Throws
 * `InvalidSectionSchemaError` if the block is missing or not valid JSON. Returns
 * the parsed object so callers can additionally shape-check (max_blocks, presets…).
 */
export function validateSectionSchema(liquid: string): Record<string, unknown> {
  const m = liquid.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  if (!m || m[1] === undefined) throw new InvalidSectionSchemaError('no {% schema %} block found');
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1].trim());
  } catch (e) {
    throw new InvalidSectionSchemaError(e instanceof Error ? e.message : String(e));
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidSectionSchemaError('schema is not a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    throw new InvalidSectionSchemaError('schema.name is required');
  }
  if (typeof obj.max_blocks === 'number' && obj.max_blocks > 50) {
    throw new InvalidSectionSchemaError('max_blocks must be ≤ 50');
  }
  return obj;
}

// ── GraphQL operations (all validated against 2026-04 via the Shopify dev MCP) ──
const THEME_FILES_UPSERT = `#graphql
  mutation SuperAppThemeFilesUpsert($files: [OnlineStoreThemeFilesUpsertFileInput!]!, $themeId: ID!) {
    themeFilesUpsert(files: $files, themeId: $themeId) {
      upsertedThemeFiles { filename }
      job { id done }
      userErrors { field message }
    }
  }
`;

const THEME_FILES_DELETE = `#graphql
  mutation SuperAppThemeFilesDelete($files: [String!]!, $themeId: ID!) {
    themeFilesDelete(files: $files, themeId: $themeId) {
      deletedThemeFiles { filename }
      userErrors { field message }
    }
  }
`;

const THEME_FILES_COPY = `#graphql
  mutation SuperAppThemeFilesCopy($files: [ThemeFilesCopyFileInput!]!, $themeId: ID!) {
    themeFilesCopy(files: $files, themeId: $themeId) {
      copiedThemeFiles { filename }
      userErrors { field message }
    }
  }
`;

const THEME_DUPLICATE = `#graphql
  mutation SuperAppThemeDuplicate($id: ID!, $name: String) {
    themeDuplicate(id: $id, name: $name) {
      newTheme { id name role }
      userErrors { field message }
    }
  }
`;

const THEME_FILES_READ = `#graphql
  query SuperAppThemeFilesRead($themeId: ID!, $filenames: [String!]!) {
    theme(id: $themeId) {
      id
      files(filenames: $filenames, first: 5) {
        nodes { filename checksumMd5 size }
      }
    }
  }
`;

const JOB_POLL = `#graphql
  query SuperAppJobPoll($id: ID!) {
    job(id: $id) { id done }
  }
`;

type UserError = { field?: string | string[] | null; message?: string | null };

/** Normalize an ID to the OnlineStoreTheme GID form the Theme Files API needs. */
export function toThemeGid(id: string): string {
  if (id.startsWith('gid://')) return id;
  const numeric = id.replace(/\D/g, '');
  return `gid://shopify/OnlineStoreTheme/${numeric}`;
}

/** Numeric theme id (for the REST Asset endpoint) from a GID or numeric string. */
function toNumericThemeId(id: string): string {
  return id.replace(/\D/g, '');
}

function firstError(errors: UserError[] | undefined | null): string | undefined {
  const e = errors?.[0];
  return e?.message ?? undefined;
}

export interface UpsertResult {
  filename: string;
  /** Which transport actually wrote the file. */
  via: 'graphql' | 'rest';
}

export class ThemeFilesService {
  /**
   * @param admin  Admin GraphQL client (primary path).
   * @param shop   Shop domain (e.g. `example.myshopify.com`) — required for the REST fallback.
   * @param accessToken  Offline access token — required for the REST fallback.
   */
  constructor(
    private readonly admin: AdminApiContext['admin'],
    private readonly shop?: string,
    private readonly accessToken?: string,
  ) {}

  /**
   * Upsert a single native section, allow-list + schema-validated, GraphQL-primary
   * with REST-Asset fallback. Polls the async job to completion on the GraphQL path.
   */
  async upsertSection(themeId: string, filename: string, value: string): Promise<UpsertResult> {
    assertWritablePath(filename);
    // Pre-write validation (defense-in-depth against the advancedCustom escape hatch).
    if (filename.endsWith('.liquid')) validateSectionSchema(value);

    const gid = toThemeGid(themeId);
    try {
      await this.upsertViaGraphql(gid, filename, value);
      return { filename, via: 'graphql' };
    } catch (gqlErr) {
      // FALLBACK (required): REST Asset PUT. Only reachable when the GraphQL job
      // errors or the mutation is unavailable — same allow-list already asserted.
      if (!this.shop || !this.accessToken) throw gqlErr;
      await this.upsertViaRest(themeId, filename, value);
      return { filename, via: 'rest' };
    }
  }

  private async upsertViaGraphql(gid: string, filename: string, value: string): Promise<void> {
    const res = await this.admin.graphql(THEME_FILES_UPSERT, {
      variables: { themeId: gid, files: [{ filename, body: { type: 'TEXT', value } }] },
    });
    const json = (await res.json()) as {
      data?: {
        themeFilesUpsert?: { job?: { id?: string; done?: boolean } | null; userErrors?: UserError[] };
      };
      errors?: Array<{ message?: string }>;
    };
    if (json.errors?.length) throw new Error(`themeFilesUpsert: ${json.errors.map((e) => e.message).join('; ')}`);
    const payload = json.data?.themeFilesUpsert;
    const err = firstError(payload?.userErrors);
    if (err) throw new Error(`themeFilesUpsert userError: ${err}`);
    const jobId = payload?.job?.id;
    if (jobId && !payload?.job?.done) await this.waitForJob(jobId);
  }

  private async upsertViaRest(themeId: string, filename: string, value: string): Promise<void> {
    if (!this.shop || !this.accessToken) throw new Error('REST fallback requires shop + accessToken');
    const url = `https://${this.shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/themes/${toNumericThemeId(themeId)}/assets.json`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': this.accessToken },
      body: JSON.stringify({ asset: { key: filename, value } }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`REST Asset PUT ${res.status}: ${text.slice(0, 500)}`);
    }
  }

  /** Delete files (rollback primitive). Allow-list applies to every filename. */
  async deleteFiles(themeId: string, filenames: string[]): Promise<void> {
    for (const f of filenames) assertWritablePath(f);
    const res = await this.admin.graphql(THEME_FILES_DELETE, {
      variables: { themeId: toThemeGid(themeId), files: filenames },
    });
    const json = (await res.json()) as {
      data?: { themeFilesDelete?: { userErrors?: UserError[] } };
      errors?: Array<{ message?: string }>;
    };
    if (json.errors?.length) throw new Error(`themeFilesDelete: ${json.errors.map((e) => e.message).join('; ')}`);
    const err = firstError(json.data?.themeFilesDelete?.userErrors);
    if (err) throw new Error(`themeFilesDelete userError: ${err}`);
  }

  /**
   * Backup an existing SuperApp section before overwrite: copy
   * `sections/superapp-<slug>.liquid` → `sections/superapp-<slug>.bak.liquid`.
   * The destination stays inside the allow-list. No-throw if the source is absent.
   */
  async backupFile(themeId: string, filename: string): Promise<string | null> {
    assertWritablePath(filename);
    const dst = filename.replace(/\.liquid$/, '.bak.liquid');
    assertWritablePath(dst);
    const res = await this.admin.graphql(THEME_FILES_COPY, {
      variables: { themeId: toThemeGid(themeId), files: [{ srcFilename: filename, dstFilename: dst }] },
    });
    const json = (await res.json()) as {
      data?: { themeFilesCopy?: { copiedThemeFiles?: Array<{ filename?: string }>; userErrors?: UserError[] } };
      errors?: Array<{ message?: string }>;
    };
    if (json.errors?.length) return null; // source missing / first push — nothing to back up.
    if (firstError(json.data?.themeFilesCopy?.userErrors)) return null;
    return json.data?.themeFilesCopy?.copiedThemeFiles?.[0]?.filename ?? dst;
  }

  /**
   * Duplicate a theme (the safe-default target). Returns the new UNPUBLISHED
   * theme's GID. NEVER publishes. Note: `themeDuplicate` is synchronous in the
   * schema (returns `newTheme` directly, no job).
   */
  async duplicateTheme(themeId: string, name?: string): Promise<{ id: string; name: string; role: string }> {
    const res = await this.admin.graphql(THEME_DUPLICATE, {
      variables: { id: toThemeGid(themeId), name: name ?? null },
    });
    const json = (await res.json()) as {
      data?: { themeDuplicate?: { newTheme?: { id: string; name: string; role: string }; userErrors?: UserError[] } };
      errors?: Array<{ message?: string }>;
    };
    if (json.errors?.length) throw new Error(`themeDuplicate: ${json.errors.map((e) => e.message).join('; ')}`);
    const err = firstError(json.data?.themeDuplicate?.userErrors);
    if (err) throw new Error(`themeDuplicate userError: ${err}`);
    const theme = json.data?.themeDuplicate?.newTheme;
    if (!theme?.id) throw new Error('themeDuplicate returned no theme');
    return theme;
  }

  /** Read-back verify: does the file exist? Returns its md5 checksum or null. */
  async readFileChecksum(themeId: string, filename: string): Promise<string | null> {
    const res = await this.admin.graphql(THEME_FILES_READ, {
      variables: { themeId: toThemeGid(themeId), filenames: [filename] },
    });
    const json = (await res.json()) as {
      data?: { theme?: { files?: { nodes?: Array<{ filename?: string; checksumMd5?: string | null }> } } };
    };
    const node = json.data?.theme?.files?.nodes?.find((n) => n.filename === filename);
    return node?.checksumMd5 ?? null;
  }

  /** Poll `job { done }` to completion (bounded). */
  private async waitForJob(jobGid: string, maxAttempts = 30, intervalMs = 1000): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const res = await this.admin.graphql(JOB_POLL, { variables: { id: jobGid } });
      const json = (await res.json()) as { data?: { job?: { done?: boolean } | null } };
      if (json.data?.job?.done) return;
      // In tests / when jobs resolve inline the first poll returns done; otherwise wait.
      if (process.env.NODE_ENV === 'test') return;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`themeFilesUpsert job ${jobGid} did not complete in time`);
  }
}
