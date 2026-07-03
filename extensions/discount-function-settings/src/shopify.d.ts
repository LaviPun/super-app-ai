/**
 * JSX type declarations for the Polaris admin web components (`s-*`) this discount
 * function-settings extension renders (API 2026-04, Preact stack). The Shopify admin
 * host registers the full component set at runtime; locally we declare the subset we
 * use (mirroring the 2026-04 prop names) since the per-target augmentations don't
 * resolve under `moduleResolution: bundler`. `[key: string]: unknown` keeps each
 * element permissive for attributes we don't type explicitly.
 *
 * `s-function-settings` is the REQUIRED root element for the
 * admin.discount-details.function-settings.render target. `s-number-field` /
 * `s-text-field` / `s-checkbox` / `s-select` are the field controls; each maps a
 * settings value onto the `$app/function-configuration` metafield via its `name`.
 */
declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      's-function-settings': { onSave?: () => void; [key: string]: unknown };
      's-section': { heading?: string; padding?: string; [key: string]: unknown };
      's-box': { padding?: string; display?: string; [key: string]: unknown };
      's-stack': { gap?: string; direction?: string; [key: string]: unknown };
      's-divider': { [key: string]: unknown };
      's-text': { type?: string; color?: string; tone?: string; [key: string]: unknown };
      's-heading': { [key: string]: unknown };
      's-paragraph': { [key: string]: unknown };
      's-banner': { heading?: string; tone?: string; [key: string]: unknown };
      's-text-field': {
        label?: string;
        name?: string;
        value?: string;
        defaultValue?: string;
        onChange?: (event: Event) => void;
        [key: string]: unknown;
      };
      's-number-field': {
        label?: string;
        name?: string;
        value?: string;
        defaultValue?: string;
        onChange?: (event: Event) => void;
        [key: string]: unknown;
      };
      's-checkbox': {
        label?: string;
        name?: string;
        checked?: boolean;
        defaultChecked?: boolean;
        onChange?: (event: Event) => void;
        [key: string]: unknown;
      };
      's-select': {
        label?: string;
        name?: string;
        value?: string;
        defaultValue?: string;
        onChange?: (event: Event) => void;
        [key: string]: unknown;
      };
      's-option': { value?: string; [key: string]: unknown };
    }
  }
}

/**
 * The subset of the Discount Function Settings API (`admin.discount-details.
 * function-settings.render`) we read off the global `shopify` object: the discount
 * `id` and its existing `metafields`, so the form can hydrate from saved values.
 */
declare global {
  const shopify: {
    data?: {
      id?: string;
      metafields?: Array<{ namespace?: string; key?: string; value?: string; type?: string }>;
    };
  };
}

export {};
