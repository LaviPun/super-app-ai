import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.pickup-point-list.render-before';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
