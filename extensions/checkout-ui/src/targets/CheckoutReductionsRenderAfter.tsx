import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.reductions.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
