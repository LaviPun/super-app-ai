import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminApiContext } from '~/types/shopify';

/**
 * Embed status (WS-E finding 5) — a successful publish does not make a theme
 * module appear on the storefront; the merchant must also enable the SuperApp
 * app embed. These tests cover the pure parser (every settings_data.json shape
 * we can encounter), the theme-editor deep link format, and that a lookup
 * failure degrades to 'unknown' instead of throwing (advisory only, never
 * blocks or misreports the publish that already succeeded).
 */

const blockType = 'shopify://apps/super-app-ai/blocks/superapp-theme-modules/aaaa-bbbb';

describe('embed status (WS-E finding 5)', () => {
  const originalApiKey = process.env.SHOPIFY_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.SHOPIFY_API_KEY;
    else process.env.SHOPIFY_API_KEY = originalApiKey;
  });

  it('not_added when settings_data has no superapp embed block', async () => {
    const { parseEmbedStatus } = await import('~/services/publish/embed-status.server');
    expect(parseEmbedStatus(JSON.stringify({ current: { blocks: {} } }))).toBe('not_added');
    expect(parseEmbedStatus(JSON.stringify({ current: {} }))).toBe('not_added');
  });

  it('enabled when present and not disabled', async () => {
    const { parseEmbedStatus } = await import('~/services/publish/embed-status.server');
    expect(parseEmbedStatus(JSON.stringify({ current: { blocks: { x: { type: blockType, disabled: false } } } }))).toBe('enabled');
    expect(parseEmbedStatus(JSON.stringify({ current: { blocks: { x: { type: blockType } } } }))).toBe('enabled');
  });

  it('disabled when present with disabled:true', async () => {
    const { parseEmbedStatus } = await import('~/services/publish/embed-status.server');
    expect(parseEmbedStatus(JSON.stringify({ current: { blocks: { x: { type: blockType, disabled: true } } } }))).toBe('disabled');
  });

  it('unknown on unparseable content (never blocks publish)', async () => {
    const { parseEmbedStatus } = await import('~/services/publish/embed-status.server');
    expect(parseEmbedStatus('not json')).toBe('unknown');
  });

  it('not_added when `current` is the legacy string (preset-name) form or blocks is absent', async () => {
    const { parseEmbedStatus } = await import('~/services/publish/embed-status.server');
    expect(parseEmbedStatus(JSON.stringify({ current: 'presetName' }))).toBe('not_added');
    expect(parseEmbedStatus(JSON.stringify({}))).toBe('not_added');
  });

  it('ignores non-superapp app-embed blocks and reports not_added', async () => {
    const { parseEmbedStatus } = await import('~/services/publish/embed-status.server');
    const otherAppType = 'shopify://apps/some-other-app/blocks/unrelated-block/cccc-dddd';
    expect(parseEmbedStatus(JSON.stringify({ current: { blocks: { x: { type: otherAppType } } } }))).toBe('not_added');
  });

  it('deep link uses api_key + handle per current docs (uuid form is deprecated)', async () => {
    process.env.SHOPIFY_API_KEY = 'testkey';
    const { embedActivationDeepLink } = await import('~/services/publish/embed-status.server');
    expect(embedActivationDeepLink('demo.myshopify.com')).toBe(
      'https://demo.myshopify.com/admin/themes/current/editor?context=apps&template=index&activateAppId=testkey/superapp-theme-modules',
    );
  });
});

describe('getThemeEmbedStatus — live theme read (advisory, never throws)', () => {
  function mockAdmin(fn: (query: string, opts?: { variables?: Record<string, unknown> }) => unknown) {
    return { graphql: vi.fn(async (query: string, opts?: { variables?: Record<string, unknown> }) => {
      const payload = fn(query, opts);
      return { json: async () => payload };
    }) } as unknown as AdminApiContext['admin'];
  }

  beforeEach(() => {
    vi.resetModules();
  });

  it('reads settings_data.json from the given themeId and parses it', async () => {
    const admin = mockAdmin((_q, opts) => {
      expect(opts?.variables?.themeId).toBe('gid://shopify/OnlineStoreTheme/123');
      return {
        data: {
          theme: {
            id: 'gid://shopify/OnlineStoreTheme/123',
            files: { nodes: [{ filename: 'config/settings_data.json', body: { content: JSON.stringify({ current: { blocks: { x: { type: blockType, disabled: false } } } }) } }] },
          },
        },
      };
    });
    const { getThemeEmbedStatus } = await import('~/services/publish/embed-status.server');
    await expect(getThemeEmbedStatus(admin, '123')).resolves.toBe('enabled');
  });

  it('falls back to the main theme when no themeId is given', async () => {
    vi.doMock('~/services/shopify/theme.service', () => ({
      ThemeService: class {
        async listThemes() {
          return [{ id: 42, name: 'Main', role: 'main' }, { id: 7, name: 'Copy', role: 'unpublished' }];
        }
      },
    }));
    const admin = mockAdmin((_q, opts) => {
      expect(opts?.variables?.themeId).toBe('gid://shopify/OnlineStoreTheme/42');
      return { data: { theme: { files: { nodes: [{ body: { content: JSON.stringify({ current: { blocks: {} } }) } }] } } } };
    });
    const { getThemeEmbedStatus } = await import('~/services/publish/embed-status.server');
    await expect(getThemeEmbedStatus(admin)).resolves.toBe('not_added');
  });

  it('returns unknown (never throws) when no main theme can be resolved', async () => {
    vi.doMock('~/services/shopify/theme.service', () => ({
      ThemeService: class {
        async listThemes() {
          return [{ id: 7, name: 'Copy', role: 'unpublished' }];
        }
      },
    }));
    const admin = mockAdmin(() => {
      throw new Error('must not be called without a resolved themeId');
    });
    const { getThemeEmbedStatus } = await import('~/services/publish/embed-status.server');
    await expect(getThemeEmbedStatus(admin)).resolves.toBe('unknown');
  });

  it('returns unknown (never throws) when admin.graphql rejects', async () => {
    const admin = {
      graphql: vi.fn(async () => {
        throw new Error('missing read_themes scope');
      }),
    } as unknown as AdminApiContext['admin'];
    const { getThemeEmbedStatus } = await import('~/services/publish/embed-status.server');
    await expect(getThemeEmbedStatus(admin, '1')).resolves.toBe('unknown');
  });

  it('returns unknown when the theme has no settings_data.json content', async () => {
    const admin = mockAdmin(() => ({ data: { theme: { files: { nodes: [] } } } }));
    const { getThemeEmbedStatus } = await import('~/services/publish/embed-status.server');
    await expect(getThemeEmbedStatus(admin, '1')).resolves.toBe('unknown');
  });
});
