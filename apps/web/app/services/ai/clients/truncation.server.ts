/**
 * WS-C Task 12. Shared, typed truncation error for every provider client.
 * Previously each client either threw an ad-hoc `Error` (OpenAI) or didn't
 * detect truncation at all (Anthropic — a `stop_reason: 'max_tokens'` reply
 * silently passed through to `JSON.parse`, which either threw a generic
 * syntax error or, worse, parsed a truncated-but-still-valid-looking prefix).
 * A distinct class lets callers (`hydrateRecipeSpec`) branch on "this failed
 * because the model ran out of room" and retry with a bumped token budget,
 * instead of burning a full billed retry on the same budget.
 */
export class TruncatedOutputError extends Error {
  readonly code = 'OUTPUT_TRUNCATED';
  constructor(
    readonly provider: string,
    readonly detail: string,
  ) {
    super(`${provider} output was truncated (${detail}). The response cannot be parsed as complete JSON.`);
    this.name = 'TruncatedOutputError';
  }
}
