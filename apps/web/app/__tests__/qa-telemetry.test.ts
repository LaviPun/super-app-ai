/**
 * WS-C Task 15 (QA telemetry aggregation + promote-to-blocking).
 *
 * Two independent contracts:
 *  1. llm.server.ts — `qaCounts` collects non-autofixed issue ids onto
 *     `OptionQaSummary.issueIds`, and `runAllQaGates` escalates a
 *     `promotedBlockingIssueIds`-matched `warn` to `fail` (the mechanism that
 *     feeds the existing corrective-regeneration loop).
 *  2. qa-telemetry.service.ts — aggregates `AiGenerationOption.qaIssuesJson`
 *     over a window and round-trips `AppSettings.qaPromotedBlockingIssueIds`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecipeSpec } from '@superapp/core';

// ---------------------------------------------------------------------------
// 1. llm.server.ts — qaCounts + runAllQaGates escalation
// ---------------------------------------------------------------------------

/** A minimal theme.section recipe whose countdown config trips the
 * `countdown:past-endAt` warn (non-autofixed) from design-qa.server.ts. */
function pastCountdownRecipe(): RecipeSpec {
  return {
    type: 'theme.section',
    name: 'QA Fixture',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: {
      kind: 'countdown',
      countdown: { enabled: true, mode: 'fixed', endAt: '2020-01-01T00:00:00Z' },
    },
    style: {
      layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
      spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
      typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
      colors: { text: '#111827', background: '#FFFFFF', overlayBackdropOpacity: 0.45 },
      shape: { radius: 'md', borderWidth: 'none', shadow: 'none', elevation: 'border' },
      responsive: { hideOnMobile: false, hideOnDesktop: false },
      accessibility: { focusVisible: true, reducedMotion: true },
      pack: 'luxe',
    },
  } as unknown as RecipeSpec;
}

describe('llm.server — qaCounts + runAllQaGates promoted-blocking escalation', () => {
  it('qaCounts.issueIds contains the known warn issue id from design-qa.server.ts', async () => {
    const { runAllQaGates, qaCounts } = await import('~/services/ai/llm.server');
    const result = runAllQaGates(pastCountdownRecipe());
    expect(result.pass).toBe(true); // warn only, not yet promoted
    const issue = result.issues.find((i) => i.id === 'countdown:past-endAt');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warn');
    expect(issue?.autofixed).toBe(false);

    const summary = qaCounts(result);
    expect(summary.issueIds).toContain('countdown:past-endAt');
  });

  it('a promoted issue id escalates warn->fail and flips pass to false', async () => {
    const { runAllQaGates } = await import('~/services/ai/llm.server');
    const recipe = pastCountdownRecipe();

    const unpromoted = runAllQaGates(recipe, {});
    expect(unpromoted.pass).toBe(true);

    const promoted = runAllQaGates(recipe, { promotedBlockingIssueIds: new Set(['countdown:past-endAt']) });
    expect(promoted.pass).toBe(false);
    const issue = promoted.issues.find((i) => i.id === 'countdown:past-endAt');
    expect(issue?.severity).toBe('fail');
  });

  it('leaves an un-promoted warn issue untouched', async () => {
    const { runAllQaGates } = await import('~/services/ai/llm.server');
    const recipe = pastCountdownRecipe();
    const result = runAllQaGates(recipe, { promotedBlockingIssueIds: new Set(['some-other-id']) });
    expect(result.pass).toBe(true);
    const issue = result.issues.find((i) => i.id === 'countdown:past-endAt');
    expect(issue?.severity).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// 2. qa-telemetry.service.ts
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({
  optionFindMany: vi.fn(),
  settingsFindUnique: vi.fn(),
  settingsUpsert: vi.fn(),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    aiGenerationOption: { findMany: hoisted.optionFindMany },
    appSettings: { findUnique: hoisted.settingsFindUnique, upsert: hoisted.settingsUpsert },
  }),
}));

describe('QaTelemetryService.topIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.settingsFindUnique.mockResolvedValue({ qaPromotedBlockingIssueIds: JSON.stringify(['a']) });
  });

  it('aggregates qaIssuesJson across option rows (["a","b"], ["a"], null) -> a:2, b:1, reflects promoted', async () => {
    hoisted.optionFindMany.mockResolvedValue([
      { qaIssuesJson: JSON.stringify(['a', 'b']) },
      { qaIssuesJson: JSON.stringify(['a']) },
      { qaIssuesJson: null },
    ]);
    const { QaTelemetryService } = await import('~/services/observability/qa-telemetry.service');
    const summary = await new QaTelemetryService().topIssues(7);

    expect(summary.windowDays).toBe(7);
    expect(summary.totalOptions).toBe(3);
    expect(summary.topIssues).toEqual([
      { issueId: 'a', count: 2, promoted: true },
      { issueId: 'b', count: 1, promoted: false },
    ]);
  });

  it('defaults to a 7-day window and tolerates corrupt/empty qaIssuesJson', async () => {
    hoisted.optionFindMany.mockResolvedValue([
      { qaIssuesJson: 'not json' },
      { qaIssuesJson: JSON.stringify({ not: 'an array' }) },
      { qaIssuesJson: JSON.stringify([1, 2, 'c']) },
    ]);
    const { QaTelemetryService } = await import('~/services/observability/qa-telemetry.service');
    const summary = await new QaTelemetryService().topIssues();

    expect(summary.windowDays).toBe(7);
    expect(summary.topIssues).toEqual([{ issueId: 'c', count: 1, promoted: false }]);
  });
});

