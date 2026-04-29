/**
 * DEBUG_AI_CAPTURE — env-gated raw prompt/response storage.
 *
 * When `DEBUG_AI_CAPTURE=1` we write the raw prompt, raw response, and
 * surrounding metadata for every AI client call to disk. Useful when a
 * generation regression is suspected and structured logs aren't enough.
 *
 * Output directory defaults to `./tmp/ai-debug` and is overridable with
 * `DEBUG_AI_CAPTURE_DIR`. Each capture is a single JSON file named
 * `<timestamp>-<correlationId>.json`. Sensitive values are passed through
 * the redact helpers before writing.
 *
 * This must NEVER run in production by default. Setting `DEBUG_AI_CAPTURE=1`
 * is the explicit opt-in.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { redact, redactString } from '~/services/observability/redact.server';
import { getRequestContext } from '~/services/observability/correlation.server';

export type AiDebugCapture = {
  provider: string;
  model: string;
  prompt: string;
  response: string;
  tokensIn?: number;
  tokensOut?: number;
  shopId?: string | null;
  durationMs?: number;
  errorMessage?: string;
};

let warnedDisabled = false;

export function isAiDebugCaptureEnabled(): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  return process.env.DEBUG_AI_CAPTURE === '1';
}

export async function captureAiDebug(input: AiDebugCapture): Promise<void> {
  if (!isAiDebugCaptureEnabled()) return;

  const dir = process.env.DEBUG_AI_CAPTURE_DIR?.trim() || './tmp/ai-debug';
  const ctx = getRequestContext();
  const correlationId = ctx?.correlationId ?? ctx?.requestId ?? 'no-corr';
  const ts = new Date();
  const stamp = ts.toISOString().replace(/[:.]/g, '-');
  const filename = `${stamp}_${correlationId}_${input.provider}.json`;
  const fullPath = path.resolve(dir, filename);

  const payload = {
    capturedAt: ts.toISOString(),
    requestId: ctx?.requestId ?? null,
    correlationId,
    provider: input.provider,
    model: input.model,
    shopId: input.shopId ?? null,
    durationMs: input.durationMs ?? null,
    tokensIn: input.tokensIn ?? null,
    tokensOut: input.tokensOut ?? null,
    errorMessage: input.errorMessage ? redactString(input.errorMessage) : null,
    prompt: redactString(input.prompt),
    response: redactString(input.response),
    actor: ctx?.actor ?? null,
    env: process.env.NODE_ENV ?? null,
  };

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, JSON.stringify(redact(payload), null, 2), 'utf8');
  } catch (err) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.warn(`[ai-debug-capture] failed to write ${fullPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
