import { redirect } from '@remix-run/node';
import * as oidc from 'openid-client';
import { internalSessionStorage, commitInternal } from '~/internal-admin/session.server';
import { parseAllowedEmails, evaluateSsoIdentity, auditSsoDenied } from '~/internal-admin/sso-allowlist.server';

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

  const config = await oidc.discovery(new URL(issuerUrl), clientId, clientSecret);

  const tokens = await oidc.authorizationCodeGrant(config, new URL(request.url), {
    pkceCodeVerifier: verifier,
    expectedState,
  });

  const claims = (tokens.claims() ?? {}) as Record<string, unknown>;

  const allowedEmails = parseAllowedEmails(process.env.INTERNAL_SSO_ALLOWED_EMAILS);
  const verdict = evaluateSsoIdentity(claims, allowedEmails);
  if (!verdict.ok) {
    await auditSsoDenied(request, verdict);
    throw new Response('SSO identity not allowed', { status: 403 });
  }

  session.unset('oidc_state');
  session.unset('oidc_verifier');
  session.set('internal_admin', true);
  session.set('internal_email', verdict.email);
  session.set('internal_name', claims.name ?? null);

  return redirect('/internal', { headers: { 'Set-Cookie': await commitInternal(session) } });
}
