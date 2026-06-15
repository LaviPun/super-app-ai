import { RECIPE_SPEC_TYPES, type ModuleType } from '@superapp/core';

/**
 * Schema-bound output invariant (WS2 / 023).
 *
 * A RecipeSpec is a Zod discriminated union keyed on `type`. If the model emits
 * an unknown `type` (or one that contradicts the requested type), repairing is
 * pointless and unsafe — repair tries to coerce the body into a schema the model
 * already declared it isn't targeting. Such responses are **rejected, not
 * repaired**. This guard runs before `RecipeSpecSchema.parse` so the caller can
 * short-circuit its repair/retry loop.
 */
export class RecipeDiscriminatorError extends Error {
  readonly code = 'RECIPE_DISCRIMINATOR_REJECTED';
  constructor(message: string) {
    super(message);
    this.name = 'RecipeDiscriminatorError';
  }
}

const KNOWN_TYPES = new Set<string>(RECIPE_SPEC_TYPES);

export function isKnownModuleType(value: unknown): value is ModuleType {
  return typeof value === 'string' && KNOWN_TYPES.has(value);
}

/**
 * Throw {@link RecipeDiscriminatorError} when the candidate's `type` is missing,
 * unknown, or (when `expectedType` is given) mismatched. Returns silently when
 * the discriminator is acceptable.
 */
export function assertKnownDiscriminator(candidate: unknown, expectedType?: ModuleType): void {
  if (!candidate || typeof candidate !== 'object') {
    throw new RecipeDiscriminatorError('AI response is not a RecipeSpec object.');
  }
  const type = (candidate as { type?: unknown }).type;
  if (typeof type !== 'string') {
    throw new RecipeDiscriminatorError('AI response is missing a string "type" discriminator.');
  }
  if (!KNOWN_TYPES.has(type)) {
    throw new RecipeDiscriminatorError(
      `AI emitted an unknown module type "${type}" — rejected (not a RECIPE_SPEC_TYPES discriminator).`,
    );
  }
  if (expectedType && type !== expectedType) {
    throw new RecipeDiscriminatorError(
      `AI emitted type "${type}" but "${expectedType}" was required — rejected.`,
    );
  }
}
