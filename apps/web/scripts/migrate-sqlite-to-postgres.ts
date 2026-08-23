/**
 * One-shot data migration: copies every model's rows from a Prisma SQLite file
 * into the Postgres database at DATABASE_URL. Schema must already be applied
 * (prisma migrate deploy). Idempotent via createMany({ skipDuplicates: true }).
 *
 * FK ordering is resolved by fixed-point retry (see `fixedPointInsert`). Some
 * schemas contain a genuine FK *cycle* between two models (e.g. this one:
 * Module.activeVersionId -> ModuleVersion, ModuleVersion.moduleId -> Module).
 * When the fixed-point loop stalls on a cycle, `deferNullableCycleEdges`
 * breaks it generically: any nullable FK column pointing at another
 * currently-stalled model is nulled out for the phase-1 insert, and its real
 * value is restored in a phase-2 UPDATE once every table is loaded. A cycle
 * with no nullable edge has no safe insertion order at all and fails loudly
 * with the concrete model names, rather than being silently dropped.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... pnpm --filter web db:copy-sqlite -- --sqlite prisma/dev.db
 * Flags:
 *   --sqlite <path>   source db file (required)
 *   --truncate        TRUNCATE all target tables first (local re-runs only; NEVER in prod)
 */
import Database from 'better-sqlite3';
import { Prisma, PrismaClient } from '@prisma/client';

export type Row = Record<string, unknown>;

export type Pending = { model: Prisma.DMMF.Model; rows: Row[] };

export function parseArgs(argv: string[]) {
  const sqliteIdx = argv.indexOf('--sqlite');
  if (sqliteIdx === -1 || !argv[sqliteIdx + 1]) {
    console.error('Missing --sqlite <path>');
    process.exit(1);
  }
  return { sqlitePath: argv[sqliteIdx + 1], truncate: argv.includes('--truncate') };
}

export function coerce(field: Prisma.DMMF.Field, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (field.type) {
    case 'DateTime':
      // Prisma/SQLite stores DateTime as epoch-ms integers or ISO strings.
      return typeof value === 'number' ? new Date(value) : new Date(String(value));
    case 'Boolean':
      return value === 1 || value === true || value === '1' || value === 'true';
    case 'BigInt':
      return BigInt(value as number | string);
    case 'Int':
    case 'Float':
      return Number(value);
    default:
      return value; // String / Json-as-String enums etc.
  }
}

export const clientKey = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

/**
 * Fixed-point insertion: attempts every pending item each pass; items whose
 * FK parents aren't inserted yet fail and are retried next pass. Terminates
 * successfully once `pending` is empty. On a stalled pass (no item among the
 * remaining ones succeeded), `onStall` gets one chance to transform the
 * failed set into something retryable (e.g. by deferring cycle-breaking FK
 * columns) — if it returns a new list, the loop retries with that list; if it
 * returns null/undefined, or isn't provided, the loop throws with the
 * concrete stalled model/item names rather than looping forever or silently
 * dropping data.
 *
 * A hard pass cap (`items.length + 10` full stall-resolution rounds) is a
 * generic safety net against a broken `onStall` that returns a list which
 * never actually makes progress — it throws rather than spinning forever.
 */
export async function fixedPointInsert<T>(
  items: T[],
  key: (item: T) => string,
  attempt: (item: T) => Promise<void>,
  log: (msg: string) => void = () => {},
  onStall?: (failed: T[]) => T[] | null | undefined,
): Promise<void> {
  let pending = items;
  let pass = 0;
  let stallResolutions = 0;
  const maxStallResolutions = items.length + 10;
  while (pending.length > 0) {
    pass += 1;
    const failed: T[] = [];
    for (const item of pending) {
      try {
        await attempt(item);
        log(`pass ${pass}: ${key(item)} OK`);
      } catch (err) {
        failed.push(item);
        log(`pass ${pass}: ${key(item)} deferred (${(err as Error).message.split('\n')[0]})`);
      }
    }
    if (failed.length === pending.length) {
      stallResolutions += 1;
      if (stallResolutions > maxStallResolutions) {
        throw new Error(
          `stall-resolution did not converge after ${maxStallResolutions} attempts; remaining: ${failed.map(key).join(', ')}`,
        );
      }
      const resolved = onStall?.(failed);
      if (resolved) {
        log(`pass ${pass}: stall resolved by deferring cycle-breaking field(s) on: ${resolved.map(key).join(', ')}`);
        pending = resolved;
        continue;
      }
      throw new Error(`no progress on pass ${pass}; remaining: ${failed.map(key).join(', ')}`);
    }
    pending = failed;
  }
}

export type DeferredRestore = {
  modelName: string;
  field: string;
  idField: string;
  id: unknown;
  value: unknown;
};

