import { describe, expect, it } from 'vitest';
import { MODULE_TEMPLATES, RecipeSpecSchema, type RecipeSpec } from '@superapp/core';
import { classifyModulePublishability } from '~/services/publish/publish-preflight.server';
import { PreviewService } from '~/services/preview/preview.service';

/**
 * Spring 2026 `admin.discountUi` (Discount UI Extension): generatable + validatable
 * + previewable, and now DEPLOYABLE — the discount-function-settings extension is
 * shipped in `extensions/discount-function-settings` (registers
 * admin.discount-details.function-settings.render, reads the published field config,
 * saves values to the discount function-configuration metafield). Publishing persists
 * the config to a superapp.admin/discount_ui_refs metaobject via a real compiler payload.
 */
function discountUiSpec(): RecipeSpec {
  const t = MODULE_TEMPLATES.find((m) => m.spec.type === 'admin.discountUi');
  if (!t) throw new Error('no admin.discountUi template');
  return t.spec as RecipeSpec;
}

describe('admin.discountUi module type', () => {
  it('has a template whose spec validates against RecipeSpecSchema', () => {
    const parsed = RecipeSpecSchema.safeParse(discountUiSpec());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('admin.discountUi');
      expect((parsed.data.config as { discountClass?: string }).discountClass).toBeDefined();
    }
  });

  it('is classified deployable (discount-function-settings extension is shipped)', () => {
    const result = classifyModulePublishability(discountUiSpec());
    expect(result.status).toBe('deployable');
    expect(result.willDeploy).toBe(true);
  });

  it('renders a real discount-UI preview (not the generic diagram)', () => {
    const out = new PreviewService().render(discountUiSpec());
    expect(out.kind).toBe('HTML');
    if (out.kind === 'HTML') {
      expect(out.html).toContain('discount');
      expect(out.html).toContain('Save discount');
    }
  });
});
