/**
 * WS-C Task 12. JSON Schema for the hydrate envelope, generated from the same
 * Zod schema (`HydrateEnvelopeSchema`) that validates the parsed response —
 * so structured output (Anthropic tool_use / OpenAI json_schema) can force
 * providers to emit a shape the Zod parse will actually accept, instead of
 * `hydrateRecipeSpec` relying on prose ("Output only the JSON") and a raw
 * `JSON.parse` that a fenced or truncated reply defeats.
 *
 * Same mechanic as `recipe-json-schema.server.ts`'s per-type schemas.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { HydrateEnvelopeSchema } from '~/schemas/hydrate-envelope.server';

let cached: { name: string; schema: Record<string, unknown> } | undefined;

export function getHydrateEnvelopeJsonSchema(): { name: string; schema: Record<string, unknown> } {
  if (!cached) {
    const schema = zodToJsonSchema(HydrateEnvelopeSchema, { $refStrategy: 'none' }) as Record<string, unknown>;
    cached = { name: 'emit_hydrate_envelope', schema };
  }
  return cached;
}
