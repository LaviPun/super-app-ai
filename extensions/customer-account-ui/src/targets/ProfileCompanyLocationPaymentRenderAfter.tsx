import { mountCaTarget } from '../lib/mount';

const TARGET = 'customer-account.profile.company-location-payment.render-after';

export default async function extension() {
  mountCaTarget(TARGET);
}
