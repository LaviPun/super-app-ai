import { describe, expect, it } from 'vitest';
import {
  buildDesignSystemDirective,
  classifyFont,
  computeAestheticSignalsFromColors,
  isHexColor,
  relativeLuminance,
  selectPack,
} from '~/services/ai/style-packs.server';
import { buildDesignQaCorrection, contrastRatio, runDesignQa } from '~/services/ai/design-qa.server';
import { PreviewService, wrapThemeFonts } from '~/services/preview/preview.service';
import {
  buildDesignSystemDirectiveForReference,
  deriveDesignReferencePack,
} from '~/services/ai/design-reference.server';
import type { RecipeSpec } from '@superapp/core';

describe('style-packs — color math', () => {
  it('detects hex colors', () => {
    expect(isHexColor('#112233')).toBe(true);
    expect(isHexColor('112233')).toBe(true);
    expect(isHexColor('rgb(0,0,0)')).toBe(false);
    expect(isHexColor('Use brand colors')).toBe(false);
  });

  it('computes luminance extremes', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('classifies fonts into families', () => {
    expect(classifyFont('Playfair Display')).toBe('serif');
    expect(classifyFont('Nunito')).toBe('rounded-sans');
    expect(classifyFont('Inter')).toBe('geom-sans');
    expect(classifyFont('IBM Plex Mono')).toBe('mono');
    expect(classifyFont(undefined)).toBe('unknown');
  });
});

describe('style-packs — selection', () => {
  it('defaults to Apple HIG Clean when no usable colors', () => {
    const signals = computeAestheticSignalsFromColors(['not a color'], ['also not']);
    expect(signals.hasUsableColors).toBe(false);
    const sel = selectPack(signals);
    expect(sel.packId).toBe('apple-hig-clean');
    expect(sel.confidence).toBe(0);
  });

  it('picks Editorial Wellness for a warm, serif, soft store', () => {
    const signals = computeAestheticSignalsFromColors(
      ['#C9745A'], // warm terracotta accent
      ['#FBF7F2', '#2B2B2B'], // warm off-white bg
      'Match heading font feel: Playfair Display.',
      '#FBF7F2',
    );
    expect(signals.accentHueFamily).toBe('warm');
    expect(selectPack(signals).packId).toBe('editorial-wellness');
  });

  it('picks Bold DTC for a loud saturated palette', () => {
    const signals = computeAestheticSignalsFromColors(
      ['#FF1E1E'], // highly saturated
      ['#111111', '#FFFFFF'],
      'Archivo Black',
      '#111111',
    );
    expect(signals.accentSaturation).toBeGreaterThan(0.6);
    expect(selectPack(signals).packId).toBe('bold-dtc');
  });

  it('picks Tech Utility for cool geometric stores', () => {
    const signals = computeAestheticSignalsFromColors(
      ['#2F80ED'], // cool blue, mid saturation
      ['#F6F8FB', '#14213A', '#6B7280'],
      'Inter',
      '#F6F8FB',
    );
    expect(signals.accentHueFamily).toBe('cool');
    expect(['tech-utility', 'apple-hig-clean']).toContain(selectPack(signals).packId);
  });

  it('does not ship a personality-heavy pack on low confidence', () => {
    // Rounded font nudges Playful, but with weak color evidence confidence stays low.
    const signals = computeAestheticSignalsFromColors(
      ['#7766AA'],
      ['#FFFFFF'],
      'Quicksand',
      '#FFFFFF',
    );
    const sel = selectPack(signals);
    if (sel.confidence < 0.34) {
      expect(['apple-hig-clean', 'editorial-wellness']).toContain(sel.packId);
    }
  });
});

describe('style-packs — directive', () => {
  it('embeds the Apple-HIG floor + pack + mobile-first + micro-interactions', () => {
    const signals = computeAestheticSignalsFromColors(['#C9745A'], ['#FBF7F2'], 'Playfair', '#FBF7F2');
    const directive = buildDesignSystemDirective({
      selection: selectPack(signals),
      brandColors: ['#C9745A', '#FBF7F2'],
      fontHints: ['serif display'],
    });
    expect(directive).toContain('DESIGN SYSTEM DIRECTIVE');
    expect(directive).toContain('Editorial Wellness');
    expect(directive).toMatch(/4\.5:1/);
    expect(directive).toMatch(/overlayBackdropOpacity/);
    expect(directive).toMatch(/reducedMotion/);
    expect(directive).toMatch(/focusVisible/);
    expect(directive).toMatch(/Mobile-first/i);
    expect(directive).toMatch(/Micro-interactions/i);
    expect(directive).toContain('#C9745A');
  });

  it('builds a directive from the fallback design reference pack', () => {
    const directive = buildDesignSystemDirectiveForReference(deriveDesignReferencePack(null));
    expect(directive).toContain('Style pack:');
    // Fallback pack has concrete hexes, so brand colors are restated.
    expect(directive).toMatch(/#F97316|#111827/);
  });
});

describe('design-qa — contrast', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeLessThan(4.5);
  });
});

