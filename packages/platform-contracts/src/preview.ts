import { z } from 'zod';

/** CSP applied to sandboxed preview HTML responses (no scripts, no external JS). */
export const PREVIEW_SANDBOX_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none';";

/** Iframe sandbox attribute for the Next.js preview shell. */
export const PREVIEW_IFRAME_SANDBOX = '';

export const PreviewPolicyMetadataSchema = z.object({
  csp: z.string().min(1),
  sandbox: z.string(),
  liquidAllowed: z.literal(false),
  scriptsAllowed: z.literal(false),
});

export const PreviewEnvelopeSchema = z.object({
  shopId: z.string().min(1),
  moduleId: z.string().min(1),
  revisionId: z.string().min(1).optional(),
  version: z.string().min(1),
  recipeSpecRef: z.string().min(1).optional(),
  renderConfig: z.record(z.unknown()).optional(),
  themeContext: z.record(z.unknown()).optional(),
  allowedAssets: z.array(z.string()).default([]),
  policy: PreviewPolicyMetadataSchema,
  storageKey: z.string().min(1),
  contentType: z.enum(['text/html', 'application/json']),
  assetId: z.string().min(1),
});

export const PreviewQuerySchema = z.object({
  shopId: z.string().min(1),
  moduleId: z.string().min(1),
  revisionId: z.string().min(1).optional(),
  assetId: z.string().min(1).default('preview_module_1'),
});

export type PreviewPolicyMetadata = z.infer<typeof PreviewPolicyMetadataSchema>;
export type PreviewEnvelope = z.infer<typeof PreviewEnvelopeSchema>;
export type PreviewQuery = z.infer<typeof PreviewQuerySchema>;

export function defaultPreviewPolicy(): PreviewPolicyMetadata {
  return {
    csp: PREVIEW_SANDBOX_CSP,
    sandbox: PREVIEW_IFRAME_SANDBOX,
    liquidAllowed: false,
    scriptsAllowed: false,
  };
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function buildAssetStorageKey(input: {
  shopId: string;
  moduleId: string;
  revisionId?: string;
  folder: 'images' | 'previews';
  assetId: string;
  extension: string;
}): string {
  const revisionSegment = input.revisionId ? `/revisions/${safePathSegment(input.revisionId)}` : '';
  return [
    'shops',
    safePathSegment(input.shopId),
    'modules',
    safePathSegment(input.moduleId),
    `${revisionSegment}/${input.folder}/${safePathSegment(input.assetId)}.${input.extension}`.replace(/^\//, ''),
  ].join('/');
}

export function buildPreviewStorageKey(input: {
  shopId: string;
  moduleId: string;
  revisionId?: string;
  assetId: string;
  contentType: 'text/html' | 'application/json';
}): string {
  const extension = input.contentType === 'text/html' ? 'html' : 'json';
  return buildAssetStorageKey({
    ...input,
    folder: 'previews',
    extension,
  });
}

export function assertPreviewContentIsRecipeSafe(body: string): void {
  if (/<script[\s>]/i.test(body) || /\son[a-z]+\s*=/i.test(body) || /javascript:/i.test(body)) {
    throw new Error(
      'Preview artifacts must be RecipeSpec/config-safe and cannot include scripts or inline event handlers.',
    );
  }
}
