import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.order.action.menu-item.render';

export default async function extension() {
  mountCaTarget(TARGET);
}
