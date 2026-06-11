import { createJobLedgerRepository, type JobLedgerRepository } from '@superapp/db';
import type { ApiEnv } from '../../env.js';

let cachedRepository: JobLedgerRepository | null = null;
let cachedKey: string | null = null;

export function resolveJobLedgerRepository(env: ApiEnv): JobLedgerRepository {
  const key = [
    env.JOB_LEDGER_DRIVER,
    env.V2_DATABASE_URL ?? '',
    env.JOB_LEDGER_SQLITE_PATH,
  ].join('|');

  if (cachedRepository && cachedKey === key) return cachedRepository;

  cachedRepository = createJobLedgerRepository({
    driver: env.JOB_LEDGER_DRIVER,
    databaseUrl: env.V2_DATABASE_URL,
    sqlitePath: env.JOB_LEDGER_SQLITE_PATH,
  });
  cachedKey = key;
  return cachedRepository;
}

export function resetJobLedgerRepositoryCache(): void {
  cachedRepository = null;
  cachedKey = null;
}
