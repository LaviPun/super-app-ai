import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.order-index.announcement.render';

export default async function extension() {
  mountCaTarget(TARGET);
}
