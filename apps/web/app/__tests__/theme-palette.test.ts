import { describe, expect, it } from 'vitest';
import { extractPalette, extractTypography } from '~/services/theme/theme-analyzer.service';

const SETTINGS_DATA = JSON.stringify({
  current: {
    color_schemes: {
      'scheme-1': {
        settings: {
          background: '#FFFFFF',
          text: '#121212',
          button: '#1773B0',
          button_label: '#FFFFFF',
        },
      },
    },
    type_header_font: 'assistant_n4',
    type_body_font: 'inter_n5',
  },
});

describe('extractPalette', () => {
  it('extracts brand colors from theme color schemes (settings_data.json)', () => {
    const p = extractPalette(SETTINGS_DATA, undefined);
    expect(p.source).toBe('settings_data');
    expect(p.background).toBe('#ffffff');
    expect(p.text).toBe('#121212');
    expect(p.button).toBe('#1773b0');
    expect(p.buttonText).toBe('#ffffff');
    // primary should prefer the non-neutral accent (the button color).
    expect(p.primary).toBe('#1773b0');
    expect(p.neutrals).toContain('#1773b0');
  });

  it('expands 3-digit hex and lowercases', () => {
    const p = extractPalette(JSON.stringify({ current: { accent: '#0AF' } }), undefined);
    expect(p.primary).toBe('#00aaff');
  });

  it('falls back to base.css frequency analysis when no settings_data', () => {
    const css = '.a{color:#222222}.b{color:#222222}.c{background:#ffffff}.d{color:#ff5a00}';
    const p = extractPalette(undefined, css);
    expect(p.source).toBe('css');
    expect(p.background).toBe('#ffffff');
    expect(p.text).toBe('#222222'); // near-black, most frequent
    expect(p.primary).toBe('#ff5a00'); // the one chromatic color
  });

  it('returns source "none" when nothing usable is present', () => {
    const p = extractPalette(undefined, undefined);
    expect(p.source).toBe('none');
    expect(p.neutrals).toEqual([]);
  });

  it('ignores malformed settings_data JSON gracefully', () => {
    const p = extractPalette('{not json', '.x{color:#abcdef}');
    expect(p.source).toBe('css');
    expect(p.neutrals).toContain('#abcdef');
  });
});

describe('extractTypography', () => {
  it('humanizes Shopify font handles into family names', () => {
    const t = extractTypography(SETTINGS_DATA);
    expect(t.headingFont).toBe('Assistant');
    expect(t.bodyFont).toBe('Inter');
  });

  it('returns empty object when absent', () => {
    expect(extractTypography(undefined)).toEqual({});
  });
});
