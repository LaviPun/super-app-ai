import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.block.render';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
