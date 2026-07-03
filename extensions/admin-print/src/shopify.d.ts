/**
 * JSX type declarations for the Polaris admin web components (`s-*`) this admin-print
 * extension renders (API 2026-04, Preact stack). The Shopify admin host registers the
 * full component set at runtime; locally we declare the subset we use (mirroring the
 * 2026-04 prop names) since the per-target augmentations don't resolve under
 * `moduleResolution: bundler`. `[key: string]: unknown` keeps each permissive.
 *
 * `s-admin-print-action` is the print-action wrapper: setting its `src` to a URL (the
 * app's /admin-print/document route) makes that document the print preview; the host's
 * Print button prints it.
 */
declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      's-admin-print-action': { src?: string | null; [key: string]: unknown };
      's-stack': { gap?: string; direction?: string; [key: string]: unknown };
      's-box': { padding?: string; [key: string]: unknown };
      's-text': { type?: string; color?: string; tone?: string; [key: string]: unknown };
      's-heading': { [key: string]: unknown };
      's-paragraph': { [key: string]: unknown };
      's-checkbox': {
        label?: string;
        name?: string;
        checked?: boolean;
        onChange?: (event: Event) => void;
        [key: string]: unknown;
      };
      's-banner': { heading?: string; tone?: string; [key: string]: unknown };
      's-select': {
        label?: string;
        name?: string;
        value?: string;
        onChange?: (event: Event) => void;
        [key: string]: unknown;
      };
      's-option': { value?: string; [key: string]: unknown };
    }
  }
}

/**
 * The subset of the Print Action Extension API we read off the global `shopify` object:
 * the selected resource(s), so the print `src` can be parameterized by the resource id.
 */
declare global {
  const shopify: {
    data?: {
      selected?: Array<{ id?: string }>;
    };
  };
}

export {};
