import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.footer.render-after';

export default async function extension() {
  mountCaTarget(TARGET);
}
