import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.order-status.customer-information.render-after';

export default async function extension() {
  mountCaTarget(TARGET);
}
