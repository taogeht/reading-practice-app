// Applies migrations/0053_longitudinal_progress.sql directly (the drizzle
// journal is out of sync with prod, so db:migrate is unsafe — see CLAUDE.md).
// Idempotent: tables/indexes use IF NOT EXISTS, foreign-key ADD CONSTRAINTs and
// the reading-level backfill tolerate re-runs ("already exists" is swallowed;
// the backfill skips any student who already has a history row), so this is
// safe to run more than once.
//
// Usage:
//   npx tsx scripts/apply-longitudinal-progress.ts
//
// Uses DATABASE_URL from .env.local. Confirm it points at the intended DB first
// (local, then Railway prod).
//
// Adds: academic_terms, classes.term_id, student_reading_level_history, the
// one-current-term-per-school partial unique index, and a one-time backfill of
// each student's current reading_level as their first history entry.

import './_bootstrap-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';

const SQL_PATH = path.resolve(process.cwd(), 'migrations/0053_longitudinal_progress.sql');

// Drizzle wraps the driver error: err.message is just "Failed query: …" while
// the real Postgres text ("… already exists") sits on err.cause. Walk the chain
// so the idempotency check sees it (ADD CONSTRAINT has no IF NOT EXISTS form).
function fullMessage(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 5; depth++) {
    if (cur instanceof Error && cur.message) parts.push(cur.message);
    cur = (cur as { cause?: unknown })?.cause;
  }
  return parts.join(' | ');
}

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
      const result = await db.execute(sql.raw(stmt));
      const count = typeof result.rowCount === 'number' ? ` (${result.rowCount} rows)` : '';
      console.log(`  ✓ ${preview}${count}`);
    } catch (err) {
      const msg = fullMessage(err) || String(err);
      if (/already exists|duplicate column/i.test(msg)) {
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
