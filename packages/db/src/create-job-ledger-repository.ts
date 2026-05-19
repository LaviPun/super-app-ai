import { InMemoryJobLedgerRepository, type JobLedgerRepository } from './job-ledger.js';
import { SqlJobLedgerRepository } from './sql-job-ledger.js';
import { createSqliteJobLedgerDriver } from './sqlite-job-ledger-driver.js';

export type JobLedgerDriverKind = 'memory' | 'sqlite' | 'postgres';

export type CreateJobLedgerRepositoryOptions = {
  driver?: JobLedgerDriverKind;
  databaseUrl?: string;
  sqlitePath?: string;
};

export function createJobLedgerRepository(
  options: CreateJobLedgerRepositoryOptions = {},
): JobLedgerRepository {
  const driver = options.driver ?? 'memory';

  switch (driver) {
    case 'memory':
      return new InMemoryJobLedgerRepository();
    case 'sqlite':
      return new SqlJobLedgerRepository(
        createSqliteJobLedgerDriver({ path: options.sqlitePath ?? ':memory:' }),
      );
    case 'postgres':
      return createPostgresJobLedgerRepository(options.databaseUrl);
    default: {
      const exhaustive: never = driver;
      throw new Error(`Unsupported job ledger driver: ${exhaustive}`);
    }
  }
}

function createPostgresJobLedgerRepository(databaseUrl?: string): JobLedgerRepository {
  if (!databaseUrl) {
    throw new Error(
      'V2_DATABASE_URL is required when JOB_LEDGER_DRIVER=postgres. Apply packages/db/migrations/0001_v2_job_ledger.sql to staging Postgres first.',
    );
  }

  throw new Error(
    'Postgres job ledger driver is not bundled in Phase 15 local mode. Use JOB_LEDGER_DRIVER=sqlite for local persistence, or add a pg-backed SqlJobLedgerDriver after the reviewed migration is applied.',
  );
}
