import { Badge, titleCase } from '~/components/superapp';

export const SEVERITY_TONE: Record<string, string | undefined> = {
  critical: 'critical',
  high: 'warning',
  medium: 'info',
  low: undefined,
};

export const TICKET_STATUS_TONE: Record<string, string | undefined> = {
  OPEN: 'info',
  AI_RESPONDED: 'success',
  ESCALATED: 'warning',
  RESOLVED: undefined,
};

export function TicketStatusBadge({ status }: { status: string }) {
  return <Badge tone={TICKET_STATUS_TONE[status]}>{titleCase(status)}</Badge>;
}
