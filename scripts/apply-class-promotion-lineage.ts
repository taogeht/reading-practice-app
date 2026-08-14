// Applies migrations/0056_class_promotion_lineage.sql directly. The Drizzle
// journal is out of sync with production, so db:migrate is unsafe for these
// later migrations; see AGENTS.md and docs/architecture.md.
//
// Usage:
//   npm run migrate:class-promotion
//
// Uses DATABASE_URL from .env.local. Confirm it points at the intended database
// before running. The migration is idempotent and safe to retry.

import './_bootstrap-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';

const SQL_PATH = path.resolve(
  process.cwd(),
  'migrations/0056_class_promotion_lineage.sql',
);

async function main() {
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

  console.log('Done.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
