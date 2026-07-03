import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.profile.addresses.render-after';

export default async function extension() {
  mountCaTarget(TARGET);
}
