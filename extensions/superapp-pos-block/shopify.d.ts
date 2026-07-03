import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/Tile.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.home.tile.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/Modal.jsx' {
  const shopify:
    | import('@shopify/ui-extensions/pos.home.modal.render').Api
    | import('@shopify/ui-extensions/pos.product-details.action.render').Api
    | import('@shopify/ui-extensions/pos.customer-details.action.render').Api
    | import('@shopify/ui-extensions/pos.cart.line-item-details.action.render').Api
    | import('@shopify/ui-extensions/pos.order-details.action.render').Api
    | import('@shopify/ui-extensions/pos.draft-order-details.action.render').Api
    | import('@shopify/ui-extensions/pos.register-details.action.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.action.render').Api
    | import('@shopify/ui-extensions/pos.return.post.action.render').Api
    | import('@shopify/ui-extensions/pos.exchange.post.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/Block.jsx' {
  const shopify:
    | import('@shopify/ui-extensions/pos.product-details.block.render').Api
    | import('@shopify/ui-extensions/pos.customer-details.block.render').Api
    | import('@shopify/ui-extensions/pos.order-details.block.render').Api
    | import('@shopify/ui-extensions/pos.draft-order-details.block.render').Api
    | import('@shopify/ui-extensions/pos.register-details.block.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.block.render').Api
    | import('@shopify/ui-extensions/pos.return.post.block.render').Api
    | import('@shopify/ui-extensions/pos.exchange.post.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/MenuItem.jsx' {
  const shopify:
    | import('@shopify/ui-extensions/pos.product-details.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.customer-details.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.cart.line-item-details.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.order-details.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.draft-order-details.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.register-details.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.return.post.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.exchange.post.action.menu-item.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/Receipt.jsx' {
  const shopify:
    | import('@shopify/ui-extensions/pos.receipt-header.block.render').Api
    | import('@shopify/ui-extensions/pos.receipt-footer.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/Observer.js' {
  const shopify:
    | import('@shopify/ui-extensions/pos.cart-update.event.observe').Api
    | import('@shopify/ui-extensions/pos.transaction-complete.event.observe').Api
    | import('@shopify/ui-extensions/pos.cash-tracking-session-start.event.observe').Api
    | import('@shopify/ui-extensions/pos.cash-tracking-session-complete.event.observe').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/usePosConfig.js' {
  const shopify:
    | import('@shopify/ui-extensions/pos.home.tile.render').Api
    | import('@shopify/ui-extensions/pos.home.modal.render').Api
    | import('@shopify/ui-extensions/pos.product-details.block.render').Api
    | import('@shopify/ui-extensions/pos.product-details.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.product-details.action.render').Api
    | import('@shopify/ui-extensions/pos.customer-details.block.render').Api
    | import('@shopify/ui-extensions/pos.customer-details.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.customer-details.action.render').Api
    | import('@shopify/ui-extensions/pos.cart.line-item-details.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.cart.line-item-details.action.render').Api
    | import('@shopify/ui-extensions/pos.order-details.block.render').Api
    | import('@shopify/ui-extensions/pos.order-details.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.order-details.action.render').Api
    | import('@shopify/ui-extensions/pos.draft-order-details.block.render').Api
    | import('@shopify/ui-extensions/pos.draft-order-details.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.draft-order-details.action.render').Api
    | import('@shopify/ui-extensions/pos.register-details.block.render').Api
    | import('@shopify/ui-extensions/pos.register-details.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.register-details.action.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.block.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.action.render').Api
    | import('@shopify/ui-extensions/pos.return.post.block.render').Api
    | import('@shopify/ui-extensions/pos.return.post.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.return.post.action.render').Api
    | import('@shopify/ui-extensions/pos.exchange.post.block.render').Api
    | import('@shopify/ui-extensions/pos.exchange.post.action.menu-item.render').Api
    | import('@shopify/ui-extensions/pos.exchange.post.action.render').Api
    | import('@shopify/ui-extensions/pos.receipt-header.block.render').Api
    | import('@shopify/ui-extensions/pos.receipt-footer.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/posBehavior.js' {
  const shopify:
    | import('@shopify/ui-extensions/pos.home.tile.render').Api
    | import('@shopify/ui-extensions/pos.home.modal.render').Api
    | import('@shopify/ui-extensions/pos.product-details.block.render').Api
    | import('@shopify/ui-extensions/pos.product-details.action.render').Api
    | import('@shopify/ui-extensions/pos.customer-details.block.render').Api
    | import('@shopify/ui-extensions/pos.customer-details.action.render').Api
    | import('@shopify/ui-extensions/pos.cart.line-item-details.action.render').Api
    | import('@shopify/ui-extensions/pos.order-details.block.render').Api
    | import('@shopify/ui-extensions/pos.order-details.action.render').Api
    | import('@shopify/ui-extensions/pos.draft-order-details.block.render').Api
    | import('@shopify/ui-extensions/pos.draft-order-details.action.render').Api
    | import('@shopify/ui-extensions/pos.register-details.block.render').Api
    | import('@shopify/ui-extensions/pos.register-details.action.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.block.render').Api
    | import('@shopify/ui-extensions/pos.purchase.post.action.render').Api
    | import('@shopify/ui-extensions/pos.return.post.block.render').Api
    | import('@shopify/ui-extensions/pos.return.post.action.render').Api
    | import('@shopify/ui-extensions/pos.exchange.post.block.render').Api
    | import('@shopify/ui-extensions/pos.exchange.post.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}
