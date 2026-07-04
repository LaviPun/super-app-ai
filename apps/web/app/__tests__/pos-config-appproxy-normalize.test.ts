/**
 * POS config projection — placeholder app-proxy paths are normalized to the REAL,
 * App-Authenticated app routes so LOYALTY_READ/WRITE, the staff-PIN gate, and
 * observers hit live handlers (build #16/#22). Modules already on `/api/pos/*` pass
 * through unchanged; a module with no path stays undefined (back-compat).
 */
import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { readPublishedPosConfig } from '~/services/pos/pos-config.server';

/** Build a fake prisma whose module.findMany returns the given published POS modules. */
function fakePrisma(modules: unknown[]): PrismaClient {
  return {
    module: { findMany: async () => modules },
  } as unknown as PrismaClient;
}

function posModule(id: string, config: Record<string, unknown>) {
  return {
    id,
    name: `mod ${id}`,
    status: 'PUBLISHED',
    activeVersion: {
      status: 'PUBLISHED',
      specJson: JSON.stringify({
        type: 'pos.extension',
        name: `mod ${id}`,
        category: 'ADMIN_UI',
        requires: [],
        config: { target: 'pos.home.modal.render', label: 'X', ...config },
      }),
    },
  };
}

describe('readPublishedPosConfig — app-proxy path normalization', () => {
  it('rewrites a placeholder appProxyPath to /api/pos/loyalty', async () => {
    const prisma = fakePrisma([
      posModule('m1', { action: 'LOYALTY_READ', binding: 'loyalty.points', appProxyPath: '/apps/loyalty/pos/balance' }),
    ]);
    const { blocks } = await readPublishedPosConfig(prisma, 'shop.myshopify.com');
    expect(blocks[0]!.appProxyPath).toBe('/api/pos/loyalty');
  });

  it('passes an already-canonical /api/pos/* path through unchanged', async () => {
    const prisma = fakePrisma([
      posModule('m2', { action: 'LOYALTY_WRITE', appProxyPath: '/api/pos/loyalty' }),
    ]);
    const { blocks } = await readPublishedPosConfig(prisma, 'shop.myshopify.com');
    expect(blocks[0]!.appProxyPath).toBe('/api/pos/loyalty');
  });

  it('leaves a module with no appProxyPath undefined (back-compat)', async () => {
    const prisma = fakePrisma([posModule('m3', { action: 'NONE', binding: 'order.name' })]);
    const { blocks } = await readPublishedPosConfig(prisma, 'shop.myshopify.com');
    expect(blocks[0]!.appProxyPath).toBeUndefined();
  });

  it('normalizes an observer forwardTo placeholder to /api/pos/observe', async () => {
    const prisma = fakePrisma([
      posModule('m4', {
        target: 'pos.transaction-complete.event.observe',
        blockKind: 'observer',
        observe: { event: 'transaction-complete', forwardTo: '/apps/loyalty/pos/observe/transaction' },
      }),
    ]);
    const { blocks } = await readPublishedPosConfig(prisma, 'shop.myshopify.com');
    expect(blocks[0]!.observe?.forwardTo).toBe('/api/pos/observe');
    expect(blocks[0]!.observe?.event).toBe('transaction-complete');
  });
});
