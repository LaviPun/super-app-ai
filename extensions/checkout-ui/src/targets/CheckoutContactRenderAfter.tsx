import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.checkout.contact.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
