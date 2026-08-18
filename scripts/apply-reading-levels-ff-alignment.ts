// Applies migrations/0060_reading_levels_ff_alignment.sql directly. The
// Drizzle journal is out of sync with production, so db:migrate is unsafe for
// later migrations; see AGENTS.md and docs/architecture.md.
//
// Usage:
//   npm run migrate:reading-levels
//
// Uses DATABASE_URL from .env.local. Confirm it points at the intended
// database before running. Safe to retry: the SQL guards the data shift behind
// a data_migrations ledger row, so a second run is a no-op rather than a
// second renumbering.

import './_bootstrap-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';

const SQL_PATH = path.resolve(
  process.cwd(),
  'migrations/0060_reading_levels_ff_alignment.sql',
);

async function main(): Promise<void> {
  const statements = fs
    .readFileSync(SQL_PATH, 'utf-8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);

  console.log(
    `Applying ${statements.length} statement(s) from ${path.basename(SQL_PATH)}…`,
  );
  for (const statement of statements) {
    const preview = statement.replace(/\s+/g, ' ').slice(0, 80);
    await db.execute(sql.raw(statement));
    console.log(`  ✓ ${preview}`);
  }

  const applied: any = await db.execute(
    sql`select applied_at from data_migrations where id = '0060_reading_levels_ff_alignment'`,
  );
  console.log(
    applied.rows?.[0]
      ? `Ledger: recorded at ${applied.rows[0].applied_at}`
      : 'Ledger: NOT recorded — the shift did not run.',
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
