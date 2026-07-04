import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.shipping-option-list.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
