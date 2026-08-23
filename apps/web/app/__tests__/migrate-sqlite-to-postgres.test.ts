import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  coerce,
  clientKey,
  fixedPointInsert,
  deferNullableCycleEdges,
  type Pending,
  type Row,
  type DeferredRestore,
} from '../../scripts/migrate-sqlite-to-postgres';

function field(type: string): Prisma.DMMF.Field {
  return { type } as Prisma.DMMF.Field;
}

function scalarField(name: string, type: string, opts: Partial<Prisma.DMMF.Field> = {}): Prisma.DMMF.Field {
  return {
    name,
    kind: 'scalar',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    hasDefaultValue: false,
    type,
    isGenerated: false,
    isUpdatedAt: false,
    ...opts,
  } as Prisma.DMMF.Field;
}

function relationField(
  name: string,
  targetModel: string,
  fromFields: string[],
  opts: Partial<Prisma.DMMF.Field> = {},
): Prisma.DMMF.Field {
  return {
    name,
    kind: 'object',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    hasDefaultValue: false,
    type: targetModel,
    relationFromFields: fromFields,
    relationToFields: ['id'],
    isGenerated: false,
    isUpdatedAt: false,
    ...opts,
  } as Prisma.DMMF.Field;
}

function model(name: string, fields: Prisma.DMMF.Field[]): Prisma.DMMF.Model {
  return {
    name,
    dbName: null,
    fields,
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
    isGenerated: false,
  } as unknown as Prisma.DMMF.Model;
}

// Fixtures mirroring the real (only) cycle in the schema: Module.activeVersionId
// (nullable) -> ModuleVersion.id, ModuleVersion.moduleId (required) -> Module.id.
const moduleModel = model('Module', [
  scalarField('id', 'String', { isId: true, hasDefaultValue: true }),
  scalarField('activeVersionId', 'String', { isRequired: false, isUnique: true }),
  relationField('activeVersion', 'ModuleVersion', ['activeVersionId'], { isRequired: false }),
]);
const moduleVersionModel = model('ModuleVersion', [
  scalarField('id', 'String', { isId: true, hasDefaultValue: true }),
  scalarField('moduleId', 'String', { isRequired: true }),
  relationField('module', 'Module', ['moduleId'], { isRequired: true }),
]);

