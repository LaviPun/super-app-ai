import type { PrismaClient } from '@prisma/client';
import { getPrisma } from '~/db.server';

type ReleaseTransitionInput = {
  shopId?: string;
  moduleId: string;
  moduleVersionId: string;
  fromModuleStatus: string;
  toModuleStatus: string;
  fromVersionStatus: string;
  toVersionStatus: string;
  source: 'merchant_api' | 'agent_api' | 'system';
  idempotencyKey: string;
  outcome: 'ATTEMPT' | 'SUCCEEDED' | 'FAILED' | 'IDEMPOTENT';
  error?: string;
  metadata?: Record<string, unknown>;
};

export class ReleaseTransitionService {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  assertPublishTransition(moduleStatus: string, versionStatus: string) {
    const allowedModuleStates = new Set(['DRAFT', 'PUBLISHED']);
    const allowedVersionStates = new Set(['DRAFT', 'PUBLISHED']);
    if (!allowedModuleStates.has(moduleStatus)) {
      throw new Error(`Invalid module transition: ${moduleStatus} -> PUBLISHED`);
    }
    if (!allowedVersionStates.has(versionStatus)) {
      throw new Error(`Invalid version transition: ${versionStatus} -> PUBLISHED`);
    }
  }

  async logTransition(input: ReleaseTransitionInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        shopId: input.shopId ?? 'unknown',
        action: 'RELEASE_TRANSITION',
        details: JSON.stringify({
          moduleId: input.moduleId,
          moduleVersionId: input.moduleVersionId,
          fromModuleStatus: input.fromModuleStatus,
          toModuleStatus: input.toModuleStatus,
          fromVersionStatus: input.fromVersionStatus,
          toVersionStatus: input.toVersionStatus,
          source: input.source,
          idempotencyKey: input.idempotencyKey,
          outcome: input.outcome,
          error: input.error,
          metadata: input.metadata ?? {},
        }),
      },
    });
  }
}

