import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.order-status.payment-details.render-after';

export default async function extension() {
  mountCaTarget(TARGET);
}