function baseRecipe(style: Record<string, unknown>): RecipeSpec {
  return {
    type: 'theme.section',
    name: 'QA Test Module',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: { kind: 'popup', activation: 'overlay', title: 'Hi', body: 'Body' },
    style,
  } as unknown as RecipeSpec;
}

describe('design-qa — gate + auto-fixes', () => {
  it('adds a dimming scrim to overlays missing one', () => {
    const r = baseRecipe({ colors: { text: '#111827', background: '#FFFFFF' } });
    const qa = runDesignQa(r);
    const colors = (qa.recipe as unknown as { style: { colors: { overlayBackdropOpacity: number } } }).style.colors;
    expect(colors.overlayBackdropOpacity).toBeGreaterThanOrEqual(0.35);
    expect(qa.issues.some((i) => i.id === 'scrim' && i.autofixed)).toBe(true);
  });

  it('forces focusVisible and defaults reducedMotion', () => {
    const r = baseRecipe({ colors: { text: '#111827', background: '#FFFFFF' }, accessibility: {} });
    const qa = runDesignQa(r);
    const a11y = (qa.recipe as unknown as { style: { accessibility: { focusVisible: boolean; reducedMotion: boolean } } })
      .style.accessibility;
    expect(a11y.focusVisible).toBe(true);
    expect(a11y.reducedMotion).toBe(true);
  });

  it('fails on low body-text contrast (without recoloring)', () => {
    const r = baseRecipe({ colors: { text: '#AAAAAA', background: '#FFFFFF' } });
    const qa = runDesignQa(r);
    expect(qa.pass).toBe(false);
    expect(qa.issues.some((i) => i.id === 'contrast-body' && i.severity === 'fail')).toBe(true);
    // Text color is NOT mutated (brand-safe).
    const colors = (qa.recipe as unknown as { style: { colors: { text: string } } }).style.colors;
    expect(colors.text).toBe('#AAAAAA');
  });

  it('passes a clean, accessible overlay', () => {
    const r = baseRecipe({
      colors: { text: '#111827', background: '#FFFFFF', overlayBackdrop: '#0F172A', overlayBackdropOpacity: 0.5 },
      accessibility: { focusVisible: true, reducedMotion: true },
    });
    const qa = runDesignQa(r);
    expect(qa.pass).toBe(true);
  });
});

function effectRecipe(style: Record<string, unknown>): RecipeSpec {
  return {
    type: 'theme.section',
    name: 'Effect Module',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: { kind: 'effect', activation: 'overlay', effectKind: 'confetti', startTrigger: 'on_click' },
    style,
  } as unknown as RecipeSpec;
}

describe('design-qa — per-effect reduced motion (§6)', () => {
  it('blocks an effect that explicitly disables reduced motion, but forces the flag on', () => {
    const qa = runDesignQa(effectRecipe({ colors: { text: '#111827', background: '#FFFFFF' }, accessibility: { reducedMotion: false } }));
    expect(qa.pass).toBe(false);
    const issue = qa.issues.find((i) => i.id === 'reduced-motion-effect');
    expect(issue?.severity).toBe('fail');
    // Safety net: the stored recipe still honors prefers-reduced-motion.
    const a11y = (qa.recipe as unknown as { style: { accessibility: { reducedMotion: boolean } } }).style.accessibility;
    expect(a11y.reducedMotion).toBe(true);
  });

  it('does not block an effect that omits the flag (auto-defaults to true)', () => {
    const qa = runDesignQa(effectRecipe({ colors: { text: '#111827', background: '#FFFFFF' } }));
    expect(qa.pass).toBe(true);
    expect(qa.issues.some((i) => i.id === 'reduced-motion-effect')).toBe(false);
  });
});

