// Applies migrations/0055_hot_indexes.sql directly (the drizzle journal is out
// of sync with prod, so db:migrate is unsafe — see CLAUDE.md). Idempotent: all
// statements use CREATE INDEX IF NOT EXISTS, so this is safe to run more than
// once.
//
// Usage:
//   npx tsx scripts/apply-hot-indexes.ts
//
// Uses DATABASE_URL from .env.local. Confirm it points at the intended DB first
// (local, then Railway prod).
//
// Adds: idx_classes_teacher / idx_classes_school / idx_classes_term +
// idx_class_enrollments_student.

import './_bootstrap-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';

const SQL_PATH = path.resolve(process.cwd(), 'migrations/0055_hot_indexes.sql');

async function main() {
  const raw = fs.readFileSync(SQL_PATH, 'utf-8');
  const statements = raw
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    console.log(`→ ${stmt.split('\n').find((l) => l.startsWith('CREATE')) ?? stmt.slice(0, 80)}`);
    await db.execute(sql.raw(stmt));
  }
  console.log('✓ hot-path indexes applied');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
