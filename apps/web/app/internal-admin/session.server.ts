import { createCookieSessionStorage } from '@remix-run/node';
import type { Session } from '@remix-run/node';

function mustGetSecret(): string {
  const s = process.env.INTERNAL_ADMIN_SESSION_SECRET;
  if (!s) throw new Error('Missing INTERNAL_ADMIN_SESSION_SECRET');
  return s;
}

const isProduction = process.env.NODE_ENV === 'production';

export const internalSessionStorage = createCookieSessionStorage({
  cookie: {
    name: isProduction ? '__Host-superapp_internal' : '__superapp_internal',
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 8 * 60 * 60,
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

export async function commitInternal(session: Session) {
  return internalSessionStorage.commitSession(session);
}

export async function destroyInternal(session: Session) {
  return internalSessionStorage.destroySession(session);
}
