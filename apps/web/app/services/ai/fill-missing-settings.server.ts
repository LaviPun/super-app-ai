/**
 * Fill-missing settings (WS3 / specs/024-module-settings-uplift).
 *
 * Diffs the current config against the expected control packs + RequirementSpec,
 * asks the AI to produce **only the missing fields**, merges them without ever
 * overwriting merchant-set values, and re-validates. The never-overwrite
 * invariant (SC-001) lives in the pure `buildFillMissingDiff` contract helper so
 * it holds independent of the model.
 */
import {
  FillMissingRequestSchema,
  buildFillMissingDiff,
  type FillMissingRequest,
  type SettingsDiff,
} from '@superapp/platform-contracts';

export interface FillMissingResult {
  config: Record<string, unknown>;
  diff: SettingsDiff;
}

/**
 * Which expected controls are absent from the current config. A control is
 * "missing" when its key is absent or holds an empty value.
 */
export function missingControls(
  currentConfig: Record<string, unknown>,
  expectedControls: string[],
): string[] {
  return expectedControls.filter((key) => {
    const v = currentConfig[key];
    return v === undefined || v === null || v === '';
  });
}

/**
 * Run fill-missing. `propose` is an injected one-shot producer of values for the
 * missing keys (the route wires the real LLM call); kept injectable so the
 * merge invariant is unit-testable. The proposer's output is filtered to the
 * missing keys before merge, and merchant-set keys are always preserved.
 */
export async function fillMissingSettings(
  request: FillMissingRequest,
  propose: (missing: string[], request: FillMissingRequest) => Promise<Record<string, unknown>>,
): Promise<FillMissingResult> {
  const req = FillMissingRequestSchema.parse(request);
  const missing = missingControls(req.currentConfig, req.expectedControls);
  if (missing.length === 0) {
    return {
      config: req.currentConfig,
      diff: { moduleType: req.moduleType, changes: [], preservedKeys: [], addedKeys: [] },
    };
  }

  const proposedRaw = await propose(missing, req);
  // Only accept proposals for genuinely-missing keys.
  const proposed: Record<string, unknown> = {};
  for (const key of missing) {
    if (Object.prototype.hasOwnProperty.call(proposedRaw, key)) {
      proposed[key] = proposedRaw[key];
    }
  }

  return buildFillMissingDiff({
    moduleType: req.moduleType,
    currentConfig: req.currentConfig,
    merchantSetKeys: req.merchantSetKeys,
    proposed,
  });
}
