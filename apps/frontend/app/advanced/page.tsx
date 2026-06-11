import { MigrationSurfacePage } from '@/components/MigrationSurfacePage';
import { getV2RouteShell } from '@/routes/legacy-route-map';

export default function AdvancedPage() {
  return <MigrationSurfacePage route={getV2RouteShell('merchant', 'Advanced features')} />;
}
