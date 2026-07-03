import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.payment-method-list.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
