import { json } from '@remix-run/node';
import type { PreviewArtifact } from './preview-contracts';
import {
  PREVIEW_CSP,
  PREVIEW_IFRAME_SANDBOX,
  type PreviewEnvelope,
  type PreviewSurface,
} from './preview-contracts';

export function previewArtifactHeaders(envelope?: PreviewEnvelope) {
  const headers = new Headers({
    'cache-control': 'no-store',
    'content-security-policy': envelope?.policy.csp ?? PREVIEW_CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'x-superapp-preview-policy': 'sandboxed-generated-artifact',
  });
  return headers;
}

export function previewArtifactResponse(artifact: PreviewArtifact): Response {
  if (artifact.kind === 'JSON') {
    return json(
      {
        envelope: artifact.envelope,
        json: artifact.json,
      },
      { headers: previewArtifactHeaders(artifact.envelope) },
    );
  }

  const headers = previewArtifactHeaders(artifact.envelope);
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(artifact.html, { headers });
}

export function previewShellResponse(input: {
  title: string;
  artifactUrl: string;
  surface: PreviewSurface;
  envelope?: PreviewEnvelope;
}): Response {
  return new Response(renderPreviewShell(input), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'self'; frame-src 'self'; img-src https: data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-superapp-preview-policy': 'sandbox-shell',
    },
  });
}

function renderPreviewShell(input: {
  title: string;
  artifactUrl: string;
  surface: PreviewSurface;
  envelope?: PreviewEnvelope;
}) {
  const policy = input.envelope?.policy;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(input.title)} Preview</title>
    <style>
      body { margin: 0; font-family: Instrument Sans, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f6f8fb; color: #111827; }
      .top { height: 56px; background: #1f3a5f; color: #fff; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 16px; font-size: 14px; }
      .badge { display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,.38); border-radius: 9999px; padding: 4px 9px; font-size: 12px; }
      .hero { background: #fff; border-bottom: 1px solid #dce3ec; padding: 18px 16px; }
      .hero h1 { margin: 0 0 6px; font-size: 20px; }
      .hero p { margin: 0; color: #6b7280; font-size: 13px; }
      .canvas { max-width: 1160px; margin: 24px auto; background: #fff; border: 1px solid #dce3ec; border-radius: 12px; overflow: hidden; }
      iframe { width: 100%; height: 560px; border: 0; display: block; background: #fff; }
      .meta { max-width: 1160px; margin: 0 auto 24px; display: grid; gap: 8px; color: #6b7280; font-size: 12px; }
      code { font-family: IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #111827; }
    </style>
  </head>
  <body>
    <div class="top">
      <span>Merchant storefront simulation</span>
      <span class="badge">Sandboxed preview</span>
    </div>
    <div class="hero">
      <h1>${esc(input.title)}</h1>
      <p>Surface: ${esc(input.surface)}. Generated preview artifacts only; no arbitrary Liquid or script execution.</p>
    </div>
    <div class="canvas">
      <iframe
        title="${escAttr(input.title)} generated preview"
        src="${escAttr(input.artifactUrl)}"
        sandbox="${escAttr(PREVIEW_IFRAME_SANDBOX)}"
        referrerpolicy="no-referrer"
      ></iframe>
    </div>
    <div class="meta">
      <div>Renderer: <code>${esc(policy?.renderer ?? 'generated-preview-artifact')}</code></div>
      <div>Script policy: <code>allowScripts=${String(policy?.allowScripts ?? false)}</code></div>
      <div>CSP: <code>${esc(policy?.csp ?? '')}</code></div>
      <div>Artifact: <code>${esc(input.envelope?.compiledRenderConfig.artifactId ?? 'local')}</code></div>
    </div>
  </body>
</html>`;
}

function esc(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escAttr(input: string) {
  return esc(input);
}
