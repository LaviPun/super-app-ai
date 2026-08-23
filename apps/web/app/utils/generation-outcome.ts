export type StreamOutcomeInput = {
  /** At least one `option` frame arrived and rendered. */
  gotAny: boolean;
  /** The server sent a terminal `error` SSE frame (it ran and finished — retrying is a NEW billable request). */
  sawErrorFrame: boolean;
  /** The SSE transport itself failed (fetch rejected / !res.ok / no body) — the stream leg billed nothing. */
  transportFailed: boolean;
};

export type StreamNextStep = 'proceed' | 'show-retry' | 'batch-fallback';

/**
 * What the generate UI does after the stream ends (WS-QF / AI-2). A server
 * terminal error means the generation RAN and failed — auto-refiring the batch
 * route would silently start a second billable request, so the merchant gets an
 * honest retry UI instead. The batch fallback survives only for transport
 * failure, where the stream request never generated (and billed 0).
 */
export function nextStepAfterStream(o: StreamOutcomeInput): StreamNextStep {
  if (o.gotAny) return 'proceed';
  if (o.sawErrorFrame) return 'show-retry';
  if (o.transportFailed) return 'batch-fallback';
  return 'show-retry';
}
