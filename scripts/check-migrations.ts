// Reports which migrations are actually present in the database.
//
// The Drizzle journal (__drizzle_migrations) is NOT trustworthy in this repo:
// older migrations were applied via db:push and hand-run scripts, neither of
// which records anything. So this checks the schema itself — for each
// migration we look for the concrete objects it creates.
//
// Usage:
//   npm run check:migrations
//
// Reads DATABASE_URL from .env.local. To check a different database:
//   DATABASE_URL="postgresql://..." npx tsx scripts/check-migrations.ts
//
// Read-only. Safe to run against production.

import './_bootstrap-env';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';

type Check =
  | { kind: 'table'; name: string }
  | { kind: 'column'; table: string; name: string }
  | { kind: 'index'; name: string };

const MIGRATIONS: { id: string; label: string; checks: Check[] }[] = [
  {
    id: '0050',
    label: 'multibook practice units',
    checks: [
      { kind: 'column', table: 'class_practice_units', name: 'book_slug' },
      { kind: 'index', name: 'unique_class_practice_book_unit' },
    ],
  },
  {
    id: '0051',
    label: 'teacher capabilities',
    checks: [
      { kind: 'column', table: 'teachers', name: 'can_manage_spelling_lists' },
      { kind: 'column', table: 'teachers', name: 'can_manage_assignments' },
      { kind: 'column', table: 'teachers', name: 'can_generate_practice_questions' },
      { kind: 'column', table: 'teachers', name: 'can_use_sunny_preview' },
    ],
  },
  {
    id: '0052',
    label: 'generated tests (printable tests)',
    checks: [
      { kind: 'table', name: 'generated_tests' },
      { kind: 'index', name: 'idx_generated_tests_school' },
    ],
  },
  {
    id: '0053',
    label: 'longitudinal progress (terms + reading level history)',
    checks: [
      { kind: 'table', name: 'academic_terms' },
      { kind: 'table', name: 'student_reading_level_history' },
      { kind: 'column', table: 'classes', name: 'term_id' },
      { kind: 'index', name: 'uniq_one_current_term_per_school' },
    ],
  },
  {
    id: '0054',
    label: 'gradebook',
    checks: [
      { kind: 'table', name: 'gradebook_tests' },
      { kind: 'table', name: 'gradebook_scores' },
      { kind: 'index', name: 'unique_gradebook_test_student' },
    ],
  },
  {
    id: '0055',
    label: 'hot indexes',
    checks: [
      { kind: 'index', name: 'idx_classes_teacher' },
      { kind: 'index', name: 'idx_classes_school' },
      { kind: 'index', name: 'idx_classes_term' },
      { kind: 'index', name: 'idx_class_enrollments_student' },
    ],
  },
  {
    id: '0056',
    label: 'class promotion lineage',
    checks: [
      { kind: 'column', table: 'classes', name: 'promoted_to_class_id' },
      { kind: 'index', name: 'idx_classes_promoted_to' },
    ],
  },
  {
    id: '0057',
    label: 'mobile auth foundation',
    checks: [
      { kind: 'table', name: 'mobile_refresh_sessions' },
      { kind: 'table', name: 'auth_rate_limits' },
      { kind: 'index', name: 'idx_mobile_refresh_sessions_token_hash' },
    ],
  },
  {
    id: '0058',
    label: 'mobile recording idempotency',
    checks: [
      { kind: 'column', table: 'recordings', name: 'client_operation_id' },
      { kind: 'index', name: 'idx_recordings_unique_client_operation' },
    ],
  },
];

async function main() {
  const [tables, columns, indexes] = await Promise.all([
    db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`),
    db.execute(sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`),
    db.execute(sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`),
  ]);

  // DATABASE.md: prod objects must be owned by railway_owner. A migration run
  // as `postgres` creates tables the app role may not be able to write to, and
  // the object exists either way — so a table-presence check alone can pass
  // while the feature is still broken.
  const owners = await db.execute(sql`
    SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public'
  `);
  const ownerOf = new Map(
    (owners.rows as any[]).map((r) => [r.tablename, r.tableowner]),
  );

  const tableSet = new Set((tables.rows as any[]).map((r) => r.table_name));
  const columnSet = new Set(
    (columns.rows as any[]).map((r) => `${r.table_name}.${r.column_name}`),
  );
  const indexSet = new Set((indexes.rows as any[]).map((r) => r.indexname));

  const present = (c: Check) =>
    c.kind === 'table'
      ? tableSet.has(c.name)
      : c.kind === 'column'
        ? columnSet.has(`${c.table}.${c.name}`)
        : indexSet.has(c.name);

  const describe = (c: Check) =>
    c.kind === 'column' ? `${c.table}.${c.name}` : c.name;

  const host = (process.env.DATABASE_URL ?? '').replace(/\/\/[^@]*@/, '//***@');
  console.log(`\nDatabase: ${host || '(DATABASE_URL unset)'}\n`);

  let missingAny = false;

  for (const m of MIGRATIONS) {
    const missing = m.checks.filter((c) => !present(c));
    const status =
      missing.length === 0
        ? 'APPLIED'
        : missing.length === m.checks.length
          ? 'MISSING'
          : 'PARTIAL';

    if (status !== 'APPLIED') missingAny = true;

    console.log(`${status.padEnd(8)} ${m.id}  ${m.label}`);
    for (const c of missing) {
      console.log(`         └─ absent: ${c.kind} ${describe(c)}`);
    }
  }

  console.log(
    missingAny
      ? '\nSome migrations are incomplete. PARTIAL is the dangerous one — a\n' +
          'half-applied migration usually means a script died midway.\n'
      : '\nAll checked migrations are present.\n',
  );

  // Ownership report for the tables these migrations create.
  const owned = MIGRATIONS.flatMap((m) =>
    m.checks
      .filter((c): c is Extract<Check, { kind: 'table' }> => c.kind === 'table')
      .map((c) => c.name),
  ).filter((t) => ownerOf.has(t));

  const distinctOwners = new Set(owned.map((t) => ownerOf.get(t)));
  if (distinctOwners.size > 1) {
    console.log('Table ownership is inconsistent:\n');
    for (const t of owned) console.log(`  ${t.padEnd(32)} ${ownerOf.get(t)}`);
    console.log(
      '\nOn Railway these should all be railway_owner. Fix with:\n' +
        '  ALTER TABLE <table> OWNER TO railway_owner;\n',
    );
  } else if (distinctOwners.size === 1) {
    console.log(`Table owner (all checked): ${[...distinctOwners][0]}\n`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('check failed:', err);
  process.exit(1);
});
