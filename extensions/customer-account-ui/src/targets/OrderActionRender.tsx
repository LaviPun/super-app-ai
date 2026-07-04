import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.order.action.render';

export default async function extension() {
  mountCaTarget(TARGET);
}
