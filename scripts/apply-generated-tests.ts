// Applies migrations/0052_generated_tests.sql directly, following the project's
// migration workflow (the drizzle journal is out of sync with prod, so
// db:migrate is unsafe — see CLAUDE.md). Idempotent: the table + indexes use
// IF NOT EXISTS and "already exists" / "does not exist" errors are tolerated
// (the FK ADD CONSTRAINTs throw "already exists" on a re-run, which we skip), so
// this is safe to re-run.
//
// Usage:
//   npx tsx scripts/apply-generated-tests.ts
//
// Uses DATABASE_URL from .env.local (via _bootstrap-env). Point it at whatever
// DB you want to migrate — confirm it's the intended one before running.

import './_bootstrap-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';

const SQL_PATH = path.resolve(process.cwd(), 'migrations/0052_generated_tests.sql');

async function main() {
  const raw = fs.readFileSync(SQL_PATH, 'utf-8');
  const statements = raw
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`Applying ${statements.length} statement(s) from ${path.basename(SQL_PATH)}…`);

  for (const stmt of statements) {
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
    try {
      await db.execute(sql.raw(stmt));
      console.log(`  ✓ ${preview}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already exists|does not exist/i.test(msg)) {
        console.log(`  • skipped (idempotent): ${preview} — ${msg}`);
      } else {
        console.error(`  ✗ ${preview}`);
        throw err;
      }
    }
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
