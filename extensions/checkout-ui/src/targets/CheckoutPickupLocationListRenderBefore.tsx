import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.pickup-location-list.render-before';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
