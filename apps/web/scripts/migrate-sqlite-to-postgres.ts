/**
 * One-shot data migration: copies every model's rows from a Prisma SQLite file
 * into the Postgres database at DATABASE_URL. Schema must already be applied
 * (prisma migrate deploy). Idempotent via createMany({ skipDuplicates: true }).
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
 * successfully once `pending` is empty, or throws when a full pass makes no
 * progress at all (a genuine unresolvable cycle, e.g. two models whose FKs
 * point at each other with no independently-insertable subset).
 */
export async function fixedPointInsert<T>(
  items: T[],
  key: (item: T) => string,
  attempt: (item: T) => Promise<void>,
  log: (msg: string) => void = () => {},
): Promise<void> {
  let pending = items;
  let pass = 0;
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
      throw new Error(`no progress on pass ${pass}; remaining: ${failed.map(key).join(', ')}`);
    }
    pending = failed;
  }
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

  type Pending = { model: Prisma.DMMF.Model; rows: Row[] };
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
    );
  } catch (err) {
    console.error(`[copy] ${(err as Error).message}`);
    process.exit(1);
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
