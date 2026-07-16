/// <reference types="react" />
// Polaris web components (s-page, s-section, s-button, …) JSX typings.
// The package augments both the global JSX namespace and 'react' JSX.
/// <reference types="@shopify/polaris-types" />
// NOTE: @shopify/app-bridge-types is deliberately NOT referenced — it augments
// React's global ButtonHTMLAttributes (variant: 'primary'|'breadcrumb'), which
// conflicts with the vendored superapp Btn used by the internal admin.

declare namespace JSX {
  interface IntrinsicElements {
    // Shopify App Bridge custom elements not covered by polaris-types
    's-app-nav': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  }
}
