import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/blocks/Checkout.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/blocks/ThankYou.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.thank-you.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/mount.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/mount.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.thank-you.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/hooks/useCheckoutConfig.ts' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/hooks/useCheckoutConfig.ts' {
  const shopify: import('@shopify/ui-extensions/purchase.thank-you.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/components/CheckoutBlockRenderer.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/components/CheckoutBlockRenderer.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.thank-you.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/checkout-content.ts' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/checkout-content.ts' {
  const shopify: import('@shopify/ui-extensions/purchase.thank-you.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/ThankYouAnnouncementRender.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.thank-you.announcement.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutFooterRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.footer.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/ThankYouFooterRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.thank-you.footer.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutHeaderRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.header.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/ThankYouHeaderRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.thank-you.header.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutContactRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.contact.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/ThankYouCustomerInformationRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.thank-you.customer-information.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutPickupLocationListRenderBefore.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.pickup-location-list.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutPickupLocationListRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.pickup-location-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutPickupLocationOptionItemRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.pickup-location-option-item.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutActionsRenderBefore.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.actions.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutCartLineItemRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.cart-line-item.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutCartLineListRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.cart-line-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutReductionsRenderBefore.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.reductions.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutReductionsRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.reductions.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/ThankYouCartLineItemRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.thank-you.cart-line-item.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/ThankYouCartLineListRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.thank-you.cart-line-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutPaymentMethodListRenderBefore.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutPaymentMethodListRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutPickupPointListRenderBefore.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.pickup-point-list.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutPickupPointListRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.pickup-point-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutDeliveryAddressRenderBefore.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutDeliveryAddressRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutShippingOptionItemDetailsRender.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.shipping-option-item.details.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutShippingOptionItemRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.shipping-option-item.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutShippingOptionListRenderBefore.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.shipping-option-list.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/targets/CheckoutShippingOptionListRenderAfter.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.shipping-option-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/mount.tsx' {
  const shopify:
    | import('@shopify/ui-extensions/purchase.thank-you.announcement.render').Api
    | import('@shopify/ui-extensions/purchase.checkout.footer.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.footer.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.header.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.header.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.contact.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.customer-information.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-location-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-location-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-location-option-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.actions.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.cart-line-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.cart-line-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.reductions.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.reductions.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.cart-line-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.cart-line-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-point-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-point-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-item.details.render').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/hooks/useCheckoutConfig.ts' {
  const shopify:
    | import('@shopify/ui-extensions/purchase.thank-you.announcement.render').Api
    | import('@shopify/ui-extensions/purchase.checkout.footer.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.footer.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.header.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.header.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.contact.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.customer-information.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-location-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-location-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-location-option-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.actions.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.cart-line-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.cart-line-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.reductions.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.reductions.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.cart-line-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.cart-line-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-point-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-point-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-item.details.render').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/components/CheckoutBlockRenderer.tsx' {
  const shopify:
    | import('@shopify/ui-extensions/purchase.thank-you.announcement.render').Api
    | import('@shopify/ui-extensions/purchase.checkout.footer.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.footer.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.header.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.header.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.contact.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.customer-information.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-location-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-location-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-location-option-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.actions.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.cart-line-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.cart-line-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.reductions.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.reductions.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.cart-line-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.cart-line-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-point-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-point-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-item.details.render').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/lib/checkout-content.ts' {
  const shopify:
    | import('@shopify/ui-extensions/purchase.thank-you.announcement.render').Api
    | import('@shopify/ui-extensions/purchase.checkout.footer.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.footer.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.header.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.header.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.contact.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.customer-information.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-location-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-location-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-location-option-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.actions.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.cart-line-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.cart-line-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.reductions.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.reductions.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.cart-line-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.thank-you.cart-line-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-point-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.pickup-point-list.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.delivery-address.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-item.details.render').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-item.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-list.render-before').Api
    | import('@shopify/ui-extensions/purchase.checkout.shipping-option-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}
