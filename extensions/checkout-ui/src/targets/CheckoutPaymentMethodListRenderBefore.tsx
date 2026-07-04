import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.payment-method-list.render-before';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
