const ALLOWED_DETAIL_KEYS = new Set([
  'moduleId',
  'versionId',
  'target',
  'error',
  'snapshotKey',
  'planTier',
  'blocked',
  'outcome',
]);

const MAX_STRING_LENGTH = 160;
const MAX_BLOCKED_ITEMS = 8;

function clampString(value: string): string {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
}

export function applyTelemetryBudget(input?: Record<string, unknown>): Record<string, unknown> {
  if (!input) return {};

  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!ALLOWED_DETAIL_KEYS.has(key)) continue;

    if (typeof raw === 'string') {
      output[key] = clampString(raw);
      continue;
    }

    if (key === 'blocked' && Array.isArray(raw)) {
      output[key] = raw.slice(0, MAX_BLOCKED_ITEMS).map((item) => String(item));
      continue;
    }

    output[key] = raw;
  }

  return output;
}

