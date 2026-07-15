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

// Merchant-facing support persona: first-line (AI-drafted) replies are shown under
// this name. One place to change it; picked for cross-market pronounceability/trust.
export const SUPPORT_AGENT_NAME = 'Maya';

// Merchant-facing status labels: support reads as a human team, so no "AI" wording.
export const TICKET_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  AI_RESPONDED: 'Answered',
  ESCALATED: 'With the team',
  RESOLVED: 'Resolved',
};

export function TicketStatusBadge({ status }: { status: string }) {
  return <Badge tone={TICKET_STATUS_TONE[status]}>{TICKET_STATUS_LABEL[status] ?? titleCase(status)}</Badge>;
}
