import { MigrationSurfacePage } from '@/components/MigrationSurfacePage';
import { getV2RouteShell } from '@/routes/legacy-route-map';

export default function InternalPage() {
  return <MigrationSurfacePage route={getV2RouteShell('internal', 'Dashboard')} />;
}
