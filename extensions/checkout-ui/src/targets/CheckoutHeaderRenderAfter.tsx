import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.header.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
