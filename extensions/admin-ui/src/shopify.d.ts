/**
 * Type declarations for Shopify Admin UI Extension runtime (2026-01, preact stack).
 * Admin block extensions run in an iframe; the host injects s-* Polaris web components
 * and the shopify:admin/api/graphql.json authenticated fetch endpoint.
 */

/** Polaris web components available in admin block extension iframes (s-*) */
declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      /* Layout */
      's-admin-block': { title?: string; [key: string]: unknown };
      's-stack': { gap?: string; direction?: string; [key: string]: unknown };
      's-inline': { gap?: string; [key: string]: unknown };
      /* Text */
      's-text': { appearance?: string; fontWeight?: string; [key: string]: unknown };
      's-heading': { [key: string]: unknown };
      /* Interactive */
      's-link': { href?: string; [key: string]: unknown };
      's-button': { [key: string]: unknown };
      /* Feedback */
      's-badge': { tone?: string; [key: string]: unknown };
      's-banner': { title?: string; tone?: string; [key: string]: unknown };
      /* Other */
      's-separator': { [key: string]: unknown };
      's-image': { src?: string; alt?: string; [key: string]: unknown };
    }
  }
}

export {};
