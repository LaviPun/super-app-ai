/**
 * Extract the flowId embedded in a job's serialized payload, if present.
 * Returns null for empty, non-JSON, or flowId-less payloads.
 */
export function payloadFlowId(payload: string | null): string | null {
  if (!payload) return null;
  try {
    const p = JSON.parse(payload) as { flowId?: unknown };
    return typeof p?.flowId === 'string' ? p.flowId : null;
  } catch {
    return null;
  }
}
