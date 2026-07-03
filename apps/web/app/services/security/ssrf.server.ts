/**
 * SSRF guard — canonical implementation lives in @superapp/network-security.
 * This module used to be a byte-identical 155-line copy that could drift;
 * it is now a re-export so web and workers share one guard.
 */
export { assertSafeTargetUrl, type AssertSafeTargetUrlOptions } from '@superapp/network-security';
