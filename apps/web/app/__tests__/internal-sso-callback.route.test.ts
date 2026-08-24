import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  log: vi.fn(async () => {}),
  claims: vi.fn((): Record<string, unknown> => ({ email: 'mallory@evil.com', email_verified: true })),
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.log;
  },
}));

vi.mock('openid-client', () => ({
  discovery: vi.fn(async () => ({ mocked: 'config' })),
  authorizationCodeGrant: vi.fn(async () => ({ claims: hoisted.claims })),
}));

async function callbackRequest() {
  // Real cookie session storage (vitest env provides the secret) so the route's
  // state/verifier check passes and we exercise ONLY the allowlist gate.
  const { internalSessionStorage } = await import('~/internal-admin/session.server');
  const session = await internalSessionStorage.getSession();
  session.set('oidc_state', 'state123');
  session.set('oidc_verifier', 'verifier123');
  const cookie = await internalSessionStorage.commitSession(session);
  return new Request('https://app.test/internal/sso/callback?code=abc&state=state123', {
    headers: { cookie },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_SSO_ISSUER = 'https://idp.example.com';
  process.env.INTERNAL_SSO_CLIENT_ID = 'client-id';
  process.env.INTERNAL_SSO_CLIENT_SECRET = 'client-secret';
  process.env.INTERNAL_SSO_REDIRECT_URI = 'https://app.test/internal/sso/callback';
  process.env.INTERNAL_SSO_ALLOWED_EMAILS = 'alice@example.com, bob@example.com';
});

describe('internal.sso.callback allowlist gate', () => {
  it('denies an authenticated identity that is not on the allowlist (403 + audit)', async () => {
    const { loader } = await import('~/routes/internal.sso.callback');
    const request = await callbackRequest();
    let threw: Response | null = null;
    try {
      await loader({ request });
    } catch (e) {
      threw = e as Response;
    }
    expect(threw).toBeInstanceOf(Response);
    expect(threw!.status).toBe(403);
    expect(hoisted.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LOGIN',
        resource: 'internal:sso',
        details: expect.objectContaining({ outcome: 'denied', email: 'mallory@evil.com' }),
      }),
    );
  });

  it('denies when the email claim is missing entirely', async () => {
    hoisted.claims.mockReturnValueOnce({ name: 'No Email' });
    const { loader } = await import('~/routes/internal.sso.callback');
    const request = await callbackRequest();
    await expect(loader({ request })).rejects.toMatchObject({ status: 403 });
  });

  it('grants an allowlisted, verified identity (302 → /internal)', async () => {
    hoisted.claims.mockReturnValueOnce({ email: 'Alice@Example.com', email_verified: true });
    const { loader } = await import('~/routes/internal.sso.callback');
    const request = await callbackRequest();
    const res = await loader({ request });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/internal');
    expect(hoisted.log).not.toHaveBeenCalled();
  });
});
