/**
 * Tolerant JSON helpers for partial / streamed model output.
 *
 * Phase 1.4: when the LLM is streaming we want to detect "the first complete
 * top-level JSON value has arrived" so we can validate it and surface to the UI
 * without waiting for the rest of the response (where retries / second tool
 * call may still be cooking).
 *
 * No external deps — small bracket counter handles the only shapes we ever see
 * from the providers (object or `{ recipe: ... }` envelope).
 */

/**
 * Returns the first balanced JSON object/array substring in `text`, ignoring
 * whitespace and skipping past any leading prose. Returns null if no complete
 * top-level value has arrived yet.
 *
 * Tracks string boundaries and escape sequences so braces inside string
 * literals don't break the depth counter.
 */
export function extractFirstJsonValue(text: string): string | null {
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    if (!/\s/.test(c)) break;
    i++;
  }
  if (i >= text.length) return null;

  const opener = text.charAt(i);
  if (opener !== '{' && opener !== '[') return null;
  const closer = opener === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let j = i; j < text.length; j++) {
    const ch = text.charAt(j);
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) {
        return text.slice(i, j + 1);
      }
    }
  }
  return null;
}

/**
 * Parses a possibly-truncated JSON string by trimming trailing characters until
 * a parse succeeds, or returns null if no prefix parses. Useful for
 * "almost-complete" model output where the closing brace is missing because of
 * max_output_tokens — we rebalance the braces and try.
 */
export function parsePartialJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1) Best case — already valid.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  // 2) Try the first balanced sub-value if model wrapped it in prose.
  const inner = extractFirstJsonValue(trimmed);
  if (inner) {
    try {
      return JSON.parse(inner);
    } catch {
      /* fall through */
    }
  }

  // 3) Walk back from the end, lopping off trailing junk until parse works.
  for (let len = trimmed.length - 1; len > 1; len--) {
    const slice = trimmed.slice(0, len);
    try {
      return JSON.parse(slice);
    } catch {
      // keep walking
    }
  }
  return null;
}

/**
 * For streaming: returns true if the buffer already contains at least one
 * complete top-level JSON value.
 */
export function hasCompleteJsonValue(buffer: string): boolean {
  return extractFirstJsonValue(buffer) !== null;
}
