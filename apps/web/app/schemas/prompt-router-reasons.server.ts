/**
 * Stable reason codes for prompt router decisions (observability + logs).
 * Avoid long free-form reasoning in production paths.
 */
export const PROMPT_ROUTER_REASON_CODES = [
  'router_decision',
  'deterministic_high_confidence',
  'deterministic_medium_confidence',
  'deterministic_low_confidence',
  'deterministic_confidence_gating',
  'deterministic_low_confidence_gating',
  'internal_router_ok',
  'internal_router_clamped',
  'internal_router_module_type_corrected',
  'internal_router_schema_reject',
  'internal_router_timeout',
  'internal_router_http_error',
  'internal_router_circuit_open',
  'internal_router_shadow_only',
  'internal_router_canary_skip',
  'security_filter_triggered',
] as const;

export type PromptRouterReasonCode = (typeof PROMPT_ROUTER_REASON_CODES)[number];
