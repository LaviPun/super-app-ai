import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.actions.render-before';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
