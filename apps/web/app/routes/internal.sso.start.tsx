import { redirect } from '@remix-run/node';
import * as oidc from 'openid-client';
import { internalSessionStorage, commitInternal } from '~/internal-admin/session.server';

export async function loader({ request }: { request: Request }) {
  const issuerUrl = process.env.INTERNAL_SSO_ISSUER;
  const clientId = process.env.INTERNAL_SSO_CLIENT_ID;
  const clientSecret = process.env.INTERNAL_SSO_CLIENT_SECRET;
  const redirectUri = process.env.INTERNAL_SSO_REDIRECT_URI;

  if (!issuerUrl || !clientId || !clientSecret || !redirectUri) {
    throw new Response('SSO not configured', { status: 500 });
  }

  const config = await oidc.discovery(new URL(issuerUrl), clientId, clientSecret);

  const session = await internalSessionStorage.getSession(request.headers.get('cookie'));
  const verifier = oidc.randomPKCECodeVerifier();
  const challenge = await oidc.calculatePKCECodeChallenge(verifier);
  const state = oidc.randomState();

  session.set('oidc_state', state);
  session.set('oidc_verifier', verifier);

  const params = new URLSearchParams({
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    response_type: 'code',
  });

  const authUrl = oidc.buildAuthorizationUrl(config, params);

  return redirect(authUrl.href, { headers: { 'Set-Cookie': await commitInternal(session) } });
}
