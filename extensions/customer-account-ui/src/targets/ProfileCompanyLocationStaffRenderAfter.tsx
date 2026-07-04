import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.profile.company-location-staff.render-after';

export default async function extension() {
  mountCaTarget(TARGET);
}
