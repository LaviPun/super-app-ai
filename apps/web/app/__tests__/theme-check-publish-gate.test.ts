import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RecipeSpec, DeployTarget } from '@superapp/core';

/**
 * Wiring test: PublishService runs the Theme Check gate on compiled
 * THEME_ASSET_UPSERT Liquid BEFORE any store write, and:
 *   - BLOCKS (throws ThemeCheckFailedError) on an error offense when the gate is blocking;
 *   - PROCEEDS (warn-only) when the gate flag is off;
 *   - PROCEEDS when theme-check degrades (never bricks publishing).
 *
 * The real compiler never emits invalid Liquid by construction, so compileRecipe
 * is mocked to inject a broken section — this isolates the gate wiring itself.
 */

// Mock the compiler to feed a deliberately broken native section into publish.
const mockCompile = vi.fn();
vi.mock('~/services/recipes/compiler', () => ({
  compileRecipe: (...args: unknown[]) => mockCompile(...args),
}));

// Native-section push must be ON for the gate branch to run.
vi.mock('~/env.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/env.server')>();
  return {
    ...actual,
    isThemeNativeSectionEnabled: () => true,
    isThemeCheckGateBlocking: () => gateBlocking,
  };
});

// Allow individual tests to force the degraded path without a real library crash.
vi.mock('~/services/publish/theme-check.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/services/publish/theme-check.server')>();
  return {
    ...actual,
    checkCompiledLiquid: (...args: Parameters<typeof actual.checkCompiledLiquid>) =>
      checkOverride ? checkOverride() : actual.checkCompiledLiquid(...args),
  };
});

let gateBlocking = true;
let checkOverride: null | (() => Promise<import('~/services/publish/theme-check.server').ThemeCheckResult>) = null;

import { PublishService } from '~/services/publish/publish.service';
import { ThemeCheckFailedError } from '~/services/publish/theme-check.server';
import { ThemeFilesService } from '~/services/publish/theme-files.server';

/** Sentinel thrown by the first post-gate store write, to prove execution passed the gate. */
const PAST_GATE = 'reached-theme-write-past-gate';

const THEME_SPEC = {
  type: 'theme.section',
  name: 'Gate Test',
  category: 'STOREFRONT_UI',
  requires: ['THEME_ASSETS'],
  config: { kind: 'hero', activation: 'section', title: 'Hi', fields: {}, blocks: [] },
  style: {},
} as unknown as RecipeSpec;

const TARGET: DeployTarget = { kind: 'THEME', themeId: '1', moduleId: 'mod-gate', mode: 'native_section' };

/** A bare admin stub; store writes are intercepted at ThemeFilesService instead. */
const admin = { graphql: vi.fn() } as never;

const BAD_UPSERT = {
  kind: 'THEME_ASSET_UPSERT' as const,
  themeId: '1',
  key: 'sections/superapp-bad.liquid',
  value: `<div>{% if section.settings.title != blank %}{{ section.settings.title }}</div>
{% schema %}
{ "name": "Bad", "presets": [{ "name": "Bad" }] }
{% endschema %}`,
};

beforeEach(() => {
  gateBlocking = true;
  checkOverride = null;
  mockCompile.mockReset();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PublishService — Theme Check gate wiring', () => {
  it('blocks publish (throws ThemeCheckFailedError) on an error offense, before any store write', async () => {
    mockCompile.mockReturnValue({ ops: [BAD_UPSERT] });
    const writeSpy = vi.spyOn(ThemeFilesService.prototype, 'upsertSection');
    const svc = new PublishService(admin);
    await expect(svc.publish(THEME_SPEC, TARGET)).rejects.toBeInstanceOf(ThemeCheckFailedError);
    // The gate must fire BEFORE the theme write.
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('does NOT block when the gate flag is off (warn-only), letting publish proceed to the write', async () => {
    gateBlocking = false;
    mockCompile.mockReturnValue({ ops: [BAD_UPSERT] });
    // The first post-gate action is the theme write; make it a sentinel so we can
    // assert execution reached PAST the gate rather than being blocked by it.
    vi.spyOn(ThemeFilesService.prototype, 'upsertSection').mockRejectedValue(new Error(PAST_GATE));
    const svc = new PublishService(admin);
    const err = await svc.publish(THEME_SPEC, TARGET).catch((e) => e);
    expect(err).not.toBeInstanceOf(ThemeCheckFailedError);
    expect(String(err?.message)).toContain(PAST_GATE);
  });

  it('does NOT block when theme-check degrades (library failure)', async () => {
    mockCompile.mockReturnValue({ ops: [BAD_UPSERT] });
    checkOverride = async () => ({ errors: [], warnings: [], degraded: true, degradedReason: 'simulated crash' });
    vi.spyOn(ThemeFilesService.prototype, 'upsertSection').mockRejectedValue(new Error(PAST_GATE));
    const svc = new PublishService(admin);
    const err = await svc.publish(THEME_SPEC, TARGET).catch((e) => e);
    expect(err).not.toBeInstanceOf(ThemeCheckFailedError);
    expect(String(err?.message)).toContain(PAST_GATE);
  });
});
