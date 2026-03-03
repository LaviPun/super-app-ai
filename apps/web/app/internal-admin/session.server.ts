import { createCookieSessionStorage } from '@remix-run/node';

function mustGetSecret(): string {
  const s = process.env.INTERNAL_ADMIN_SESSION_SECRET;
  if (!s) throw new Error('Missing INTERNAL_ADMIN_SESSION_SECRET');
  return s;
}

export const internalSessionStorage = createCookieSessionStorage({
  cookie: {
    name: '__superapp_internal',
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    secrets: [mustGetSecret()],
  },
});

export async function requireInternalAdmin(request: Request) {
  const cookie = request.headers.get('cookie');
  const session = await internalSessionStorage.getSession(cookie);
  const ok = session.get('internal_admin') === true;
  if (!ok) {
    const url = new URL(request.url);
    const to = url.pathname + url.search;
    throw new Response(null, { status: 302, headers: { Location: `/internal/login?to=${encodeURIComponent(to)}` } });
  }
  return session;
}

export async function commitInternal(session: any) {
  return internalSessionStorage.commitSession(session);
}

export async function destroyInternal(session: any) {
  return internalSessionStorage.destroySession(session);
}
