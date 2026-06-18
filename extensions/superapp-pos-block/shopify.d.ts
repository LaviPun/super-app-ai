import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/Action.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.product-details.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/Block.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.product-details.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/usePosConfig.js' {
  const shopify:
    | import('@shopify/ui-extensions/pos.product-details.action.render').Api
    | import('@shopify/ui-extensions/pos.product-details.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}
