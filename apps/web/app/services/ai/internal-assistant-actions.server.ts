/**
 * Server entry for assistant action proposals.
 *
 * All logic is pure and lives in the isomorphic `internal-assistant-actions`
 * module so the SSE producer (server) and the chat UI (client) share one
 * allowlist + validator. This `.server` barrel is the import point for
 * server-only callers (the stream route); the client imports the pure module
 * directly (Remix strips `.server` modules from the client bundle).
 */
export {
  ACTION_INTENT_ALLOWLIST,
  LINK_HREF_ALLOWED_PREFIXES,
  MAX_ACTION_PROPOSALS,
  deriveActionProposals,
  deriveLinkProposals,
  isAllowedActionIntent,
  isAllowedLinkHref,
  isLinkProposal,
  parseStoredActionProposals,
  validateActionProposal,
  type ActionProposal,
  type LinkActionProposal,
  type OpsActionProposal,
} from '~/services/ai/internal-assistant-actions';
