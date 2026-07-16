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
  return (
    <s-badge tone={TICKET_STATUS_TONE[status] ?? 'neutral'}>
      {TICKET_STATUS_LABEL[status] ?? titleCase(status)}
    </s-badge>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <s-badge tone={SEVERITY_TONE[severity] ?? 'neutral'}>{titleCase(severity)}</s-badge>;
}
