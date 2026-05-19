import { MigrationSurfacePage } from '@/components/MigrationSurfacePage';
import { getV2RouteShell } from '@/routes/legacy-route-map';

export default function SettingsPage() {
  return <MigrationSurfacePage route={getV2RouteShell('merchant', 'Settings')} />;
}
