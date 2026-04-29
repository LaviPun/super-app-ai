import { describe, it, expect, vi } from 'vitest';
import { ReleaseTransitionService } from '~/services/releases/release-transition.service';

describe('ReleaseTransitionService', () => {
  it('allows publish transition from DRAFT module/version', () => {
    const mockPrisma: any = { auditLog: { create: vi.fn() } };
    const service = new ReleaseTransitionService(mockPrisma);

    expect(() => service.assertPublishTransition('DRAFT', 'DRAFT')).not.toThrow();
  });

  it('rejects invalid publish transition states', () => {
    const mockPrisma: any = { auditLog: { create: vi.fn() } };
    const service = new ReleaseTransitionService(mockPrisma);

    expect(() => service.assertPublishTransition('ARCHIVED', 'DRAFT')).toThrow(
      /Invalid module transition/
    );
    expect(() => service.assertPublishTransition('DRAFT', 'FAILED')).toThrow(
      /Invalid version transition/
    );
  });

  it('writes transition audit log', async () => {
    const create = vi.fn().mockResolvedValue({});
    const mockPrisma: any = { auditLog: { create } };
    const service = new ReleaseTransitionService(mockPrisma);

    await service.logTransition({
      shopId: 'shop_1',
      moduleId: 'module_1',
      moduleVersionId: 'ver_1',
      fromModuleStatus: 'DRAFT',
      toModuleStatus: 'PUBLISHED',
      fromVersionStatus: 'DRAFT',
      toVersionStatus: 'PUBLISHED',
      source: 'merchant_api',
      idempotencyKey: 'publish:shop_1:module_1:ver_1:platform',
      outcome: 'SUCCEEDED',
    });

    expect(create).toHaveBeenCalledTimes(1);
    const firstCall = create.mock.calls[0];
    expect(firstCall).toBeTruthy();
    expect(firstCall?.[0]?.data?.action).toBe('RELEASE_TRANSITION');
  });
});

