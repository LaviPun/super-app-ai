import type { AdminApiContext } from '~/types/shopify';

const ACCESS_SCOPES_QUERY = `#graphql
  query CurrentAppScopes {
    currentAppInstallation {
      accessScopes {
        handle
      }
    }
  }
`;

export type PublishPreflightResult = {
  ok: boolean;
  missingScopes: string[];
  grantedScopes: string[];
  requiredScopes: string[];
  error?: string;
};

export async function runPublishPreflight(
  admin: AdminApiContext['admin'],
  input: { isThemeModule: boolean },
): Promise<PublishPreflightResult> {
  const requiredScopes = [
    'write_metaobjects',
    ...(input.isThemeModule ? ['read_themes'] : []),
  ];

  try {
    const response = await admin.graphql(ACCESS_SCOPES_QUERY);
    const json = await response.json();
    const graphqlError = json?.errors?.[0]?.message as string | undefined;
    if (graphqlError) {
      return {
        ok: false,
        missingScopes: [],
        grantedScopes: [],
        requiredScopes,
        error: `Unable to verify granted scopes: ${graphqlError}`,
      };
    }

    const grantedScopes: string[] = (json?.data?.currentAppInstallation?.accessScopes ?? [])
      .map((row: { handle?: string }) => row.handle)
      .filter((v: unknown): v is string => typeof v === 'string');

    const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));
    return {
      ok: missingScopes.length === 0,
      missingScopes,
      grantedScopes,
      requiredScopes,
    };
  } catch (err) {
    return {
      ok: false,
      missingScopes: [],
      grantedScopes: [],
      requiredScopes,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