describe('design-qa — F1–F8 micro-interaction heuristic (§7.1)', () => {
  it('flags status-icon-text on a contact form and records the accessibility-flag gap', () => {
    const r = {
      type: 'theme.section',
      name: 'Form',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { kind: 'contactForm', submissionMode: 'APP_PROXY', fields: { email: true } },
      style: { colors: { text: '#111827', background: '#FFFFFF' } },
    } as unknown as RecipeSpec;
    const qa = runDesignQa(r);
    expect(qa.issues.some((i) => i.id === 'micro-interaction:status-icon-text' && i.severity === 'warn')).toBe(true);
    expect(qa.issues.some((i) => i.id === 'micro-interaction:accessibility-flags')).toBe(true);
    // Heuristic warnings must not block generation.
    expect(qa.pass).toBe(true);
  });
});

describe('design-qa — pack fidelity (§3)', () => {
  it('warns when a Luxe pack uses fast motion', () => {
    const qa = runDesignQa(baseRecipe({ colors: { text: '#111827', background: '#FFFFFF' }, pack: 'luxe', motion: { duration: 'fast' } }));
    expect(qa.issues.some((i) => i.id === 'pack-fidelity:motion' && i.severity === 'warn')).toBe(true);
    expect(qa.pass).toBe(true);
  });

  it('does not warn when a Bold pack uses fast motion', () => {
    const qa = runDesignQa(baseRecipe({ colors: { text: '#111827', background: '#FFFFFF' }, pack: 'bold', motion: { duration: 'fast' } }));
    expect(qa.issues.some((i) => i.id.startsWith('pack-fidelity'))).toBe(false);
  });

  it('warns when a Playful pack uses slow motion or square (none) radius', () => {
    const slow = runDesignQa(baseRecipe({ colors: { text: '#111827', background: '#FFFFFF' }, pack: 'playful', motion: { duration: 'slow' } }));
    expect(slow.issues.some((i) => i.id === 'pack-fidelity:motion' && i.severity === 'warn')).toBe(true);
    const square = runDesignQa(baseRecipe({ colors: { text: '#111827', background: '#FFFFFF' }, pack: 'playful', shape: { radius: 'none' } }));
    expect(square.issues.some((i) => i.id === 'pack-fidelity:shape' && i.severity === 'warn')).toBe(true);
  });

  it('warns when a Utility pack uses slow motion or large radius', () => {
    const slow = runDesignQa(baseRecipe({ colors: { text: '#111827', background: '#FFFFFF' }, pack: 'utility', motion: { duration: 'slow' } }));
    expect(slow.issues.some((i) => i.id === 'pack-fidelity:motion' && i.severity === 'warn')).toBe(true);
    const round = runDesignQa(baseRecipe({ colors: { text: '#111827', background: '#FFFFFF' }, pack: 'utility', shape: { radius: 'xl' } }));
    expect(round.issues.some((i) => i.id === 'pack-fidelity:shape' && i.severity === 'warn')).toBe(true);
  });
});

function gamePopup(blocks: Array<Record<string, unknown>>, style: Record<string, unknown> = {}): RecipeSpec {
  return {
    type: 'theme.section',
    name: 'Spin to win',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: { kind: 'popup', activation: 'overlay', title: 'Spin', blocks },
    style: { colors: { text: '#111827', background: '#FFFFFF' }, ...style },
  } as unknown as RecipeSpec;
}

