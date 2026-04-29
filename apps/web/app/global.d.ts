/// <reference types="react" />

declare namespace JSX {
  interface IntrinsicElements {
    // Shopify App Bridge custom elements
    's-app-nav': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  }
}
