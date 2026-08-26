import { z } from 'zod';
import { RecipeSpecSchema, type RecipeSpec } from '@superapp/core';

export const PREVIEW_ENVELOPE_VERSION = '1.0' as const;

export const PREVIEW_SANDBOX_DIRECTIVES = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "img-src https: data:",
  "style-src 'unsafe-inline'",
  "font-src data:",
  "script-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
] as const;

export const PREVIEW_IFRAME_SANDBOX = '' as const;
export const PREVIEW_CSP = PREVIEW_SANDBOX_DIRECTIVES.join('; ');

const PreviewSurfaceSchema = z.enum([
  'generic',
  'product',
  'collection',
  'cart',
  'checkout',
  'postPurchase',
  'customer',
]);

export type PreviewSurface = z.infer<typeof PreviewSurfaceSchema>;

const HttpAssetUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'data:';
  }, 'Preview assets must use https: or data: URLs');

const PreviewPolicySchema = z.object({
  csp: z.literal(PREVIEW_CSP),
  iframeSandbox: z.literal(PREVIEW_IFRAME_SANDBOX),
  allowScripts: z.literal(false),
  allowForms: z.literal(false),
  allowSameOrigin: z.literal(false),
  allowPopups: z.literal(false),
  renderer: z.literal('generated-preview-artifact'),
});

export type PreviewPolicy = z.infer<typeof PreviewPolicySchema>;

const PreviewRenderConfigSchema = z.object({
  kind: z.enum(['HTML', 'JSON']),
  artifactId: z.string().min(16).max(96),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export type PreviewRenderConfig = z.infer<typeof PreviewRenderConfigSchema>;

export const PreviewEnvelopeSchema = z
  .object({
    version: z.literal(PREVIEW_ENVELOPE_VERSION),
    recipeSpec: RecipeSpecSchema,
    compiledRenderConfig: PreviewRenderConfigSchema,
    policy: PreviewPolicySchema,
    allowedAssets: z.array(HttpAssetUrlSchema).max(25),
    themeContext: z.object({
      surface: PreviewSurfaceSchema,
      shopDomain: z.string().max(255).optional(),
    }),
  })
  .strict();

export type PreviewEnvelope = z.infer<typeof PreviewEnvelopeSchema>;

export type PreviewArtifact =
  | {
      id: string;
      kind: 'HTML';
      html: string;
      envelope: PreviewEnvelope;
    }
  | {
      id: string;
      kind: 'JSON';
      json: unknown;
      envelope: PreviewEnvelope;
    };

export class PreviewSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreviewSafetyError';
  }
}

export function assertGeneratedPreviewHtmlIsSafe(html: string) {
  const lower = html.toLowerCase();
  const blockedPatterns = [
    '<script',
    'javascript:',
    'onerror=',
    'onclick=',
    'onload=',
    'onsubmit=',
    '<iframe',
    '<object',
    '<embed',
    '<link',
    '<meta http-equiv',
    '{{',
    '{%',
  ];
  const match = blockedPatterns.find((pattern) => lower.includes(pattern));
  if (match) {
    throw new PreviewSafetyError(`Unsafe preview artifact rejected: ${match}`);
  }
}

export function assertPreviewSpecIsSafe(spec: RecipeSpec) {
  const blocked = findUnsafeValue(spec);
  if (blocked) {
    throw new PreviewSafetyError(`Unsafe preview input rejected: ${blocked}`);
  }
}

function findUnsafeValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('<script')) return '<script';
    if (lower.includes('javascript:')) return 'javascript:';
    if (lower.includes('{{') || lower.includes('{%')) return 'liquid';
    if (looksLikeUrl(value)) {
      const protocol = new URL(value).protocol;
      if (protocol !== 'https:' && protocol !== 'data:') return `asset protocol ${protocol}`;
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const blocked = findUnsafeValue(item);
      if (blocked) return blocked;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      const blocked = findUnsafeValue(item);
      if (blocked) return blocked;
    }
  }

  return null;
}

function looksLikeUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
