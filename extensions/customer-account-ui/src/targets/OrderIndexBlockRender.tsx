import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.order-index.block.render';

export default async function extension() {
  mountCaTarget(TARGET);
}
