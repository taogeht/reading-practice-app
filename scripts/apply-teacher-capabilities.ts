// Applies migrations/0051_teacher_capabilities.sql directly (the drizzle journal
// is out of sync with prod, so db:migrate is unsafe — see CLAUDE.md). Idempotent:
// every ADD COLUMN uses IF NOT EXISTS and "already exists" errors are tolerated,
// so this is safe to re-run.
//
// Usage:
//   npx tsx scripts/apply-teacher-capabilities.ts
//
// Uses DATABASE_URL from .env.local. Confirm it points at the intended DB first.
//
// NOTE (hard cutover, per product decision): can_generate_practice_questions and
// can_use_sunny_preview default FALSE, so existing teachers (who could use both
// today via role-only gating) LOSE that access on deploy until an admin re-grants
// it per teacher. Spelling/assignments default TRUE, so authoring is undisrupted.

import './_bootstrap-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';

const SQL_PATH = path.resolve(process.cwd(), 'migrations/0051_teacher_capabilities.sql');

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
