import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.pickup-location-list.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
