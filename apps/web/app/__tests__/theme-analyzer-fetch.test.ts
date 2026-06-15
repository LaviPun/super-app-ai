import { describe, expect, it, vi, beforeEach } from 'vitest';

const upsert = vi.fn();
vi.mock('~/db.server', () => ({
  getPrisma: () => ({ themeProfile: { upsert } }),
}));

import { ThemeAnalyzerService } from '~/services/theme/theme-analyzer.service';
import type { AdminApiContext } from '~/types/shopify';

const SETTINGS_DATA = JSON.stringify({
  current: {
    color_schemes: { 'scheme-1': { settings: { background: '#ffffff', text: '#101820', button: '#e4002b', button_label: '#ffffff' } } },
    type_header_font: 'futura_n7',
  },
});

function makeAdmin(graphqlImpl: (q: string, opts: { variables: Record<string, unknown> }) => unknown) {
  return { graphql: vi.fn(graphqlImpl) } as unknown as AdminApiContext['admin'];
}

describe('ThemeAnalyzerService GraphQL themeFiles fetch (2026-04)', () => {
  beforeEach(() => upsert.mockReset());

  it('queries themeFiles with a theme GID and extracts the palette from the response', async () => {
    let capturedVars: Record<string, unknown> | undefined;
    const admin = makeAdmin((_q, opts) => {
      capturedVars = opts.variables;
      return {
        json: async () => ({
          data: {
            theme: {
              files: {
                nodes: [
                  { filename: 'config/settings_data.json', body: { content: SETTINGS_DATA } },
                  { filename: 'sections/header.liquid', body: { content: '<cart-drawer></cart-drawer>' } },
                ],
              },
            },
          },
        }),
      };
    });

    const svc = new ThemeAnalyzerService(admin);
    const profile = await svc.analyzeAndStore('shop_1', '225007463');

    // GID built from the numeric theme id, and the file list was requested.
    expect(capturedVars?.themeId).toBe('gid://shopify/OnlineStoreTheme/225007463');
    expect(Array.isArray(capturedVars?.filenames)).toBe(true);
    expect(capturedVars?.filenames as string[]).toContain('config/settings_data.json');

    // Palette extracted from the GraphQL body content.
    expect(profile.palette.source).toBe('settings_data');
    expect(profile.palette.primary).toBe('#e4002b');
    expect(profile.palette.background).toBe('#ffffff');
    expect(profile.typography.headingFont).toBe('Futura');
    expect(profile.detected.cartDrawer).toBe(true);
    expect(upsert).toHaveBeenCalledOnce();
  });

  it('degrades to palette source "none" when the GraphQL call throws', async () => {
    const admin = makeAdmin(() => { throw new Error('network'); });
    const svc = new ThemeAnalyzerService(admin);
    const profile = await svc.analyzeAndStore('shop_1', 'gid://shopify/OnlineStoreTheme/1');
    expect(profile.palette.source).toBe('none');
  });
});
