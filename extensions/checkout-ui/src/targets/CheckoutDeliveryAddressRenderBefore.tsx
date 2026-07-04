import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.delivery-address.render-before';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
