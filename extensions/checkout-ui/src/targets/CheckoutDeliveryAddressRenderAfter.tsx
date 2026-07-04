import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.delivery-address.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
