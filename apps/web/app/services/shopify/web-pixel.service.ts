import type { AdminApiContext } from '~/types/shopify';

/**
 * WebPixelService — deploys an `analytics.pixel` module as a real Shopify Web
 * Pixel (Layer-B config for the shipped `extensions/superapp-web-pixel`).
 *
 * Idempotent: there is exactly one app-owned web pixel per shop, so we read the
 * current one and `webPixelUpdate` it when present, else `webPixelCreate`. The
 * `settings` are sent as a JSON string (the API expects serialized settings).
 */
const WEB_PIXEL_QUERY = `#graphql
  query SuperAppWebPixel {
    webPixel { id settings }
  }
`;

const WEB_PIXEL_CREATE = `#graphql
  mutation SuperAppWebPixelCreate($webPixel: WebPixelInput!) {
    webPixelCreate(webPixel: $webPixel) {
      webPixel { id }
      userErrors { field message }
    }
  }
`;

const WEB_PIXEL_UPDATE = `#graphql
  mutation SuperAppWebPixelUpdate($id: ID!, $webPixel: WebPixelInput!) {
    webPixelUpdate(id: $id, webPixel: $webPixel) {
      webPixel { id }
      userErrors { field message }
    }
  }
`;

export class WebPixelService {
  constructor(private readonly admin: AdminApiContext['admin']) {}

  /** Create or update the app's web pixel with `settings`. Returns the pixel GID. */
  async upsert(settings: Record<string, string>): Promise<string> {
    const settingsJson = JSON.stringify(settings);

    const existingId = await this.currentPixelId();
    if (existingId) {
      const res = await this.admin.graphql(WEB_PIXEL_UPDATE, {
        variables: { id: existingId, webPixel: { settings: settingsJson } },
      });
      const json = (await res.json()) as {
        data?: { webPixelUpdate?: { webPixel?: { id?: string }; userErrors?: Array<{ message?: string }> } };
      };
      const err = json?.data?.webPixelUpdate?.userErrors?.[0]?.message;
      if (err) throw new Error(`webPixelUpdate error: ${err}`);
      return json?.data?.webPixelUpdate?.webPixel?.id ?? existingId;
    }

    const res = await this.admin.graphql(WEB_PIXEL_CREATE, {
      variables: { webPixel: { settings: settingsJson } },
    });
    const json = (await res.json()) as {
      data?: { webPixelCreate?: { webPixel?: { id?: string }; userErrors?: Array<{ message?: string }> } };
    };
    const err = json?.data?.webPixelCreate?.userErrors?.[0]?.message;
    if (err) throw new Error(`webPixelCreate error: ${err}`);
    const id = json?.data?.webPixelCreate?.webPixel?.id;
    if (!id) throw new Error('webPixelCreate returned no pixel id');
    return id;
  }

  private async currentPixelId(): Promise<string | null> {
    try {
      const res = await this.admin.graphql(WEB_PIXEL_QUERY);
      const json = (await res.json()) as { data?: { webPixel?: { id?: string } | null } };
      return json?.data?.webPixel?.id ?? null;
    } catch {
      // No pixel yet (the API errors when none exists) → treat as "create".
      return null;
    }
  }
}
