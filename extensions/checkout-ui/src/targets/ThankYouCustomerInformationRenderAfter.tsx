import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.thank-you.customer-information.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
