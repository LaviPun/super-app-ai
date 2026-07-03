import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.profile.company-details.render-after';

export default async function extension() {
  mountCaTarget(TARGET);
}
