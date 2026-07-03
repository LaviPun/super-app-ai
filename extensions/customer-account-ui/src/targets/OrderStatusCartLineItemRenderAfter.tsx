import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.order-status.cart-line-item.render-after';

export default async function extension() {
  mountCaTarget(TARGET);
}
