import { MigrationSurfacePage } from '@/components/MigrationSurfacePage';
import { getV2RouteShell } from '@/routes/legacy-route-map';

export default function DataPage() {
  return <MigrationSurfacePage route={getV2RouteShell('merchant', 'Data models')} />;
}
