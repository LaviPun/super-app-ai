// Shared tab strip across the four log surfaces (Activity / API Logs / Error
// Logs / Audit). Renders under each page's PageHead and navigates via the admin
// ctx so the individual deep-link routes stay independent pages.
import { Tabs } from '~/components/superapp';
import { useAdminCtx } from './admin-ctx';

export type LogTab = 'activity' | 'api-logs' | 'logs' | 'audit';

const TABS: { id: LogTab; label: string; hash: string }[] = [
  { id: 'activity', label: 'Activity', hash: '#/admin/activity' },
  { id: 'api-logs', label: 'API Logs', hash: '#/admin/api-logs' },
  { id: 'logs', label: 'Error Logs', hash: '#/admin/logs' },
  { id: 'audit', label: 'Audit', hash: '#/admin/audit' },
];

export function LogTabs({ active }: { active: LogTab }) {
  const ctx = useAdminCtx();
  return (
    <div style={{ marginBottom: 14 }}>
      <Tabs
        tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
        active={active}
        onChange={(id: string) => {
          if (id === active) return;
          const tab = TABS.find((t) => t.id === id);
          if (tab) ctx.go(tab.hash);
        }}
      />
    </div>
  );
}
