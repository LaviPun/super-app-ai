import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.thank-you.block.render';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
