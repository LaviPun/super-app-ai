import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.order-status.return-details.render-after';

export default async function extension() {
  mountCaTarget(TARGET);
}
