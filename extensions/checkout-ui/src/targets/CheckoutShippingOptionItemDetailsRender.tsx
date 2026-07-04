import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.shipping-option-item.details.render';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
