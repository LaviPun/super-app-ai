import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.thank-you.footer.render-after';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