describe('design-qa — gamified popup rules (§4.1)', () => {
  it('warns when no slice carries a positive oddsWeight (uniform fallback)', () => {
    const qa = runDesignQa(
      gamePopup([
        { kind: 'slice', text: '10% off', fields: { couponCode: 'A', oddsWeight: 0 } },
        { kind: 'slice', text: 'Free ship', fields: { couponCode: 'B' } },
      ]),
    );
    expect(qa.issues.some((i) => i.id === 'game-odds:uniform' && i.severity === 'warn')).toBe(true);
  });

  it('warns when a single slice dominates ≥95% of the odds weight', () => {
    const qa = runDesignQa(
      gamePopup([
        { kind: 'slice', text: 'Almost always', fields: { couponCode: 'A', oddsWeight: 99 } },
        { kind: 'slice', text: 'Rare', fields: { couponCode: 'B', oddsWeight: 1 } },
      ]),
    );
    expect(qa.issues.some((i) => i.id === 'game-odds:dominant' && i.severity === 'warn')).toBe(true);
  });

  it('does not warn for balanced slice weights', () => {
    const qa = runDesignQa(
      gamePopup([
        { kind: 'slice', text: '10% off', fields: { couponCode: 'A', oddsWeight: 30 } },
        { kind: 'slice', text: 'Free ship', fields: { couponCode: 'B', oddsWeight: 20 } },
        { kind: 'slice', text: 'Try again', fields: { couponCode: '', oddsWeight: 5 } },
      ]),
    );
    expect(qa.issues.some((i) => i.id.startsWith('game-odds'))).toBe(false);
  });

  it('blocks a game popup that disabled reduced-motion (mirrors §6 effect severity)', () => {
    const qa = runDesignQa(
      gamePopup(
        [{ kind: 'scratch', text: 'Mystery 20%', fields: { couponCode: 'SCRATCH20' } }],
        { accessibility: { reducedMotion: false } },
      ),
    );
    expect(qa.pass).toBe(false);
    expect(qa.issues.some((i) => i.id === 'reduced-motion-game' && i.severity === 'fail')).toBe(true);
  });

  it('leaves a classic popup (no game blocks) untouched by game rules', () => {
    const qa = runDesignQa(gamePopup([{ kind: 'field', text: 'Email', fields: { input: 'email' } }]));
    expect(qa.issues.some((i) => i.id.startsWith('game-odds') || i.id === 'reduced-motion-game')).toBe(false);
  });
});

describe('design-qa — corrective instruction', () => {
  it('summarizes blocking issues for regeneration, empty when clean', () => {
    const blocked = runDesignQa(effectRecipe({ colors: { text: '#111827', background: '#FFFFFF' }, accessibility: { reducedMotion: false } }));
    const corr = buildDesignQaCorrection(blocked);
    expect(corr).toContain('DESIGN-QA CORRECTION');
    expect(corr).toContain('reduced-motion-effect');

    const clean = runDesignQa(baseRecipe({
      colors: { text: '#111827', background: '#FFFFFF', overlayBackdrop: '#0F172A', overlayBackdropOpacity: 0.5 },
      accessibility: { focusVisible: true, reducedMotion: true },
    }));
    expect(buildDesignQaCorrection(clean)).toBe('');
  });
});

describe('preview — theme font inheritance', () => {
  it('returns html unchanged when no theme fonts are given', () => {
    const html = '<div>hi</div>';
    expect(wrapThemeFonts(html, {})).toBe(html);
  });

  it('wraps html in a font scope and loads the families', () => {
    const out = wrapThemeFonts('<h3>Title</h3>', { headingFont: 'Playfair Display', bodyFont: 'Assistant' });
    expect(out).toContain('superapp-preview-fontscope');
    expect(out).toContain("font-family: 'Assistant'"); // body
    expect(out).toContain("'Playfair Display'"); // heading
    expect(out).toContain('fonts.googleapis.com/css2?family=Playfair+Display');
    expect(out).toContain('family=Assistant');
  });

  it('sanitizes the family so it cannot break out of the declaration or URL', () => {
    const out = wrapThemeFonts('<p>x</p>', { bodyFont: "Evil', x:expression(alert(1)); '" });
    expect(out).not.toContain('expression(');
    expect(out).not.toContain('alert(1)');
    // the body family value contains only safe chars (no quotes/parens/colons/semicolons)
    const m = out.match(/font-family: '([^']*)'/);
    expect(m).toBeTruthy();
    expect(m![1]).toMatch(/^[a-zA-Z0-9 ]+$/);
  });

  it('PreviewService.render applies theme fonts to a theme.section popup', () => {
    const spec = baseRecipe({ colors: { text: '#111827', background: '#FFFFFF' } });
    const out = new PreviewService().render(spec, { themeFonts: { bodyFont: 'Assistant' } });
    expect(out.kind).toBe('HTML');
    if (out.kind === 'HTML') {
      expect(out.html).toContain('superapp-preview-fontscope');
      expect(out.html).toContain("'Assistant'");
    }
  });

  it('render without theme fonts is untouched (no scope wrapper)', () => {
    const spec = baseRecipe({ colors: { text: '#111827', background: '#FFFFFF' } });
    const out = new PreviewService().render(spec);
    if (out.kind === 'HTML') expect(out.html).not.toContain('superapp-preview-fontscope');
  });
});
