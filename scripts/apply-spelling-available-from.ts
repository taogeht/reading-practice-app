// Applies migrations/0061_spelling_list_available_from.sql directly. The
// Drizzle journal is out of sync with production, so db:migrate is unsafe for
// later migrations; see AGENTS.md and docs/architecture.md.
//
// Usage:
//   npm run migrate:spelling-release
//
// Uses DATABASE_URL from .env.local. Additive and guarded — safe to retry.

import './_bootstrap-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';

const SQL_PATH = path.resolve(
  process.cwd(),
  'migrations/0061_spelling_list_available_from.sql',
);

async function main(): Promise<void> {
  const statements = fs
    .readFileSync(SQL_PATH, 'utf-8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);

  console.log(`Applying ${statements.length} statement(s) from ${path.basename(SQL_PATH)}…`);
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
    console.log(`  ✓ ${statement.replace(/\s+/g, ' ').slice(0, 80)}`);
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
