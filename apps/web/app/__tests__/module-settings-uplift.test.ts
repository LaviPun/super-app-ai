import { describe, expect, it, vi } from 'vitest';
import { FillMissingRequestSchema } from '@superapp/platform-contracts';
import {
  fillMissingSettings,
  missingControls,
} from '~/services/ai/fill-missing-settings.server';

describe('WS3 fill-missing settings', () => {
  it('identifies absent/empty controls', () => {
    const missing = missingControls(
      { heading: 'Hi', delaySeconds: '', cta: null },
      ['heading', 'delaySeconds', 'cta', 'schedule'],
    );
    expect(missing).toEqual(['delaySeconds', 'cta', 'schedule']);
  });

  it('SC-001: never overwrites merchant-set fields', async () => {
    const propose = vi.fn().mockResolvedValue({ delaySeconds: 5, schedule: 'always', heading: 'AI' });
    const { config, diff } = await fillMissingSettings(
      FillMissingRequestSchema.parse({
        moduleId: 'm1',
        moduleType: 'theme.section',
        currentConfig: { heading: 'Merchant heading' },
        expectedControls: ['heading', 'delaySeconds', 'schedule'],
        merchantSetKeys: ['heading'],
      }),
      propose,
    );
    expect(config.heading).toBe('Merchant heading');
    expect(config.delaySeconds).toBe(5);
    // heading is never even offered to the proposer, so it is preserved implicitly.
    expect(diff.addedKeys).not.toContain('heading');
    // proposer must only be asked for missing keys
    expect(propose).toHaveBeenCalledWith(['delaySeconds', 'schedule'], expect.anything());
  });

  it('drops proposed values for keys that were not missing', async () => {
    const propose = vi.fn().mockResolvedValue({ delaySeconds: 9, heading: 'sneaky' });
    const { config } = await fillMissingSettings(
      FillMissingRequestSchema.parse({
        moduleId: 'm1',
        moduleType: 'theme.section',
        currentConfig: { heading: 'Keep me' },
        expectedControls: ['heading', 'delaySeconds'],
        merchantSetKeys: [],
      }),
      propose,
    );
    expect(config.heading).toBe('Keep me');
    expect(config.delaySeconds).toBe(9);
  });

  it('no-ops (no proposer call) when nothing is missing', async () => {
    const propose = vi.fn();
    const { diff } = await fillMissingSettings(
      FillMissingRequestSchema.parse({
        moduleId: 'm1',
        moduleType: 'theme.section',
        currentConfig: { heading: 'x', cta: 'y' },
        expectedControls: ['heading', 'cta'],
      }),
      propose,
    );
    expect(propose).not.toHaveBeenCalled();
    expect(diff.changes).toEqual([]);
  });
});
