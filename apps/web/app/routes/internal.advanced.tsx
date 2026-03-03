import { redirect } from '@remix-run/node';
import { requireInternalAdmin } from '~/internal-admin/session.server';

/** Advanced has been merged into Settings. Redirect for backwards compatibility. */
export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  return redirect('/internal/settings');
}

export default function InternalAdvancedRedirect() {
  return null;
}
