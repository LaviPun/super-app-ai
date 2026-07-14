import { redirect } from '@remix-run/node';
import { requireInternalAdmin } from '~/internal-admin/session.server';

/** AI accounts have been merged into the AI Providers page. Redirect for
 *  backwards compatibility (deep links, ⌘K). */
export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  return redirect('/internal/ai-providers?tab=accounts');
}

export default function InternalAiAccountsRedirect() {
  return null;
}
