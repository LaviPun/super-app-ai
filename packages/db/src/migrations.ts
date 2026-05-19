import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertMigrationContract } from './migration-contract.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export type MigrationDialect = 'postgres' | 'sqlite';

export function migrationFileName(dialect: MigrationDialect): string {
  return dialect === 'sqlite' ? '0001_v2_job_ledger.sqlite.sql' : '0001_v2_job_ledger.sql';
}

export function readMigrationSql(dialect: MigrationDialect): string {
  const path = join(packageRoot, 'migrations', migrationFileName(dialect));
  const sql = readFileSync(path, 'utf8');
  assertMigrationContract(sql, dialect);
  return sql;
}

export function applyMigrationStatements(
  exec: (statement: string) => void,
  sql: string,
): void {
  const statements = sql
    .split(';')
    .map((statement) => statement.replace(/^\s*--.*$/gm, '').trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    exec(statement);
  }
}
