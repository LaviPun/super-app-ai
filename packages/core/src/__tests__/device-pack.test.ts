import { describe, it, expect } from 'vitest';
import { DevicePackSchema, devicePack, DEVICE_MOBILE_COLUMNS } from '../control-packs/packs/device.pack.js';
import { RecipeSpecSchema } from '../recipe.js';

/**
 * V-A A7 — per-device visibility pack. The pack is the vocabulary FACE of the
 * module-root sa-hide-* classes (see device.pack.ts for the responsive-vs-pack
 * decision); these tests lock its schema + that it pins onto theme.section AND
 * proxy.widget as an optional, back-compatible `config.device`.
 */
describe('device pack schema', () => {
  it('defaults desktop + mobile to true (show everywhere) and leaves mobileColumns unset', () => {
    const parsed = DevicePackSchema.parse({});
    expect(parsed).toEqual({ desktop: true, mobile: true });
    expect(parsed.mobileColumns).toBeUndefined();
  });

  it('accepts hide flags + a 1|2 mobileColumns override', () => {
    expect(DevicePackSchema.parse({ desktop: false, mobile: true }).desktop).toBe(false);
    expect(DevicePackSchema.parse({ mobileColumns: 2 }).mobileColumns).toBe(2);
    expect(DEVICE_MOBILE_COLUMNS).toEqual([1, 2]);
  });

  it('rejects a mobileColumns outside {1,2}', () => {
    expect(DevicePackSchema.safeParse({ mobileColumns: 3 }).success).toBe(false);
    expect(DevicePackSchema.safeParse({ mobileColumns: 0 }).success).toBe(false);
  });

  it('is registered as a basic pack under the `device` namespace', () => {
    expect(devicePack.id).toBe('device');
    expect(devicePack.namespace).toBe('device');
    expect(devicePack.tier).toBe('basic');
  });
});

describe('device pack pins onto theme.section + proxy.widget (optional, back-compat)', () => {
  const base = {
    category: 'STOREFRONT_UI',
    requires: [],
    placement: {},
  };

  it('theme.section accepts config.device', () => {
    const r = RecipeSpecSchema.safeParse({
      ...base,
      type: 'theme.section',
      name: 'Device Test',
      config: { kind: 'hero', activation: 'section', fields: {}, blocks: [], device: { desktop: true, mobile: false, mobileColumns: 2 } },
    });
    expect(r.success).toBe(true);
  });

  it('proxy.widget accepts config.device', () => {
    const r = RecipeSpecSchema.safeParse({
      ...base,
      type: 'proxy.widget',
      name: 'Device Test',
      config: { widgetId: 'my-widget', mode: 'HTML', title: 'Widget', device: { mobile: false } },
    });
    expect(r.success).toBe(true);
  });

  it('absent device still validates (back-compat)', () => {
    const r = RecipeSpecSchema.safeParse({
      ...base,
      type: 'theme.section',
      name: 'Device Test',
      config: { kind: 'hero', activation: 'section', fields: {}, blocks: [] },
    });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data.config as { device?: unknown }).device).toBeUndefined();
  });
});
