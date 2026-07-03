import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/CustomerSegmentTemplateData.ts' {
  const shopify: import('@shopify/ui-extensions/admin.customers.segmentation-templates.data').Api;
  const globalThis: { shopify: typeof shopify };
}
