import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  coerce,
  clientKey,
  fixedPointInsert,
} from '../../scripts/migrate-sqlite-to-postgres';

function field(type: string): Prisma.DMMF.Field {
  return { type } as Prisma.DMMF.Field;
}

describe('coerce', () => {
  it('passes through null/undefined regardless of declared type', () => {
    expect(coerce(field('DateTime'), null)).toBeNull();
    expect(coerce(field('Int'), undefined)).toBeNull();
  });

  it('converts DateTime from epoch-ms integers and from ISO strings', () => {
    const fromMs = coerce(field('DateTime'), 1735689600000) as Date;
    expect(fromMs).toBeInstanceOf(Date);
    expect(fromMs.getTime()).toBe(1735689600000);

    const fromIso = coerce(field('DateTime'), '2025-01-01T00:00:00.000Z') as Date;
    expect(fromIso).toBeInstanceOf(Date);
    expect(fromIso.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('normalizes SQLite Boolean encodings (0/1, true/false, "0"/"1")', () => {
    expect(coerce(field('Boolean'), 1)).toBe(true);
    expect(coerce(field('Boolean'), 0)).toBe(false);
    expect(coerce(field('Boolean'), true)).toBe(true);
    expect(coerce(field('Boolean'), false)).toBe(false);
    expect(coerce(field('Boolean'), '1')).toBe(true);
    expect(coerce(field('Boolean'), '0')).toBe(false);
    expect(coerce(field('Boolean'), 'true')).toBe(true);
  });

  it('converts BigInt from number or string', () => {
    expect(coerce(field('BigInt'), 42)).toBe(42n);
    expect(coerce(field('BigInt'), '9007199254740993')).toBe(9007199254740993n);
  });

  it('converts Int/Float to Number', () => {
    expect(coerce(field('Int'), '7')).toBe(7);
    expect(coerce(field('Float'), '3.5')).toBe(3.5);
  });

  it('passes through String/enum-as-string values unchanged', () => {
    expect(coerce(field('String'), 'hello')).toBe('hello');
    expect(coerce(field('SomeEnum'), 'ACTIVE')).toBe('ACTIVE');
  });
});

describe('clientKey', () => {
  it('lowercases the first letter of a PascalCase model name', () => {
    expect(clientKey('Shop')).toBe('shop');
    expect(clientKey('ModuleVersion')).toBe('moduleVersion');
    expect(clientKey('AiUsage')).toBe('aiUsage');
  });
});

describe('fixedPointInsert (FK ordering via retry)', () => {
  it('inserts independent items in a single pass', async () => {
    const items = ['A', 'B', 'C'];
    const inserted: string[] = [];
    await fixedPointInsert(
      items,
      (i) => i,
      async (i) => {
        inserted.push(i);
      },
    );
    expect(inserted.sort()).toEqual(['A', 'B', 'C']);
  });

  it('resolves a multi-level FK chain (parent before child before grandchild) regardless of input order', async () => {
    // Grandchild depends on Child depends on Parent, but the pending list is
    // handed to the algorithm in the WORST order (grandchild first).
    const items = ['Grandchild', 'Child', 'Parent'];
    const done = new Set<string>();
    const deps: Record<string, string | null> = {
      Parent: null,
      Child: 'Parent',
      Grandchild: 'Child',
    };
    await fixedPointInsert(
      items,
      (i) => i,
      async (i) => {
        const dep = deps[i];
        if (dep && !done.has(dep)) {
          throw new Error(`FK violation: ${i} needs ${dep}`);
        }
        done.add(i);
      },
    );
    // All three eventually succeed regardless of starting order.
    expect(done).toEqual(new Set(['Parent', 'Child', 'Grandchild']));
  });

  it('takes exactly N passes for an N-deep dependency chain given in reverse order', async () => {
    const items = ['C', 'B', 'A']; // A has no deps, B needs A, C needs B
    const deps: Record<string, string | null> = { A: null, B: 'A', C: 'B' };
    const done = new Set<string>();
    let passCount = 0;
    const logs: string[] = [];
    await fixedPointInsert(
      items,
      (i) => i,
      async (i) => {
        const dep = deps[i];
        if (dep && !done.has(dep)) throw new Error('deferred');
        done.add(i);
      },
      (msg) => {
        logs.push(msg);
        const m = msg.match(/^pass (\d+):/);
        if (m) passCount = Math.max(passCount, Number(m[1]));
      },
    );
    expect(done.size).toBe(3);
    expect(passCount).toBe(3);
  });

  it('throws when a genuine cycle makes zero progress in a pass (e.g. Module <-> ModuleVersion style mutual FK)', async () => {
    // Simulates two models whose FK constraints each require the other to
    // already be fully inserted — no independently-insertable subset exists,
    // so the fixed-point loop can never make progress.
    const items = ['Module', 'ModuleVersion'];
    const attempt = vi.fn(async () => {
      throw new Error('FK constraint violation');
    });
    await expect(
      fixedPointInsert(items, (i) => i, attempt),
    ).rejects.toThrow(/no progress on pass 1/);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('is a no-op-safe second pass: once all items are already "inserted" upstream (idempotent createMany), re-running succeeds trivially in pass 1', async () => {
    const items = ['Shop', 'Module', 'ModuleVersion'];
    const calls: string[] = [];
    const secondRunAttempt = async (i: string) => {
      // Represents createMany({ skipDuplicates: true }) against a target that
      // already has every row: it always resolves without throwing, so a
      // second full run of the algorithm completes in exactly one pass.
      calls.push(i);
    };
    await fixedPointInsert(items, (i) => i, secondRunAttempt);
    expect(calls).toEqual(items);
  });
});
