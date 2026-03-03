import { redirect } from '@remix-run/node';
import { Issuer } from 'openid-client';
import { internalSessionStorage, commitInternal } from '~/internal-admin/session.server';

export async function loader({ request }: { request: Request }) {
  const issuerUrl = process.env.INTERNAL_SSO_ISSUER;
  const clientId = process.env.INTERNAL_SSO_CLIENT_ID;
  const clientSecret = process.env.INTERNAL_SSO_CLIENT_SECRET;
  const redirectUri = process.env.INTERNAL_SSO_REDIRECT_URI;

  if (!issuerUrl || !clientId || !clientSecret || !redirectUri) {
    throw new Response('SSO not configured', { status: 500 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const session = await internalSessionStorage.getSession(request.headers.get('cookie'));
  const expectedState = session.get('oidc_state');
  const verifier = session.get('oidc_verifier');

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    throw new Response('Invalid SSO callback', { status: 400 });
  }

  const issuer = await Issuer.discover(issuerUrl);
  const client = new issuer.Client({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: [redirectUri],
    response_types: ['code'],
  });

  const tokenSet = await client.callback(redirectUri, { code, state }, { code_verifier: verifier });
  const claims = tokenSet.claims();

  session.unset('oidc_state');
  session.unset('oidc_verifier');
  session.set('internal_admin', true);
  session.set('internal_email', claims.email ?? null);
  session.set('internal_name', claims.name ?? null);

  return redirect('/internal', { headers: { 'Set-Cookie': await commitInternal(session) } });
}
