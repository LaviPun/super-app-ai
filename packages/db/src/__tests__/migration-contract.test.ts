import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertMigrationContract } from '../migration-contract.js';
import { migrationFileName, readMigrationSql } from '../migrations.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('V2 migration contract', () => {
  it('loads postgres and sqlite migration files with the same logical contract', () => {
    const postgres = readFileSync(
      join(packageRoot, 'migrations', migrationFileName('postgres')),
      'utf8',
    );
    const sqlite = readFileSync(
      join(packageRoot, 'migrations', migrationFileName('sqlite')),
      'utf8',
    );

    expect(() => assertMigrationContract(postgres, 'postgres')).not.toThrow();
    expect(() => assertMigrationContract(sqlite, 'sqlite')).not.toThrow();
  });

  it('exposes migration SQL through the package migration helper', () => {
    expect(readMigrationSql('postgres')).toContain('CREATE TABLE IF NOT EXISTS v2_job_ledger');
    expect(readMigrationSql('sqlite')).toContain('CREATE TABLE IF NOT EXISTS v2_job_ledger');
  });
});
