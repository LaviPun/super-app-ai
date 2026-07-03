import { describe, expect, it } from 'vitest';
import { MODULE_TEMPLATES, RecipeSpecSchema, type RecipeSpec } from '@superapp/core';
import { classifyModulePublishability } from '~/services/publish/publish-preflight.server';
import { PreviewService } from '~/services/preview/preview.service';

/**
 * Spring 2026 `admin.discountUi` (Discount UI Extension): generatable + validatable
 * + previewable now, honestly `needs_runtime` for publish until the discount-details
 * admin extension is shipped in `extensions/`.
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

  it('is classified needs_runtime (fails loudly, never silently "published")', () => {
    const result = classifyModulePublishability(discountUiSpec());
    expect(result.status).toBe('needs_runtime');
    expect(result.willDeploy).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
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
