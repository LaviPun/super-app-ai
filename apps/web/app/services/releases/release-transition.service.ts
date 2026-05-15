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
  actor?: 'MERCHANT' | 'SYSTEM' | 'CRON' | 'WEBHOOK' | 'INTERNAL_ADMIN';
  idempotencyKey: string;
  outcome: 'ATTEMPT' | 'SUCCEEDED' | 'FAILED' | 'IDEMPOTENT';
  error?: string;
  errorClass?: string;
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
    const actor = input.actor ?? 'SYSTEM';
    const result = input.outcome;
    const fromState = `${input.fromModuleStatus}:${input.fromVersionStatus}`;
    const toState = `${input.toModuleStatus}:${input.toVersionStatus}`;

    await this.prisma.auditLog.create({
      data: {
        shopId: input.shopId ?? 'unknown',
        action: 'RELEASE_TRANSITION',
        details: JSON.stringify({
          actor,
          source: input.source,
          idempotency_key: input.idempotencyKey,
          from: fromState,
          to: toState,
          result,
          error_class: input.errorClass ?? (input.error ? 'UNCLASSIFIED_ERROR' : null),
          moduleId: input.moduleId,
          moduleVersionId: input.moduleVersionId,
          fromModuleStatus: input.fromModuleStatus,
          toModuleStatus: input.toModuleStatus,
          fromVersionStatus: input.fromVersionStatus,
          toVersionStatus: input.toVersionStatus,
          idempotencyKey: input.idempotencyKey,
          outcome: input.outcome,
          error: input.error,
          errorClass: input.errorClass ?? null,
          metadata: input.metadata ?? {},
        }),
      },
    });
  }
}

