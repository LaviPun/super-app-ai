import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.order-status.unfulfilled-items.render-after';

export default async function extension() {
  mountCaTarget(TARGET);
}
