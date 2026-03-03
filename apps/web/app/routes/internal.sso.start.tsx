import { redirect } from '@remix-run/node';
import { Issuer, generators } from 'openid-client';
import { internalSessionStorage, commitInternal } from '~/internal-admin/session.server';

export async function loader({ request }: { request: Request }) {
  const issuerUrl = process.env.INTERNAL_SSO_ISSUER;
  const clientId = process.env.INTERNAL_SSO_CLIENT_ID;
  const clientSecret = process.env.INTERNAL_SSO_CLIENT_SECRET;
  const redirectUri = process.env.INTERNAL_SSO_REDIRECT_URI;

  if (!issuerUrl || !clientId || !clientSecret || !redirectUri) {
    throw new Response('SSO not configured', { status: 500 });
  }

  const issuer = await Issuer.discover(issuerUrl);
  const client = new issuer.Client({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: [redirectUri],
    response_types: ['code'],
  });

  const session = await internalSessionStorage.getSession(request.headers.get('cookie'));
  const state = generators.state();
  const verifier = generators.codeVerifier();
  const challenge = generators.codeChallenge(verifier);

  session.set('oidc_state', state);
  session.set('oidc_verifier', verifier);

  const authUrl = client.authorizationUrl({
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return redirect(authUrl, { headers: { 'Set-Cookie': await commitInternal(session) } });
}
