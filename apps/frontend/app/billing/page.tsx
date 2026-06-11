import { MigrationSurfacePage } from '@/components/MigrationSurfacePage';
import { getV2RouteShell } from '@/routes/legacy-route-map';

export default function BillingPage() {
  return <MigrationSurfacePage route={getV2RouteShell('merchant', 'Billing')} />;
}
