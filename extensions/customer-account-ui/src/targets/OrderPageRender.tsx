import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.order.page.render';

export default async function extension() {
  mountCaTarget(TARGET);
}
