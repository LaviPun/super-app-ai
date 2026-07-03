import { redirect } from '@remix-run/node';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';

/**
 * Deep-link entry for a module's recipe (linked from the module detail/list pages).
 * There is a single real editor (`internal.recipe-edit.tsx`) that loads a module's
 * live RecipeSpec and drives the validate/save actions. This route resolves the
 * module id to its shop and forwards to that editor with the proper query so the
 * spec loads for real — no placeholder module data.
 */
export async function loader({ request, params }: { request: Request; params: { id?: string } }) {
  await requireInternalAdmin(request);
  const id = String(params.id ?? '').trim();
  if (id) {
    const mod = await getPrisma().module.findUnique({ where: { id }, select: { id: true, shopId: true } });
    if (mod) {
      return redirect(
        `/internal/recipe-edit?shopId=${encodeURIComponent(mod.shopId)}&moduleId=${encodeURIComponent(mod.id)}`,
      );
    }
  }
  return redirect('/internal/recipe-edit');
}

export default function AdminRecipeEditDetailRedirect() {
  return null;
}
