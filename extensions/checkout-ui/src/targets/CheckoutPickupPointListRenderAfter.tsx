import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.pickup-point-list.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