// Fixtures for a *hypothetical* cycle with no nullable edge on either side —
// impossible in the real schema today, but the resolver must still refuse to
// silently skip it and fail loudly with the concrete model names instead.
const hardModelA = model('HardA', [
  scalarField('id', 'String', { isId: true }),
  scalarField('bId', 'String', { isRequired: true }),
  relationField('b', 'HardB', ['bId'], { isRequired: true }),
]);
const hardModelB = model('HardB', [
  scalarField('id', 'String', { isId: true }),
  scalarField('aId', 'String', { isRequired: true }),
  relationField('a', 'HardA', ['aId'], { isRequired: true }),
]);

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

  it('throws on a stalled pass when no onStall resolver is supplied (baseline: no silent skip)', async () => {
    const items = ['X', 'Y'];
    const attempt = vi.fn(async () => {
      throw new Error('FK constraint violation');
    });
    await expect(fixedPointInsert(items, (i) => i, attempt)).rejects.toThrow(/no progress on pass 1/);
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

describe('deferNullableCycleEdges', () => {
  it('defers only the nullable FK column among the stalled set, leaves already-null rows alone, and leaves the non-nullable side unresolved', () => {
    const restores: DeferredRestore[] = [];
    const failed: Pending[] = [
      {
        model: moduleModel,
        rows: [
          { id: 'mod_1', activeVersionId: 'mv_1' },
          { id: 'mod_2', activeVersionId: null },
        ],
      },
      { model: moduleVersionModel, rows: [{ id: 'mv_1', moduleId: 'mod_1' }] },
    ];

    const resolved = deferNullableCycleEdges(failed, restores);

    expect(resolved).not.toBeNull();
    const moduleItem = resolved!.find((p) => p.model.name === 'Module')!;
    expect(moduleItem.rows).toEqual([
      { id: 'mod_1', activeVersionId: null },
      { id: 'mod_2', activeVersionId: null }, // already null: no-op, no restore needed
    ]);
    const versionItem = resolved!.find((p) => p.model.name === 'ModuleVersion')!;
    // moduleId is required -> not deferrable -> item passes through unchanged, still stalled.
    expect(versionItem.rows).toEqual([{ id: 'mv_1', moduleId: 'mod_1' }]);

    expect(restores).toEqual([{ modelName: 'Module', field: 'activeVersionId', idField: 'id', id: 'mod_1', value: 'mv_1' }]);
  });

  it('returns null (nothing deferrable) when a cycle has no nullable edge on either side', () => {
    const restores: DeferredRestore[] = [];
    const failed: Pending[] = [
      { model: hardModelA, rows: [{ id: 'a1', bId: 'b1' }] },
      { model: hardModelB, rows: [{ id: 'b1', aId: 'a1' }] },
    ];
    expect(deferNullableCycleEdges(failed, restores)).toBeNull();
    expect(restores).toEqual([]);
  });
});

describe('fixedPointInsert + deferNullableCycleEdges (Module <-> ModuleVersion cycle resolution)', () => {
  it('resolves the cycle: Module inserts in phase 1 with activeVersionId deferred (null), ModuleVersion inserts after, and the real value is queued for a phase-2 restore', async () => {
    const moduleRow: Row = { id: 'mod_1', activeVersionId: 'mv_1' };
    const versionRow: Row = { id: 'mv_1', moduleId: 'mod_1' };
    // Handed in cycle order; the algorithm must resolve it regardless.
    const pending: Pending[] = [
      { model: moduleModel, rows: [moduleRow] },
      { model: moduleVersionModel, rows: [versionRow] },
    ];

    const insertedIds: Record<string, Set<unknown>> = { Module: new Set(), ModuleVersion: new Set() };
    const insertedRows: Record<string, Row[]> = { Module: [], ModuleVersion: [] };
    const order: string[] = [];

    // A fake "target DB" that enforces FK constraints exactly like Postgres
    // would: a row with a non-null FK column fails unless the referenced row
    // is already committed.
    const attempt = async (item: Pending) => {
      for (const row of item.rows) {
        for (const f of item.model.fields) {
          if (f.kind !== 'object' || !f.relationFromFields) continue;
          for (const fk of f.relationFromFields) {
            const value = row[fk];
            if (value !== null && value !== undefined && !insertedIds[f.type]?.has(value)) {
              throw new Error(`FK violation: ${item.model.name}.${fk}=${String(value)} -> ${f.type} not found`);
            }
          }
        }
      }
      for (const row of item.rows) {
        insertedIds[item.model.name]!.add(row.id);
        insertedRows[item.model.name]!.push(row);
      }
      order.push(item.model.name);
    };

    const restores: DeferredRestore[] = [];
    await fixedPointInsert(
      pending,
      (item) => item.model.name,
      attempt,
      () => {},
      (failed) => deferNullableCycleEdges(failed, restores),
    );

    // Plan: Module lands before ModuleVersion (phase 1, deferred FK).
    expect(order.indexOf('Module')).toBeLessThan(order.indexOf('ModuleVersion'));
    expect(insertedRows.Module![0]!.activeVersionId).toBeNull(); // phase-1 row was nulled
    expect(insertedRows.ModuleVersion![0]).toEqual({ id: 'mv_1', moduleId: 'mod_1' });

    // Phase 2: exactly one restore queued, carrying the real source value.
    expect(restores).toEqual([{ modelName: 'Module', field: 'activeVersionId', idField: 'id', id: 'mod_1', value: 'mv_1' }]);

    // Simulate applying the phase-2 restore (what main() does against Prisma)
    // and confirm it's a pure, idempotent overwrite to the source value.
    for (const r of restores) {
      const row = insertedRows[r.modelName]!.find((x) => x.id === r.id)!;
      row[r.field] = r.value;
    }
    expect(insertedRows.Module![0]!.activeVersionId).toBe('mv_1');
  });

  it('fails loudly with the concrete model names — never silently skips — when a cycle has no nullable edge to defer', async () => {
    const pending: Pending[] = [
      { model: hardModelA, rows: [{ id: 'a1', bId: 'b1' }] },
      { model: hardModelB, rows: [{ id: 'b1', aId: 'a1' }] },
    ];
    const restores: DeferredRestore[] = [];
    const attempt = async () => {
      throw new Error('FK constraint violation');
    };

    let caught: Error | undefined;
    try {
      await fixedPointInsert(
        pending,
        (item) => item.model.name,
        attempt,
        () => {},
        (failed) => deferNullableCycleEdges(failed, restores),
      );
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/no progress on pass 1/);
    expect(caught!.message).toContain('HardA');
    expect(caught!.message).toContain('HardB');
    expect(restores).toEqual([]); // nothing silently deferred
  });
});
