import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.order-status.announcement.render';

export default async function extension() {
  mountCaTarget(TARGET);
}
