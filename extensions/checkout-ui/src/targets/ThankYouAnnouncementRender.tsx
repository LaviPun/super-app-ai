import { mountCheckoutTarget } from '../lib/mount';

const TARGET = 'purchase.thank-you.announcement.render';

export default async function extension() {
  mountCheckoutTarget(TARGET);
}