/**
 * Breaks a stalled fixed-point pass by deferring nullable FK columns whose
 * target model is *also* currently stalled — i.e. the column participates in
 * a cycle among the models that are stuck together. Those columns are nulled
 * out in the returned (cloned) rows so phase-1 insertion can proceed without
 * its cyclic dependency; the real values are appended to `restores` so a
 * phase-2 UPDATE can put them back once every table is loaded.
 *
 * Returns null when no stalled model has any nullable cycle-breaking edge —
 * a genuine hard cycle with no safe insertion order — so the caller can fail
 * loudly with the concrete model names instead of masking the problem.
 */
export function deferNullableCycleEdges(failed: Pending[], restores: DeferredRestore[]): Pending[] | null {
  const stalledNames = new Set(failed.map((f) => f.model.name));
  let anyDeferred = false;
  const resolved: Pending[] = [];

  for (const item of failed) {
    const deferrableFields = item.model.fields.filter((f) => {
      if (f.kind !== 'object' || !f.relationFromFields || f.relationFromFields.length === 0) return false;
      if (!stalledNames.has(f.type)) return false; // only cycle edges among the stalled set
      return f.relationFromFields.every((fkName) => {
        const scalar = item.model.fields.find((sf) => sf.name === fkName);
        return scalar ? !scalar.isRequired : false; // every underlying FK column must be nullable
      });
    });

    if (deferrableFields.length === 0) {
      resolved.push(item); // unresolved by this pass; unchanged, still stalled
      continue;
    }

    const idField = item.model.fields.find((f) => f.isId)?.name;
    if (!idField) {
      throw new Error(
        `${item.model.name} has a nullable cycle-breaking FK but no single @id field to key its phase-2 restore on`,
      );
    }

    anyDeferred = true;
    const fkColumns = deferrableFields.flatMap((f) => f.relationFromFields as string[]);
    const newRows = item.rows.map((row) => {
      const clone: Row = { ...row };
      for (const col of fkColumns) {
        const value = clone[col];
        if (value !== null && value !== undefined) {
          restores.push({ modelName: item.model.name, field: col, idField, id: row[idField], value });
        }
        clone[col] = null;
      }
      return clone;
    });
    resolved.push({ model: item.model, rows: newRows });
  }

  return anyDeferred ? resolved : null;
}

async function main() {
  const { sqlitePath, truncate } = parseArgs(process.argv.slice(2));
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const pg = new PrismaClient();

  // Models in DMMF order; scalar field map per model for coercion.
  const models = Prisma.dmmf.datamodel.models;

  if (truncate) {
    const tables = models.map((m) => `"${m.dbName ?? m.name}"`).join(', ');
    await pg.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    console.log('[copy] target tables truncated');
  }

  const pending: Pending[] = [];
  const sourceCounts = new Map<string, number>();

  for (const model of models) {
    const table = model.dbName ?? model.name;
    const exists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
      .get(table);
    if (!exists) {
      sourceCounts.set(model.name, 0);
      continue;
    }
    const raw = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Row[];
    sourceCounts.set(model.name, raw.length);
    if (raw.length === 0) continue;
    const scalarFields = model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum');
    const rows = raw.map((r) => {
      const out: Row = {};
      for (const f of scalarFields) {
        if (f.name in r) out[f.name] = coerce(f, r[f.name]);
      }
      return out;
    });
    pending.push({ model, rows });
  }

  const restores: DeferredRestore[] = [];
  try {
    await fixedPointInsert(
      pending,
      (item) => `${item.model.name} (${item.rows.length} rows)`,
      async (item) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (pg as any)[clientKey(item.model.name)].createMany({
          data: item.rows,
          skipDuplicates: true,
        });
      },
      (msg) => console.log(`[copy] ${msg}`),
      (failed) => deferNullableCycleEdges(failed, restores),
    );
  } catch (err) {
    console.error(`[copy] ${(err as Error).message}`);
    process.exit(1);
  }

  // Phase 2: restore deferred cycle-breaking FK values now that every table
  // is loaded. Idempotent — it's a pure overwrite to the source value, so a
  // re-run (with nothing deferred, since the target already has the value)
  // is either a no-op or an identical repeat write.
  if (restores.length > 0) {
    console.log(`[copy] phase 2: restoring ${restores.length} deferred cycle-breaking value(s)`);
    for (const r of restores) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (pg as any)[clientKey(r.modelName)].update({
        where: { [r.idField]: r.id },
        data: { [r.field]: r.value },
      });
    }
    console.log('[copy] phase 2 done');
  }

  // Verify counts.
  let mismatches = 0;
  for (const model of models) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const got: number = await (pg as any)[clientKey(model.name)].count();
    const want = sourceCounts.get(model.name) ?? 0;
    const flag = got >= want ? 'OK ' : 'MISMATCH';
    if (got < want) mismatches += 1;
    console.log(`[verify] ${flag} ${model.name}: sqlite=${want} postgres=${got}`);
  }
  await pg.$disconnect();
  sqlite.close();
  if (mismatches > 0) process.exit(1);
  console.log('[copy] done — all tables at or above source counts');
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