describe('QaTelemetryService.getPromotedBlockingIssueIds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads AppSettings.qaPromotedBlockingIssueIds', async () => {
    hoisted.settingsFindUnique.mockResolvedValue({ qaPromotedBlockingIssueIds: JSON.stringify(['x', 'y']) });
    const { QaTelemetryService } = await import('~/services/observability/qa-telemetry.service');
    const ids = await new QaTelemetryService().getPromotedBlockingIssueIds();
    expect(ids).toEqual(['x', 'y']);
  });

  it('returns [] when null', async () => {
    hoisted.settingsFindUnique.mockResolvedValue({ qaPromotedBlockingIssueIds: null });
    const { QaTelemetryService } = await import('~/services/observability/qa-telemetry.service');
    expect(await new QaTelemetryService().getPromotedBlockingIssueIds()).toEqual([]);
  });

  it('returns [] when the row is missing entirely', async () => {
    hoisted.settingsFindUnique.mockResolvedValue(null);
    const { QaTelemetryService } = await import('~/services/observability/qa-telemetry.service');
    expect(await new QaTelemetryService().getPromotedBlockingIssueIds()).toEqual([]);
  });

  it('returns [] on corrupt JSON', async () => {
    hoisted.settingsFindUnique.mockResolvedValue({ qaPromotedBlockingIssueIds: '{not json' });
    const { QaTelemetryService } = await import('~/services/observability/qa-telemetry.service');
    expect(await new QaTelemetryService().getPromotedBlockingIssueIds()).toEqual([]);
  });
});

describe('QaTelemetryService.setPromoted', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds an id and persists the de-duped JSON list', async () => {
    hoisted.settingsFindUnique.mockResolvedValue({ qaPromotedBlockingIssueIds: JSON.stringify(['a']) });
    hoisted.settingsUpsert.mockResolvedValue({});
    const { QaTelemetryService } = await import('~/services/observability/qa-telemetry.service');
    const next = await new QaTelemetryService().setPromoted('a', true); // already present -> de-duped
    expect(next).toEqual(['a']);
    expect(hoisted.settingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'singleton' },
        update: { qaPromotedBlockingIssueIds: JSON.stringify(['a']) },
      }),
    );
  });

  it('adds a new id alongside existing ones', async () => {
    hoisted.settingsFindUnique.mockResolvedValue({ qaPromotedBlockingIssueIds: JSON.stringify(['a']) });
    hoisted.settingsUpsert.mockResolvedValue({});
    const { QaTelemetryService } = await import('~/services/observability/qa-telemetry.service');
    const next = await new QaTelemetryService().setPromoted('b', true);
    expect(next).toEqual(['a', 'b']);
  });

  it('removes an id on demote', async () => {
    hoisted.settingsFindUnique.mockResolvedValue({ qaPromotedBlockingIssueIds: JSON.stringify(['a', 'b']) });
    hoisted.settingsUpsert.mockResolvedValue({});
    const { QaTelemetryService } = await import('~/services/observability/qa-telemetry.service');
    const next = await new QaTelemetryService().setPromoted('a', false);
    expect(next).toEqual(['b']);
  });
});
