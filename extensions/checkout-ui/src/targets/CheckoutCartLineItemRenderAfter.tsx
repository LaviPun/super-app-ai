import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.cart-line-item.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
