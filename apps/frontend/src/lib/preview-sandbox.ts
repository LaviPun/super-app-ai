const apiBase = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3002';

export type PreviewSandboxParams = {
  shopId: string;
  moduleId: string;
  revisionId?: string;
  assetId?: string;
};

export function buildPreviewEnvelopeUrl(params: PreviewSandboxParams): string {
  const search = new URLSearchParams();
  if (params.revisionId) search.set('revisionId', params.revisionId);
  if (params.assetId) search.set('assetId', params.assetId);
  const query = search.toString();
  return `${apiBase()}/v1/preview/${encodeURIComponent(params.shopId)}/${encodeURIComponent(params.moduleId)}/envelope${query ? `?${query}` : ''}`;
}

export function buildPreviewContentUrl(params: PreviewSandboxParams): string {
  const search = new URLSearchParams();
  if (params.revisionId) search.set('revisionId', params.revisionId);
  if (params.assetId) search.set('assetId', params.assetId);
  const query = search.toString();
  return `${apiBase()}/v1/preview/${encodeURIComponent(params.shopId)}/${encodeURIComponent(params.moduleId)}/content${query ? `?${query}` : ''}`;
}

export const PREVIEW_SHELL_CSP =
  "default-src 'none'; frame-src http: https:; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none';";
