import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.reductions.render-before';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
