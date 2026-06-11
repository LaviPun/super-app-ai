import { PREVIEW_SHELL_CSP, buildPreviewContentUrl, buildPreviewEnvelopeUrl } from '../../src/lib/preview-sandbox';

type PreviewPageProps = {
  params: Promise<{ shopId: string; moduleId: string }>;
  searchParams: Promise<{ revisionId?: string; assetId?: string }>;
};

type PreviewEnvelope = {
  shopId: string;
  moduleId: string;
  revisionId?: string;
  version: string;
  policy: { sandbox: string; csp: string; liquidAllowed: false; scriptsAllowed: false };
  contentType: string;
  assetId: string;
};

async function loadEnvelope(input: {
  shopId: string;
  moduleId: string;
  revisionId?: string;
  assetId?: string;
}): Promise<{ envelope: PreviewEnvelope | null; error?: string }> {
  try {
    const response = await fetch(buildPreviewEnvelopeUrl(input), { cache: 'no-store' });
    if (response.status === 404) {
      return { envelope: null, error: 'Preview artifact not found. Export a preview via PREVIEW_EXPORT first.' };
    }
    if (!response.ok) {
      return { envelope: null, error: 'Unable to load preview envelope.' };
    }
    return { envelope: (await response.json()) as PreviewEnvelope };
  } catch {
    return { envelope: null, error: 'Preview API is unreachable.' };
  }
}

export default async function PreviewSandboxPage({ params, searchParams }: PreviewPageProps) {
  const { shopId, moduleId } = await params;
  const query = await searchParams;
  const previewParams = {
    shopId,
    moduleId,
    revisionId: query.revisionId,
    assetId: query.assetId,
  };

  const { envelope, error } = await loadEnvelope(previewParams);
  const contentUrl = buildPreviewContentUrl(previewParams);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: '1rem' }}>
      <meta httpEquiv="Content-Security-Policy" content={PREVIEW_SHELL_CSP} />
      <header style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: '0 0 0.5rem' }}>Preview sandbox</h1>
        <p style={{ margin: 0, color: '#444' }}>
          RecipeSpec-only preview shell — no Liquid, no merchant scripts. Publish remains a separate audited step.
        </p>
        {envelope ? (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
            v{envelope.version} · {envelope.contentType} · asset {envelope.assetId}
          </p>
        ) : null}
      </header>

      {error ? (
        <p role="alert" style={{ color: '#a40000' }}>
          {error}
        </p>
      ) : (
        <iframe
          title={`Preview ${shopId}/${moduleId}`}
          src={contentUrl}
          sandbox={envelope?.policy.sandbox ?? ''}
          style={{
            width: '100%',
            minHeight: '70vh',
            border: '1px solid #ddd',
            borderRadius: 8,
            background: '#fff',
          }}
        />
      )}
    </main>
  );
}
