import { redirect } from '@remix-run/node';
import { internalSessionStorage, destroyInternal } from '~/internal-admin/session.server';

export async function loader({ request }: { request: Request }) {
  const session = await internalSessionStorage.getSession(request.headers.get('cookie'));
  return redirect('/internal/login', { headers: { 'Set-Cookie': await destroyInternal(session) } });
}
