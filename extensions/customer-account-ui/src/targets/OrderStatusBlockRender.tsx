import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.order-status.block.render';

export default async function extension() {
  mountCaTarget(TARGET);
}
