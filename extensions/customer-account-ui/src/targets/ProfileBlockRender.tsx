import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.profile.block.render';

export default async function extension() {
  mountCaTarget(TARGET);
}
