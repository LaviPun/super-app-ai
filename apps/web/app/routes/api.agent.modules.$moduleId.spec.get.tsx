import { redirect } from '@remix-run/node';

/**
 * Redirect: /api/agent/modules/:moduleId/spec/get → /api/agent/modules/:moduleId/spec
 * Use GET /api/agent/modules/:moduleId/spec instead.
 */
export async function loader({ params }: { request: Request; params: { moduleId?: string } }) {
  return redirect(`/api/agent/modules/${params.moduleId ?? ''}/spec`);
}
