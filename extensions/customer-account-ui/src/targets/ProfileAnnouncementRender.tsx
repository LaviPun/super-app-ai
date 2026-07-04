import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.profile.announcement.render';

export default async function extension() {
  mountCaTarget(TARGET);
}
