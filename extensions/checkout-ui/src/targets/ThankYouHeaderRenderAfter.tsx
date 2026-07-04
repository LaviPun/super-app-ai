import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.thank-you.header.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
