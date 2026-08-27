import type { AdminApiContext } from '~/types/shopify';
import { toThemeGid } from '~/services/publish/theme-files.server';
import { ThemeService } from '~/services/shopify/theme.service';

/**
 * WS-E finding 5 — a successful publish (metaobject + list.metaobject_reference
 * written, or a native section pushed) does NOT make a theme module render on
 * the storefront: the merchant must ALSO enable the "SuperApp Theme Modules" app
 * embed block in the theme editor. Without it, the app-block path writes real
 * data but nothing appears — a silent gap the merchant has no way to notice from
 * the publish flow alone. This module gives publish an advisory (never
 * blocking) read of that embed's on/off state, plus the theme-editor deep link
 * that turns it on.
 */
export type EmbedStatus = 'enabled' | 'disabled' | 'not_added' | 'unknown';

/** Handle of the app embed block declared by extensions/superapp-theme-app-extension. */
export const EMBED_BLOCK_HANDLE = 'superapp-theme-modules';

// Validated against Admin 2026-07 via shopify-dev-mcp (read_themes scope):
// theme.files body → OnlineStoreThemeFileBodyText.content.
const EMBED_SETTINGS_QUERY = `#graphql
  query SuperAppEmbedStatus($themeId: ID!) {
    theme(id: $themeId) {
      id
      files(filenames: ["config/settings_data.json"], first: 1) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }
`;

/**
 * Pure parse of config/settings_data.json. App embed blocks appear under
 * `current.blocks` with a type of the form
 * `shopify://apps/{app}/blocks/{handle}/{uuid}`; the entry exists only after
 * the merchant enables it the first time, and then persists with a `disabled`
 * flag toggled by the theme editor's on/off switch. Unparseable or
 * unexpected-shape content never throws — this is advisory only, so it
 * degrades to 'unknown' rather than blocking anything upstream.
 */
export function parseEmbedStatus(settingsDataJson: string): EmbedStatus {
  try {
    const parsed = JSON.parse(settingsDataJson) as {
      current?: { blocks?: Record<string, { type?: string; disabled?: boolean }> } | string;
    };
    const current = typeof parsed.current === 'string' ? undefined : parsed.current;
    const blocks = current?.blocks ?? {};
    for (const block of Object.values(blocks)) {
      if (typeof block?.type === 'string' && block.type.includes(`/blocks/${EMBED_BLOCK_HANDLE}/`)) {
        return block.disabled ? 'disabled' : 'enabled';
      }
    }
    return 'not_added';
  } catch {
    return 'unknown';
  }
}

/**
 * Read the embed status from the given theme (or the store's main theme when
 * no `themeId` is given). NEVER throws — any lookup failure (missing scope,
 * theme gone, network error) yields 'unknown' so a flaky read can never block
 * or misreport the publish that already succeeded.
 */
export async function getThemeEmbedStatus(
  admin: AdminApiContext['admin'],
  themeId?: string,
): Promise<EmbedStatus> {
  try {
    let id = themeId;
    if (!id) {
      const themes = await new ThemeService(admin).listThemes();
      const main = themes.find((t) => t.role === 'main');
      if (main) id = String(main.id);
    }
    if (!id) return 'unknown';
    const res = await admin.graphql(EMBED_SETTINGS_QUERY, { variables: { themeId: toThemeGid(id) } });
    const json = (await res.json()) as {
      data?: { theme?: { files?: { nodes?: Array<{ body?: { content?: string } | null }> } } };
    };
    const content = json?.data?.theme?.files?.nodes?.[0]?.body?.content;
    if (!content) return 'unknown';
    return parseEmbedStatus(content);
  } catch {
    return 'unknown';
  }
}

/**
 * Theme-editor deep link that lands the merchant directly on the app-embed
 * toggle for this app (api_key + block handle form — the older
 * `shopify://apps/.../{uuid}` deep-link form is deprecated per current docs).
 */
export function embedActivationDeepLink(shopDomain: string): string {
  const apiKey = process.env.SHOPIFY_API_KEY ?? '';
  return `https://${shopDomain}/admin/themes/current/editor?context=apps&template=index&activateAppId=${apiKey}/${EMBED_BLOCK_HANDLE}`;
}
