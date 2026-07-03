import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.footer.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
