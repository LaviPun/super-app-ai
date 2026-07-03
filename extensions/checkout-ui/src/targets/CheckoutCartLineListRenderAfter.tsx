import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.cart-line-list.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
