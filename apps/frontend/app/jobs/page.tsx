import { AsyncJobUxShowcase } from '@/components/AsyncJobUxShowcase';
import { MigrationSurfacePage } from '@/components/MigrationSurfacePage';
import { getV2RouteShell } from '@/routes/legacy-route-map';

export default function JobsPage() {
  const route = getV2RouteShell('merchant', 'Jobs');

  return (
    <>
      <MigrationSurfacePage route={route} />
      <AsyncJobUxShowcase />
    </>
  );
}
