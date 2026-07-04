/**
 * JSX type declarations for the Polaris admin web components (`s-*`) used by this
 * generic admin UI extension (API 2026-04, Preact stack).
 *
 * At runtime the Shopify admin host registers the full Polaris `s-*` component set;
 * the Shopify CLI bundler loads every component regardless of TS. Locally, however,
 * `@shopify/ui-extensions/preact` only augments a small base set into
 * `preact.JSX.IntrinsicElements`, and the per-target component augmentations
 * (`import "@shopify/ui-extensions/admin.*"`) do not resolve under this
 * `moduleResolution: bundler` tsconfig. So we declare the components this extension
 * actually renders here, with just the attributes we set — mirroring the real
 * 2026-04 prop names (verified against the admin extensions docs and the
 * `@shopify/ui-extensions` d.ts). `[key: string]: unknown` keeps each permissive
 * for attributes we don't type explicitly.
 */
declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      /* Settings / containers */
      's-admin-block': { heading?: string; collapsedSummary?: string; [key: string]: unknown };
      's-admin-action': { heading?: string; loading?: boolean; [key: string]: unknown };
      's-section': { heading?: string; padding?: string; [key: string]: unknown };
      's-box': { padding?: string; background?: string; [key: string]: unknown };
      /* Layout */
      's-stack': { gap?: string; direction?: string; [key: string]: unknown };
      's-divider': { direction?: string; [key: string]: unknown };
      /* Text */
      's-text': { type?: string; color?: string; tone?: string; [key: string]: unknown };
      's-heading': { [key: string]: unknown };
      's-paragraph': { [key: string]: unknown };
      /* Interactive */
      's-link': { href?: string; tone?: string; [key: string]: unknown };
      's-button': { href?: string; tone?: string; slot?: string; onClick?: () => void; [key: string]: unknown };
      /* Feedback */
      's-badge': { tone?: string; color?: string; [key: string]: unknown };
      's-banner': { heading?: string; tone?: string; dismissible?: boolean; [key: string]: unknown };
      /* Table */
      's-table': { [key: string]: unknown };
      's-table-header-row': { [key: string]: unknown };
      's-table-header': { [key: string]: unknown };
      's-table-body': { [key: string]: unknown };
      's-table-row': { [key: string]: unknown };
      's-table-cell': { [key: string]: unknown };
      /* Media */
      's-image': { src?: string; alt?: string; [key: string]: unknown };
    }
  }
}

export {};
