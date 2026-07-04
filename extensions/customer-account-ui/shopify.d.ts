import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/targets/PageRender.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.page.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderPageRender.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order.page.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/mount.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.page.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/mount.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order.page.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderIndexBlockRender.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-index.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/hooks/useBlockConfig.ts' {
  const shopify: import('@shopify/ui-extensions/customer-account.page.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/hooks/useBlockConfig.ts' {
  const shopify: import('@shopify/ui-extensions/customer-account.order.page.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderStatusBlockRender.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-status.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/components/BlockRenderer.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.page.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/components/BlockRenderer.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order.page.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/ProfileBlockRender.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.profile.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/ca-content.ts' {
  const shopify: import('@shopify/ui-extensions/customer-account.page.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/ca-content.ts' {
  const shopify: import('@shopify/ui-extensions/customer-account.order.page.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/mount.tsx' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.order-index.block.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.block.render').Api
    | import('@shopify/ui-extensions/customer-account.profile.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/ca-bindings.ts' {
  const shopify: import('@shopify/ui-extensions/customer-account.page.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/ca-bindings.ts' {
  const shopify: import('@shopify/ui-extensions/customer-account.order.page.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/hooks/useBlockConfig.ts' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.order-index.block.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.block.render').Api
    | import('@shopify/ui-extensions/customer-account.profile.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/components/BlockRenderer.tsx' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.order-index.block.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.block.render').Api
    | import('@shopify/ui-extensions/customer-account.profile.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/ca-content.ts' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.order-index.block.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.block.render').Api
    | import('@shopify/ui-extensions/customer-account.profile.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/ca-bindings.ts' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.order-index.block.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.block.render').Api
    | import('@shopify/ui-extensions/customer-account.profile.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/FooterRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.footer.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderActionMenuItemRender.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order.action.menu-item.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderActionRender.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderIndexAnnouncementRender.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-index.announcement.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderStatusAnnouncementRender.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-status.announcement.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderStatusCartLineItemRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-status.cart-line-item.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderStatusCartLineListRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-status.cart-line-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderStatusCustomerInformationRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-status.customer-information.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderStatusFulfillmentDetailsRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-status.fulfillment-details.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderStatusPaymentDetailsRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-status.payment-details.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderStatusReturnDetailsRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-status.return-details.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/OrderStatusUnfulfilledItemsRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-status.unfulfilled-items.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/ProfileAddressesRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.profile.addresses.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/ProfileAnnouncementRender.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.profile.announcement.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/ProfileCompanyDetailsRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.profile.company-details.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/ProfileCompanyLocationAddressesRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.profile.company-location-addresses.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/ProfileCompanyLocationPaymentRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.profile.company-location-payment.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/ProfileCompanyLocationStaffRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.profile.company-location-staff.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/mount.tsx' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.footer.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order.action.menu-item.render').Api
    | import('@shopify/ui-extensions/customer-account.order.action.render').Api
    | import('@shopify/ui-extensions/customer-account.order-index.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.cart-line-item.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.cart-line-list.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.customer-information.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.fulfillment-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.payment-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.return-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.unfulfilled-items.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.addresses.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-addresses.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-payment.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-staff.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/hooks/useBlockConfig.ts' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.footer.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order.action.menu-item.render').Api
    | import('@shopify/ui-extensions/customer-account.order.action.render').Api
    | import('@shopify/ui-extensions/customer-account.order-index.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.cart-line-item.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.cart-line-list.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.customer-information.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.fulfillment-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.payment-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.return-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.unfulfilled-items.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.addresses.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-addresses.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-payment.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-staff.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/components/BlockRenderer.tsx' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.footer.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order.action.menu-item.render').Api
    | import('@shopify/ui-extensions/customer-account.order.action.render').Api
    | import('@shopify/ui-extensions/customer-account.order-index.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.cart-line-item.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.cart-line-list.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.customer-information.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.fulfillment-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.payment-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.return-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.unfulfilled-items.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.addresses.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-addresses.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-payment.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-staff.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/ca-content.ts' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.footer.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order.action.menu-item.render').Api
    | import('@shopify/ui-extensions/customer-account.order.action.render').Api
    | import('@shopify/ui-extensions/customer-account.order-index.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.cart-line-item.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.cart-line-list.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.customer-information.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.fulfillment-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.payment-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.return-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.unfulfilled-items.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.addresses.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-addresses.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-payment.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-staff.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/ca-bindings.ts' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.footer.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order.action.menu-item.render').Api
    | import('@shopify/ui-extensions/customer-account.order.action.render').Api
    | import('@shopify/ui-extensions/customer-account.order-index.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.cart-line-item.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.cart-line-list.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.customer-information.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.fulfillment-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.payment-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.return-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.order-status.unfulfilled-items.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.addresses.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.announcement.render').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-details.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-addresses.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-payment.render-after').Api
    | import('@shopify/ui-extensions/customer-account.profile.company-location-staff.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}
