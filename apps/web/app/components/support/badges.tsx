import { titleCase, type WcTone } from '~/components/merchant/polaris';

export const SEVERITY_TONE: Record<string, WcTone> = {
  critical: 'critical',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

export const TICKET_STATUS_TONE: Record<string, WcTone> = {
  OPEN: 'info',
  AI_RESPONDED: 'success',
  ESCALATED: 'warning',
  RESOLVED: 'neutral',
};

// Merchant-facing support persona: Maya is disclosed as an AI assistant (D4 —
// "instant AI answer, humans on escalation"). One place to change the name.
export const SUPPORT_AGENT_NAME = 'Maya';

// Merchant-facing status labels: honest about AI vs human authorship (D4).
export const TICKET_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  AI_RESPONDED: 'Answered by Maya (AI)',
  ESCALATED: 'With the team',
  RESOLVED: 'Resolved',
};

export function TicketStatusBadge({ status }: { status: string }) {
  return (
    <s-badge tone={TICKET_STATUS_TONE[status] ?? 'neutral'}>
      {TICKET_STATUS_LABEL[status] ?? titleCase(status)}
    </s-badge>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <s-badge tone={SEVERITY_TONE[severity] ?? 'neutral'}>{titleCase(severity)}</s-badge>;
}
