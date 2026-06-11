import { MigrationSurfacePage } from '@/components/MigrationSurfacePage';
import { getV2RouteShell } from '@/routes/legacy-route-map';

export default function InternalMonitoringPage() {
  return <MigrationSurfacePage route={getV2RouteShell('internal', 'Monitoring')} />;
}
