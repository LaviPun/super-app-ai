import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.order-status.cart-line-list.render-after';

export default async function extension() {
  mountCaTarget(TARGET);
}
