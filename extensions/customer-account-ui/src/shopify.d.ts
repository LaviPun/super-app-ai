/**
 * Minimal types for global shopify object (2026-01).
 * Run `shopify app dev` to generate a full shopify.d.ts in this directory.
 */
declare global {
  const shopify: {
    query: (
      query: string,
      options?: { variables?: Record<string, unknown> }
    ) => Promise<{ data?: unknown; errors?: unknown[] }>;
  };
}

/** Polaris web components (s-*) for JSX */
declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      's-stack': { gap?: string; direction?: string; [key: string]: unknown };
      's-heading': { [key: string]: unknown };
      's-text': { [key: string]: unknown };
      's-link': { href?: string; [key: string]: unknown };
      's-badge': { tone?: string; [key: string]: unknown };
      's-separator': { [key: string]: unknown };
    }
  }
}

export {};
