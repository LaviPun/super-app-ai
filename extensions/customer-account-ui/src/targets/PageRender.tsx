import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.page.render';

export default async function extension() {
  mountCaTarget(TARGET);
}
