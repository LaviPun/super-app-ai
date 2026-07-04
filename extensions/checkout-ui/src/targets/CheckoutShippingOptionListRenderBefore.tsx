import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.shipping-option-list.render-before';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
